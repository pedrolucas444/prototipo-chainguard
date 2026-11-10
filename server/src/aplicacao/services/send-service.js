import { badRequest, notFound, requireFields } from "../../shared/errors.js";
import { validateAddress } from "../../shared/address.js";

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Envio de fundos: o ChainGuard nunca assina nada. O front verifica o destino, a carteira
 * do usuário assina e transmite, e aqui só registramos o envio e consultamos o status na rede.
 * Decisão para o ponto em aberto nº 6: o status vem da rede (recibo via RPC), não da carteira.
 */
const DROPPED_AFTER_MS = 60 * 60_000;

export function createSendService({ repos, integrations, riskService }) {
  return {
    /**
     * Registra um envio já assinado e transmitido pela carteira. O nível de risco gravado é o calculado
     * aqui no servidor (não o informado pelo navegador). A confirmação de alto risco acontece antes da
     * assinatura, no navegador; como a transação já está na rede, o registro nunca é recusado por isso.
     */
    async record(userId, body) {
      const f = requireFields(body, {
        hash: {}, from: {}, to: {}, amount: { type: "number", min: 0 }, asset: { max: 10 },
        riskLevel: { required: false, oneOf: ["low", "medium", "high"] }, whitelisted: { type: "boolean", required: false }, confirmedHighRisk: { type: "boolean", required: false },
      });
      if (!HASH_RE.test(f.hash)) throw badRequest("Hash de transação inválido.");
      const from = validateAddress(f.from);
      const to = validateAddress(f.to);
      if (!from.ok || !to.ok) throw badRequest("Endereço inválido.");
      const server = await riskService?.checkDestination(userId, { address: to.address }).catch(() => null);
      const riskLevel = server ? (server.whitelisted ? null : server.level) : f.riskLevel;
      const whitelisted = server ? Boolean(server.whitelisted) : f.whitelisted;
      return repos.sends.create({ userId, hash: f.hash.toLowerCase(), from: from.address, to: to.address, amount: f.amount, asset: f.asset.toUpperCase(), riskLevel, whitelisted, confirmedHighRisk: f.confirmedHighRisk });
    },

    list: userId => repos.sends.list(userId),

    async status(userId, hash) {
      const send = repos.sends.find(userId, String(hash).toLowerCase());
      if (!send) throw notFound("Envio não encontrado.");
      if (send.status !== "pending") return send;
      const receipt = await integrations.alchemy.getTransactionReceipt(send.hash).catch(() => null);
      if (!receipt) {
        // Sem recibo depois de 1 h e sem a transação no mempool: provavelmente substituída (mesmo nonce) ou descartada.
        if (Date.now() - new Date(send.created_at).getTime() > DROPPED_AFTER_MS) {
          const tx = await integrations.alchemy.getTransaction(send.hash).catch(() => undefined);
          if (tx === null) return { ...send, network: "não encontrada na rede: pode ter sido substituída ou descartada", dropped: true };
        }
        return { ...send, network: "aguardando inclusão em bloco" };
      }
      const status = receipt.status === "0x1" ? "confirmed" : "failed";
      const blockNumber = Number(BigInt(receipt.blockNumber));
      repos.sends.updateStatus(send.id, status, blockNumber);
      return repos.sends.find(userId, send.hash);
    },

    assets: () => repos.catalog.assets().filter(a => a.symbol !== "BRL" && (a.symbol === "ETH" || a.contract_address)),
  };
}
