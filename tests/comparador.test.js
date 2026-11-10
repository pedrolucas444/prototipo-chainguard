import { test } from "node:test";
import assert from "node:assert/strict";
import { compareQuotes, rankQuotes, routeFor, suggestSplit, walkBuyWithQuote, walkSell, applyFees } from "../server/src/comparador-cotacoes/index.js";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const NOW = "2026-01-01T00:01:00.000Z";
const FEES = { version: 3, data: { exchanges: { a: { taker: 0.001, withdrawal: { USDT: 1 } }, b: { taker: 0.001, withdrawal: { USDT: 1 } } } } };

test("exemplo do guia: vender 1 ETH em 0.4@2000, 0.3@1999, 0.5@1997", () => {
  const bids = [[2000, 0.4], [1999, 0.3], [1997, 0.5]];
  const w = walkSell(bids, 1);
  close(w.output, 1998.8);
  close(w.avgPrice, 1998.8);
  assert.equal(w.levels, 3);
  assert.equal(w.complete, true);
  close(w.slippagePct, 0.06);
  const fees = applyFees({ exchangeId: "x", grossOutput: w.output, toAsset: "USDT", feeTable: { exchanges: { x: { taker: 0.001 } } }, includeWithdrawal: false });
  close(fees.tradingFee, 1.9988);
  assert.equal(fees.net.toFixed(2), "1996.80");
});

test("walkBuyWithQuote: gasta quote e compra base", () => {
  const asks = [[2000, 0.5], [2010, 1]];
  const w = walkBuyWithQuote(asks, 2005);
  close(w.output, 0.5 + 1005 / 2010);
  close(w.input, 2005);
  close(w.avgPrice, 2005 / w.output);
  assert.equal(w.complete, true);
});

test("livro raso: rota marcada como incompleta", () => {
  const w = walkSell([[2000, 0.2]], 1);
  assert.equal(w.complete, false);
  close(w.input, 0.2);
  const b = walkBuyWithQuote([[2000, 0.1]], 1000);
  assert.equal(b.complete, false);
});

test("routeFor: compra vs venda vs sem par", () => {
  const book = { base: "ETH", quote: "USDT" };
  assert.equal(routeFor(book, "ETH", "USDT"), "sell");
  assert.equal(routeFor(book, "USDT", "ETH"), "buy");
  assert.equal(routeFor(book, "ETH", "BRL"), null);
});

test("ranking: completas primeiro, depois por líquido", () => {
  const r = rankQuotes([
    { exchangeId: "x", complete: false, net: 9999 },
    { exchangeId: "y", complete: true, net: 100 },
    { exchangeId: "z", complete: true, net: 120 },
  ]);
  assert.deepEqual(r.map(x => x.exchangeId), ["z", "y", "x"]);
  assert.equal(r[0].position, 1);
  assert.equal(r[1].diffFromBest, -20);
});

test("compareQuotes: ranking, flag de defasagem, saque e premissas", () => {
  const books = [
    { exchangeId: "a", base: "ETH", quote: "USDT", bids: [[2000, 5]], asks: [[2001, 5]], fetchedAt: "2026-01-01T00:00:50.000Z" },
    { exchangeId: "b", base: "ETH", quote: "USDT", bids: [[2010, 5]], asks: [[2011, 5]], fetchedAt: "2025-12-31T23:58:00.000Z" },
    { exchangeId: "c", base: "ETH", quote: "BRL", bids: [[10000, 5]], asks: [[10010, 5]], fetchedAt: NOW },
  ];
  const r = compareQuotes({ fromAsset: "ETH", toAsset: "USDT", amount: 1, books, feeTable: FEES, includeWithdrawal: true, now: NOW });
  // "b" paga mais, mas o dado tem mais de 1 min: fica depois da rota atualizada.
  assert.deepEqual(r.ranking.map(x => x.exchangeId), ["a", "b"]);
  assert.equal(r.ranking[0].stale, false);
  assert.equal(r.ranking[1].stale, true);
  close(r.ranking[0].net, 2000 - 2 - 1);
  assert.equal(r.feeTableVersion, 3);
  assert.ok(r.assumptions.some(a => /horário da coleta/.test(a)));
  // Compra: USDT → ETH
  const buy = compareQuotes({ fromAsset: "USDT", toAsset: "ETH", amount: 2001, books, feeTable: FEES, now: NOW });
  assert.equal(buy.ranking[0].exchangeId, "a");
  assert.equal(buy.ranking[0].side, "buy");
});

test("suggestSplit: livros complementares rendem mais que a melhor corretora sozinha", () => {
  const books = [
    { exchangeId: "a", base: "ETH", quote: "USDT", bids: [[2000, 1], [1900, 10]], asks: [], fetchedAt: NOW },
    { exchangeId: "b", base: "ETH", quote: "USDT", bids: [[1999, 1], [1800, 10]], asks: [], fetchedAt: NOW },
  ];
  const r = compareQuotes({ fromAsset: "ETH", toAsset: "USDT", amount: 2, books, feeTable: FEES, now: NOW });
  assert.equal(r.ranking[0].exchangeId, "a");
  assert.ok(r.split);
  assert.equal(r.split.allocations.length, 2);
  assert.ok(r.split.gainVsBest > 0);
  assert.equal(r.split.worthIt, true);
  close(r.split.net, (2000 + 1999) * 0.999);
  // Uma única corretora: sem sugestão
  assert.equal(suggestSplit({ fromAsset: "ETH", toAsset: "USDT", amount: 1, books: [books[0]], feeTable: FEES.data }), null);
});

test("ranking: dado com mais de 1 min e corretora sem taxas não viram a melhor estimativa", async () => {
  const { compareQuotes } = await import("../server/src/comparador-cotacoes/index.js");
  const now = "2026-01-01T12:00:00.000Z";
  const book = (exchangeId, mid, fetchedAt) => ({ exchangeId, base: "ETH", quote: "USDT", fetchedAt, bids: [[mid, 10]], asks: [[mid + 1, 10]] });
  const feeTable = { version: 1, data: { exchanges: { binance: { taker: 0.001 }, kraken: { taker: 0.004 } } } };
  const result = compareQuotes({
    fromAsset: "ETH", toAsset: "USDT", amount: 1, now, feeTable,
    books: [book("binance", 2000, now), book("kraken", 2100, "2026-01-01T11:00:00.000Z"), book("semtaxa", 2050, now)],
  });
  assert.deepEqual(result.ranking.map(r => r.exchangeId), ["binance", "semtaxa", "kraken"]);
  assert.equal(result.ranking[0].reliable, true);
  assert.equal(result.split, null); // só uma corretora confiável: não há divisão
});
