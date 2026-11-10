import { compareQuotes } from "../../comparador-cotacoes/index.js";
import { MARKET_PAIRS } from "../../integracoes/exchange-adapters/index.js";
import { badRequest, notFound, requireFields } from "../../shared/errors.js";

/**
 * Quote Service: coleta (via Job), painel de preços, simulação e histórico.
 * Módulo informativo: sem ordens, sem custódia, sem cotação firme.
 */
export function createQuoteService({ repos, integrations, config, logger = console }) {
  const lastRun = { at: null, results: [] };
  const exchangeNames = () => Object.fromEntries(repos.catalog.exchanges().map(e => [e.id, e.name]));

  function activeMarkets() {
    const assets = new Set(repos.catalog.enabledAssets().map(a => a.symbol));
    const markets = [];
    for (const exchange of repos.catalog.enabledExchanges()) {
      const adapter = integrations.exchanges[exchange.id];
      if (!adapter) continue;
      for (const [base, quote] of MARKET_PAIRS) {
        if (assets.has(base) && assets.has(quote) && adapter.symbolFor(base, quote)) markets.push({ exchange, adapter, base, quote });
      }
    }
    return markets;
  }

  function latestBooks() {
    const enabled = new Set(repos.catalog.enabledExchanges().map(e => e.id));
    const assets = new Set(repos.catalog.enabledAssets().map(a => a.symbol));
    const names = exchangeNames();
    return repos.snapshots.latest()
      .filter(s => enabled.has(s.exchange_id) && assets.has(s.base) && assets.has(s.quote))
      .map(s => ({ exchangeId: s.exchange_id, exchangeName: names[s.exchange_id] ?? s.exchange_id, base: s.base, quote: s.quote, bids: s.bids, asks: s.asks, fetchedAt: s.fetched_at }));
  }

  return {
    /** Chamado pelo Job de coleta. Falha de uma corretora não derruba as outras. */
    async collect() {
      const markets = activeMarkets();
      const settled = await Promise.allSettled(markets.map(async m => {
        const book = await m.adapter.fetchOrderBook(m.base, m.quote, config.quotes.depth);
        if (!book.bids.length || !book.asks.length) throw new Error("livro vazio");
        repos.snapshots.insert({ exchangeId: m.exchange.id, base: m.base, quote: m.quote, bids: book.bids, asks: book.asks, fetchedAt: new Date().toISOString() });
      }));
      lastRun.at = new Date().toISOString();
      lastRun.results = settled.map((r, i) => ({
        exchangeId: markets[i].exchange.id,
        pair: `${markets[i].base}/${markets[i].quote}`,
        ok: r.status === "fulfilled",
        error: r.status === "rejected" ? String(r.reason?.message ?? r.reason).slice(0, 200) : null,
      }));
      const failed = lastRun.results.filter(r => !r.ok);
      if (failed.length) logger.warn?.(`[cotações] ${failed.length}/${markets.length} coletas falharam: ${failed.map(f => `${f.exchangeId} ${f.pair}`).join(", ")}`);
      return { ok: lastRun.results.length - failed.length, failed: failed.length };
    },

    collectorStatus: () => lastRun,

    /** Painel: melhor compra/venda por corretora e por par, com fonte e horário. */
    prices() {
      const now = Date.now();
      const books = latestBooks();
      const pairs = new Map();
      for (const b of books) {
        const key = `${b.base}/${b.quote}`;
        const bestBid = b.bids[0]?.[0] ?? null;
        const bestAsk = b.asks[0]?.[0] ?? null;
        const ageMs = now - new Date(b.fetchedAt).getTime();
        const row = {
          exchangeId: b.exchangeId, exchangeName: b.exchangeName, bestBid, bestAsk,
          spreadPct: bestBid && bestAsk ? ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 100 : null,
          fetchedAt: b.fetchedAt, ageSeconds: Math.round(ageMs / 1000), stale: ageMs > config.quotes.maxAgeMs,
        };
        if (!pairs.has(key)) pairs.set(key, { pair: key, base: b.base, quote: b.quote, exchanges: [] });
        pairs.get(key).exchanges.push(row);
      }
      const result = [...pairs.values()].map(p => {
        // "Melhor compra/venda" só entre dados dentro da defasagem máxima (1 min).
        const withBid = p.exchanges.filter(e => e.bestBid && !e.stale);
        const withAsk = p.exchanges.filter(e => e.bestAsk && !e.stale);
        return {
          ...p,
          exchanges: p.exchanges.sort((a, b) => a.exchangeName.localeCompare(b.exchangeName)),
          bestSell: withBid.sort((a, b) => b.bestBid - a.bestBid)[0]?.exchangeId ?? null,  // onde se vende mais caro
          bestBuy: withAsk.sort((a, b) => a.bestAsk - b.bestAsk)[0]?.exchangeId ?? null,   // onde se compra mais barato
        };
      });
      const order = MARKET_PAIRS.map(([b, q]) => `${b}/${q}`);
      result.sort((a, b) => order.indexOf(a.pair) - order.indexOf(b.pair));
      return { pairs: result, collector: lastRun, maxAgeSeconds: config.quotes.maxAgeMs / 1000, disclaimer: "Valores informativos coletados de APIs públicas. Não são cotação firme." };
    },

    /** Ativos e pares disponíveis para o simulador. */
    options() {
      const assets = repos.catalog.enabledAssets().map(a => a.symbol);
      const pairs = MARKET_PAIRS.filter(([b, q]) => assets.includes(b) && assets.includes(q)).map(([b, q]) => `${b}/${q}`);
      return { assets, pairs };
    },

    simulate(userId, body) {
      const f = requireFields(body, { fromAsset: { max: 10 }, toAsset: { max: 10 }, amount: { type: "number", min: 0 }, includeWithdrawal: { type: "boolean", required: false } });
      const fromAsset = f.fromAsset.toUpperCase();
      const toAsset = f.toAsset.toUpperCase();
      if (fromAsset === toAsset) throw badRequest("Escolha ativos diferentes.");
      if (!(f.amount > 0)) throw badRequest("Informe uma quantidade maior que zero.", { amount: "Deve ser maior que zero." });
      const enabled = new Set(repos.catalog.enabledAssets().map(a => a.symbol));
      if (!enabled.has(fromAsset) || !enabled.has(toAsset)) throw badRequest("Ativo não habilitado.");
      const books = latestBooks();
      const feeTable = repos.feeTables.active();
      const result = compareQuotes({ fromAsset, toAsset, amount: f.amount, books, feeTable, includeWithdrawal: Boolean(f.includeWithdrawal), maxAgeMs: config.quotes.maxAgeMs });
      if (!result.ranking.length) throw badRequest(`Nenhuma corretora habilitada tem dados do par direto ${fromAsset}/${toAsset} no momento.`);
      const saved = repos.simulations.create({ userId, fromAsset, toAsset, amount: f.amount, result });
      return { id: saved.id, createdAt: saved.created_at, ...result };
    },

    history: userId => repos.simulations.list(userId).map(s => ({
      id: s.id, fromAsset: s.from_asset, toAsset: s.to_asset, amount: s.amount, createdAt: s.created_at,
      best: s.result.ranking?.[0] ? { exchangeName: s.result.ranking[0].exchangeName, net: s.result.ranking[0].net } : null,
      routes: s.result.ranking?.length ?? 0,
    })),

    getSimulation(userId, id) {
      const s = repos.simulations.findForUser(userId, id);
      if (!s) throw notFound("Simulação não encontrada.");
      return { id: s.id, createdAt: s.created_at, ...s.result };
    },

    pruneSnapshots() {
      return repos.snapshots.pruneOlderThan(new Date(Date.now() - config.quotes.retentionHours * 3_600_000).toISOString());
    },
  };
}
