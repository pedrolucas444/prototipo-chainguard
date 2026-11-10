import crypto from "node:crypto";

// ---------- Senhas (scrypt) ----------
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Assíncrona: o scrypt roda no pool de threads e não trava as outras requisições. */
export async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await new Promise((resolve, reject) =>
    crypto.scrypt(String(password), Buffer.from(saltHex, "hex"), expected.length, SCRYPT_PARAMS, (err, key) => (err ? reject(err) : resolve(key))));
  return crypto.timingSafeEqual(expected, actual);
}

// ---------- Tokens opacos (sessão, desafio de 2FA, códigos de recuperação) ----------
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

export function safeEqualHex(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
export const normalizeRecoveryCode = code => String(code || "").toUpperCase().replace(/[^0-9A-F]/g, "");

// ---------- Cifra simétrica para segredos guardados no banco (TOTP) ----------
export function createCipher(secret) {
  const key = crypto.createHash("sha256").update(`chainguard:${secret}`).digest();
  return {
    encrypt(plain) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      return [iv, cipher.getAuthTag(), data].map(b => b.toString("base64url")).join(".");
    },
    decrypt(payload) {
      const [iv, tag, data] = String(payload).split(".").map(part => Buffer.from(part, "base64url"));
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    },
  };
}

// ---------- HMAC (assinatura do webhook) ----------
export function hmacSha256Hex(key, body) {
  return crypto.createHmac("sha256", key).update(body).digest("hex");
}
