# ChainGuard

Protótipo navegável do TCC para monitoramento e análise de risco de carteiras e transações na rede Ethereum.

## Escopo desta versão

- dashboard com cotação de ETH via CoinGecko;
- cadastro local de carteiras públicas;
- análise explicável de risco de uma transação;
- whitelist de endereços confiáveis;
- alertas e histórico persistidos em `localStorage`;
- interface responsiva com dados de demonstração.

MetaMask, webhooks on-chain reais, backend persistente e comparação de preços entre corretoras estão sinalizados como próximas integrações e não são simulados como recursos prontos.

## Executar localmente

Sirva a pasta `dist` com qualquer servidor estático, por exemplo:

```bash
python3 -m http.server 4173 --directory dist
```

Abra `http://localhost:4173`.

