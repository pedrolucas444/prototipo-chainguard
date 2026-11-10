/**
 * Reputation Client:
 *  - GoPlus (address_security): flags de golpe por endereço, consulta pontual na hora da análise.
 *  - Explorer (Etherscan se houver chave, senão Blockscout, ambos com API compatível):
 *    dados básicos da conta (idade, histórico) e atividade recente para o Job de sincronização.
 *
 * Rótulos de reputação do Etherscan exigem plano Pro Plus (a confirmar); não são usados.
 */
import { createTtlCache, fetchJson } from "../shared/http-client.js";

const GOPLUS_FLAGS = {
  phishing_activities: { label: "phishing", strong: true },
  stealing_attack: { label: "roubo de fundos", strong: true },
  sanctioned: { label: "sancionado", strong: true },
  cybercrime: { label: "crime cibernético", strong: true },
  money_laundering: { label: "lavagem de dinheiro", strong: true },
  financial_crime: { label: "crime financeiro", strong: true },
  blackmail_activities: { label: "extorsão", strong: true },
  darkweb_transactions: { label: "transações na darkweb", strong: true },
  honeypot_related_address: { label: "ligado a honeypot", strong: true },
  fake_kyc: { label: "KYC falso", strong: true },
  malicious_mining_activities: { label: "mineração maliciosa", strong: true },
  fake_token: { label: "token falso", strong: true },
  fake_standard_interface: { label: "interface de token falsa", strong: true },
  mixer: { label: "mixer", strong: false },
  blacklist_doubt: { label: "suspeita de lista negra", strong: false },
  gas_abuse: { label: "abuso de gas", strong: false },
  reinit: { label: "contrato reinicializável", strong: false },
};

const lower = v => (typeof v === "string" && v ? v.toLowerCase() : null);

