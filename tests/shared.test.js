import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256 } from "../server/src/shared/keccak.js";
import { toChecksumAddress, validateAddress } from "../server/src/shared/address.js";
import { base32Encode, hotp, totp, verifyTotp } from "../server/src/shared/totp.js";
import { createCipher, hashPassword, verifyPassword } from "../server/src/shared/security.js";
import { decodeApproval } from "../server/src/shared/abi.js";
import { extractAddresses } from "../server/src/integracoes/listas-publicas-client.js";

test("keccak256: vetores conhecidos", () => {
  assert.equal(keccak256(""), "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  assert.equal(keccak256("transfer(address,uint256)").slice(0, 8), "a9059cbb");
  assert.equal(keccak256("approve(address,uint256)").slice(0, 8), "095ea7b3");
  // Entrada maior que o rate (136 bytes) exercita múltiplos blocos.
  assert.equal(keccak256("a".repeat(200)).length, 64);
});

test("EIP-55: gera, aceita e rejeita checksum", () => {
  assert.equal(toChecksumAddress("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"), "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
  assert.deepEqual(validateAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"), { ok: true, address: "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed" });
  assert.equal(validateAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD").ok, false);
  assert.equal(validateAddress("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed").ok, true); // minúsculas: sem checksum
  assert.equal(validateAddress("0x123").ok, false);
  assert.equal(validateAddress("").ok, false);
});

test("HOTP/TOTP: vetor RFC 4226 e janela de tolerância", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  assert.equal(hotp(secret, 0), "755224");
  assert.equal(hotp(secret, 1), "287082");
  const now = 1_700_000_000_000;
  assert.equal(verifyTotp(secret, totp(secret, now), now), true);
  assert.equal(verifyTotp(secret, totp(secret, now - 30_000), now), true); // um passo antes
  assert.equal(verifyTotp(secret, totp(secret, now - 90_000), now), false); // três passos antes
  assert.equal(verifyTotp(secret, "abc", now), false);
});

test("senha: hash e verificação", async () => {
  const h = hashPassword("senha1234");
  assert.match(h, /^scrypt\$/);
  assert.equal(await verifyPassword("senha1234", h), true);
  assert.equal(await verifyPassword("errada", h), false);
  assert.equal(await verifyPassword("x", "lixo"), false);
});

test("cifra AES-GCM: ida e volta e chave errada falha", () => {
  const c = createCipher("segredo");
  const enc = c.encrypt("JBSWY3DPEHPK3PXP");
  assert.notEqual(enc, "JBSWY3DPEHPK3PXP");
  assert.equal(c.decrypt(enc), "JBSWY3DPEHPK3PXP");
  assert.throws(() => createCipher("outro").decrypt(enc));
});

test("decodeApproval: approve ilimitado, limitado e setApprovalForAll", () => {
  const spender = "1111111111111111111111111111111111111111";
  const token = "0xdac17f958d2ee523a2206206994597c13d831ec7";
  const max = "f".repeat(64);
  const small = (1000n).toString(16).padStart(64, "0");
  const unlimited = decodeApproval(`0x095ea7b3${spender.padStart(64, "0")}${max}`, token);
  assert.equal(unlimited.kind, "approve");
  assert.equal(unlimited.unlimited, true);
  assert.equal(unlimited.spender, `0x${spender}`);
  assert.equal(unlimited.token, token);
  const limited = decodeApproval(`0x095ea7b3${spender.padStart(64, "0")}${small}`, token);
  assert.equal(limited.unlimited, false);
  assert.equal(limited.amount, "1000");
  const all = decodeApproval(`0xa22cb465${spender.padStart(64, "0")}${"1".padStart(64, "0")}`, token);
  assert.equal(all.kind, "setApprovalForAll");
  assert.equal(all.unlimited, true);
  assert.equal(decodeApproval("0xa9059cbb" + "0".repeat(128), token), null);
  assert.equal(decodeApproval("0x", token), null);
});

test("extractAddresses: JSON, texto, duplicatas e endereço nulo", () => {
  const a = "0x" + "a".repeat(40);
  const b = "0x" + "B".repeat(40);
  const text = JSON.stringify([a, b, a.toUpperCase().replace("0X", "0x"), "0x" + "0".repeat(40), "0x" + "c".repeat(41)]) + `\n${a}`;
  const out = extractAddresses(text);
  assert.deepEqual(out.sort(), [a, b.toLowerCase()].sort());
});

test("clientIp: ignora X-Forwarded-For sem TRUST_PROXY e usa o IP anexado pelo proxy com TRUST_PROXY", async () => {
  const { clientIp } = await import("../server/src/aplicacao/http/server.js");
  const req = { socket: { remoteAddress: "10.0.0.1" }, headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9" } };
  assert.equal(clientIp(req, 0), "10.0.0.1");
  assert.equal(clientIp(req, 1), "203.0.113.9"); // o cliente forjou 6.6.6.6, mas o proxy anexou o IP real
  assert.equal(clientIp({ socket: { remoteAddress: "10.0.0.1" }, headers: {} }, 1), "10.0.0.1");
});

test("TOTP: o mesmo passo não é aceito duas vezes", async () => {
  const { matchTotp } = await import("../server/src/shared/totp.js");
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  const now = 1_700_000_000_000;
  const step = matchTotp(secret, totp(secret, now), { timeMs: now });
  assert.equal(typeof step, "number");
  assert.equal(matchTotp(secret, totp(secret, now), { timeMs: now, afterStep: step }), null);
  assert.equal(matchTotp(secret, totp(secret, now + 30_000), { timeMs: now, afterStep: step }), step + 1);
});

test("rateKey: IPv6 agrupado por /64, IPv4 (inclusive mapeado) sem mudança", async () => {
  const { rateKey } = await import("../server/src/aplicacao/http/server.js");
  assert.equal(rateKey("2001:db8:1:2:aaaa::1"), rateKey("2001:db8:1:2:ffff:1:2:3"));
  assert.notEqual(rateKey("2001:db8:1:2::1"), rateKey("2001:db8:1:3::1"));
  assert.equal(rateKey("::ffff:203.0.113.5"), "203.0.113.5");
  assert.equal(rateKey("203.0.113.5"), "203.0.113.5");
});
