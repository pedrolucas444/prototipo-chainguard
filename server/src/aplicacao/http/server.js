import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { AppError, forbidden, tooMany, unauthorized } from "../../shared/errors.js";
import { accessFor, RATE_LIMITS } from "../config/access.js";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json",
};
const SESSION_COOKIE = "cg_session";
const MAX_BODY = 1_000_000;

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map(p => p.trim().split("=")).filter(([k, v]) => k && v !== undefined).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new AppError(413, "Corpo da requisição muito grande.")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function createRateLimiter() {
  const hits = new Map();
  return (ip, pathname, method = "GET") => {
    for (const rule of RATE_LIMITS) {
      if (!pathname.startsWith(rule.prefix) || (rule.methods && !rule.methods.includes(method))) continue;
      hit(rule, `${rule.prefix}|${rateKey(ip)}`);
    }
  };
  function hit(rule, key) {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) { hits.set(key, { count: 1, reset: now + rule.windowMs }); return; }
    if (++entry.count > rule.max) throw tooMany();
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }
}

/** IPv6 é agrupado por /64 (um único cliente costuma ter a faixa inteira); IPv4 fica como está. */
export function rateKey(ip) {
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (v4) return v4[1];
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups.slice(0, 4).map(g => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * IP do cliente para o limitador. Atrás de proxy reverso (Render, Railway, Nginx…), o socket mostra o IP do proxy;
 * com TRUST_PROXY=N, usa o N-ésimo IP a partir da direita do X-Forwarded-For (o que o proxy mais próximo anexou),
 * que o cliente não consegue forjar. Sem TRUST_PROXY, o header é ignorado.
 */
export function clientIp(req, trustProxyHops = 0) {
  const socketIp = req.socket.remoteAddress ?? "?";
  if (!trustProxyHops) return socketIp;
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",").map(p => p.trim()).filter(Boolean);
  return forwarded[forwarded.length - trustProxyHops] ?? forwarded[0] ?? socketIp;
}

function securityHeaders(res, config) {
  const wc = config.walletConnectProjectId;
  const csp = [
    "default-src 'self'",
    `script-src 'self'${wc ? " https://esm.sh" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    `connect-src 'self'${wc ? " https://esm.sh https://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.com wss://*.walletconnect.org https://*.web3modal.org https://*.reown.com wss://*.reown.com" : ""}`,
    `frame-src ${wc ? "https://verify.walletconnect.com https://verify.walletconnect.org" : "'none'"}`,
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  if (config.cookieSecure) res.setHeader("Strict-Transport-Security", "max-age=31536000");
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body ?? null);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(data);
}

function serveStatic(req, res, webDir, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return sendJson(res, 400, { error: "Caminho inválido." }); }
  let file = path.normalize(path.join(webDir, decoded));
  if (file !== webDir && !file.startsWith(webDir + path.sep)) return sendJson(res, 403, { error: "Proibido." });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(webDir, "index.html"); // SPA fallback
  if (!fs.existsSync(file)) return sendJson(res, 404, { error: "Front-end não encontrado." });
  const ext = path.extname(file);
  res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": ext === ".html" ? "no-cache" : "public, max-age=300" });
  fs.createReadStream(file).on("error", () => { if (!res.headersSent) sendJson(res, 404, { error: "Arquivo não encontrado." }); else res.destroy(); }).pipe(res);
}

export function createHttpServer({ router, authService, config, logger = console }) {
  const rateLimit = createRateLimiter();

  const sessionCookie = (token, maxAgeSec) => [
    `${SESSION_COOKIE}=${token ? encodeURIComponent(token) : ""}`, "Path=/", "HttpOnly", "SameSite=Strict",
    `Max-Age=${maxAgeSec}`, config.cookieSecure ? "Secure" : null,
  ].filter(Boolean).join("; ");

  return http.createServer(async (req, res) => {
    const started = Date.now();
    let url;
    // URL malformada (ex.: "GET //") não pode derrubar o processo: responde 400.
    try { url = new URL(req.url, "http://localhost"); } catch { url = null; }
    const pathname = url?.pathname ?? "";
    securityHeaders(res, config);
    try {
      if (!url) throw new AppError(400, "URL inválida.");
      const isApi = pathname.startsWith("/api/") || pathname === "/api" || pathname.startsWith("/webhooks/");
      if (!isApi) {
        if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Método não permitido." });
        return serveStatic(req, res, config.webDir, pathname);
      }

      const ip = clientIp(req, config.trustProxyHops);
      rateLimit(ip, pathname, req.method);

      // CSRF: além do cookie SameSite=Strict, toda chamada que altera estado precisa de um header customizado
      // (navegadores não enviam headers customizados entre origens sem preflight CORS, que não habilitamos).
      if (req.method !== "GET" && pathname.startsWith("/api/") && req.headers["x-requested-with"] !== "ChainGuard") {
        throw forbidden("Requisição sem o header X-Requested-With.");
      }

      const cookies = parseCookies(req.headers.cookie);
      const token = cookies[SESSION_COOKIE];
      const user = authService.authenticate(token);
      const access = accessFor(pathname);
      if (access === "user" && !user) throw unauthorized();
      if (access === "admin") {
        if (!user) throw unauthorized();
        if (user.role !== "admin") throw forbidden("Área restrita ao Administrador.");
      }

      const { handler, params, methodNotAllowed } = router.match(req.method, pathname);
      if (!handler) return sendJson(res, methodNotAllowed ? 405 : 404, { error: methodNotAllowed ? "Método não permitido." : "Rota não encontrada." });

      const rawBody = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) ? await readBody(req) : Buffer.alloc(0);
      let body = {};
      if (rawBody.length && !pathname.startsWith("/webhooks/")) {
        try { body = JSON.parse(rawBody.toString("utf8")); } catch { throw new AppError(400, "JSON inválido."); }
      }

      const ctx = {
        req, res, params, body, rawBody, user, token, ip,
        query: Object.fromEntries(url.searchParams),
        setSession: t => res.setHeader("Set-Cookie", sessionCookie(t, Math.floor(config.sessionTtlMs / 1000))),
        clearSession: () => res.setHeader("Set-Cookie", sessionCookie("", 0)),
      };
      const result = await handler(ctx);
      if (res.writableEnded) return;
      if (result && result.__status) return sendJson(res, result.__status, result.body);
      sendJson(res, 200, result ?? { ok: true });
    } catch (error) {
      const status = error instanceof AppError ? error.status : 500;
      if (status >= 500) logger.error?.(`[http] ${req.method} ${pathname}`, error);
      if (!res.headersSent) sendJson(res, status, { error: status === 500 ? "Erro interno." : error.message, details: error.details });
    } finally {
      if (process.env.LOG_REQUESTS === "1") logger.info?.(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  });
}
