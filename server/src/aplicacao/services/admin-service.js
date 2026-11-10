import { badRequest, conflict, notFound, requireFields } from "../../shared/errors.js";
import { validateAddress } from "../../shared/address.js";
import { DEFAULT_RISK_PARAMS, normalizeRiskParams } from "../../motor-risco/index.js";

const CATEGORIES = ["scam", "phishing", "poisoning", "drainer", "sanctioned", "mixer", "honeypot", "other"];

/**
 * Admin Service: toda alteração gera uma linha no log (quem, o quê, quando).
 * Também concentra a sincronização das listas públicas (chamada pelo Job ou pelo Admin).
 */
export function createAdminService({ repos, integrations, transactionService, logger = console }) {
  const audit = (actor, action, entity, entityId, details) => repos.audit.record({ actor, action, entity, entityId, details });

  async function syncLists(actor = null, { onlyId } = {}) {
    const sources = repos.listSources.listEnabled().filter(s => !onlyId || s.id === onlyId);
    const results = [];
    for (const source of sources) {
      try {
        const entries = await integrations.listas.fetchList(source.url);
        // Em lotes, cedendo a vez entre eles: uma lista grande não trava as outras requisições.
        let inserted = 0;
        for (let i = 0; i < entries.length; i += 2000) {
          inserted += repos.malicious.bulkUpsertFromSource(source, entries.slice(i, i + 2000));
          await new Promise(resolve => setImmediate(resolve));
        }
        repos.listSources.recordSync(source.id, "ok", entries.length);
        results.push({ id: source.id, name: source.name, ok: true, total: entries.length, inserted });
      } catch (error) {
        repos.listSources.recordSync(source.id, `erro: ${error.message}`.slice(0, 200), null);
        results.push({ id: source.id, name: source.name, ok: false, error: error.message });
        logger.warn?.(`[listas] falha em ${source.name}: ${error.message}`);
      }
    }
    audit(actor, "import", "malicious_addresses", null, { sources: results });
    return results;
  }

  return {
    syncLists,
    /** Ações do Admin que não passam por este Service (ex.: coletar cotações agora) também vão para o log. */
    recordAction: (actor, action, entity, entityId, details) => audit(actor, action, entity, entityId, details),

    overview() {
      const wallets = repos.wallets.countAll();
      const txs = repos.transactions.countAll();
      return {
        users: repos.users.count(),
        wallets: wallets.n ?? 0,
        monitoredWallets: wallets.monitored ?? 0,
        transactions: txs.n ?? 0,
        highRiskTransactions: txs.high ?? 0,
        maliciousAddresses: repos.malicious.count(),
        maliciousBySource: repos.malicious.countsBySource(),
        queue: repos.queue.stats(),
        snapshots: repos.snapshots.count(),
        integrations: {
          alchemyWebhook: integrations.alchemy.webhookEnabled,
          alchemySigning: integrations.alchemy.signingEnabled,
          explorer: integrations.reputation.explorerName,
        },
      };
    },

    // ---------------- Usuários ----------------
    listUsers: query => repos.users.list({ search: String(query.search ?? "").slice(0, 80) }),
    updateUser(actor, id, body) {
      const user = repos.users.findById(id);
      if (!user) throw notFound("Usuário não encontrado.");
      const f = requireFields(body, { status: { required: false, oneOf: ["active", "blocked"] }, role: { required: false, oneOf: ["admin", "customer"] } });
      if (user.id === actor.id && (f.status === "blocked" || f.role === "customer")) throw badRequest("Você não pode bloquear nem rebaixar a própria conta.");
      const losingAdmin = user.role === "admin" && user.status === "active" && (f.role === "customer" || f.status === "blocked");
      if (losingAdmin && repos.users.countAdmins() <= 1) throw conflict("É preciso manter pelo menos um administrador ativo.");
      const updated = repos.users.update(id, f);
      if (f.status === "blocked") repos.users.deleteSessionsOfUser(id);
      audit(actor, "update", "user", id, { email: user.email, ...f });
      return updated;
    },
    async deleteUser(actor, id, walletService) {
      const user = repos.users.findById(id);
      if (!user) throw notFound("Usuário não encontrado.");
      if (user.id === actor.id) throw badRequest("Para excluir a própria conta, use a tela Conta.");
      // Só conta se o removido for um administrador ATIVO (remover um admin bloqueado não reduz os ativos).
      if (user.role === "admin" && user.status === "active" && repos.users.countAdmins() <= 1) throw conflict("É preciso manter pelo menos um administrador ativo.");
      await walletService.removeAllForUser(id);
      repos.users.delete(id);
      audit(actor, "delete", "user", id, { email: user.email });
      return { ok: true };
    },

    // ---------------- Base de endereços maliciosos ----------------
    listMalicious: query => repos.malicious.list({
      search: String(query.search ?? "").toLowerCase().slice(0, 80),
      source: query.source || undefined,
      limit: Math.min(Number(query.limit) || 50, 200),
      offset: Number(query.offset) || 0,
    }),
    createMalicious(actor, body) {
      const f = requireFields(body, { address: {}, label: { required: false, max: 80 }, category: { required: false, oneOf: CATEGORIES } });
      const check = validateAddress(f.address);
      if (!check.ok) throw badRequest(check.reason, { address: check.reason });
      if (repos.malicious.findByAddress(check.address)) throw conflict("Endereço já está na base.");
      const entry = repos.malicious.create({ address: check.address, label: f.label, category: f.category ?? "scam" });
      audit(actor, "create", "malicious_address", entry.id, { address: entry.address, category: entry.category });
      return entry;
    },
    updateMalicious(actor, id, body) {
      const current = repos.malicious.findById(id);
      if (!current) throw notFound();
      const f = requireFields(body, { label: { required: false, max: 80 }, category: { required: false, oneOf: CATEGORIES } });
      const entry = repos.malicious.update(id, { label: f.label ?? current.label, category: f.category ?? current.category });
      audit(actor, "update", "malicious_address", id, { address: current.address, ...f });
      return entry;
    },
    getMalicious(id) {
      const entry = repos.malicious.findById(id);
      if (!entry) throw notFound();
      return entry;
    },
    deleteMalicious(actor, id) {
      const current = repos.malicious.findById(id);
      if (!current || !repos.malicious.delete(id)) throw notFound();
      audit(actor, "delete", "malicious_address", id, { address: current.address });
      return { ok: true };
    },
    categories: () => CATEGORIES,

    // ---------------- Fontes de listas públicas ----------------
    listSources: () => repos.listSources.list(),
    createSource(actor, body) {
      const f = requireFields(body, { name: { max: 60 }, url: { max: 500 }, category: { required: false, oneOf: CATEGORIES } });
      if (!/^https:\/\//.test(f.url)) throw badRequest("A URL precisa usar HTTPS.");
      const source = repos.listSources.create(f);
      audit(actor, "create", "list_source", source.id, f);
      return source;
    },
    updateSource(actor, id, body) {
      if (!repos.listSources.findById(id)) throw notFound();
      const f = requireFields(body, { name: { required: false, max: 60 }, url: { required: false, max: 500 }, category: { required: false, oneOf: CATEGORIES }, enabled: { type: "boolean", required: false } });
      if (f.url && !/^https:\/\//.test(f.url)) throw badRequest("A URL precisa usar HTTPS.");
      const source = repos.listSources.update(id, f);
      audit(actor, "update", "list_source", id, f);
      return source;
    },
    deleteSource(actor, id) {
      const source = repos.listSources.findById(id);
      if (!source || !repos.listSources.delete(id)) throw notFound();
      audit(actor, "delete", "list_source", id, { name: source.name, url: source.url });
      return { ok: true };
    },

    // ---------------- Motor de risco ----------------
    riskParams: () => normalizeRiskParams(repos.settings.get("risk_params", DEFAULT_RISK_PARAMS)),
    updateRiskParams(actor, body) {
      let params;
      const before = this.riskParams();
      try {
        params = normalizeRiskParams(body, before);
      } catch (error) {
        throw badRequest(error.message);
      }
      repos.settings.set("risk_params", params, actor.id);
      audit(actor, "update", "risk_params", null, { before, after: params });
      return params;
    },
    resetRiskParams(actor) {
      const before = this.riskParams();
      const params = normalizeRiskParams(DEFAULT_RISK_PARAMS);
      repos.settings.set("risk_params", params, actor.id);
      audit(actor, "reset", "risk_params", null, { before, after: params });
      return params;
    },

    // ---------------- Corretoras, ativos e taxas ----------------
    catalog: () => ({ exchanges: repos.catalog.exchanges(), assets: repos.catalog.assets() }),
    setExchangeEnabled(actor, id, body) {
      const { enabled } = requireFields(body, { enabled: { type: "boolean" } });
      if (!repos.catalog.setExchangeEnabled(id, enabled)) throw notFound("Corretora não encontrada.");
      audit(actor, "update", "exchange", id, { enabled });
      return repos.catalog.findExchange(id);
    },
    setAssetEnabled(actor, symbol, body) {
      const { enabled } = requireFields(body, { enabled: { type: "boolean" } });
      if (!repos.catalog.setAssetEnabled(symbol, enabled)) throw notFound("Ativo não encontrado.");
      audit(actor, "update", "asset", symbol, { enabled });
      return repos.catalog.findAsset(symbol);
    },
    feeTables: () => ({ active: repos.feeTables.active(), versions: repos.feeTables.list() }),
    createFeeTable(actor, body) {
      const data = body?.data;
      if (!data || typeof data !== "object" || typeof data.exchanges !== "object") throw badRequest("Formato esperado: { data: { exchanges: { <id>: { taker, withdrawal: { <ativo>: valor } } } } }");
      const clean = { exchanges: {} };
      const known = new Set(repos.catalog.exchanges().map(x => x.id));
      for (const [id, fees] of Object.entries(data.exchanges)) {
        if (!known.has(id)) throw badRequest(`Corretora desconhecida na tabela de taxas: ${id}.`);
        const taker = Number(fees?.taker);
        if (!Number.isFinite(taker) || taker < 0 || taker > 0.05) throw badRequest(`Taxa taker inválida para ${id} (use fração, ex.: 0.001 = 0,1%).`);
        const withdrawal = {};
        for (const [asset, value] of Object.entries(fees?.withdrawal ?? {})) {
          const v = Number(value);
          if (!Number.isFinite(v) || v < 0) throw badRequest(`Taxa de saque inválida para ${id}/${asset}.`);
          withdrawal[asset.toUpperCase()] = v;
        }
        clean.exchanges[id] = { taker, withdrawal };
      }
      const table = repos.feeTables.createVersion({ data: clean, note: typeof body.note === "string" ? body.note.slice(0, 200) : null, userId: actor.id });
      audit(actor, "create", "fee_table", table.version, { note: table.note });
      return table;
    },
    activateFeeTable(actor, version) {
      if (!repos.feeTables.findByVersion(version)) throw notFound("Versão não encontrada.");
      const previous = repos.feeTables.active()?.version ?? null;
      const table = repos.feeTables.activate(version);
      audit(actor, "activate", "fee_table", version, { previousVersion: previous });
      return table;
    },

    // ---------------- Log e fila ----------------
    auditLog: query => repos.audit.list({ limit: Math.min(Number(query.limit) || 100, 500), offset: Number(query.offset) || 0, entity: query.entity || undefined }),
    queue: () => ({ stats: repos.queue.stats(), dead: repos.queue.listDead() }),
    retryDead(actor, id) {
      const message = repos.queue.findById(id);
      if (!message || !repos.queue.requeue(id)) throw notFound("Mensagem não está na fila de mortas.");
      if (message.payload?.transactionId) repos.transactions.resetToPending(message.payload.transactionId);
      audit(actor, "retry", "queue_message", id, { type: message.type });
      return { ok: true };
    },
  };
}
