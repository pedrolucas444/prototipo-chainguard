/** fetch com timeout e erro legível; usado por todos os clientes da camada de Integrações. */
export async function fetchJson(url, { method = "GET", headers = {}, body, timeoutMs = 8000, fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(url, {
    method,
    headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} em ${new URL(url).host}: ${text.slice(0, 160)}`);
    error.status = response.status;
    throw error;
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Resposta não-JSON de ${new URL(url).host}`);
  }
}

/**
 * Baixa texto com teto de tamanho (lê em streaming e aborta ao passar de maxBytes).
 * beforeRequest(url) permite validar cada destino, inclusive os de redirecionamento (até 3).
 */
export async function fetchText(url, { timeoutMs = 20000, maxBytes = 20 * 1024 * 1024, beforeRequest, fetchImpl = globalThis.fetch } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = url;
  let response;
  for (let hop = 0; ; hop++) {
    await beforeRequest?.(current);
    response = await fetchImpl(current, { signal, redirect: "manual" });
    const location = response.headers?.get?.("location");
    if (response.status < 300 || response.status >= 400 || !location) break;
    if (hop >= 3) throw new Error("Redirecionamentos demais.");
    current = new URL(location, current).toString();
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${new URL(current).host}`);
  const declared = Number(response.headers?.get?.("content-length"));
  if (declared > maxBytes) throw new Error(`Arquivo grande demais (${Math.round(declared / 1048576)} MB; máximo ${Math.round(maxBytes / 1048576)} MB).`);
  if (!response.body?.getReader) return response.text();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(`Arquivo grande demais (máximo ${Math.round(maxBytes / 1048576)} MB).`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Cache simples em memória com TTL (protege os limites de uso das APIs externas). */
export function createTtlCache(ttlMs, maxEntries = 2000) {
  const map = new Map();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (hit.expires < Date.now()) { map.delete(key); return undefined; }
      return hit.value;
    },
    set(key, value) {
      if (map.size >= maxEntries) map.delete(map.keys().next().value);
      map.set(key, { value, expires: Date.now() + ttlMs });
    },
    clear: () => map.clear(),
  };
}
