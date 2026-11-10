import { nowIso, parseJson, plain } from "../db.js";

function hydrate(row) {
  if (!row) return null;
  const tx = plain(row);
  tx.risk_factors = parseJson(tx.risk_factors, []);
  tx.risk_notes = parseJson(tx.risk_notes, []);
  tx.whitelisted = Boolean(tx.whitelisted);
  tx.alert_seen = Boolean(tx.alert_seen);
  return tx;
}

export function createTransactionsRepository(db) {
  return {
    findById: id => hydrate(db.prepare("SELECT * FROM transactions WHERE id = ?").get(id)),
    findForUser: (userId, id) => hydrate(db.prepare(`
      SELECT t.*, w.label AS wallet_label, w.address AS wallet_address FROM transactions t
      JOIN wallets w ON w.id = t.wallet_id WHERE t.id = ? AND t.user_id = ?`).get(id, userId)),

    /** Insere ignorando duplicatas (entrega "pelo menos uma vez"). Retorna o id ou null se já existia. */
    insertIfNew(tx) {
      const result = db.prepare(`
        INSERT INTO transactions (user_id, wallet_id, dedup_key, hash, direction, from_address, to_address, counterparty,
          value, value_raw, asset, category, contract_address, input_data, block_number, occurred_at, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (wallet_id, dedup_key) DO NOTHING`).run(
        tx.userId, tx.walletId, tx.dedupKey, tx.hash, tx.direction, tx.from, tx.to ?? null, tx.counterparty ?? null,
        tx.value ?? 0, tx.valueRaw ?? null, tx.asset ?? "ETH", tx.category ?? "external", tx.contractAddress ?? null,
        tx.inputData ?? null, tx.blockNumber ?? null, tx.occurredAt ?? nowIso(), tx.source);
      return result.changes ? Number(result.lastInsertRowid) : null;
    },
    /**
     * Reorg desfeito: a mesma atividade voltou a ser minerada depois de marcada como removida.
     * Reabre a linha para nova análise e devolve o id (ou null se não havia linha removida).
     */
    reviveRemoved(walletId, dedupKey, blockNumber) {
      const row = db.prepare("SELECT id FROM transactions WHERE wallet_id = ? AND dedup_key = ? AND status = 'removed'").get(walletId, dedupKey);
      if (!row) return null;
      db.prepare(`UPDATE transactions SET status = 'pending', block_number = COALESCE(?, block_number), risk_level = NULL, risk_score = NULL,
        risk_factors = NULL, risk_notes = NULL, whitelisted = 0, analyzed_at = NULL, alert_seen = 1 WHERE id = ?`).run(blockNumber ?? null, row.id);
      return Number(row.id);
    },
    markRemoved(walletId, dedupKey) {
      return db.prepare("UPDATE transactions SET status = 'removed' WHERE wallet_id = ? AND dedup_key = ?").run(walletId, dedupKey).changes;
    },
    saveAnalysis(id, { level, score, factors, notes, whitelisted }) {
      db.prepare(`UPDATE transactions SET status = 'analyzed', risk_level = ?, risk_score = ?, risk_factors = ?, risk_notes = ?, whitelisted = ?, analyzed_at = ?,
        alert_seen = CASE WHEN ? IN ('medium', 'high') THEN 0 ELSE 1 END WHERE id = ? AND status != 'removed'`)
        .run(level ?? null, score ?? null, JSON.stringify(factors ?? []), JSON.stringify(notes ?? []), whitelisted ? 1 : 0, nowIso(), level ?? null, id);
    },
    markFailed: id => db.prepare("UPDATE transactions SET status = 'failed' WHERE id = ? AND status = 'pending'").run(id),
    resetToPending: id => db.prepare("UPDATE transactions SET status = 'pending' WHERE id = ? AND status = 'failed'").run(id),

    list(userId, { level, from, to, address, walletId, status, limit = 50, offset = 0 } = {}) {
      const where = ["t.user_id = ?", "t.status != 'removed'"]; // removidas por reorg não existem mais na rede
      const args = [userId];
      if (level === "whitelisted") where.push("t.whitelisted = 1");
      else if (level === "pending") where.push("t.status IN ('pending', 'failed')");
      else if (level) { where.push("t.risk_level = ?"); args.push(level); }
      if (status) { where.push("t.status = ?"); args.push(status); }
      if (from) { where.push("t.occurred_at >= ?"); args.push(from); }
      if (to) { where.push("t.occurred_at <= ?"); args.push(to); }
      if (address) {
        const like = `%${address.replace(/[\\%_]/g, c => `\\${c}`)}%`;
        where.push("(t.from_address LIKE ? ESCAPE '\\' OR t.to_address LIKE ? ESCAPE '\\' OR t.hash LIKE ? ESCAPE '\\')");
        args.push(like, like, like);
      }
      if (walletId) { where.push("t.wallet_id = ?"); args.push(walletId); }
      const sqlWhere = where.join(" AND ");
      const total = db.prepare(`SELECT COUNT(*) AS n FROM transactions t WHERE ${sqlWhere}`).get(...args).n;
      const items = db.prepare(`
        SELECT t.*, w.label AS wallet_label, w.address AS wallet_address FROM transactions t
        JOIN wallets w ON w.id = t.wallet_id WHERE ${sqlWhere}
        ORDER BY t.occurred_at DESC, t.id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset).map(hydrate);
      return { total, items };
    },
    alerts(userId, { onlyUnseen = false, limit = 100 } = {}) {
      return db.prepare(`
        SELECT t.*, w.label AS wallet_label, w.address AS wallet_address FROM transactions t
        JOIN wallets w ON w.id = t.wallet_id
        WHERE t.user_id = ? AND t.status = 'analyzed' AND t.risk_level IN ('medium', 'high') ${onlyUnseen ? "AND t.alert_seen = 0" : ""}
        ORDER BY t.occurred_at DESC LIMIT ?`).all(userId, limit).map(hydrate);
    },
    markAlertsSeen(userId, ids) {
      if (!ids) return db.prepare("UPDATE transactions SET alert_seen = 1 WHERE user_id = ?").run(userId).changes;
      const stmt = db.prepare("UPDATE transactions SET alert_seen = 1 WHERE user_id = ? AND id = ?");
      return ids.reduce((n, id) => n + stmt.run(userId, id).changes, 0);
    },
    /** Endereços com que o usuário já interagiu enviando fundos (base da regra de similaridade). */
    outgoingCounterparties(userId) {
      return db.prepare("SELECT DISTINCT to_address AS address FROM transactions WHERE user_id = ? AND direction = 'out' AND to_address IS NOT NULL AND status != 'removed' AND NOT (category != 'external' AND category != 'internal' AND value = 0)")
        .all(userId).map(r => r.address);
    },
    summary(userId) {
      return plain(db.prepare(`
        SELECT COUNT(*) AS total,
          SUM(risk_level = 'high' AND status = 'analyzed') AS high,
          SUM(risk_level = 'medium' AND status = 'analyzed') AS medium,
          SUM(risk_level = 'low' AND status = 'analyzed') AS low,
          SUM(whitelisted = 1) AS whitelisted,
          SUM(status IN ('pending', 'failed')) AS pending,
          SUM(alert_seen = 0 AND risk_level IN ('medium', 'high') AND status = 'analyzed') AS unseen_alerts
        FROM transactions WHERE user_id = ? AND status != 'removed'`).get(userId));
    },
    countAll: () => plain(db.prepare("SELECT COUNT(*) AS n, SUM(risk_level = 'high') AS high FROM transactions").get()),
  };
}
