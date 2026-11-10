import { RULE_LABELS } from "./defaults.js";

/**
 * Converte fatores em pontuação 0..100 e nível (low/medium/high) usando pesos e limiares configuráveis.
 * Uma regra pode gerar vários fatores (ex.: duas aprovações); só o de maior severidade pontua,
 * os demais aparecem como evidência com 0 ponto.
 */
export function aggregate(factors, params) {
  const awarded = new Set();
  const scored = [...factors]
    .sort((a, b) => b.severity - a.severity)
    .map(f => {
      const points = awarded.has(f.rule) ? 0 : Math.round((params.weights[f.rule] ?? 0) * f.severity);
      awarded.add(f.rule);
      return { ...f, ruleLabel: RULE_LABELS[f.rule] ?? f.rule, points };
    })
    .sort((a, b) => b.points - a.points);

  const score = Math.min(100, scored.reduce((sum, f) => sum + f.points, 0));
  const level = score >= params.thresholds.high ? "high" : score >= params.thresholds.medium ? "medium" : "low";
  return { score, level, factors: scored };
}
