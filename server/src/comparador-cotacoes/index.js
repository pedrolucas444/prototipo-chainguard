/**
 * Comparador de Cotações: biblioteca pura (inspirada em smart order routing, mas só calcula e ordena;
 * não executa ordens). Recebe snapshots já coletados e a tabela de taxas.
 */
import { walkBuyWithQuote, walkSell } from "./orderbook-walker.js";
import { applyFees } from "./fee-model.js";
import { rankQuotes } from "./ranking.js";

export { walkSell, walkBuyWithQuote } from "./orderbook-walker.js";
export { applyFees } from "./fee-model.js";
export { rankQuotes } from "./ranking.js";

/** Descobre o lado da operação num livro base/quote: vender base ou comprar base com quote. */
export function routeFor(book, fromAsset, toAsset) {
  if (book.base === fromAsset && book.quote === toAsset) return "sell";
  if (book.base === toAsset && book.quote === fromAsset) return "buy";
  return null;
}

/**
 * @param {object} p
 * @param {string} p.fromAsset, p.toAsset
 * @param {number} p.amount quantidade do ativo de origem
 * @param {Array} p.books [{ exchangeId, exchangeName, base, quote, bids, asks, fetchedAt }]
 * @param {object} p.feeTable { version, data }
 * @param {boolean} p.includeWithdrawal
 * @param {string} p.now ISO
 * @param {number} p.maxAgeMs defasagem máxima aceita
 */
export function compareQuotes({ fromAsset, toAsset, amount, books, feeTable, includeWithdrawal = false, now = new Date().toISOString(), maxAgeMs = 60_000 }) {
  const results = [];
  for (const book of books) {
    const side = routeFor(book, fromAsset, toAsset);
    if (!side) continue;
    const walk = side === "sell" ? walkSell(book.bids, amount) : walkBuyWithQuote(book.asks, amount);
    const fees = applyFees({ exchangeId: book.exchangeId, grossOutput: walk.output, toAsset, feeTable: feeTable?.data, includeWithdrawal });
    const ageMs = new Date(now).getTime() - new Date(book.fetchedAt).getTime();
    // Preço efetivo sempre expresso como "toAsset por 1 fromAsset" para comparar rotas.
    const effectiveRate = walk.input > 0 ? walk.output / walk.input : null;
    results.push({
      exchangeId: book.exchangeId,
      exchangeName: book.exchangeName ?? book.exchangeId,
      pair: `${book.base}/${book.quote}`,
      side,
      complete: walk.complete,
      inputUsed: walk.input,
      grossOutput: walk.output,
      avgPrice: walk.avgPrice,
      bestPrice: walk.bestPrice,
      effectiveRate,
      slippagePct: walk.slippagePct,
      levelsUsed: walk.levels,
      tradingFee: fees.tradingFee,
      tradingFeeRate: fees.tradingFeeRate,
      withdrawalFee: fees.withdrawalFee,
      net: fees.net,
      feesKnown: fees.feesKnown,
      assumptions: fees.assumptions,
      fetchedAt: book.fetchedAt,
      ageSeconds: Math.max(0, Math.round(ageMs / 1000)),
      stale: ageMs > maxAgeMs,
    });
  }

  const ranking = rankQuotes(results);
  // A divisão só usa livros recentes e de corretoras com taxas cadastradas (os mesmos critérios da melhor estimativa).
  const usable = new Set(results.filter(r => !r.stale && r.feesKnown !== false).map(r => r.exchangeId));
  const split = suggestSplit({ fromAsset, toAsset, amount, books: books.filter(b => usable.has(b.exchangeId)), feeTable: feeTable?.data, includeWithdrawal, bestSingle: ranking.find(r => r.reliable) });

  const assumptions = [
    "Estimativa informativa, não é cotação firme: o livro de ofertas muda a cada segundo.",
    "Nenhuma ordem é executada pelo ChainGuard.",
    `Taxas da tabela versionada${feeTable?.version ? ` v${feeTable.version}` : ""}; a taxa de negociação (taker) é descontada do ativo recebido.`,
    includeWithdrawal ? `Inclui taxa de saque de ${toAsset} quando cadastrada.` : "Não inclui taxa de saque nem de rede.",
    "Considera apenas pares diretos (sem triangulação entre pares).",
  ];
  if (ranking.some(r => r.stale)) assumptions.push(`Há dados com mais de ${Math.round(maxAgeMs / 1000)} s: aparecem com o horário da coleta, depois das rotas atualizadas, e não entram na melhor estimativa nem na divisão.`);
  if (ranking.some(r => !r.complete)) assumptions.push("Rotas marcadas como incompletas: a profundidade do livro coletado não cobriu toda a quantidade.");

  return { fromAsset, toAsset, amount, includeWithdrawal, feeTableVersion: feeTable?.version ?? null, ranking, split, assumptions, computedAt: now };
}

/**
 * Sugestão de divisão entre corretoras (funcionalidade "útil"): junta os níveis de todos os livros,
 * já ajustados pela taxa de negociação, e consome do melhor para o pior.
 * Taxas de saque são fixas por corretora usada e são descontadas no final.
 */
export function suggestSplit({ fromAsset, toAsset, amount, books, feeTable, includeWithdrawal, bestSingle }) {
  const levels = [];
  for (const book of books) {
    const side = routeFor(book, fromAsset, toAsset);
    if (!side) continue;
    const taker = Number(feeTable?.exchanges?.[book.exchangeId]?.taker ?? 0);
    if (side === "sell") {
      for (const [price, qty] of book.bids) levels.push({ exchangeId: book.exchangeId, exchangeName: book.exchangeName ?? book.exchangeId, rate: price * (1 - taker), capacity: qty });
    } else {
      for (const [price, qty] of book.asks) levels.push({ exchangeId: book.exchangeId, exchangeName: book.exchangeName ?? book.exchangeId, rate: (1 - taker) / price, capacity: price * qty });
    }
  }
  if (new Set(levels.map(l => l.exchangeId)).size < 2) return null;
  levels.sort((a, b) => b.rate - a.rate);

  let remaining = amount;
  const alloc = new Map();
  for (const level of levels) {
    if (remaining <= 1e-12) break;
    const take = Math.min(level.capacity, remaining);
    const entry = alloc.get(level.exchangeId) ?? { exchangeId: level.exchangeId, exchangeName: level.exchangeName, input: 0, output: 0 };
    entry.input += take;
    entry.output += take * level.rate;
    alloc.set(level.exchangeId, entry);
    remaining -= take;
  }
  const allocations = [...alloc.values()].map(a => {
    const withdrawalFee = includeWithdrawal ? Number(feeTable?.exchanges?.[a.exchangeId]?.withdrawal?.[toAsset] ?? 0) : 0;
    return { ...a, withdrawalFee, net: Math.max(0, a.output - withdrawalFee), sharePct: (a.input / amount) * 100 };
  });
  const net = allocations.reduce((s, a) => s + a.net, 0);
  const complete = remaining <= 1e-9 * Math.max(1, amount);
  const gain = bestSingle ? net - bestSingle.net : null;
  return {
    complete,
    allocations: allocations.sort((a, b) => b.input - a.input),
    net,
    gainVsBest: gain,
    worthIt: Boolean(complete && allocations.length > 1 && gain !== null && gain > 0),
  };
}
