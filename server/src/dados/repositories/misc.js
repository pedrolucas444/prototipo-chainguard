import { nowIso, parseJson, plain } from "../db.js";

export function createWhitelistRepository(db) {
  return {
    list: userId => db.prepare("SELECT * FROM whitelist WHERE user_id = ? ORDER BY created_at DESC").all(userId).map(plain),
    addresses: userId => db.prepare("SELECT address FROM whitelist WHERE user_id = ?").all(userId).map(r => r.address),
    find: (userId, address) => plain(db.prepare("SELECT * FROM whitelist WHERE user_id = ? AND address = ?").get(userId, address)),
    findById: (userId, id) => plain(db.prepare("SELECT * FROM whitelist WHERE user_id = ? AND id = ?").get(userId, id)),
    create({ userId, address, label }) {
      const { lastInsertRowid } = db.prepare("INSERT INTO whitelist (user_id, address, label) VALUES (?, ?, ?)").run(userId, address, label);
      return plain(db.prepare("SELECT * FROM whitelist WHERE id = ?").get(Number(lastInsertRowid)));
    },
    delete: (userId, id) => db.prepare("DELETE FROM whitelist WHERE user_id = ? AND id = ?").run(userId, id).changes,
  };
}

export function createSendsRepository(db) {
  return {
    create(s) {
      db.prepare(`INSERT INTO sends (user_id, hash, from_address, to_address, amount, asset, risk_level, whitelisted, confirmed_high_risk)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, hash) DO NOTHING`)
        .run(s.userId, s.hash, s.from, s.to, s.amount, s.asset, s.riskLevel ?? null, s.whitelisted ? 1 : 0, s.confirmedHighRisk ? 1 : 0);
      return this.find(s.userId, s.hash);
    },
    find: (userId, hash) => plain(db.prepare("SELECT * FROM sends WHERE user_id = ? AND hash = ?").get(userId, hash)),
    list: (userId, limit = 50) => db.prepare("SELECT * FROM sends WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").all(userId, limit).map(plain),
    updateStatus: (id, status, blockNumber) => db.prepare("UPDATE sends SET status = ?, block_number = ?, updated_at = ? WHERE id = ?").run(status, blockNumber ?? null, nowIso(), id),
  };
}

