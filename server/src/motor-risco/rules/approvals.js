const short = a => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function approvalsRule(input) {
  const unlimited = (input.approvals ?? []).filter(a => a.unlimited);
  return unlimited.map(a => ({
    rule: "approvals",
    severity: 1,
    title: a.kind === "setApprovalForAll" ? "Autorização total sobre uma coleção" : "Aprovação ilimitada de tokens",
    detail: a.kind === "setApprovalForAll"
      ? `A transação autoriza ${short(a.spender)} a mover todos os itens do contrato ${short(a.token)}.`
      : `A transação autoriza ${short(a.spender)} a gastar uma quantidade ilimitada do token ${short(a.token)}. Revogue se não reconhecer.`,
    evidence: a,
  }));
}
