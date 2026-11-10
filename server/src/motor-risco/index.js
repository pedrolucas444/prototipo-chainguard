/**
 * Motor de Risco: biblioteca pura. Não conhece banco nem internet.
 * Recebe os dados que o Service reuniu e devolve { score, level, factors, notes }.
 */
import { RULES } from "./rules/index.js";
import { aggregate } from "./score-aggregator.js";
import { normalizeRiskParams } from "./defaults.js";

export { DEFAULT_RISK_PARAMS, RULE_LABELS, normalizeRiskParams } from "./defaults.js";
export { findLookalike } from "./rules/similarity.js";

export function evaluateRisk(input, rawParams) {
  const params = normalizeRiskParams(rawParams);
  const factors = RULES.flatMap(rule => rule(input, params));
  const result = aggregate(factors, params);

  // Observações honestas sobre o que não pôde ser avaliado (fonte fora do ar etc.).
  const notes = [];
  if (input.reputation && !input.reputation.available) notes.push(`Reputação externa indisponível: o fator ficou de fora desta análise${input.reputation.error ? ` (${input.reputation.error})` : ""}.`);
  if (input.account && !input.account.available) notes.push("Dados de histórico da conta indisponíveis: a regra de idade da carteira não foi aplicada.");

  return { ...result, notes, thresholds: params.thresholds, evaluatedAt: input.now ?? new Date().toISOString() };
}
