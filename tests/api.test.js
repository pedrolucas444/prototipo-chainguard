import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../server/src/aplicacao/config/env.js";
import { createApp } from "../server/src/app.js";
import { openDatabase } from "../server/src/dados/db.js";
import { createRepositories } from "../server/src/dados/repositories/index.js";
import { createConsumer } from "../server/src/aplicacao/events/consumer.js";
import { createAlchemyClient } from "../server/src/integracoes/alchemy-client.js";
import { hmacSha256Hex } from "../server/src/shared/security.js";
import { totp } from "../server/src/shared/totp.js";

const SIGNING_KEY = "test-signing-key";
const ADMIN = { email: "admin@chainguard.local", password: "admin12345" };
const silent = { info() {}, warn() {}, error() {} };

const WALLET = "0x" + "a".repeat(40);
const NEUTRAL = "0x" + "5".repeat(40);
const TRUSTED = "0xabcd" + "1".repeat(32) + "ef01";
const LOOKALIKE = "0xabcd" + "9".repeat(32) + "ef01";
const SCAMMER = "0x" + "d".repeat(40);
const hash = n => "0x" + n.toString(16).padStart(64, "0");

// ---------------- Integrações falsas (sem rede) ----------------
function fakeBook(mid) {
  return {
    bids: [[mid - 1, 2], [mid - 2, 5], [mid - 5, 50]],
    asks: [[mid + 1, 2], [mid + 2, 5], [mid + 5, 50]],
  };
}
function fakeAdapter(id, name, supported, mid, { fail = false } = {}) {
  return {
    id, name,
    symbolFor: (b, q) => (supported.includes(`${b}/${q}`) ? `${b}${q}` : null),
    async fetchOrderBook() {
      if (fail) throw new Error("HTTP 521");
      return fakeBook(mid);
    },
  };
}

function createFakeIntegrations(config) {
  const real = createAlchemyClient(config);
  const alchemy = {
    ...real,
    async getAccountState() { return { balanceWei: "1000000000000000000", balanceEth: 1, nonce: 5, isContract: false, blockNumber: 100 }; },
    async getBalances(addresses) { return addresses.map(() => 1); },
    async getTransaction() { return null; },
    async getTransactionReceipt() { return { status: "0x1", blockNumber: "0x64" }; },
    async blockNumber() { return 100; },
    async rpc() { throw new Error("sem rede nos testes"); },
  };
  const reputation = {
    sourceName: "GoPlus (fake)",
    explorerName: "Fake",
    async addressSecurity() { return { available: true, source: "GoPlus", flags: [] }; },
    async accountInfo() { return { available: true, hasHistory: true, firstSeenAt: "2020-01-01T00:00:00.000Z", source: "Fake" }; },
    async recentActivity() { return []; },
    async activitySince(_, { startBlock = 0 } = {}) { return { activities: [], nextStartBlock: startBlock }; },
  };
  return {
    alchemy,
    reputation,
    listas: { async fetchList() { return [{ address: "0x" + "e".repeat(40) }]; } },
    exchanges: {
      binance: fakeAdapter("binance", "Binance", ["ETH/USDT", "ETH/USDC"], 2000),
      kraken: fakeAdapter("kraken", "Kraken", ["ETH/USDT"], 1990),
      mercadobitcoin: fakeAdapter("mercadobitcoin", "Mercado Bitcoin", ["ETH/BRL"], 10000, { fail: true }),
    },
  };
}

// ---------------- Setup ----------------
let app;
let baseUrl;

before(async () => {
  const config = loadConfig({
    DB_PATH: ":memory:", ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, JOBS: "off", PORT: "0",
    ALCHEMY_SIGNING_KEY: SIGNING_KEY, ETH_RPC_URL: "http://127.0.0.1:9/never",
  }, { loadDotEnv: false });
  app = createApp(config, { integrations: createFakeIntegrations(config), db: openDatabase(":memory:"), logger: silent });
  const address = await app.start();
  app.consumer.stop(); // os testes drenam a fila explicitamente (determinístico)
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await app?.stop();
});

