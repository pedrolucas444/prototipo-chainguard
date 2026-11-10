import { MENSAGENS } from "../events/mensagens.js";
import { notFound } from "../../shared/errors.js";
import { decodeApproval } from "../../shared/abi.js";

const kindOf = category => (category === "external" ? "external" : category === "internal" ? "internal" : "token");

/** Chave de deduplicação estável entre reenvios (independe da fonte: webhook ou sincronização). */
// logIndex distingue eventos de token; traceId distingue transferências internas da mesma transação.
export const dedupKeyFor = a => [a.hash, kindOf(a.category), a.logIndex ?? a.traceId ?? a.asset, a.from, a.to ?? ""].join(":");

export function createTransactionService({ repos, integrations, publisher, riskService, runInTransaction = fn => fn(), logger = console }) {
  /**
   * Recebe atividades normalizadas, descarta duplicatas, trata eventos removidos (reorg),
   * grava e publica "transação recebida". Não faz análise aqui: responde rápido.
   */
  function ingest(activities, source) {
    const stats = { received: activities.length, inserted: 0, duplicates: 0, removed: 0, ignored: 0, revived: 0 };
    // Gravar e publicar na mesma transação SQL: se o processo cair no meio, o reenvio do Alchemy não vira "duplicata" sem mensagem.
    return runInTransaction(() => ingestAll(activities, source, stats));
  }

  function ingestAll(activities, source, stats) {
    for (const activity of activities) {
      const wallets = new Map();
      for (const w of [...repos.wallets.monitoredByAddress(activity.from), ...(activity.to ? repos.wallets.monitoredByAddress(activity.to) : [])]) wallets.set(w.id, w);
      if (!wallets.size) { stats.ignored++; continue; }
      const dedupKey = dedupKeyFor(activity);
      for (const wallet of wallets.values()) {
        if (activity.removed) {
          stats.removed += repos.transactions.markRemoved(wallet.id, dedupKey);
          continue;
        }
        const direction = activity.from === wallet.address && activity.to === wallet.address ? "self" : activity.from === wallet.address ? "out" : "in";
        const id = repos.transactions.insertIfNew({
          userId: wallet.user_id,
          walletId: wallet.id,
          dedupKey,
          hash: activity.hash,
          direction,
          from: activity.from,
          to: activity.to,
          counterparty: direction === "out" ? activity.to : direction === "in" ? activity.from : wallet.address,
          value: activity.value,
          valueRaw: activity.valueRaw,
          asset: activity.asset,
          category: activity.category,
          contractAddress: activity.contractAddress,
          inputData: activity.inputData,
          blockNumber: activity.blockNumber,
          occurredAt: activity.occurredAt,
          source,
        });
        if (id) {
          stats.inserted++;
          publisher.publish(MENSAGENS.TRANSACAO_RECEBIDA, { transactionId: id });
          continue;
        }
        // Reorg desfeito: a atividade marcada como removida foi minerada de novo.
        const revivedId = repos.transactions.reviveRemoved(wallet.id, dedupKey, activity.blockNumber);
        if (revivedId) {
          stats.revived++;
          publisher.publish(MENSAGENS.TRANSACAO_RECEBIDA, { transactionId: revivedId });
        } else stats.duplicates++;
      }
    }
    return stats;
  }

  async function approvalsFor(tx) {
    if (tx.direction !== "out" || tx.category !== "external") return [];
    let input = tx.input_data;
    if (!input) {
      const onchain = await integrations.alchemy.getTransaction(tx.hash).catch(() => null);
      input = onchain?.input ?? null;
    }
    const approval = decodeApproval(input, tx.to_address);
    return approval ? [approval] : [];
  }

  return {
    ingest,

    handleWebhook(payload) {
      const normalized = integrations.alchemy.normalizeWebhook(payload);
      if (normalized.ignored) return { ignored: normalized.ignored };
      return ingest(normalized.activities, "alchemy");
    },

    /** Handler da mensagem TRANSACAO_RECEBIDA (chamado pelo Consumer). */
    async analyze(transactionId) {
      const tx = repos.transactions.findById(transactionId);
      if (!tx || tx.status === "removed") return;
      if (tx.direction === "self") {
        repos.transactions.saveAnalysis(tx.id, { level: "low", score: 0, factors: [], notes: ["Transferência entre a mesma carteira."] });
        return;
      }
      // Só a contraparte importa: se o usuário colocar a própria carteira na whitelist, as demais transações dela continuam analisadas.
      const whitelist = new Set(repos.whitelist.addresses(tx.user_id));
      if (tx.counterparty && whitelist.has(tx.counterparty)) {
        repos.transactions.saveAnalysis(tx.id, { level: null, score: null, factors: [], notes: [`Análise ignorada: ${tx.direction === "out" ? "o destino" : "a origem"} está na sua whitelist.`], whitelisted: true });
        return;
      }
      const approvals = await approvalsFor(tx);
      const result = await riskService.evaluate({
        userId: tx.user_id,
        kind: "transaction",
        direction: tx.direction,
        counterparty: tx.counterparty,
        value: tx.value,
        asset: tx.asset,
        category: tx.category,
        tokenContract: tx.contract_address,
        approvals,
      });
      repos.transactions.saveAnalysis(tx.id, { level: result.level, score: result.score, factors: result.factors, notes: result.notes });
    },

    /** Chamado quando a mensagem vai para a fila de mortas. */
    markFailed(transactionId) {
      repos.transactions.markFailed(transactionId);
    },

    list(userId, query) {
      const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
      const offset = Math.max(Number(query.offset) || 0, 0);
      const level = ["low", "medium", "high", "whitelisted", "pending"].includes(query.level) ? query.level : undefined;
      const toIso = v => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);
      const to = query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? new Date(`${query.to}T23:59:59.999Z`).toISOString() : toIso(query.to);
      return repos.transactions.list(userId, {
        level,
        from: toIso(query.from),
        to,
        address: query.address ? String(query.address).toLowerCase().slice(0, 66) : undefined,
        walletId: Number(query.walletId) || undefined,
        limit,
        offset,
      });
    },

    get(userId, id) {
      const tx = repos.transactions.findForUser(userId, id);
      if (!tx) throw notFound("Transação não encontrada.");
      return tx;
    },

    /** Reprocessar a análise de uma transação (ex.: após falha de fonte externa). */
    reanalyze(userId, id) {
      const tx = repos.transactions.findForUser(userId, id);
      if (!tx) throw notFound("Transação não encontrada.");
      repos.transactions.resetToPending(tx.id);
      publisher.publish(MENSAGENS.TRANSACAO_RECEBIDA, { transactionId: tx.id });
      return { queued: true };
    },

    alerts(userId, query = {}) {
      return repos.transactions.alerts(userId, { onlyUnseen: query.unseen === "1" || query.unseen === "true" });
    },
    markAlertsSeen(userId, body) {
      const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter(Number.isInteger) : null;
      return { updated: repos.transactions.markAlertsSeen(userId, ids) };
    },

    summary(userId) {
      const s = repos.transactions.summary(userId);
      return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v ?? 0]));
    },
  };
}
