import { keccak256 } from "./keccak.js";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function toChecksumAddress(address) {
  const lower = address.toLowerCase().replace(/^0x/, "");
  const hash = keccak256(lower);
  let out = "0x";
  for (let i = 0; i < 40; i++) out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  return out;
}

/**
 * Valida o formato 0x + 40 hex. Se o endereço vier com letras maiúsculas e minúsculas
 * misturadas, confere também o checksum EIP-55 (pega erros de digitação).
 */
export function validateAddress(value) {
  const address = String(value ?? "").trim();
  if (!ADDRESS_RE.test(address)) return { ok: false, reason: "Formato inválido: use 0x seguido de 40 caracteres hexadecimais." };
  const body = address.slice(2);
  const mixedCase = body !== body.toLowerCase() && body !== body.toUpperCase();
  if (mixedCase && toChecksumAddress(address) !== address) {
    return { ok: false, reason: "Checksum EIP-55 inválido: confira se o endereço foi copiado corretamente." };
  }
  return { ok: true, address: address.toLowerCase() };
}

export const isAddress = value => ADDRESS_RE.test(String(value ?? "").trim());
export const normalizeAddress = value => String(value ?? "").trim().toLowerCase();
export const shortAddress = value => (value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "");
