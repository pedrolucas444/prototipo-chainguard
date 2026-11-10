import { test } from "node:test";
import assert from "node:assert/strict";
import { createReputationClient } from "../server/src/integracoes/reputation-client.js";
import { createAlchemyClient } from "../server/src/integracoes/alchemy-client.js";
import { dedupKeyFor } from "../server/src/aplicacao/services/transaction-service.js";

const WALLET = "0x" + "1".repeat(40);
const config = { goplus: {}, etherscanApiKey: "", blockscoutUrl: "https://explorer.test" };

function fakeExplorer({ normal, tokens }) {
  return async url => {
    const action = new URL(url).searchParams.get("action");
    const result = action === "txlist" ? normal : tokens;
    return new Response(JSON.stringify(result.length ? { status: "1", result } : { status: "0", message: "No transactions found", result: [] }));
  };
}
const tx = block => ({ hash: `0x${block.toString(16).padStart(64, "0")}`, from: WALLET, to: "0x" + "2".repeat(40), value: "1", blockNumber: String(block), timeStamp: "1700000000", isError: "0" });

test("sincronização: não pula atividade quando uma das listas vem cheia", async () => {
  const normal = Array.from({ length: 100 }, (_, i) => tx(1000 + i)); // lista cheia: blocos 1000..1099
  const tokens = [{ ...tx(1500), tokenDecimal: "6", tokenSymbol: "USDT", contractAddress: "0x" + "3".repeat(40), logIndex: "4" }];
  const client = createReputationClient(config, { fetchImpl: fakeExplorer({ normal, tokens }) });
  const { activities, nextStartBlock } = await client.activitySince(WALLET, { startBlock: 1000, limit: 100 });
  assert.equal(activities.length, 101);
  assert.equal(nextStartBlock, 1099); // e não 1500: as normais entre 1100 e 1500 ainda não foram lidas
});

test("sincronização: sem lista cheia, avança até o maior bloco lido", async () => {
  const client = createReputationClient(config, { fetchImpl: fakeExplorer({ normal: [tx(10), tx(12)], tokens: [] }) });
  const { nextStartBlock } = await client.activitySince(WALLET, { startBlock: 5, limit: 100 });
  assert.equal(nextStartBlock, 12);
});

test("transferências internas da mesma transação não colidem na deduplicação", () => {
  const alchemy = createAlchemyClient({ alchemy: {}, rpcUrl: "http://rpc.test" });
  const base = { fromAddress: "0x" + "4".repeat(40), toAddress: WALLET, hash: "0x" + "5".repeat(64), asset: "ETH", category: "internal", blockNum: "0x1" };
  const { activities } = alchemy.normalizeWebhook({ type: "ADDRESS_ACTIVITY", event: { network: "ETH_MAINNET", activity: [
    { ...base, value: 1, typeTraceAddress: "call_0" },
    { ...base, value: 2, typeTraceAddress: "call_1" },
  ] } });
  assert.notEqual(dedupKeyFor(activities[0]), dedupKeyFor(activities[1]));
});

test("listas públicas: recusa URL que resolve para rede interna e redirecionamento para ela", async () => {
  const { assertPublicHttps, isPrivateIp, createListasPublicasClient } = await import("../server/src/integracoes/listas-publicas-client.js");
  assert.equal(isPrivateIp("10.1.2.3"), true);
  assert.equal(isPrivateIp("169.254.169.254"), true);
  assert.equal(isPrivateIp("::1"), true);
  assert.equal(isPrivateIp("140.82.112.3"), false);
  await assert.rejects(assertPublicHttps("http://example.com/x"), /HTTPS/);
  await assert.rejects(assertPublicHttps("https://interno.test/x", { lookup: async () => [{ address: "192.168.0.10" }] }), /rede interna/);

  const lookup = async host => [{ address: host === "lista.test" ? "140.82.112.3" : "127.0.0.1" }];
  const redirecting = async () => new Response(null, { status: 302, headers: { location: "https://localhost.test/segredo" } });
  await assert.rejects(createListasPublicasClient({ fetchImpl: redirecting, lookup }).fetchList("https://lista.test/a.json"), /rede interna/);

  const ok = async () => new Response(JSON.stringify(["0x" + "a".repeat(40)]));
  const list = await createListasPublicasClient({ fetchImpl: ok, lookup }).fetchList("https://lista.test/a.json");
  assert.equal(list.length, 1);
});

test("download com teto de tamanho", async () => {
  const { fetchText } = await import("../server/src/shared/http-client.js");
  const big = async () => new Response("x".repeat(2048));
  await assert.rejects(fetchText("https://x.test", { fetchImpl: big, maxBytes: 1024 }), /grande demais/);
});