export function createReputationClient(config, { fetchImpl = globalThis.fetch } = {}) {
  const goplusCache = createTtlCache(10 * 60_000);
  const accountCache = createTtlCache(30 * 60_000);
  const goplusHeaders = config.goplus.accessToken ? { Authorization: config.goplus.accessToken } : {};

  function explorerUrl(params) {
    const qs = new URLSearchParams(params);
    if (config.etherscanApiKey) {
      qs.set("chainid", "1");
      qs.set("apikey", config.etherscanApiKey);
      return `https://api.etherscan.io/v2/api?${qs}`;
    }
    return `${config.blockscoutUrl}/api?${qs}`;
  }
  const explorerName = config.etherscanApiKey ? "Etherscan" : "Blockscout";

  async function explorerList(params) {
    const body = await fetchJson(explorerUrl(params), { fetchImpl, timeoutMs: 12_000 });
    if (body?.status === "1" && Array.isArray(body.result)) return body.result;
    if (/no (transactions|token transfers) found/i.test(body?.message ?? "")) return [];
    throw new Error(`${explorerName}: ${body?.message ?? "resposta inesperada"}`);
  }

  return {
    sourceName: "GoPlus Security",
    explorerName,

    /** Nunca lança erro: devolve { available: false } se a fonte estiver fora do ar. */
    async addressSecurity(address) {
      const cached = goplusCache.get(address);
      if (cached) return cached;
      try {
        const body = await fetchJson(`https://api.gopluslabs.io/api/v1/address_security/${address}?chain_id=1`, { headers: goplusHeaders, fetchImpl, timeoutMs: 8000 });
        if (body?.code !== 1 || !body.result) throw new Error(body?.message ?? "resposta inesperada");
        const r = body.result;
        const flags = Object.entries(GOPLUS_FLAGS).filter(([key]) => r[key] === "1").map(([key, meta]) => ({ key, ...meta }));
        if (Number(r.number_of_malicious_contracts_created) > 0) flags.push({ key: "malicious_contracts_created", label: `criou ${r.number_of_malicious_contracts_created} contrato(s) malicioso(s)`, strong: true });
        const result = { available: true, source: "GoPlus", flags, dataSource: r.data_source || null, isContract: r.contract_address === "1" };
        goplusCache.set(address, result);
        return result;
      } catch (error) {
        return { available: false, source: "GoPlus", flags: [], error: error.message };
      }
    },

    /** Idade/histórico da conta. Nunca lança erro. */
    async accountInfo(address) {
      const cached = accountCache.get(address);
      if (cached) return cached;
      try {
        const first = await explorerList({ module: "account", action: "txlist", address, sort: "asc", page: "1", offset: "1" });
        let firstSeenAt = first[0] ? new Date(Number(first[0].timeStamp) * 1000).toISOString() : null;
        let hasHistory = first.length > 0;
        if (!hasHistory) {
          // Pode ter recebido só tokens (sem transação "normal").
          const tokens = await explorerList({ module: "account", action: "tokentx", address, sort: "asc", page: "1", offset: "1" });
          hasHistory = tokens.length > 0;
          firstSeenAt = tokens[0] ? new Date(Number(tokens[0].timeStamp) * 1000).toISOString() : null;
        }
        const result = { available: true, hasHistory, firstSeenAt, source: explorerName };
        accountCache.set(address, result);
        return result;
      } catch (error) {
        return { available: false, error: error.message, source: explorerName };
      }
    },

    /** Atividade recente (normalizada no mesmo formato do webhook) para o Job de sincronização. */
    async recentActivity(address, { startBlock = 0, limit = 30 } = {}) {
      return (await fetchActivity(address, { startBlock, limit, sort: "desc" })).activities;
    },

    /**
     * Atividade a partir de um bloco, em ordem crescente, para a sincronização incremental.
     * nextStartBlock só avança até onde as duas listas (normais e tokens) foram lidas por completo:
     * se uma lista veio cheia, o próximo ciclo recomeça do último bloco dela (duplicatas são descartadas).
     */
    async activitySince(address, { startBlock = 0, limit = 100 } = {}) {
      const { activities, normal, tokens } = await fetchActivity(address, { startBlock, limit, sort: "asc" });
      const lastBlock = list => Number(list.at(-1)?.blockNumber ?? startBlock);
      const full = [normal, tokens].filter(list => list.length >= limit);
      const nextStartBlock = full.length
        ? Math.max(startBlock, Math.min(...full.map(lastBlock)))
        : Math.max(startBlock, ...activities.map(a => a.blockNumber ?? 0));
      return { activities, nextStartBlock };
    },
  };

  async function fetchActivity(address, { startBlock, limit, sort }) {
    const common = { module: "account", address, sort, page: "1", offset: String(limit), startblock: String(startBlock) };
    const [normal, tokens] = await Promise.all([
      explorerList({ ...common, action: "txlist" }),
      explorerList({ ...common, action: "tokentx" }),
    ]);
    const activities = [
      ...normal.filter(t => t.isError !== "1").map(t => ({
        hash: lower(t.hash), from: lower(t.from), to: lower(t.to) ?? lower(t.contractAddress), value: Number(BigInt(t.value || "0")) / 1e18, valueRaw: t.value,
        asset: "ETH", category: "external", contractAddress: null, blockNumber: Number(t.blockNumber), logIndex: null, removed: false,
        occurredAt: new Date(Number(t.timeStamp) * 1000).toISOString(), inputData: t.input && t.input !== "0x" ? t.input.slice(0, 2 + 8 + 64 * 2) : null,
      })),
      ...tokens.map(t => {
        const decimals = Number(t.tokenDecimal || 18);
        return {
          hash: lower(t.hash), from: lower(t.from), to: lower(t.to), value: Number(t.value || "0") / 10 ** decimals, valueRaw: t.value,
          asset: t.tokenSymbol || "TOKEN", category: "token", contractAddress: lower(t.contractAddress), blockNumber: Number(t.blockNumber),
          logIndex: t.logIndex !== undefined && t.logIndex !== "" ? Number(t.logIndex) : null, removed: false,
          occurredAt: new Date(Number(t.timeStamp) * 1000).toISOString(), inputData: null,
        };
      }),
    ];
    return { activities: activities.filter(a => a.hash && a.from), normal, tokens };
  }
}
