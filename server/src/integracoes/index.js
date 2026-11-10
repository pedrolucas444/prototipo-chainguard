import { createAlchemyClient } from "./alchemy-client.js";
import { createReputationClient } from "./reputation-client.js";
import { createListasPublicasClient } from "./listas-publicas-client.js";
import { createExchangeAdapters } from "./exchange-adapters/index.js";

export function createIntegrations(config, options = {}) {
  return {
    alchemy: createAlchemyClient(config, options),
    reputation: createReputationClient(config, options),
    listas: createListasPublicasClient(options),
    exchanges: createExchangeAdapters(options),
  };
}
