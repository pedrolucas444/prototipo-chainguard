# ChainGuard

Protótipo navegável do TCC para monitoramento e análise de risco de carteiras e transações na rede Ethereum.

## Escopo desta versão

- dashboard com cotação de ETH via CoinGecko;
- cadastro de carteiras públicas com saldo real via Ethereum JSON-RPC;
- histórico recente de movimentações via Blockscout;
- análise explicável de risco baseada em reputação, histórico on-chain, tipo do endereço, whitelist e exposição financeira;
- whitelist de endereços confiáveis;
- monitoramento por polling e geração de alertas enquanto o app permanece aberto;
- estado do protótipo persistido em `localStorage`;
- interface responsiva com dados de demonstração.

MetaMask, webhooks 24/7, backend persistente e comparação de preços entre corretoras estão sinalizados como próximas integrações e não são simulados como recursos prontos.

## Fontes externas

- Ethereum PublicNode: saldo on-chain (`eth_getBalance`);
- Blockscout: perfil público, reputação e movimentações recentes;
- CoinGecko: cotação de ETH em BRL.

Nenhuma dessas integrações exige chave secreta no navegador. O score é um mecanismo de apoio à decisão, não uma garantia contra fraude.

## Executar localmente

Sirva a pasta `dist` com qualquer servidor estático, por exemplo:

```bash
python3 -m http.server 4173 --directory dist
```

Abra `http://localhost:4173`.

