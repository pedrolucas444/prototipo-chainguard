import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Lê .env (se existir) e monta a configuração. Nenhuma chave é obrigatória. */
export function loadConfig(env = process.env, { loadDotEnv = true } = {}) {
  if (loadDotEnv && fs.existsSync(".env")) process.loadEnvFile(".env");
  const e = key => (env[key] ?? "").trim();
  const num = (key, fallback) => (Number.isFinite(Number(e(key))) && e(key) !== "" ? Number(e(key)) : fallback);

  const alchemyApiKey = e("ALCHEMY_API_KEY");
  const dbPath = e("DB_PATH") || "data/chainguard.db";
  return {
    port: num("PORT", 3000),
    host: e("HOST") || "127.0.0.1",
    dbPath,
    appSecret: e("APP_SECRET") || persistentSecret(dbPath),
    // Em produção (NODE_ENV=production) o cookie é Secure por padrão; COOKIE_SECURE=false desliga explicitamente.
    cookieSecure: e("COOKIE_SECURE") ? e("COOKIE_SECURE") === "true" : e("NODE_ENV") === "production",
    trustProxyHops: e("TRUST_PROXY") === "true" ? 1 : Math.max(0, Math.trunc(num("TRUST_PROXY", 0))),
    sessionTtlMs: num("SESSION_TTL_HOURS", 12) * 3_600_000,
    admin: { email: e("ADMIN_EMAIL") || "admin@chainguard.local", password: e("ADMIN_PASSWORD") },
    alchemy: {
      apiKey: alchemyApiKey,
      authToken: e("ALCHEMY_AUTH_TOKEN"),
      webhookId: e("ALCHEMY_WEBHOOK_ID"),
      signingKey: e("ALCHEMY_SIGNING_KEY"),
    },
    rpcUrl: e("ETH_RPC_URL") || (alchemyApiKey ? `https://eth-mainnet.g.alchemy.com/v2/${alchemyApiKey}` : "https://ethereum-rpc.publicnode.com"),
    goplus: { accessToken: e("GOPLUS_ACCESS_TOKEN") },
    etherscanApiKey: e("ETHERSCAN_API_KEY"),
    blockscoutUrl: (e("BLOCKSCOUT_URL") || "https://eth.blockscout.com").replace(/\/$/, ""),
    walletConnectProjectId: e("WALLETCONNECT_PROJECT_ID"),
    jobs: {
      enabled: e("JOBS") !== "off",
      quotesIntervalMs: Math.min(num("QUOTES_INTERVAL_MS", 30_000), 59_000), // precisa ser < 1 min (defasagem máxima)
      listsIntervalMs: num("LISTS_INTERVAL_MS", 6 * 3_600_000),
      fallbackSyncMs: num("FALLBACK_SYNC_MS", 60_000),
      maintenanceMs: 3_600_000,
    },
    quotes: { maxAgeMs: 60_000, depth: 100, retentionHours: 24 },
    queue: { pollMs: 300, maxAttempts: 5, baseDelayMs: 2000, concurrency: Math.max(1, Math.trunc(num("QUEUE_CONCURRENCY", 4))) },
    webDir: path.resolve(e("WEB_DIR") || "web"),
  };
}

/** Sem APP_SECRET, gera um e guarda ao lado do banco (para o TOTP continuar legível após reinício). */
function persistentSecret(dbPath) {
  if (dbPath === ":memory:") return crypto.randomBytes(32).toString("hex");
  const file = path.join(path.dirname(path.resolve(dbPath)), ".app-secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const secret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}
