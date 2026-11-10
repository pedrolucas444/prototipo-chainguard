/**
 * Fee Model: aplica taxas a partir de uma tabela estática e versionada (as APIs públicas
 * em geral não informam taxa de saque e de rede).
 *
 * Tabela: { exchanges: { binance: { taker: 0.001, withdrawal: { ETH: 0.0008, USDT: 3 } } } }
 * Premissa: a taxa de negociação (taker) é descontada do ativo recebido.
 */
export function applyFees({ exchangeId, grossOutput, toAsset, feeTable, includeWithdrawal }) {
  const fees = feeTable?.exchanges?.[exchangeId];
  const assumptions = [];
  if (!fees) {
    assumptions.push("Taxas desta corretora não cadastradas: líquido sem desconto de taxas, por isso ela fica depois das demais no ranking.");
    return { tradingFee: 0, tradingFeeRate: 0, withdrawalFee: 0, net: grossOutput, feesKnown: false, assumptions };
  }
  const tradingFeeRate = Number(fees.taker ?? 0);
  const tradingFee = grossOutput * tradingFeeRate;
  let withdrawalFee = 0;
  if (includeWithdrawal) {
    const value = fees.withdrawal?.[toAsset];
    if (value === undefined || value === null) assumptions.push(`Taxa de saque de ${toAsset} não cadastrada para esta corretora.`);
    else withdrawalFee = Number(value);
  }
  const net = Math.max(0, grossOutput - tradingFee - withdrawalFee);
  return { tradingFee, tradingFeeRate, withdrawalFee, net, feesKnown: true, assumptions };
}
