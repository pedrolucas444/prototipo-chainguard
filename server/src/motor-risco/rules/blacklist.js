const short = a => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function blacklistRule(input) {
  const hits = input.blacklistHits ?? [];
  if (!hits.length) return [];
  return hits.map(hit => {
    const role = hit.address === input.counterparty
      ? (input.direction === "in" ? "A origem" : "O destino")
      : (input.approvals ?? []).some(a => a.spender === hit.address) ? "O contrato autorizado (spender)" : "O contrato do token";
    return {
      rule: "blacklist",
      severity: 1,
      title: "Endereço presente na base de golpes",
      detail: `${role} ${short(hit.address)} consta na base de endereços maliciosos (${hit.source}${hit.category ? `, ${hit.category}` : ""}).`,
      evidence: { address: hit.address, source: hit.source, label: hit.label },
    };
  });
}
