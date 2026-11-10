import { evaluateRisk, DEFAULT_RISK_PARAMS, normalizeRiskParams } from "../../motor-risco/index.js";
import { badRequest, requireFields } from "../../shared/errors.js";
import { validateAddress } from "../../shared/address.js";

/**
 * Risk Service: reúne os dados (banco + reputação) e chama o Motor de Risco.
 * Usado tanto pelo fluxo assíncrono (transação recebida) quanto pelo síncrono (verificar destino).
 */
export function createRiskService({ repos, integrations }) {
  const params = () => normalizeRiskParams(repos.settings.get("risk_params", DEFAULT_RISK_PARAMS));

  function knownAddressesFor(userId, exclude) {
    const set = new Set([
      ...repos.wallets.addressesOfUser(userId),
      ...repos.whitelist.addresses(userId),
      ...repos.transactions.outgoingCounterparties(userId),
    ]);
    set.delete(exclude);
    return [...set];
  }

  async function evaluate({ userId, kind, direction, counterparty, value = 0, asset = "ETH", category = "external", tokenContract = null, approvals = [] }) {
    const toCheck = [counterparty, tokenContract, ...approvals.flatMap(a => [a.spender, a.token])].filter(Boolean);
    const [reputation, accountInfo] = await Promise.all([
      integrations.reputation.addressSecurity(counterparty),
      integrations.reputation.accountInfo(counterparty),
    ]);
    const account = { ...accountInfo, isContract: Boolean(accountInfo.isContract || (reputation.available && reputation.isContract)) };
    const input = {
      kind,
      direction,
      counterparty,
      value,
      asset,
      category,
      approvals,
      blacklistHits: repos.malicious.findByAddresses(toCheck),
      reputation,
      account,
      knownAddresses: knownAddressesFor(userId, counterparty),
      now: new Date().toISOString(),
    };
    const result = evaluateRisk(input, params());
    return { ...result, sources: { reputation: reputation.source, reputationAvailable: reputation.available, account: account.source, accountAvailable: account.available } };
  }

  return {
    params,
    evaluate,

    /** Verificação síncrona do destino (Send Modal e tela "Analisar destino"). */
    async checkDestination(userId, body) {
      const fields = requireFields(body, { address: {}, amount: { type: "number", required: false, min: 0 }, asset: { required: false, max: 10 } });
      const check = validateAddress(fields.address);
      if (!check.ok) throw badRequest(check.reason, { address: check.reason });
      const address = check.address;
      const whitelisted = repos.whitelist.find(userId, address);
      if (whitelisted) {
        return { address, whitelisted: true, whitelistLabel: whitelisted.label, level: null, score: null, factors: [], notes: ["Endereço na sua whitelist: a análise foi dispensada."] };
      }
      const ownWallet = repos.wallets.findByUserAndAddress(userId, address);
      const result = await evaluate({ userId, kind: "destination", direction: "out", counterparty: address, value: fields.amount ?? 0, asset: fields.asset ?? "ETH" });
      if (ownWallet) result.notes.unshift(`Este endereço é a sua carteira "${ownWallet.label}".`);
      return { address, whitelisted: false, ...result, disclaimer: "Classificação estimada a partir de heurísticas e dados públicos. Não é garantia." };
    },
  };
}