async function call(method, path, { body, session, csrf = true, headers = {} } = {}) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(csrf && method !== "GET" ? { "x-requested-with": "ChainGuard" } : {}),
      ...(session ? { cookie: `cg_session=${encodeURIComponent(session)}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  const m = setCookie && /cg_session=([^;]*)/.exec(setCookie);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json, session: m ? decodeURIComponent(m[1]) : undefined };
}

async function register(name, email, password = "senha1234") {
  const r = await call("POST", "/api/auth/register", { body: { name, email, password } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.session);
  return { session: r.session, user: r.body.user, recoveryCodes: r.body.recoveryCodes };
}

async function login(email, password) {
  const r = await call("POST", "/api/auth/login", { body: { email, password } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.session;
}

function sendWebhook(payload, { signature } = {}) {
  const raw = JSON.stringify(payload);
  return call("POST", "/webhooks/alchemy", {
    body: raw,
    csrf: false,
    headers: { "x-alchemy-signature": signature ?? hmacSha256Hex(SIGNING_KEY, raw) },
  });
}

function activityPayload(activities, id = "evt") {
  return {
    webhookId: "wh_test", id, createdAt: "2026-01-01T12:00:00.000Z", type: "ADDRESS_ACTIVITY",
    event: { network: "ETH_MAINNET", activity: activities },
  };
}

const ethIn = ({ from, value, n }) => ({
  fromAddress: from, toAddress: WALLET, blockNum: "0x10", hash: hash(n), value, asset: "ETH", category: "external",
  rawContract: { rawValue: "0x0", decimals: 18 },
});

// ---------------- Estado compartilhado entre testes (executam em ordem) ----------------
let ana; // cliente principal
let adminSession;

test("cadastro, /api/me e login com senha errada", async () => {
  ana = await register("Ana", "ana@test.com");
  assert.equal(ana.recoveryCodes.length, 8);
  const me = await call("GET", "/api/me", { session: ana.session });
  assert.equal(me.status, 200);
  assert.equal(me.body.email, "ana@test.com");
  assert.equal(me.body.role, "customer");
  assert.equal(me.body.recoveryCodesRemaining, 8);

  const wrong = await call("POST", "/api/auth/login", { body: { email: "ana@test.com", password: "errada123" } });
  assert.equal(wrong.status, 401);
  const dup = await call("POST", "/api/auth/register", { body: { name: "Ana", email: "ANA@test.com", password: "senha1234" } });
  assert.equal(dup.status, 409);
  const weak = await call("POST", "/api/auth/register", { body: { name: "Zé", email: "ze@test.com", password: "curta" } });
  assert.equal(weak.status, 400);
});

test("controle de acesso: CSRF, não autenticado e cliente na área admin", async () => {
  const noCsrf = await call("POST", "/api/wallets", { session: ana.session, csrf: false, body: { label: "x", address: WALLET } });
  assert.equal(noCsrf.status, 403);
  const anon = await call("GET", "/api/wallets");
  assert.equal(anon.status, 401);
  const forbidden = await call("GET", "/api/admin/users", { session: ana.session });
  assert.equal(forbidden.status, 403);
  adminSession = await login(ADMIN.email, ADMIN.password);
  const ok = await call("GET", "/api/admin/users", { session: adminSession });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.some(u => u.email === "ana@test.com"));
});

test("2FA completo e login com código de recuperação", async () => {
  const bia = await register("Bia", "bia@test.com");
  const setup = await call("POST", "/api/me/2fa/setup", { session: bia.session });
  assert.equal(setup.status, 200);
  assert.match(setup.body.otpauthUrl, /^otpauth:\/\/totp\//);
  const badEnable = await call("POST", "/api/me/2fa/enable", { session: bia.session, body: { code: "000000" === totp(setup.body.secret) ? "111111" : "000000" } });
  assert.equal(badEnable.status, 400);
  const enable = await call("POST", "/api/me/2fa/enable", { session: bia.session, body: { code: totp(setup.body.secret) } });
  assert.equal(enable.status, 200);
  assert.equal(enable.body.twoFactorEnabled, true);

  await call("POST", "/api/auth/logout", { session: bia.session });
  assert.equal((await call("GET", "/api/me", { session: bia.session })).status, 401);

  const step1 = await call("POST", "/api/auth/login", { body: { email: "bia@test.com", password: "senha1234" } });
  assert.equal(step1.status, 200);
  assert.equal(step1.body.twoFactorRequired, true);
  assert.equal(step1.session, undefined);
  // O código usado para ativar não vale de novo (proteção contra reuso); o do próximo passo, sim.
  const replay = await call("POST", "/api/auth/login/2fa", { body: { challenge: step1.body.challenge, code: totp(setup.body.secret) } });
  assert.equal(replay.status, 401);
  const step2 = await call("POST", "/api/auth/login/2fa", { body: { challenge: step1.body.challenge, code: totp(setup.body.secret, Date.now() + 30_000) } });
  assert.equal(step2.status, 200);
  assert.ok(step2.session);
  assert.equal((await call("GET", "/api/me", { session: step2.session })).body.email, "bia@test.com");

  // Celular perdido: código de recuperação no lugar do TOTP.
  const again = await call("POST", "/api/auth/login", { body: { email: "bia@test.com", password: "senha1234" } });
  const viaRecovery = await call("POST", "/api/auth/login/2fa", { body: { challenge: again.body.challenge, code: bia.recoveryCodes[0] } });
  assert.equal(viaRecovery.status, 200);
  const me = await call("GET", "/api/me", { session: viaRecovery.session });
  assert.equal(me.body.recoveryCodesRemaining, 7);
});

test("recuperação de senha com código de uso único", async () => {
  const caio = await register("Caio", "caio@test.com");
  const body = { email: "caio@test.com", recoveryCode: caio.recoveryCodes[1].toLowerCase(), newPassword: "novaSenha99" };
  const ok = await call("POST", "/api/auth/recover", { body });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.recoveryCodesRemaining, 7);
  // Sessões antigas foram revogadas.
  assert.equal((await call("GET", "/api/me", { session: caio.session })).status, 401);
  const reuse = await call("POST", "/api/auth/recover", { body: { ...body, newPassword: "outraSenha11" } });
  assert.equal(reuse.status, 401);
  await login("caio@test.com", "novaSenha99");
});

let walletId;
test("carteiras: endereço inválido, cadastro e duplicata", async () => {
  const invalid = await call("POST", "/api/wallets", { session: ana.session, body: { label: "Principal", address: "0x123" } });
  assert.equal(invalid.status, 400);
  const badChecksum = await call("POST", "/api/wallets", { session: ana.session, body: { label: "Principal", address: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD" } });
  assert.equal(badChecksum.status, 400);
  const created = await call("POST", "/api/wallets", { session: ana.session, body: { label: "Principal", address: WALLET, importHistory: false } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.wallet.address, WALLET);
  assert.equal(created.body.wallet.onchain_verified, 1);
  walletId = created.body.wallet.id;
  const dup = await call("POST", "/api/wallets", { session: ana.session, body: { label: "De novo", address: WALLET.toUpperCase().replace("0X", "0x") } });
  assert.equal(dup.status, 409);
  const list = await call("GET", "/api/wallets", { session: ana.session });
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].balance_eth, 1);
});

test("whitelist: adicionar endereço confiável", async () => {
  const r = await call("POST", "/api/whitelist", { session: ana.session, body: { label: "Exchange", address: TRUSTED } });
  assert.equal(r.status, 200);
  assert.equal(r.body.entry.address, TRUSTED);
  const dup = await call("POST", "/api/whitelist", { session: ana.session, body: { label: "Exchange", address: TRUSTED } });
  assert.equal(dup.status, 409);
  assert.equal((await call("GET", "/api/whitelist", { session: ana.session })).body.length, 1);
});

test("webhook: assinatura inválida é rejeitada", async () => {
  const r = await sendWebhook(activityPayload([ethIn({ from: NEUTRAL, value: 1, n: 1 })]), { signature: "00".repeat(32) });
  assert.equal(r.status, 401);
  const none = await call("POST", "/webhooks/alchemy", { body: "{}", csrf: false });
  assert.equal(none.status, 401);
});

test("webhook: grava, descarta duplicata e a fila analisa", async () => {
  const payload = activityPayload([ethIn({ from: NEUTRAL, value: 1, n: 1 })], "evt_1");
  const first = await sendWebhook(payload);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.inserted, 1);
  const again = await sendWebhook(payload);
  assert.equal(again.body.inserted, 0);
  assert.equal(again.body.duplicates, 1);

  let list = await call("GET", "/api/transactions", { session: ana.session });
  assert.equal(list.body.total, 1);
  assert.equal(list.body.items[0].status, "pending");

  await app.consumer.drainNow();
  list = await call("GET", "/api/transactions", { session: ana.session });
  const tx = list.body.items[0];
  assert.equal(tx.status, "analyzed");
  assert.equal(tx.risk_level, "low");
  assert.equal(tx.direction, "in");
  const detail = await call("GET", `/api/transactions/${tx.id}`, { session: ana.session });
  assert.equal(detail.body.hash, hash(1));
  assert.equal(detail.body.wallet_label, "Principal");
});

test("address poisoning: dust de endereço parecido com um da whitelist", async () => {
  await sendWebhook(activityPayload([ethIn({ from: LOOKALIKE, value: 0, n: 2 })], "evt_2"));
  await app.consumer.drainNow();
  const list = await call("GET", "/api/transactions?level=high", { session: ana.session });
  assert.equal(list.body.total, 1);
  const tx = list.body.items[0];
  assert.deepEqual(tx.risk_factors.map(f => f.rule).sort(), ["dust", "similarity"]);
  assert.equal(tx.risk_score, 75);
  const alerts = await call("GET", "/api/alerts?unseen=1", { session: ana.session });
  assert.equal(alerts.body.length, 1);
  const seen = await call("POST", "/api/alerts/seen", { session: ana.session, body: { ids: [tx.id] } });
  assert.equal(seen.body.updated, 1);
  assert.equal((await call("GET", "/api/alerts?unseen=1", { session: ana.session })).body.length, 0);
});

test("whitelist: transação com endereço confiável não é analisada", async () => {
  await sendWebhook(activityPayload([ethIn({ from: TRUSTED, value: 0, n: 3 })], "evt_3"));
  await app.consumer.drainNow();
  const list = await call("GET", "/api/transactions?level=whitelisted", { session: ana.session });
  assert.equal(list.body.total, 1);
  assert.equal(list.body.items[0].whitelisted, true);
  assert.equal(list.body.items[0].risk_level, null);
  assert.equal(list.body.items[0].status, "analyzed");
});

test("reorg: atividade com removed=true marca a transação como removida", async () => {
  const token = removed => ({
    fromAddress: NEUTRAL, toAddress: WALLET, blockNum: "0x11", hash: hash(4), value: 25, asset: "USDT", category: "token",
    rawContract: { rawValue: "0x17d7840", address: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6 },
    log: { logIndex: "0x7", removed },
  });
  const r1 = await sendWebhook(activityPayload([token(false)], "evt_4"));
  assert.equal(r1.body.inserted, 1);
  const r2 = await sendWebhook(activityPayload([token(true)], "evt_5"));
  assert.equal(r2.body.removed, 1);
  await app.consumer.drainNow();
  const row = app.db.prepare("SELECT status, risk_level FROM transactions WHERE hash = ?").get(hash(4));
  assert.equal(row.status, "removed");
  assert.equal(row.risk_level, null);
  // Removidas não aparecem nas listagens (não existem mais na rede).
  const list = await call("GET", `/api/transactions?address=${hash(4)}`, { session: ana.session });
  assert.equal(list.body.total, 0);

  // A mesma atividade minerada de novo em outro bloco: volta para análise.
  const r3 = await sendWebhook(activityPayload([{ ...token(false), blockNum: "0x12" }], "evt_4b"));
  assert.equal(r3.body.revived, 1);
  await app.consumer.drainNow();
  const back = await call("GET", `/api/transactions?address=${hash(4)}`, { session: ana.session });
  assert.equal(back.body.items[0].status, "analyzed");
  assert.equal(back.body.items[0].block_number, 0x12);
});

test("reorg durante a análise: o resultado não ressuscita a transação removida", async () => {
  const activity = { fromAddress: NEUTRAL, toAddress: WALLET, blockNum: "0x13", hash: hash(41), value: 0.3, asset: "ETH", category: "external", rawContract: { rawValue: "0x0", decimals: 18 } };
  await sendWebhook(activityPayload([activity], "evt_41"));
  const original = app.integrations.reputation.addressSecurity;
  app.integrations.reputation.addressSecurity = async () => {
    await sendWebhook(activityPayload([{ ...activity, removed: true }], "evt_42")); // reorg chega no meio da análise
    return { available: true, source: "GoPlus", flags: [] };
  };
  try { await app.consumer.drainNow(); } finally { app.integrations.reputation.addressSecurity = original; }
  const row = app.db.prepare("SELECT status FROM transactions WHERE hash = ?").get(hash(41));
  assert.equal(row.status, "removed");
});

test("webhook de outra rede é ignorado", async () => {
  const payload = activityPayload([ethIn({ from: NEUTRAL, value: 1, n: 9 })], "evt_9");
  payload.event.network = "MATIC_MAINNET";
  const r = await sendWebhook(payload);
  assert.equal(r.status, 200);
  assert.match(r.body.ignored, /fora do escopo/);
});

test("fila: mensagem que sempre falha vai para a fila de mortas", async () => {
  const db = openDatabase(":memory:");
  const repos = createRepositories(db);
  let calls = 0;
  const dead = [];
  const consumer = createConsumer({
    queueRepo: repos.queue, logger: silent, baseDelayMs: 0,
    handlers: { "x.falha": async () => { calls++; throw new Error("fonte fora do ar"); } },
    onDead: m => dead.push(m.id),
  });
  const id = repos.queue.insert({ type: "x.falha", payload: { a: 1 }, maxAttempts: 3 });
  await consumer.drainNow();
  assert.equal(calls, 3);
  assert.deepEqual(dead, [id]);
  const msg = repos.queue.findById(id);
  assert.equal(msg.status, "dead");
  assert.equal(msg.last_error, "fonte fora do ar");
  assert.equal(repos.queue.listDead().length, 1);
  db.close();
});

test("admin: reprocessar mensagem da fila de mortas", async () => {
  const id = app.repos.queue.insert({ type: "tipo.desconhecido", payload: {}, maxAttempts: 1 });
  await app.consumer.drainNow();
  const q = await call("GET", "/api/admin/queue", { session: adminSession });
  assert.ok(q.body.dead.some(m => m.id === id));
  const retry = await call("POST", `/api/admin/queue/${id}/retry`, { session: adminSession });
  assert.equal(retry.status, 200);
  assert.equal(app.repos.queue.findById(id).status, "pending");
  const notDead = await call("POST", `/api/admin/queue/${id}/retry`, { session: adminSession });
  assert.equal(notDead.status, 404);
  await app.consumer.drainNow();
});

test("lista negra: admin cadastra, cliente verifica destino e o log registra", async () => {
  const created = await call("POST", "/api/admin/malicious", { session: adminSession, body: { address: SCAMMER, label: "Drainer teste", category: "drainer" } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const dup = await call("POST", "/api/admin/malicious", { session: adminSession, body: { address: SCAMMER } });
  assert.equal(dup.status, 409);

  const check = await call("POST", "/api/risk/check", { session: ana.session, body: { address: SCAMMER, amount: 1, asset: "ETH" } });
  assert.equal(check.status, 200);
  assert.equal(check.body.level, "high");
  assert.ok(check.body.factors.some(f => f.rule === "blacklist"));
  assert.match(check.body.disclaimer, /Não é garantia/);

  const trusted = await call("POST", "/api/risk/check", { session: ana.session, body: { address: TRUSTED } });
  assert.equal(trusted.body.whitelisted, true);
  assert.equal(trusted.body.level, null);

  const log = await call("GET", "/api/admin/audit-log", { session: adminSession });
  assert.ok(log.body.items.some(e => e.entity === "malicious_address" && e.action === "create" && e.actor_email === ADMIN.email));

  const sync = await call("POST", "/api/admin/list-sources/sync", { session: adminSession, body: {} });
  assert.equal(sync.status, 200);
  assert.ok(sync.body.every(s => s.ok));
  const listed = await call("GET", "/api/admin/malicious?search=eeee", { session: adminSession });
  assert.equal(listed.body.total, 1);
});

test("cotações: coleta (com corretora fora do ar), painel, simulação e histórico", async () => {
  const collect = await call("POST", "/api/admin/quotes/collect", { session: adminSession });
  assert.equal(collect.status, 200);
  assert.equal(collect.body.ok, 3);
  assert.equal(collect.body.failed, 1);

  const prices = await call("GET", "/api/quotes/prices", { session: ana.session });
  assert.equal(prices.status, 200);
  const ethUsdt = prices.body.pairs.find(p => p.pair === "ETH/USDT");
  assert.equal(ethUsdt.exchanges.length, 2);
  assert.equal(ethUsdt.bestSell, "binance");
  assert.equal(ethUsdt.bestBuy, "kraken");
  assert.ok(prices.body.collector.results.some(r => r.exchangeId === "mercadobitcoin" && !r.ok));

  const sim = await call("POST", "/api/quotes/simulate", { session: ana.session, body: { fromAsset: "ETH", toAsset: "USDT", amount: 1 } });
  assert.equal(sim.status, 200, JSON.stringify(sim.body));
  assert.equal(sim.body.ranking[0].exchangeId, "binance");
  assert.equal(sim.body.ranking.length, 2);
  assert.ok(sim.body.assumptions.length >= 3);

  const same = await call("POST", "/api/quotes/simulate", { session: ana.session, body: { fromAsset: "ETH", toAsset: "ETH", amount: 1 } });
  assert.equal(same.status, 400);
  const noPair = await call("POST", "/api/quotes/simulate", { session: ana.session, body: { fromAsset: "USDC", toAsset: "BRL", amount: 1 } });
  assert.equal(noPair.status, 400);

  const history = await call("GET", "/api/simulations", { session: ana.session });
  assert.equal(history.body.length, 1);
  assert.equal(history.body[0].best.exchangeName, "Binance");
  const one = await call("GET", `/api/simulations/${sim.body.id}`, { session: ana.session });
  assert.equal(one.body.ranking.length, 2);
  // Isolamento: outro usuário não vê a simulação.
  const bia = await login("caio@test.com", "novaSenha99");
  assert.equal((await call("GET", `/api/simulations/${sim.body.id}`, { session: bia })).status, 404);
});

test("admin: parâmetros do motor de risco validados e registrados no log", async () => {
  const bad = await call("PUT", "/api/admin/risk-params", { session: adminSession, body: { thresholds: { medium: 50, high: 40 } } });
  assert.equal(bad.status, 400);
  const ok = await call("PUT", "/api/admin/risk-params", { session: adminSession, body: { weights: { dust: 30 }, thresholds: { medium: 30, high: 60 } } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.weights.dust, 30);
  assert.equal((await call("GET", "/api/admin/risk-params", { session: adminSession })).body.weights.dust, 30);
  const log = await call("GET", "/api/admin/audit-log?entity=risk_params", { session: adminSession });
  assert.equal(log.body.total, 1);
  assert.equal(log.body.items[0].details.after.weights.dust, 30);
});

test("envio: o risco gravado é o calculado no servidor e o status vem da rede", async () => {
  // O navegador diz "low", mas o destino está na base de maliciosos: o servidor grava "high".
  const base = { hash: hash(77), from: WALLET, to: SCAMMER, amount: 0.5, asset: "ETH", riskLevel: "low", confirmedHighRisk: false };
  const ok = await call("POST", "/api/sends", { session: ana.session, body: base });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.risk_level, "high");
  assert.equal(ok.body.confirmed_high_risk, 0);
  const status = await call("GET", `/api/sends/${hash(77)}/status`, { session: ana.session });
  assert.equal(status.body.status, "confirmed");
  assert.equal(status.body.block_number, 100);
});

test("admin: bloquear usuário derruba a sessão dele", async () => {
  const dani = await register("Dani", "dani@test.com");
  const users = await call("GET", "/api/admin/users?search=dani", { session: adminSession });
  const id = users.body[0].id;
  const self = await call("PATCH", `/api/admin/users/${users.body.find(u => u.email === ADMIN.email)?.id ?? 1}`, { session: adminSession, body: { status: "blocked" } });
  assert.equal(self.status, 400);
  const blocked = await call("PATCH", `/api/admin/users/${id}`, { session: adminSession, body: { status: "blocked" } });
  assert.equal(blocked.status, 200);
  assert.equal((await call("GET", "/api/me", { session: dani.session })).status, 401);
  const relogin = await call("POST", "/api/auth/login", { body: { email: "dani@test.com", password: "senha1234" } });
  assert.equal(relogin.status, 403);
});

test("exclusão de conta remove os dados do usuário", async () => {
  const wrong = await call("DELETE", "/api/me", { session: ana.session, body: { password: "errada" } });
  assert.equal(wrong.status, 403);
  const userId = ana.user.id;
  const ok = await call("DELETE", "/api/me", { session: ana.session, body: { password: "senha1234" } });
  assert.equal(ok.status, 200);
  assert.equal((await call("GET", "/api/me", { session: ana.session })).status, 401);
  assert.equal(app.repos.users.findById(userId), null);
  assert.equal(app.repos.wallets.listByUser(userId).length, 0);
  assert.equal(app.repos.whitelist.list(userId).length, 0);
  assert.equal(app.repos.transactions.list(userId).total, 0);
  assert.equal(app.repos.simulations.list(userId).length, 0);
  assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE wallet_id = ?").get(walletId).n, 0);
});

test("URL malformada responde 400 e não derruba o servidor", async () => {
  const net = await import("node:net");
  const { port } = new URL(baseUrl);
  const raw = await new Promise((resolve, reject) => {
    const socket = net.connect(Number(port), "127.0.0.1", () => socket.write("GET // HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"));
    let data = "";
    socket.on("data", chunk => { data += chunk; });
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
  });
  assert.match(raw, /^HTTP\/1\.1 400/);
  assert.equal((await call("GET", "/api/health")).status, 200);
});
