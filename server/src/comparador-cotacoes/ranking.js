/**
 * Ranking de Cotações: ordena pelo valor líquido estimado. Ficam depois, nesta ordem de critério:
 * rotas incompletas (livro raso), dados com mais de 1 min (defasagem máxima aceita) e corretoras sem taxas cadastradas
 * (o líquido delas não é comparável). A "melhor estimativa" é a primeira rota que não tem nenhum desses problemas.
 */
const reliable = r => r.complete && !r.stale && r.feesKnown !== false;
export function rankQuotes(results) {
  const ranked = [...results].sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? -1 : 1;
    if (Boolean(a.stale) !== Boolean(b.stale)) return a.stale ? 1 : -1;
    if ((a.feesKnown !== false) !== (b.feesKnown !== false)) return a.feesKnown === false ? 1 : -1;
    return b.net - a.net;
  });
  const best = ranked.find(reliable) ?? ranked.find(r => r.complete) ?? ranked[0];
  return ranked.map((r, i) => ({
    ...r,
    position: i + 1,
    reliable: reliable(r),
    diffFromBest: best ? r.net - best.net : 0,
    diffFromBestPct: best && best.net > 0 ? ((r.net - best.net) / best.net) * 100 : 0,
  }));
}
