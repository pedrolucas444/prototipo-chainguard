/** Decodificação mínima de chamadas de aprovação de tokens (approve / increaseAllowance / setApprovalForAll). */
const SELECTORS = {
  "0x095ea7b3": "approve",
  "0x39509351": "increaseAllowance",
  "0xa22cb465": "setApprovalForAll",
};
const UNLIMITED_THRESHOLD = 2n ** 128n; // na prática, "ilimitado" (max uint256 é o caso mais comum)

export function decodeApproval(input, tokenAddress) {
  if (!input || input.length < 138) return null;
  const kind = SELECTORS[input.slice(0, 10).toLowerCase()];
  if (!kind) return null;
  const spender = `0x${input.slice(34, 74)}`.toLowerCase();
  const word = BigInt(`0x${input.slice(74, 138)}`);
  if (kind === "setApprovalForAll") return { kind, token: tokenAddress, spender, unlimited: word === 1n, amount: null };
  return { kind, token: tokenAddress, spender, unlimited: word >= UNLIMITED_THRESHOLD, amount: word.toString() };
}
