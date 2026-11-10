import { badRequest, conflict, notFound, requireFields, upstream } from "../../shared/errors.js";
import { validateAddress } from "../../shared/address.js";
import { createTtlCache } from "../../shared/http-client.js";

const MAX_WALLETS_PER_USER = 20;

export function createWalletService({ repos, integrations, logger = console, onHistoryImported }) {
  const balanceCache = createTtlCache(60_000);
  const { alchemy, reputation } = integrations;

  /** Inclui no Alchemy só se ninguém mais monitora o endereço; remove só se for o último. */
  async function startMonitoring(address, excludeWalletId = 0) {
    if (repos.wallets.countMonitoredWithAddress(address, excludeWalletId) > 0) return;
    try {
      await alchemy.updateMonitoredAddresses({ add: [address] });
    } catch (error) {
      throw upstream(`Não foi possível cadastrar o endereço no monitoramento do Alchemy: ${error.message}`);
    }
  }
  async function stopMonitoring(address, excludeWalletId = 0) {
    if (repos.wallets.countMonitoredWithAddress(address, excludeWalletId) > 0) return;
    try {
      await alchemy.updateMonitoredAddresses({ remove: [address] });
    } catch (error) {
      logger.warn?.(`[carteiras] falha ao remover ${address} do Alchemy: ${error.message}`);
    }
  }

  async function withBalances(wallets) {
    const missing = wallets.filter(w => balanceCache.get(w.address) === undefined).map(w => w.address);
    if (missing.length) {
      const balances = await alchemy.getBalances([...new Set(missing)]).catch(() => []);
      [...new Set(missing)].forEach((address, i) => { if (balances[i] !== null && balances[i] !== undefined) balanceCache.set(address, balances[i]); });
    }
    return wallets.map(w => ({ ...w, balance_eth: balanceCache.get(w.address) ?? null }));
  }

  return {
    async list(userId) {
      return withBalances(repos.wallets.listByUser(userId));
    },

    async add(userId, body) {
      const { label, address: rawAddress } = requireFields(body, { label: { min: 1, max: 32 }, address: {} });
      const check = validateAddress(rawAddress);
      if (!check.ok) throw badRequest(check.reason, { address: check.reason });
      const address = check.address;
      if (repos.wallets.findByUserAndAddress(userId, address)) throw conflict("Esta carteira já está cadastrada.");
      if (repos.wallets.listByUser(userId).length >= MAX_WALLETS_PER_USER) throw badRequest(`Limite de ${MAX_WALLETS_PER_USER} carteiras por conta.`);

      // Conferência on-chain.
      let state = null;
      const warnings = [];
      try {
        state = await alchemy.getAccountState(address);
        if (state.isContract) warnings.push("Este endereço é um contrato (ou conta com delegação EIP-7702), não uma carteira comum.");
        if (state.nonce === 0 && state.balanceWei === "0") warnings.push("Endereço sem saldo e sem transações enviadas até agora.");
      } catch (error) {
        warnings.push(`Não foi possível conferir o endereço on-chain agora (${error.message}). O monitoramento segue normalmente.`);
      }

      await startMonitoring(address);
      const wallet = repos.wallets.create({ userId, address, label, isContract: state?.isContract, onchainVerified: Boolean(state), lastSyncedBlock: state?.blockNumber ?? null });
      if (state) balanceCache.set(address, state.balanceEth);

      // Importa as movimentações recentes para o painel não começar vazio (analisadas pela mesma fila).
      if (body.importHistory !== false) {
        reputation.recentActivity(address, { limit: 10 })
          .then(activities => onHistoryImported?.(activities))
          .catch(error => logger.warn?.(`[carteiras] histórico inicial indisponível para ${address}: ${error.message}`));
      }
      return { wallet: { ...wallet, balance_eth: state?.balanceEth ?? null }, warnings };
    },

    async update(userId, id, body) {
      const wallet = repos.wallets.findForUser(userId, id);
      if (!wallet) throw notFound("Carteira não encontrada.");
      const fields = requireFields(body, { label: { required: false, min: 1, max: 32 }, status: { required: false, oneOf: ["monitored", "paused"] } });
      if (fields.status && fields.status !== wallet.status) {
        if (fields.status === "paused") await stopMonitoring(wallet.address, wallet.id);
        else {
          await startMonitoring(wallet.address, wallet.id);
          const block = await alchemy.blockNumber().catch(() => null);
          if (block) fields.lastSyncedBlock = block; // ao retomar, não reprocessa o período pausado
        }
      }
      return repos.wallets.update(wallet.id, fields);
    },

    async remove(userId, id) {
      const wallet = repos.wallets.findForUser(userId, id);
      if (!wallet) throw notFound("Carteira não encontrada.");
      if (wallet.status === "monitored") await stopMonitoring(wallet.address, wallet.id);
      repos.wallets.delete(wallet.id);
      return { ok: true };
    },

    async removeAllForUser(userId) {
      for (const wallet of repos.wallets.listByUser(userId)) {
        if (wallet.status === "monitored") await stopMonitoring(wallet.address, wallet.id);
        repos.wallets.delete(wallet.id);
      }
    },
  };
}
