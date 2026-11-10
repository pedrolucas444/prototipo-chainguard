/**
 * OrderBook Walker: percorre o livro do melhor preço ao pior até completar a quantidade
 * e calcula o preço médio efetivo.
 *
 * Livros: bids = [[preço, qtd], …] decrescente; asks = [[preço, qtd], …] crescente.
 * Preço sempre em "quote por base" (ex.: ETH/USDT → USDT por 1 ETH).
 */
const EPS = 1e-12;

/** Vende `baseAmount` do ativo base consumindo os bids. Recebe quote. */
export function walkSell(bids, baseAmount) {
  let remaining = baseAmount;
  let received = 0;
  let levels = 0;
  for (const [price, qty] of bids) {
    if (remaining <= EPS) break;
    const take = Math.min(qty, remaining);
    received += take * price;
    remaining -= take;
    levels++;
  }
  const filled = baseAmount - Math.max(remaining, 0);
  return summarize({ side: "sell", input: filled, output: received, avgPrice: filled > 0 ? received / filled : null, bestPrice: bids[0]?.[0] ?? null, levels, complete: remaining <= EPS * Math.max(1, baseAmount) });
}

/** Gasta `quoteAmount` do ativo quote consumindo os asks. Recebe base. */
export function walkBuyWithQuote(asks, quoteAmount) {
  let remaining = quoteAmount;
  let received = 0;
  let levels = 0;
  for (const [price, qty] of asks) {
    if (remaining <= EPS) break;
    const cost = price * qty;
    if (cost <= remaining) {
      received += qty;
      remaining -= cost;
    } else {
      received += remaining / price;
      remaining = 0;
    }
    levels++;
  }
  const spent = quoteAmount - Math.max(remaining, 0);
  return summarize({ side: "buy", input: spent, output: received, avgPrice: received > 0 ? spent / received : null, bestPrice: asks[0]?.[0] ?? null, levels, complete: remaining <= EPS * Math.max(1, quoteAmount) });
}

function summarize(r) {
  // Slippage: quanto o preço médio ficou pior que o melhor preço da vitrine.
  if (r.avgPrice && r.bestPrice) {
    r.slippagePct = r.side === "sell" ? ((r.bestPrice - r.avgPrice) / r.bestPrice) * 100 : ((r.avgPrice - r.bestPrice) / r.bestPrice) * 100;
  } else r.slippagePct = null;
  return r;
}
