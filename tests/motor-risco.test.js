import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRisk, DEFAULT_RISK_PARAMS, normalizeRiskParams, findLookalike } from "../server/src/motor-risco/index.js";
import { aggregate } from "../server/src/motor-risco/score-aggregator.js";
import { blacklistRule } from "../server/src/motor-risco/rules/blacklist.js";
import { reputationRule } from "../server/src/motor-risco/rules/reputation.js";
import { similarityRule } from "../server/src/motor-risco/rules/similarity.js";
import { dustRule } from "../server/src/motor-risco/rules/dust.js";
import { approvalsRule } from "../server/src/motor-risco/rules/approvals.js";
import { walletAgeRule } from "../server/src/motor-risco/rules/wallet-age.js";

const P = normalizeRiskParams(DEFAULT_RISK_PARAMS);
const A = "0xabcd" + "1".repeat(32) + "ef01";
const LOOKALIKE = "0xabcd" + "9".repeat(32) + "ef01";
const NOW = "2026-01-10T00:00:00.000Z";

const base = (over = {}) => ({
  kind: "transaction", direction: "in", counterparty: A, value: 1, asset: "ETH", category: "external",
  approvals: [], blacklistHits: [], reputation: { available: true, flags: [], source: "GoPlus" },
  knownAddresses: [], account: { available: true, hasHistory: true, firstSeenAt: "2020-01-01T00:00:00Z" }, now: NOW, ...over,
});

test("blacklist: dispara para a contraparte e identifica o papel", () => {
  const f = blacklistRule(base({ blacklistHits: [{ address: A, source: "ScamSniffer", category: "phishing" }] }));
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 1);
  assert.match(f[0].detail, /A origem/);
  assert.deepEqual(blacklistRule(base()), []);
});

test("reputation: flags fortes = 1, fracas = 0.6, indisponível = nada", () => {
  assert.equal(reputationRule(base({ reputation: { available: true, flags: [{ key: "phishing_activities", label: "phishing", strong: true }] } }))[0].severity, 1);
  assert.equal(reputationRule(base({ reputation: { available: true, flags: [{ key: "mixer", label: "mixer", strong: false }] } }))[0].severity, 0.6);
  assert.deepEqual(reputationRule(base({ reputation: { available: false, flags: [] } })), []);
});

test("similarity: address poisoning detectado; mesmo endereço não", () => {
  assert.equal(findLookalike(LOOKALIKE, [A]), A);
  assert.equal(findLookalike(A, [A]), null);
  const f = similarityRule(base({ counterparty: LOOKALIKE, knownAddresses: [A] }), P);
  assert.equal(f.length, 1);
  assert.equal(f[0].evidence.lookalike, A);
  assert.deepEqual(similarityRule(base({ counterparty: A, knownAddresses: [A] }), P), []);
  assert.deepEqual(similarityRule(base({ counterparty: "0x" + "2".repeat(40), knownAddresses: [A] }), P), []);
});

test("dust: ETH abaixo do limite, token de valor zero, stable baixo, saída não conta", () => {
  assert.equal(dustRule(base({ value: 0.00001 }), P).length, 1);
  assert.equal(dustRule(base({ value: 0.5 }), P).length, 0);
  const zeroToken = dustRule(base({ value: 0, asset: "USDT", category: "token" }), P);
  assert.equal(zeroToken.length, 1);
  assert.match(zeroToken[0].detail, /0 USDT/);
  const stable = dustRule(base({ value: 0.01, asset: "USDC", category: "token" }), P);
  assert.equal(stable[0].severity, 0.8);
  assert.equal(dustRule(base({ value: 50, asset: "USDC", category: "token" }), P).length, 0);
  assert.equal(dustRule(base({ value: 0.00001, direction: "out" }), P).length, 0);
  assert.equal(dustRule(base({ kind: "destination", value: 0 }), P).length, 0);
});

test("approvals: só as ilimitadas geram fator", () => {
  const f = approvalsRule(base({ approvals: [
    { kind: "approve", token: A, spender: LOOKALIKE, unlimited: true },
    { kind: "approve", token: A, spender: LOOKALIKE, unlimited: false },
    { kind: "setApprovalForAll", token: A, spender: LOOKALIKE, unlimited: true },
  ] }));
  assert.equal(f.length, 2);
  assert.match(f[1].title, /coleção/);
});

