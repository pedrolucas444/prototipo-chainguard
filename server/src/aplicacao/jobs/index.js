/**
 * Jobs (entrada agendada): só disparam Services. Nenhuma regra de negócio aqui.
 *  - coleta de cotações   (intervalo < 1 min: defasagem máxima aceita)
 *  - sincronização das listas públicas de golpes
 *  - sincronização on-chain (só quando o webhook do Alchemy não está configurado)
 *  - manutenção (sessões expiradas, snapshots antigos, mensagens processadas)
 */
export function createScheduler(logger = console) {
  const timers = [];
  const status = {};
  return {
    every(name, intervalMs, fn, { initialDelayMs = 0 } = {}) {
      let running = false;
      status[name] = { intervalMs, lastRunAt: null, lastError: null, runs: 0 };
      const run = async () => {
        if (running) return; // não sobrepõe execuções
        running = true;
        try {
          await fn();
          status[name].lastError = null;
        } catch (error) {
          status[name].lastError = error.message;
          logger.warn?.(`[job ${name}] ${error.message}`);
        } finally {
          status[name].lastRunAt = new Date().toISOString();
          status[name].runs++;
          running = false;
        }
      };
      const start = setTimeout(() => {
        run();
        const t = setInterval(run, intervalMs);
        t.unref?.();
        timers.push(t);
      }, initialDelayMs);
      start.unref?.();
      timers.push(start);
    },
    status: () => status,
    stop() {
      for (const t of timers) { clearTimeout(t); clearInterval(t); }
    },
  };
}

export function registerJobs({ scheduler, config, services, repos, integrations, logger = console }) {
  const { jobs } = config;
  scheduler.every("coleta-cotacoes", jobs.quotesIntervalMs, () => services.quotes.collect(), { initialDelayMs: 1000 });
  scheduler.every("sincroniza-listas", jobs.listsIntervalMs, () => services.admin.syncLists(null), { initialDelayMs: 15_000 });

  if (!integrations.alchemy.webhookEnabled) {
    logger.info?.("[jobs] Webhook do Alchemy não configurado: usando o Job de sincronização on-chain como fonte de transações.");
    scheduler.every("sincroniza-onchain", jobs.fallbackSyncMs, () => syncOnchain({ repos, integrations, services, logger }), { initialDelayMs: 5000 });
  }

  scheduler.every("manutencao", jobs.maintenanceMs, () => {
    repos.users.purgeExpiredSessions();
    services.quotes.pruneSnapshots();
    repos.queue.pruneDone(new Date(Date.now() - 7 * 86_400_000).toISOString());
  }, { initialDelayMs: 60_000 });
}

/** Busca atividade recente dos endereços monitorados e entrega ao mesmo fluxo do webhook. */
async function syncOnchain({ repos, integrations, services, logger }) {
  const byAddress = new Map();
  for (const w of repos.wallets.listMonitored()) {
    const list = byAddress.get(w.address) ?? [];
    list.push(w);
    byAddress.set(w.address, list);
  }
  for (const [address, wallets] of byAddress) {
    const startBlock = Math.min(...wallets.map(w => w.last_synced_block ?? 0));
    try {
      const { activities, nextStartBlock } = await integrations.reputation.activitySince(address, { startBlock, limit: 100 });
      if (activities.length) services.transactions.ingest(activities, "sync");
      for (const w of wallets) repos.wallets.update(w.id, { lastSyncedBlock: nextStartBlock });
    } catch (error) {
      logger.warn?.(`[sincroniza-onchain] ${address}: ${error.message}`);
    }
    await new Promise(r => setTimeout(r, 300)); // respeita o limite de requisições do explorer
  }
}
