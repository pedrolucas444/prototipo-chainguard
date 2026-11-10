/**
 * Alchemy Client: isola o formato do Alchemy do resto do sistema.
 *  - Notify API: inclui/remove endereços do webhook "Address Activity".
 *  - Webhook: confere a assinatura HMAC e normaliza o payload.
 *  - JSON-RPC (Alchemy ou RPC público): conferência on-chain e recibos.
 */
import crypto from "node:crypto";
import { fetchJson } from "../shared/http-client.js";
import { hmacSha256Hex } from "../shared/security.js";

const NOTIFY_URL = "https://dashboard.alchemy.com/api/update-webhook-addresses";
const lower = v => (typeof v === "string" && v ? v.toLowerCase() : null);

export function createAlchemyClient(config, { fetchImpl = globalThis.fetch } = {}) {
  const { authToken, webhookId, signingKey } = config.alchemy;
  const rpcUrl = config.rpcUrl;
  let rpcId = 0;

  async function rpc(method, params = []) {
    const body = await fetchJson(rpcUrl, { method: "POST", body: { jsonrpc: "2.0", id: ++rpcId, method, params }, fetchImpl, timeoutMs: 10_000 });
    if (body?.error) throw new Error(`RPC ${method}: ${body.error.message}`);
    return body?.result;
  }

  return {
    get webhookEnabled() { return Boolean(authToken && webhookId); },
    get signingEnabled() { return Boolean(signingKey); },

    /** Assinatura do Alchemy: header X-Alchemy-Signature = HMAC-SHA256(signing key, corpo bruto) em hex. */
    verifySignature(rawBody, signature) {
      if (!signingKey || !signature) return false;
      const expected = Buffer.from(hmacSha256Hex(signingKey, rawBody), "hex");
      const received = Buffer.from(String(signature).trim(), "hex");
      return expected.length === received.length && crypto.timingSafeEqual(expected, received);
    },

    /** Inclui/remove endereços do monitoramento. Sem credenciais, não faz nada (modo Job de sincronização). */
    async updateMonitoredAddresses({ add = [], remove = [] }) {
      if (!this.webhookEnabled || (!add.length && !remove.length)) return { skipped: true };
      await fetchJson(NOTIFY_URL, {
        method: "PATCH",
        headers: { "X-Alchemy-Token": authToken },
        body: { webhook_id: webhookId, addresses_to_add: add, addresses_to_remove: remove },
        fetchImpl,
      });
      return { skipped: false };
    },

    /** Converte o payload "ADDRESS_ACTIVITY" no formato interno de atividade. */
    normalizeWebhook(payload) {
      const event = payload?.event ?? {};
      if (payload?.type && payload.type !== "ADDRESS_ACTIVITY") return { ignored: `tipo ${payload.type} não tratado`, activities: [] };
      if (event.network && event.network !== "ETH_MAINNET") return { ignored: `rede ${event.network} fora do escopo`, activities: [] };
      const activities = (event.activity ?? []).map(a => ({
        hash: lower(a.hash),
        from: lower(a.fromAddress),
        to: lower(a.toAddress),
        value: Number(a.value ?? 0) || 0,
        valueRaw: a.rawContract?.rawValue ?? null,
        asset: a.asset ?? (a.category === "external" || a.category === "internal" ? "ETH" : "TOKEN"),
        category: a.category ?? "external",
        contractAddress: lower(a.rawContract?.address),
        blockNumber: a.blockNum ? parseInt(a.blockNum, 16) : null,
        logIndex: a.log?.logIndex !== undefined ? parseInt(a.log.logIndex, 16) : null,
        traceId: a.category === "internal" ? (a.typeTraceAddress ?? null) : null,
        removed: Boolean(a.log?.removed || a.removed),
        occurredAt: payload.createdAt ?? new Date().toISOString(),
        inputData: null,
      })).filter(a => a.hash && a.from);
      return { webhookId: payload?.webhookId, eventId: payload?.id, activities };
    },

    rpc,
    async getAccountState(address) {
      const [balance, nonce, code, block] = await Promise.all([
        rpc("eth_getBalance", [address, "latest"]),
        rpc("eth_getTransactionCount", [address, "latest"]),
        rpc("eth_getCode", [address, "latest"]),
        rpc("eth_blockNumber"),
      ]);
      return {
        balanceWei: BigInt(balance ?? "0x0").toString(),
        balanceEth: Number(BigInt(balance ?? "0x0")) / 1e18,
        nonce: Number(BigInt(nonce ?? "0x0")),
        isContract: Boolean(code && code !== "0x"),
        blockNumber: Number(BigInt(block ?? "0x0")),
      };
    },
    getBalances: async addresses => Promise.all(addresses.map(a => rpc("eth_getBalance", [a, "latest"]).then(v => Number(BigInt(v)) / 1e18).catch(() => null))),
    getTransaction: hash => rpc("eth_getTransactionByHash", [hash]),
    getTransactionReceipt: hash => rpc("eth_getTransactionReceipt", [hash]),
    blockNumber: async () => Number(BigInt(await rpc("eth_blockNumber"))),
  };
}
