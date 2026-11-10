import { nowIso, plain } from "../db.js";
import { sha256 } from "../../shared/security.js";

const PUBLIC_COLUMNS = "id, email, name, role, status, totp_enabled, created_at, last_login_at";

export function createUsersRepository(db) {
  return {
    findById: id => plain(db.prepare("SELECT * FROM users WHERE id = ?").get(id)),
    findByEmail: email => plain(db.prepare("SELECT * FROM users WHERE email = ?").get(email)),
    count: () => db.prepare("SELECT COUNT(*) AS n FROM users").get().n,
    countAdmins: () => db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'").get().n,
    create({ email, name, passwordHash, role = "customer" }) {
      const { lastInsertRowid } = db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)").run(email, name, passwordHash, role);
      return this.findById(Number(lastInsertRowid));
    },
    list({ search = "", limit = 100, offset = 0 } = {}) {
      const like = `%${search}%`;
      const rows = db.prepare(`
        SELECT ${PUBLIC_COLUMNS},
          (SELECT COUNT(*) FROM wallets w WHERE w.user_id = u.id) AS wallet_count,
          (SELECT COUNT(*) FROM transactions t WHERE t.user_id = u.id) AS tx_count
        FROM users u WHERE email LIKE ? OR name LIKE ? ORDER BY id LIMIT ? OFFSET ?`).all(like, like, limit, offset);
      return rows.map(plain);
    },
    update(id, fields) {
      const map = { name: "name", role: "role", status: "status", passwordHash: "password_hash", totpSecretEnc: "totp_secret_enc", totpPendingEnc: "totp_pending_enc", totpEnabled: "totp_enabled", totpLastStep: "totp_last_step", lastLoginAt: "last_login_at" };
      const entries = Object.entries(fields).filter(([k]) => map[k]);
      if (!entries.length) return this.findById(id);
      db.prepare(`UPDATE users SET ${entries.map(([k]) => `${map[k]} = ?`).join(", ")} WHERE id = ?`).run(...entries.map(([, v]) => v), id);
      return this.findById(id);
    },
    delete: id => db.prepare("DELETE FROM users WHERE id = ?").run(id),

    // ---- sessões ----
    createSession({ token, userId, kind = "session", ttlMs }) {
      db.prepare("INSERT INTO sessions (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)").run(sha256(token), userId, kind, new Date(Date.now() + ttlMs).toISOString());
    },
    findSession(token, kind = "session") {
      return plain(db.prepare("SELECT * FROM sessions WHERE token_hash = ? AND kind = ? AND expires_at > ?").get(sha256(token), kind, nowIso()));
    },
    bumpChallengeAttempts: id => db.prepare("UPDATE sessions SET attempts = attempts + 1 WHERE id = ?").run(id),
    deleteSession: token => db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token)),
    deleteSessionById: id => db.prepare("DELETE FROM sessions WHERE id = ?").run(id),
    deleteSessionsOfUser: userId => db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId),
    purgeExpiredSessions: () => db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso()).changes,

    // ---- códigos de recuperação ----
    replaceRecoveryCodes(userId, codeHashes) {
      db.prepare("DELETE FROM recovery_codes WHERE user_id = ?").run(userId);
      const insert = db.prepare("INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)");
      for (const hash of codeHashes) insert.run(userId, hash);
    },
    useRecoveryCode(userId, codeHash) {
      return db.prepare("UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL").run(nowIso(), userId, codeHash).changes === 1;
    },
    remainingRecoveryCodes: userId => db.prepare("SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL").get(userId).n,
  };
}
