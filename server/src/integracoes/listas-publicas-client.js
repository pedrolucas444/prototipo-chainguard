/**
 * Listas Públicas Client: baixa listas públicas de endereços maliciosos.
 * Aceita JSON (array ou objeto) ou texto: extrai todo endereço 0x… encontrado, o que torna
 * o cliente tolerante a pequenas mudanças de formato das fontes.
 */
import dns from "node:dns/promises";
import net from "node:net";
import { fetchText } from "../shared/http-client.js";

const ADDRESS_GLOBAL = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
const MAX_ENTRIES = 500_000;

export function extractAddresses(text) {
  const found = new Set();
  for (const match of String(text).matchAll(ADDRESS_GLOBAL)) {
    found.add(match[0].toLowerCase());
    if (found.size >= MAX_ENTRIES) break;
  }
  found.delete("0x0000000000000000000000000000000000000000");
  return [...found];
}

/** Endereços IP que não podem ser alvo de uma URL configurada pelo Admin (rede interna, loopback, link-local…). */
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
}

/** Só HTTPS, e o host precisa resolver para IP público (evita usar o servidor para sondar a rede interna). */
export async function assertPublicHttps(url, { lookup = dns.lookup } = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("A URL precisa usar HTTPS.");
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(a => isPrivateIp(a.address))) throw new Error("A URL aponta para um endereço de rede interna.");
}

export function createListasPublicasClient({ fetchImpl = globalThis.fetch, lookup = dns.lookup } = {}) {
  return {
    async fetchList(url) {
      const text = await fetchText(url, { fetchImpl, timeoutMs: 30_000, maxBytes: 20 * 1024 * 1024, beforeRequest: target => assertPublicHttps(target, { lookup }) });
      const addresses = extractAddresses(text);
      if (!addresses.length) throw new Error("Nenhum endereço encontrado na lista.");
      return addresses.map(address => ({ address }));
    },
  };
}
