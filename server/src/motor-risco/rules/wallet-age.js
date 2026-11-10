const DAY = 86_400_000;

export function walletAgeRule(input, params) {
  const account = input.account;
  if (!account?.available || account.isContract) return [];
  const who = input.direction === "in" ? "A origem" : "O destino";
  if (!account.hasHistory) {
    return [{ rule: "walletAge", severity: 1, title: "Endereço sem histórico", detail: `${who} não tem nenhuma transação registrada na rede.`, evidence: { hasHistory: false } }];
  }
  if (!account.firstSeenAt) return [];
  const ageDays = (new Date(input.now ?? Date.now()).getTime() - new Date(account.firstSeenAt).getTime()) / DAY;
  if (ageDays >= params.walletAge.minDays) return [];
  return [{
    rule: "walletAge",
    severity: ageDays < 1 ? 1 : 0.6,
    title: "Carteira muito nova",
    detail: `${who} teve a primeira transação há ${ageDays < 1 ? "menos de 1 dia" : `${Math.floor(ageDays)} dia(s)`} (limite: ${params.walletAge.minDays} dias).`,
    evidence: { firstSeenAt: account.firstSeenAt, ageDays: Math.round(ageDays * 10) / 10 },
  }];
}
