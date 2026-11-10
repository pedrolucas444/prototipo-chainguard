import crypto from "node:crypto";

// TOTP (RFC 6238) compatível com Google Authenticator, Authy, 1Password etc.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateTotpSecret = () => base32Encode(crypto.randomBytes(20));

export function hotp(secret, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, "0");
}

export function totp(secret, timeMs = Date.now(), step = 30) {
  return hotp(secret, Math.floor(timeMs / 1000 / step));
}

/**
 * Aceita o código atual e um passo antes/depois (relógio levemente fora) e devolve o passo aceito, ou null.
 * Com afterStep, recusa passos já usados (RFC 6238 §5.2: um código não pode ser aceito duas vezes).
 */
export function matchTotp(secret, code, { timeMs = Date.now(), window = 1, afterStep = -1 } = {}) {
  const clean = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const counter = Math.floor(timeMs / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    const expected = hotp(secret, counter + i);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean)) && counter + i > afterStep) return counter + i;
  }
  return null;
}

export function verifyTotp(secret, code, timeMs = Date.now(), window = 1) {
  return matchTotp(secret, code, { timeMs, window }) !== null;
}

export function otpauthUrl({ secret, account, issuer = "ChainGuard" }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
