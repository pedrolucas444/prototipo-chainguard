import crypto from "node:crypto";
import { hashPassword } from "../shared/security.js";
import { DEFAULT_RISK_PARAMS } from "../motor-risco/index.js";

/**
 * Tabela de taxas inicial (v1). Valores de REFERÊNCIA para o protótipo, a revisar pelo Admin:
 * as corretoras mudam taxas com frequência e as APIs públicas não informam saque/rede.
 * taker em fração (0.001 = 0,1%); withdrawal em unidades do ativo.
 */
export const DEFAULT_FEE_TABLE = {
  exchanges: {
    binance: { taker: 0.001, withdrawal: { ETH: 0.0008, USDT: 3.2, USDC: 3.2, BRL: 0 } },
    kraken: { taker: 0.004, withdrawal: { ETH: 0.0025, USDT: 5, USDC: 5 } },
    mercadobitcoin: { taker: 0.007, withdrawal: { ETH: 0.002, USDT: 5, USDC: 5, BRL: 0 } },
  },
};

const EXCHANGES = [
  { id: "binance", name: "Binance" },
  { id: "kraken", name: "Kraken" },
  { id: "mercadobitcoin", name: "Mercado Bitcoin", note: "Disponibilidade da API pública a confirmar." },
];

const ASSETS = [
  { symbol: "ETH", name: "Ether", decimals: 18 },
  { symbol: "USDT", name: "Tether USD", decimals: 6, contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7" },
  { symbol: "USDC", name: "USD Coin", decimals: 6, contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
  { symbol: "BRL", name: "Real brasileiro", decimals: 2 },
];

const LIST_SOURCES = [
  { name: "ScamSniffer", url: "https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/address.json", category: "phishing" },
  { name: "OFAC (sancionados)", url: "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_ETH.json", category: "sanctioned" },
];

/** Idempotente: só cria o que ainda não existe. */
export function seed(repos, config, logger = console) {
  for (const e of EXCHANGES) repos.catalog.upsertExchange(e);
  for (const a of ASSETS) repos.catalog.upsertAsset(a);
  if (!repos.settings.has("risk_params")) repos.settings.set("risk_params", DEFAULT_RISK_PARAMS);
  if (!repos.feeTables.active() && !repos.feeTables.list().length) repos.feeTables.createVersion({ data: DEFAULT_FEE_TABLE, note: "Tabela inicial de referência" });
  if (!repos.listSources.list().length) for (const s of LIST_SOURCES) repos.listSources.create(s);

  if (repos.users.countAdmins() === 0 && !repos.users.findByEmail(config.admin.email)) {
    const password = config.admin.password || crypto.randomBytes(9).toString("base64url");
    repos.users.create({ email: config.admin.email, name: "Administrador", passwordHash: hashPassword(password), role: "admin" });
    if (!config.admin.password) {
      logger.info?.(`\n[seed] Conta de administrador criada:\n        e-mail: ${config.admin.email}\n        senha:  ${password}\n       (defina ADMIN_PASSWORD no .env para escolher a senha)\n`);
    }
  }
}
