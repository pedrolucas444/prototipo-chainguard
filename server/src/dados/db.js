import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function openDatabase(file = ":memory:") {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON;");
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(fs.readFileSync(path.join(here, "schema.sql"), "utf8"));
  migrate(db);
  return db;
}

/** Colunas adicionadas depois da primeira versão do schema (bancos já existentes). */
function migrate(db) {
  const has = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
  if (!has("users", "totp_last_step")) db.exec("ALTER TABLE users ADD COLUMN totp_last_step INTEGER NOT NULL DEFAULT -1");
}

/** Executa fn dentro de uma transação SQL (commit/rollback automáticos). */
export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export const nowIso = () => new Date().toISOString();
export const parseJson = (text, fallback = null) => {
  if (text === null || text === undefined) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
};
/** node:sqlite devolve objetos sem protótipo; convertemos para objetos comuns. */
export const plain = row => (row ? { ...row } : null);