test("walletAge: sem histórico, nova, antiga e contrato ignorado", () => {
  assert.equal(walletAgeRule(base({ account: { available: true, hasHistory: false } }), P)[0].severity, 1);
  const young = walletAgeRule(base({ account: { available: true, hasHistory: true, firstSeenAt: "2026-01-07T00:00:00Z" } }), P);
  assert.equal(young[0].severity, 0.6);
  const hours = walletAgeRule(base({ account: { available: true, hasHistory: true, firstSeenAt: "2026-01-09T20:00:00Z" } }), P);
  assert.equal(hours[0].severity, 1);
  assert.deepEqual(walletAgeRule(base(), P), []);
  assert.deepEqual(walletAgeRule(base({ account: { available: true, hasHistory: false, isContract: true } }), P), []);
  assert.deepEqual(walletAgeRule(base({ account: { available: false } }), P), []);
});

test("aggregator: pesos, teto 100, níveis e só o fator de maior severidade pontua", () => {
  const params = normalizeRiskParams({ weights: { blacklist: 80, reputation: 65, similarity: 55, approvals: 45, dust: 20, walletAge: 15 }, thresholds: { medium: 30, high: 60 } });
  const low = aggregate([{ rule: "dust", severity: 1 }], params);
  assert.equal(low.score, 20);
  assert.equal(low.level, "low");
  assert.equal(aggregate([{ rule: "approvals", severity: 1 }], params).level, "medium");
  const capped = aggregate([{ rule: "blacklist", severity: 1 }, { rule: "reputation", severity: 1 }], params);
  assert.equal(capped.score, 100);
  assert.equal(capped.level, "high");
  const dup = aggregate([{ rule: "walletAge", severity: 0.6 }, { rule: "walletAge", severity: 1 }, { rule: "approvals", severity: 1 }, { rule: "approvals", severity: 1 }], params);
  assert.equal(dup.score, 15 + 45);
  assert.equal(dup.factors.filter(f => f.points > 0).length, 2);
  assert.equal(dup.factors.find(f => f.rule === "walletAge" && f.points > 0).severity, 1);
  assert.equal(dup.factors[0].ruleLabel, "Approvals");
});

test("evaluateRisk: poisoning com dust vira risco alto e notas de fontes indisponíveis", () => {
  const r = evaluateRisk(base({ counterparty: LOOKALIKE, knownAddresses: [A], value: 0, reputation: { available: false, flags: [], error: "timeout" }, account: { available: false } }), DEFAULT_RISK_PARAMS);
  assert.deepEqual(r.factors.map(f => f.rule).sort(), ["dust", "similarity"]);
  assert.equal(r.score, 75);
  assert.equal(r.level, "high");
  assert.equal(r.notes.length, 2);
  assert.match(r.notes[0], /Reputação externa indisponível.*timeout/);
  const clean = evaluateRisk(base(), DEFAULT_RISK_PARAMS);
  assert.equal(clean.level, "low");
  assert.equal(clean.score, 0);
  assert.deepEqual(clean.notes, []);
});

test("normalizeRiskParams: limites e rejeição de high <= medium", () => {
  assert.throws(() => normalizeRiskParams({ thresholds: { medium: 50, high: 50 } }), /maior/);
  assert.throws(() => normalizeRiskParams({ thresholds: { medium: 70, high: 40 } }));
  const p = normalizeRiskParams({ weights: { dust: 500, blacklist: -3 }, similarity: { prefix: 1 } });
  assert.equal(p.weights.dust, 100);
  assert.equal(p.weights.blacklist, 0);
  assert.equal(p.similarity.prefix, 2);
  assert.equal(normalizeRiskParams({}).thresholds.high, 60);
});

test("dust: NFT recebido (ERC-721/1155) não é tratado como valor ínfimo", () => {
  assert.equal(dustRule(base({ value: 0, asset: "BAYC", category: "erc721" }), P).length, 0);
  assert.equal(dustRule(base({ value: 0, asset: "ITEM", category: "erc1155" }), P).length, 0);
});

test("parâmetros de risco: atualização parcial mantém os valores salvos e ignora campos vazios", () => {
  const saved = normalizeRiskParams({ weights: { blacklist: 90, dust: 10 } });
  const next = normalizeRiskParams({ thresholds: { high: 70 }, weights: { blacklist: null, dust: "" } }, saved);
  assert.equal(next.thresholds.high, 70);
  assert.equal(next.weights.blacklist, 90);
  assert.equal(next.weights.dust, 10);
  assert.equal(next.dust.ethMax, DEFAULT_RISK_PARAMS.dust.ethMax);
});
