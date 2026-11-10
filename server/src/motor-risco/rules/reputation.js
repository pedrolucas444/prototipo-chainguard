export function reputationRule(input) {
  const rep = input.reputation;
  if (!rep?.available || !rep.flags?.length) return [];
  const strong = rep.flags.filter(f => f.strong);
  const severity = strong.length ? 1 : 0.6;
  return [{
    rule: "reputation",
    severity,
    title: strong.length ? "Reputação negativa em serviço externo" : "Sinais de alerta em serviço de reputação",
    detail: `${rep.source ?? "Serviço de reputação"} marcou o endereço: ${rep.flags.map(f => f.label).join(", ")}.`,
    evidence: { flags: rep.flags.map(f => f.key), source: rep.source, dataSource: rep.dataSource },
  }];
}
