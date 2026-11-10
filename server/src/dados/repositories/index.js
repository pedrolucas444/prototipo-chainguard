import { createUsersRepository } from "./users.js";
import { createWalletsRepository } from "./wallets.js";
import { createTransactionsRepository } from "./transactions.js";
import {
  createAuditRepository, createCatalogRepository, createFeeTablesRepository, createListSourcesRepository,
  createMaliciousRepository, createQueueRepository, createSendsRepository, createSettingsRepository,
  createSimulationsRepository, createSnapshotsRepository, createWhitelistRepository,
} from "./misc.js";

export function createRepositories(db) {
  return {
    users: createUsersRepository(db),
    wallets: createWalletsRepository(db),
    transactions: createTransactionsRepository(db),
    whitelist: createWhitelistRepository(db),
    sends: createSendsRepository(db),
    malicious: createMaliciousRepository(db),
    listSources: createListSourcesRepository(db),
    settings: createSettingsRepository(db),
    feeTables: createFeeTablesRepository(db),
    catalog: createCatalogRepository(db),
    snapshots: createSnapshotsRepository(db),
    simulations: createSimulationsRepository(db),
    audit: createAuditRepository(db),
    queue: createQueueRepository(db),
  };
}
