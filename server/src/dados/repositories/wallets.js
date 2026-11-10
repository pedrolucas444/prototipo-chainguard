import { plain } from "../db.js";

export function createWalletsRepository(db) {
  return {
    findById: id => plain(db.prepare("SELECT * FROM wallets WHERE id = ?").get(id)),
    findForUser: (userId, id) => plain(db.prepare("SELECT * FROM wallets WHERE id = ? AND user_id = ?").get(id, userId)),
    listByUser: userId => db.prepare(`
      SELECT w.*,
        (SELECT COUNT(*) FROM transactions t WHERE t.wallet_id = w.id AND t.status != 'removed') AS tx_count,
        (SELECT COUNT(*) FROM transactions t WHERE t.wallet_id = w.id AND t.risk_level = 'high' AND t.status = 'analyzed') AS high_count,
        (SELECT MAX(occurred_at) FROM transactions t WHERE t.wallet_id = w.id AND t.status != 'removed') AS last_activity_at
      FROM wallets w WHERE w.user_id = ? ORDER BY w.created_at`).all(userId).map(plain),
    findByUserAndAddress: (userId, address) => plain(db.prepare("SELECT * FROM wallets WHERE user_id = ? AND address = ?").get(userId, address)),
    /** Carteiras monitoradas (de qualquer usuário) que tenham este endereço. */
    monitoredByAddress: address => db.prepare("SELECT * FROM wallets WHERE address = ? AND status = 'monitored'").all(address).map(plain),
    listMonitored: () => db.prepare("SELECT * FROM wallets WHERE status = 'monitored'").all().map(plain),
    distinctMonitoredAddresses: () => db.prepare("SELECT DISTINCT address FROM wallets WHERE status = 'monitored'").all().map(r => r.address),
    countMonitoredWithAddress: (address, excludeId = 0) => db.prepare("SELECT COUNT(*) AS n FROM wallets WHERE address = ? AND status = 'monitored' AND id != ?").get(address, excludeId).n,
    addressesOfUser: userId => db.prepare("SELECT address FROM wallets WHERE user_id = ?").all(userId).map(r => r.address),
    create({ userId, address, label, isContract, onchainVerified, lastSyncedBlock }) {
      const { lastInsertRowid } = db.prepare("INSERT INTO wallets (user_id, address, label, is_contract, onchain_verified, last_synced_block) VALUES (?, ?, ?, ?, ?, ?)")
        .run(userId, address, label, isContract ? 1 : 0, onchainVerified ? 1 : 0, lastSyncedBlock ?? null);
      return this.findById(Number(lastInsertRowid));
    },
    update(id, { label, status, lastSyncedBlock }) {
      if (label !== undefined) db.prepare("UPDATE wallets SET label = ? WHERE id = ?").run(label, id);
      if (status !== undefined) db.prepare("UPDATE wallets SET status = ? WHERE id = ?").run(status, id);
      if (lastSyncedBlock !== undefined) db.prepare("UPDATE wallets SET last_synced_block = ? WHERE id = ?").run(lastSyncedBlock, id);
      return this.findById(id);
    },
    delete: id => db.prepare("DELETE FROM wallets WHERE id = ?").run(id),
    countAll: () => db.prepare("SELECT COUNT(*) AS n, SUM(status = 'monitored') AS monitored FROM wallets").get(),
  };
}
