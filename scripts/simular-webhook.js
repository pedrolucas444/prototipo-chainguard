#!/usr/bin/env node
/**
 * Simula o Alchemy chamando o webhook do ChainGuard com payloads "ADDRESS_ACTIVITY"
 * assinados por HMAC (mesmo formato e mesma assinatura do Alchemy real).
 * Útil para demonstrar o fluxo central sem expor o servidor na internet.
 *
 * Uso:
 *   node scripts/simular-webhook.js --wallet 0xSUA_CARTEIRA_MONITORADA [--url http://127.0.0.1:3000] [--cenario todos]
 *
 * Requer ALCHEMY_SIGNING_KEY igual no servidor e aqui (lido do .env, se existir).
 * Cenários: normal | poisoning | golpe | reenvio | reorg | todos
 */
import crypto from "node:crypto";
import fs from "node:fs";

if (fs.existsSync(".env")) process.loadEnvFile(".env");
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith("--") ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []));
const url = (args.url ?? `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, "");
const wallet = args.wallet?.toLowerCase();
const key = process.env.ALCHEMY_SIGNING_KEY;
const scenario = args.cenario ?? "todos";

if (!wallet || !/^0x[0-9a-f]{40}$/.test(wallet)) { console.error("Informe --wallet 0x… (uma carteira já cadastrada e monitorada no ChainGuard)."); process.exit(1); }
if (!key) { console.error("Defina ALCHEMY_SIGNING_KEY no .env (o mesmo valor usado pelo servidor)."); process.exit(1); }

const randomHash = () => `0x${crypto.randomBytes(32).toString("hex")}`;
const randomAddress = () => `0x${crypto.randomBytes(20).toString("hex")}`;
// "Contato" para quem a carteira já enviou fundos, e um endereço quase igual a ele (address poisoning).
const contact = `0x${"a1b2"}${crypto.randomBytes(16).toString("hex")}${"c3d4"}`;
const lookalike = `0x${"a1b2"}${crypto.randomBytes(16).toString("hex")}${"c3d4"}`;
const SANCTIONED = "0x098b716b8aaf21512996dc57eb0615e2383e2f96"; // Ronin Bridge exploiter (OFAC)
const EXCHANGE = "0x28c6c06298d514db089934071355e5743bf21d60";   // Binance hot wallet
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";

const eth = (from, to, value) => ({ fromAddress: from, toAddress: to, blockNum: "0x1700000", hash: randomHash(), value, asset: "ETH", category: "external", rawContract: { rawValue: `0x${BigInt(Math.round(value * 1e18)).toString(16)}`, decimals: 18 } });
const token = (from, to, value, symbol, contract) => ({ fromAddress: from, toAddress: to, blockNum: "0x1700001", hash: randomHash(), value, asset: symbol, category: "token", rawContract: { rawValue: "0x0", address: contract, decimals: 6 }, log: { logIndex: "0x1", removed: false } });

async function deliver(label, activity) {
  const payload = JSON.stringify({ webhookId: "wh_simulado", id: `whevt_${crypto.randomBytes(8).toString("hex")}`, createdAt: new Date().toISOString(), type: "ADDRESS_ACTIVITY", event: { network: "ETH_MAINNET", activity } });
  const signature = crypto.createHmac("sha256", key).update(payload).digest("hex");
  const response = await fetch(`${url}/webhooks/alchemy`, { method: "POST", headers: { "content-type": "application/json", "x-alchemy-signature": signature }, body: payload });
  const body = await response.json().catch(() => ({}));
  console.log(`${response.ok ? "✔" : "✘"} ${label.padEnd(44)} → HTTP ${response.status} ${JSON.stringify(body)}`);
  return payload;
}

const run = name => scenario === "todos" || scenario === name;
console.log(`Enviando webhooks assinados para ${url}/webhooks/alchemy (carteira ${wallet})\n`);

if (run("normal")) {
  await deliver("Recebimento de 0,5 ETH de uma exchange", [eth(EXCHANGE, wallet, 0.5)]);
  await deliver("Envio de 0,2 ETH para um contato", [eth(wallet, contact, 0.2)]);
}
if (run("poisoning")) {
  if (!run("normal")) await deliver("Envio de 0,2 ETH para um contato", [eth(wallet, contact, 0.2)]);
  await new Promise(r => setTimeout(r, 1500)); // garante que o envio ao contato foi processado antes
  await deliver("Address poisoning: 0 USDT de endereço parecido", [token(lookalike, wallet, 0, "USDT", USDT)]);
}
if (run("golpe")) await deliver("Recebimento de endereço sancionado (OFAC)", [eth(SANCTIONED, wallet, 0.01)]);
if (run("reenvio")) {
  const activity = [eth(EXCHANGE, wallet, 1.25)];
  await deliver("Recebimento de 1,25 ETH", activity);
  await deliver("Reenvio do MESMO evento (deve ser duplicata)", activity);
}
if (run("reorg")) {
  const activity = eth(EXCHANGE, wallet, 3);
  await deliver("Recebimento de 3 ETH", [activity]);
  await deliver("Mesmo evento marcado como removido (reorg)", [{ ...activity, removed: true }]);
}
console.log("\nAbra o ChainGuard: em poucos segundos o Consumer analisa e a tela de Transações mostra o risco e os fatores.");
