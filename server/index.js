import { loadConfig } from "./src/aplicacao/config/env.js";
import { createApp } from "./src/app.js";

// Rede de segurança: um erro inesperado é registrado, mas não derruba o processo.
process.on("unhandledRejection", error => console.error("[processo] promessa rejeitada sem tratamento:", error));

const config = loadConfig();
const app = createApp(config);
const address = await app.start();

const host = address.address === "::" || address.address === "0.0.0.0" ? "localhost" : address.address;
console.log(`\nChainGuard rodando em http://${host}:${address.port}`);
console.log(`  monitoramento: ${app.integrations.alchemy.webhookEnabled ? "webhook do Alchemy" : "Job de sincronização on-chain (sem webhook configurado)"}`);
console.log(`  explorer:      ${app.integrations.reputation.explorerName}`);
console.log(`  jobs:          ${config.jobs.enabled ? "ligados" : "desligados"}\n`);
const local = ["127.0.0.1", "localhost", "::1"].includes(config.host);
if (!local && !config.cookieSecure) console.warn("⚠ Servidor acessível pela rede sem COOKIE_SECURE=true: em produção, sirva por HTTPS e ligue COOKIE_SECURE.");
if (!local && !config.trustProxyHops) console.warn("⚠ Se houver proxy reverso na frente (Render, Railway, Nginx…), defina TRUST_PROXY=1 para o limitador ver o IP real.");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    console.log("\nEncerrando…");
    await app.stop();
    process.exit(0);
  });
}
