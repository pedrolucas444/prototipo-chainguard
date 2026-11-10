/**
 * Address poisoning: o golpista gera um endereço com o mesmo início e o mesmo fim de um
 * endereço que a vítima usa, e o planta no histórico esperando um "copiar e colar" errado.
 */
export function findLookalike(candidate, knownAddresses, { prefix = 4, suffix = 4 } = {}) {
  const c = candidate?.toLowerCase();
  if (!c) return null;
  const head = c.slice(2, 2 + prefix);
  const tail = c.slice(-suffix);
  return knownAddresses.find(k => {
    const known = k.toLowerCase();
    return known !== c && known.slice(2, 2 + prefix) === head && known.slice(-suffix) === tail;
  }) ?? null;
}

export function similarityRule(input, params) {
  const lookalike = findLookalike(input.counterparty, input.knownAddresses ?? [], params.similarity);
  if (!lookalike) return [];
  const short = a => `${a.slice(0, 8)}…${a.slice(-6)}`;
  return [{
    rule: "similarity",
    severity: 1,
    title: "Endereço parecido com um que você já usa",
    detail: `${short(input.counterparty)} tem o mesmo início e fim de ${short(lookalike)}, mas é outro endereço. Padrão típico de address poisoning.`,
    evidence: { lookalike, counterparty: input.counterparty },
  }];
}
