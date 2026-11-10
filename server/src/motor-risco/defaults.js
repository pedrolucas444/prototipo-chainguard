/**
 * Parâmetros padrão do motor de risco. O Administrador ajusta pesos e limiares pela tela
 * de configuração; estes valores são só o ponto de partida (pesos iniciais "a definir com o cliente").
 *
 * Pontuação: cada regra disparada contribui com peso × severidade (0..1). A soma é limitada a 100.
 */
export const DEFAULT_RISK_PARAMS = Object.freeze({
  weights: {
    blacklist: 80,      // endereço/contrato na base local de golpes
    reputation: 65,     // flags do serviço de reputação (GoPlus)
    similarity: 55,     // address poisoning
    approvals: 45,      // aprovação ilimitada de tokens
    dust: 20,           // valor ínfimo recebido
    walletAge: 15,      // contraparte nova ou sem histórico
  },
  thresholds: { medium: 30, high: 60 },
  dust: { ethMax: 0.0001, stableMax: 0.1 },
  similarity: { prefix: 4, suffix: 4 },
  walletAge: { minDays: 7 },
});

export const RULE_LABELS = {
  blacklist: "Lista negra",
  reputation: "Reputação",
  similarity: "Similaridade de endereço",
  dust: "Dust",
  approvals: "Approvals",
  walletAge: "Idade da carteira",
};

// null, "" e valores não numéricos contam como "não informado" (e não como 0).
const num = v => (v === null || v === undefined || (typeof v === "string" && v.trim() === "") ? NaN : Number(v));

/**
 * Mescla os parâmetros informados sobre a base (os parâmetros salvos, ou os padrões) e valida limites.
 * Campos ausentes mantêm o valor da base: uma atualização parcial não zera nem restaura o resto.
 */
export function normalizeRiskParams(input = {}, base = DEFAULT_RISK_PARAMS) {
  const out = structuredClone(base === DEFAULT_RISK_PARAMS ? DEFAULT_RISK_PARAMS : normalizeRiskParams(base));
  for (const key of Object.keys(out.weights)) {
    const v = num(input?.weights?.[key]);
    if (Number.isFinite(v)) out.weights[key] = Math.max(0, Math.min(100, Math.round(v)));
  }
  const medium = num(input?.thresholds?.medium);
  const high = num(input?.thresholds?.high);
  if (Number.isFinite(medium)) out.thresholds.medium = Math.max(1, Math.min(99, Math.round(medium)));
  if (Number.isFinite(high)) out.thresholds.high = Math.max(2, Math.min(100, Math.round(high)));
  if (out.thresholds.high <= out.thresholds.medium) throw new Error("O limiar de risco alto precisa ser maior que o de risco médio.");
  const ethMax = num(input?.dust?.ethMax);
  const stableMax = num(input?.dust?.stableMax);
  if (Number.isFinite(ethMax) && ethMax >= 0) out.dust.ethMax = ethMax;
  if (Number.isFinite(stableMax) && stableMax >= 0) out.dust.stableMax = stableMax;
  for (const k of ["prefix", "suffix"]) {
    const v = num(input?.similarity?.[k]);
    if (Number.isFinite(v)) out.similarity[k] = Math.max(2, Math.min(10, Math.round(v)));
  }
  const minDays = num(input?.walletAge?.minDays);
  if (Number.isFinite(minDays)) out.walletAge.minDays = Math.max(0, Math.min(365, Math.round(minDays)));
  return out;
}
