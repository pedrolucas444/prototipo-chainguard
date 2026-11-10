/**
 * Raiz de composição: monta Dados → Integrações → Services → entradas (Controllers, Consumer, Jobs).
 * As três entradas chamam os mesmos Services.
 */
import { openDatabase, transaction } from "./dados/db.js";
import { createRepositories } from "./dados/repositories/index.js";
import { seed } from "./dados/seed.js";
import { createIntegrations } from "./integracoes/index.js";
import { createCipher } from "./shared/security.js";
import { createPublisher } from "./aplicacao/events/publisher.js";
import { createConsumer } from "./aplicacao/events/consumer.js";
import { MENSAGENS } from "./aplicacao/events/mensagens.js";
import { createAuthService } from "./aplicacao/services/auth-service.js";
import { createWalletService } from "./aplicacao/services/wallet-service.js";
import { createRiskService } from "./aplicacao/services/risk-service.js";
import { createTransactionService } from "./aplicacao/services/transaction-service.js";
import { createWhitelistService } from "./aplicacao/services/whitelist-service.js";
import { createSendService } from "./aplicacao/services/send-service.js";
import { createQuoteService } from "./aplicacao/services/quote-service.js";
import { createAdminService } from "./aplicacao/services/admin-service.js";
import { createScheduler, registerJobs } from "./aplicacao/jobs/index.js";
import { createRouter } from "./aplicacao/http/router.js";
import { createHttpServer } from "./aplicacao/http/server.js";
import { registerControllers } from "./aplicacao/controllers/index.js";

export function createApp(config, { integrations: injected, logger = console, db: injectedDb } = {}) {
  const db = injectedDb ?? openDatabase(config.dbPath);
  const repos = createRepositories(db);
  seed(repos, config, logger);

  const integrations = injected ?? createIntegrations(config);
  const publisher = createPublisher(repos.queue, { maxAttempts: config.queue.maxAttempts });

  const services = {};
  services.risk = createRiskService({ repos, integrations });
  services.transactions = createTransactionService({ repos, integrations, publisher, riskService: services.risk, runInTransaction: fn => transaction(db, fn), logger });
  services.wallets = createWalletService({ repos, integrations, logger, onHistoryImported: activities => services.transactions.ingest(activities, "sync") });
  services.auth = createAuthService({ repos, config, cipher: createCipher(config.appSecret), walletService: services.wallets });
  services.whitelist = createWhitelistService({ repos });
  services.sends = createSendService({ repos, integrations, riskService: services.risk });
  services.quotes = createQuoteService({ repos, integrations, config, logger });
  services.admin = createAdminService({ repos, integrations, transactionService: services.transactions, logger });
  services.scheduler = createScheduler(logger);

  const consumer = createConsumer({
    queueRepo: repos.queue,
    logger,
    pollMs: config.queue.pollMs,
    concurrency: config.queue.concurrency,
    baseDelayMs: config.queue.baseDelayMs,
    handlers: { [MENSAGENS.TRANSACAO_RECEBIDA]: payload => services.transactions.analyze(payload.transactionId) },
    onDead: message => { if (message.payload?.transactionId) services.transactions.markFailed(message.payload.transactionId); },
  });

  const router = createRouter();
  registerControllers(router, { services, integrations, config });
  const server = createHttpServer({ router, authService: services.auth, config, logger });

  return {
    db, repos, services, integrations, consumer, server,
    start() {
      consumer.start();
      if (config.jobs.enabled) registerJobs({ scheduler: services.scheduler, config, services, repos, integrations, logger });
      return new Promise(resolve => server.listen(config.port, config.host, () => resolve(server.address())));
    },
    async stop() {
      consumer.stop();
      services.scheduler.stop();
      await new Promise(resolve => server.close(resolve));
      db.close();
    },
  };
}
