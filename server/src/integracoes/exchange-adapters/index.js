/**
 * Exchange Adapters: um por corretora, com interface comum. Só dados públicos
 * (sem credenciais, sem ordens).
 *
 * interface ExchangeAdapter {
 *   id: string; name: string;
 *   symbolFor(base, quote): string | null;          // null = par não suportado
 *   fetchOrderBook(base, quote, depth): Promise<{ bids: [preço, qtd][], asks: [preço, qtd][] }>
 * }
 */
import { fetchJson } from "../../shared/http-client.js";

const toLevels = levels => (levels ?? []).map(([p, q]) => [Number(p), Number(q)]).filter(([p, q]) => p > 0 && q > 0);
const sortBook = ({ bids, asks }) => ({ bids: bids.sort((a, b) => b[0] - a[0]), asks: asks.sort((a, b) => a[0] - b[0]) });

export function createBinanceAdapter({ fetchImpl } = {}) {
  const SUPPORTED = new Set(["ETHUSDT", "ETHUSDC", "USDCUSDT", "ETHBRL", "USDTBRL"]);
  return {
    id: "binance",
    name: "Binance",
    symbolFor: (base, quote) => (SUPPORTED.has(`${base}${quote}`) ? `${base}${quote}` : null),
    async fetchOrderBook(base, quote, depth = 100) {
      const symbol = this.symbolFor(base, quote);
      const body = await fetchJson(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${depth}`, { fetchImpl });
      return sortBook({ bids: toLevels(body.bids), asks: toLevels(body.asks) });
    },
  };
}

export function createKrakenAdapter({ fetchImpl } = {}) {
  const SUPPORTED = new Set(["ETHUSDT", "ETHUSDC", "USDCUSDT"]);
  return {
    id: "kraken",
    name: "Kraken",
    symbolFor: (base, quote) => (SUPPORTED.has(`${base}${quote}`) ? `${base}${quote}` : null),
    async fetchOrderBook(base, quote, depth = 100) {
      const pair = this.symbolFor(base, quote);
      const body = await fetchJson(`https://api.kraken.com/0/public/Depth?pair=${pair}&count=${depth}`, { fetchImpl });
      if (body.error?.length) throw new Error(`Kraken: ${body.error.join(", ")}`);
      const book = Object.values(body.result ?? {})[0];
      if (!book) throw new Error("Kraken: livro vazio");
      return sortBook({ bids: toLevels(book.bids), asks: toLevels(book.asks) });
    },
  };
}

/** Mercado Bitcoin: API v4 pública. Disponibilidade da API a confirmar (não é compromisso de escopo). */
export function createMercadoBitcoinAdapter({ fetchImpl } = {}) {
  const SUPPORTED = new Set(["ETH-BRL", "USDT-BRL", "USDC-BRL"]);
  return {
    id: "mercadobitcoin",
    name: "Mercado Bitcoin",
    symbolFor: (base, quote) => (SUPPORTED.has(`${base}-${quote}`) ? `${base}-${quote}` : null),
    async fetchOrderBook(base, quote, depth = 100) {
      const symbol = this.symbolFor(base, quote);
      const body = await fetchJson(`https://api.mercadobitcoin.net/api/v4/${symbol}/orderbook?limit=${depth}`, { fetchImpl });
      return sortBook({ bids: toLevels(body.bids), asks: toLevels(body.asks) });
    },
  };
}

export function createExchangeAdapters(options = {}) {
  const list = [createBinanceAdapter(options), createKrakenAdapter(options), createMercadoBitcoinAdapter(options)];
  return Object.fromEntries(list.map(a => [a.id, a]));
}

/** Pares coletados (diretos). Pares com BRL quando a corretora oferece. */
export const MARKET_PAIRS = [
  ["ETH", "USDT"], ["ETH", "USDC"], ["USDC", "USDT"], ["ETH", "BRL"], ["USDT", "BRL"], ["USDC", "BRL"],
];
