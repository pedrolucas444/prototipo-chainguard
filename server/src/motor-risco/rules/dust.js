const STABLES = new Set(["USDT", "USDC", "DAI", "BUSD", "TUSD", "USDP", "FDUSD", "PYUSD"]);

export function dustRule(input, params) {
  if (input.kind !== "transaction" || input.direction !== "in") return [];
  // NFTs (ERC-721/1155) não têm "valor" fungível: valor 0 é normal e não indica dust.
  if (["erc721", "erc1155", "specialnft"].includes(String(input.category ?? "").toLowerCase())) return [];
  const value = Number(input.value ?? 0);
  const asset = String(input.asset ?? "ETH").toUpperCase();
  const isEth = asset === "ETH" && (input.category === "external" || input.category === "internal");
  let detail = null;
  let severity = 1;
  if (value === 0) {
    detail = isEth ? "Transferência de valor zero recebida, usada para plantar o endereço no seu histórico." : `Transferência de 0 ${asset}: técnica comum para plantar endereços falsos no histórico.`;
  } else if (isEth && value < params.dust.ethMax) {
    detail = `Valor ínfimo recebido (${value} ETH, abaixo de ${params.dust.ethMax} ETH).`;
  } else if (STABLES.has(asset) && value < params.dust.stableMax) {
    detail = `Valor ínfimo recebido (${value} ${asset}, abaixo de ${params.dust.stableMax} ${asset}).`;
    severity = 0.8;
  }
  if (!detail) return [];
  return [{ rule: "dust", severity, title: "Dust: valor ínfimo recebido", detail, evidence: { value, asset } }];
}