export function createMaliciousRepository(db) {
  return {
    findByAddresses(addresses) {
      const list = [...new Set(addresses.filter(Boolean))];
      if (!list.length) return [];
      return db.prepare(`SELECT * FROM malicious_addresses WHERE address IN (${list.map(() => "?").join(",")})`).all(...list).map(plain);
    },
    findById: id => plain(db.prepare("SELECT * FROM malicious_addresses WHERE id = ?").get(id)),
    findByAddress: address => plain(db.prepare("SELECT * FROM malicious_addresses WHERE address = ?").get(address)),
    list({ search = "", source, limit = 50, offset = 0 } = {}) {
      const where = ["(address LIKE ? OR IFNULL(label, '') LIKE ?)"];
      const args = [`%${search}%`, `%${search}%`];
      if (source) { where.push("source = ?"); args.push(source); }
      const total = db.prepare(`SELECT COUNT(*) AS n FROM malicious_addresses WHERE ${where.join(" AND ")}`).get(...args).n;
      const items = db.prepare(`SELECT * FROM malicious_addresses WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset).map(plain);
      return { total, items };
    },
    create({ address, label, category, source = "manual", sourceId = null }) {
      const { lastInsertRowid } = db.prepare("INSERT INTO malicious_addresses (address, label, category, source, source_id) VALUES (?, ?, ?, ?, ?)").run(address, label ?? null, category, source, sourceId);
      return this.findById(Number(lastInsertRowid));
    },
    update(id, { label, category }) {
      db.prepare("UPDATE malicious_addresses SET label = ?, category = ?, updated_at = ? WHERE id = ?").run(label ?? null, category, nowIso(), id);
      return this.findById(id);
    },
    delete: id => db.prepare("DELETE FROM malicious_addresses WHERE id = ?").run(id).changes,
    /** Importação em lote: insere novos, não sobrescreve entradas manuais. */
    bulkUpsertFromSource(source, entries) {
      const stmt = db.prepare(`INSERT INTO malicious_addresses (address, label, category, source, source_id) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (address) DO UPDATE SET updated_at = excluded.created_at WHERE malicious_addresses.source != 'manual'`);
      const exists = db.prepare("SELECT 1 FROM malicious_addresses WHERE address = ?");
      let inserted = 0;
      db.exec("BEGIN");
      try {
        for (const entry of entries) {
          const before = exists.get(entry.address);
          stmt.run(entry.address, entry.label ?? source.name, source.category, source.name, source.id);
          if (!before) inserted++;
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return inserted;
    },
    count: () => db.prepare("SELECT COUNT(*) AS n FROM malicious_addresses").get().n,
    countsBySource: () => db.prepare("SELECT source, COUNT(*) AS n FROM malicious_addresses GROUP BY source ORDER BY n DESC").all().map(plain),
  };
}

export function createListSourcesRepository(db) {
  return {
    list: () => db.prepare("SELECT * FROM list_sources ORDER BY id").all().map(plain),
    listEnabled: () => db.prepare("SELECT * FROM list_sources WHERE enabled = 1 ORDER BY id").all().map(plain),
    findById: id => plain(db.prepare("SELECT * FROM list_sources WHERE id = ?").get(id)),
    create({ name, url, category = "scam", enabled = true }) {
      const { lastInsertRowid } = db.prepare("INSERT INTO list_sources (name, url, category, enabled) VALUES (?, ?, ?, ?)").run(name, url, category, enabled ? 1 : 0);
      return this.findById(Number(lastInsertRowid));
    },
    update(id, { name, url, category, enabled }) {
      const current = this.findById(id);
      db.prepare("UPDATE list_sources SET name = ?, url = ?, category = ?, enabled = ? WHERE id = ?")
        .run(name ?? current.name, url ?? current.url, category ?? current.category, enabled === undefined ? current.enabled : enabled ? 1 : 0, id);
      return this.findById(id);
    },
    recordSync: (id, status, count) => db.prepare("UPDATE list_sources SET last_sync_at = ?, last_status = ?, last_count = ? WHERE id = ?").run(nowIso(), status, count ?? null, id),
    delete: id => db.prepare("DELETE FROM list_sources WHERE id = ?").run(id).changes,
  };
}

export function createSettingsRepository(db) {
  return {
    get: (key, fallback = null) => {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
      return row ? parseJson(row.value, fallback) : fallback;
    },
    set: (key, value, userId = null) => db.prepare(`INSERT INTO settings (key, value, updated_by) VALUES (?, ?, ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = ?`).run(key, JSON.stringify(value), userId, nowIso()),
    has: key => Boolean(db.prepare("SELECT 1 FROM settings WHERE key = ?").get(key)),
  };
}

export function createFeeTablesRepository(db) {
  const hydrate = row => (row ? { ...plain(row), data: parseJson(row.data, {}), active: Boolean(row.active) } : null);
  return {
    active: () => hydrate(db.prepare("SELECT * FROM fee_tables WHERE active = 1 ORDER BY version DESC LIMIT 1").get()),
    list: () => db.prepare("SELECT * FROM fee_tables ORDER BY version DESC").all().map(hydrate),
    findByVersion: version => hydrate(db.prepare("SELECT * FROM fee_tables WHERE version = ?").get(version)),
    createVersion({ data, note, userId }) {
      const next = (db.prepare("SELECT MAX(version) AS v FROM fee_tables").get().v ?? 0) + 1;
      db.exec("BEGIN");
      try {
        db.prepare("UPDATE fee_tables SET active = 0").run();
        db.prepare("INSERT INTO fee_tables (version, data, note, active, created_by) VALUES (?, ?, ?, 1, ?)").run(next, JSON.stringify(data), note ?? null, userId ?? null);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return this.findByVersion(next);
    },
    activate(version) {
      db.exec("BEGIN");
      db.prepare("UPDATE fee_tables SET active = (version = ?)").run(version);
      db.exec("COMMIT");
      return this.findByVersion(version);
    },
  };
}

export function createCatalogRepository(db) {
  const exchange = row => (row ? { ...plain(row), enabled: Boolean(row.enabled) } : null);
  return {
    exchanges: () => db.prepare("SELECT * FROM exchanges ORDER BY name").all().map(exchange),
    enabledExchanges: () => db.prepare("SELECT * FROM exchanges WHERE enabled = 1 ORDER BY name").all().map(exchange),
    findExchange: id => exchange(db.prepare("SELECT * FROM exchanges WHERE id = ?").get(id)),
    upsertExchange: ({ id, name, enabled = true, note = null }) => db.prepare("INSERT INTO exchanges (id, name, enabled, note) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING").run(id, name, enabled ? 1 : 0, note),
    setExchangeEnabled: (id, enabled) => db.prepare("UPDATE exchanges SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id).changes,
    assets: () => db.prepare("SELECT * FROM assets ORDER BY symbol").all().map(r => ({ ...plain(r), enabled: Boolean(r.enabled) })),
    enabledAssets: () => db.prepare("SELECT * FROM assets WHERE enabled = 1").all().map(r => ({ ...plain(r), enabled: true })),
    findAsset: symbol => plain(db.prepare("SELECT * FROM assets WHERE symbol = ?").get(symbol)),
    upsertAsset: ({ symbol, name, decimals, contractAddress = null, enabled = true }) => db.prepare("INSERT INTO assets (symbol, name, decimals, contract_address, enabled) VALUES (?, ?, ?, ?, ?) ON CONFLICT (symbol) DO NOTHING").run(symbol, name, decimals, contractAddress, enabled ? 1 : 0),
    setAssetEnabled: (symbol, enabled) => db.prepare("UPDATE assets SET enabled = ? WHERE symbol = ?").run(enabled ? 1 : 0, symbol).changes,
  };
}

export function createSnapshotsRepository(db) {
  const hydrate = row => (row ? { ...plain(row), bids: parseJson(row.bids, []), asks: parseJson(row.asks, []) } : null);
  return {
    insert: ({ exchangeId, base, quote, bids, asks, fetchedAt }) => db.prepare("INSERT INTO snapshots (exchange_id, base, quote, bids, asks, fetched_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(exchangeId, base, quote, JSON.stringify(bids), JSON.stringify(asks), fetchedAt ?? nowIso()),
    /** Snapshot mais recente de cada (exchange, par). */
    latest: () => db.prepare(`
      SELECT s.* FROM snapshots s
      JOIN (SELECT exchange_id, base, quote, MAX(fetched_at) AS m FROM snapshots GROUP BY exchange_id, base, quote) last
        ON last.exchange_id = s.exchange_id AND last.base = s.base AND last.quote = s.quote AND last.m = s.fetched_at`).all().map(hydrate),
    pruneOlderThan: iso => db.prepare("DELETE FROM snapshots WHERE fetched_at < ?").run(iso).changes,
    count: () => db.prepare("SELECT COUNT(*) AS n FROM snapshots").get().n,
  };
}

export function createSimulationsRepository(db) {
  const hydrate = row => (row ? { ...plain(row), result: parseJson(row.result, {}) } : null);
  return {
    create({ userId, fromAsset, toAsset, amount, result }) {
      const { lastInsertRowid } = db.prepare("INSERT INTO simulations (user_id, from_asset, to_asset, amount, result) VALUES (?, ?, ?, ?, ?)").run(userId, fromAsset, toAsset, amount, JSON.stringify(result));
      return hydrate(db.prepare("SELECT * FROM simulations WHERE id = ?").get(Number(lastInsertRowid)));
    },
    list: (userId, limit = 50) => db.prepare("SELECT * FROM simulations WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?").all(userId, limit).map(hydrate),
    findForUser: (userId, id) => hydrate(db.prepare("SELECT * FROM simulations WHERE user_id = ? AND id = ?").get(userId, id)),
  };
}

export function createAuditRepository(db) {
  return {
    record: ({ actor, action, entity, entityId, details }) => db.prepare("INSERT INTO audit_log (actor_id, actor_email, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)")
      .run(actor?.id ?? null, actor?.email ?? "sistema", action, entity, entityId === undefined || entityId === null ? null : String(entityId), details ? JSON.stringify(details) : null),
    list({ limit = 100, offset = 0, entity } = {}) {
      const where = entity ? "WHERE entity = ?" : "";
      const args = entity ? [entity] : [];
      const total = db.prepare(`SELECT COUNT(*) AS n FROM audit_log ${where}`).get(...args).n;
      const items = db.prepare(`SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset)
        .map(r => ({ ...plain(r), details: parseJson(r.details, null) }));
      return { total, items };
    },
  };
}

export function createQueueRepository(db) {
  const hydrate = row => (row ? { ...plain(row), payload: parseJson(row.payload, {}) } : null);
  return {
    insert: ({ type, payload, maxAttempts = 5, availableAt = Date.now() }) => Number(db.prepare("INSERT INTO queue_messages (type, payload, max_attempts, available_at) VALUES (?, ?, ?, ?)")
      .run(type, JSON.stringify(payload), maxAttempts, availableAt).lastInsertRowid),
    /** Reserva a próxima mensagem disponível (atomicamente). */
    claimNext(now = Date.now()) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = db.prepare("SELECT * FROM queue_messages WHERE status = 'pending' AND available_at <= ? ORDER BY available_at, id LIMIT 1").get(now);
        if (row) db.prepare("UPDATE queue_messages SET status = 'processing', attempts = attempts + 1, updated_at = ? WHERE id = ?").run(nowIso(), row.id);
        db.exec("COMMIT");
        return row ? hydrate({ ...row, attempts: row.attempts + 1, status: "processing" }) : null;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    markDone: id => db.prepare("UPDATE queue_messages SET status = 'done', last_error = NULL, updated_at = ? WHERE id = ?").run(nowIso(), id),
    markRetry: (id, availableAt, error) => db.prepare("UPDATE queue_messages SET status = 'pending', available_at = ?, last_error = ?, updated_at = ? WHERE id = ?").run(availableAt, error, nowIso(), id),
    markDead: (id, error) => db.prepare("UPDATE queue_messages SET status = 'dead', last_error = ?, updated_at = ? WHERE id = ?").run(error, nowIso(), id),
    requeue: id => db.prepare("UPDATE queue_messages SET status = 'pending', attempts = 0, available_at = ?, updated_at = ? WHERE id = ? AND status = 'dead'").run(Date.now(), nowIso(), id).changes,
    recoverStuck: () => db.prepare("UPDATE queue_messages SET status = 'pending' WHERE status = 'processing'").run().changes,
    findById: id => hydrate(db.prepare("SELECT * FROM queue_messages WHERE id = ?").get(id)),
    listDead: (limit = 100) => db.prepare("SELECT * FROM queue_messages WHERE status = 'dead' ORDER BY id DESC LIMIT ?").all(limit).map(hydrate),
    stats: () => Object.fromEntries(db.prepare("SELECT status, COUNT(*) AS n FROM queue_messages GROUP BY status").all().map(r => [r.status, r.n])),
    pruneDone: iso => db.prepare("DELETE FROM queue_messages WHERE status = 'done' AND updated_at < ?").run(iso).changes,
  };
}
