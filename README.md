# ChainGuard

Sistema web **não custodial** para monitorar carteiras **Ethereum (Mainnet)**, classificar o risco de cada transação com explicação dos fatores, manter uma whitelist, enviar fundos com verificação do destino (a assinatura é feita na carteira do usuário) e comparar cotações entre corretoras de forma **informativa**.

> O protótipo estático anterior continua em `dist/`, sem alterações. O sistema completo é `server/` (API) + `web/` (SPA).

## Executar

Requisito: **Node.js 22.13+** (testado no 24). O projeto não tem dependências externas: usa `node:http`, `node:sqlite` e `node:crypto`.

```bash
cp .env.example .env      # opcional: todas as chaves são opcionais
npm start                 # http://127.0.0.1:3000
npm test                  # 56 testes (motor de risco, comparador, API, webhook, fila, reorg, segurança…)
```

Na primeira execução é criada a conta de **administrador** (`ADMIN_EMAIL` / `ADMIN_PASSWORD`). Se a senha não estiver definida, uma senha aleatória aparece no console.

### Demonstrar o fluxo central (webhook → fila → Motor de Risco)

O Alchemy real precisa de uma URL pública. Para apresentar localmente, o script abaixo envia payloads `ADDRESS_ACTIVITY` com a **mesma assinatura HMAC** do Alchemy:

```bash
# no .env: ALCHEMY_SIGNING_KEY=qualquer-segredo   (o mesmo valor para o servidor e o script)
npm start
# cadastre uma carteira no app e depois:
npm run demo:webhook -- --wallet 0xSUA_CARTEIRA
```

Cenários enviados:
- recebimento normal;
- envio a um contato;
- **address poisoning** (0 USDT vindo de um endereço com o mesmo início e fim do contato);
- recebimento de endereço **sancionado**;
- **reenvio** do mesmo evento (descartado como duplicata);
- **reorg** (evento marcado como removido).

### Chaves recomendadas

| Variável | Para quê | Sem ela |
|---|---|---|
| `ALCHEMY_AUTH_TOKEN`, `ALCHEMY_WEBHOOK_ID`, `ALCHEMY_SIGNING_KEY` | Monitoramento por webhook (Address Activity) | Um Job consulta a atividade das carteiras a cada 60 s e entrega ao **mesmo** fluxo |
| `ALCHEMY_API_KEY` ou `ETH_RPC_URL` | RPC (conferência on-chain, saldos, recibos) | Usa o RPC público PublicNode |
| `ETHERSCAN_API_KEY` | Idade/histórico das contas (plano gratuito) | Usa o Blockscout anônimo, que tem limite baixo de requisições |
| `GOPLUS_ACCESS_TOKEN` | Limite maior no GoPlus | Usa a cota pública |
| `WALLETCONNECT_PROJECT_ID` | Botão WalletConnect no envio | Apenas MetaMask (carteira injetada) |

### Produção (antes de publicar)

O sistema precisa de um host que rode **Node.js continuamente** (Jobs e fila) e de **disco persistente** para o SQLite (ex.: Railway, Render com disco, Fly.io, uma VPS). Não funciona em hospedagem só estática nem em funções serverless.

| Variável | Valor em produção |
|---|---|
| `NODE_ENV` | `production` (liga o cookie `Secure` por padrão) |
| `HOST` | `0.0.0.0` |
| `TRUST_PROXY` | `1` quando houver proxy reverso na frente (o limitador de tentativas passa a ver o IP real do usuário) |
| `APP_SECRET` | fixo (`openssl rand -hex 32`); se mudar, o 2FA já configurado deixa de funcionar |
| `ADMIN_PASSWORD` | senha forte |
| `DB_PATH` | caminho dentro do disco persistente; faça backup periódico desse arquivo |
| `QUEUE_CONCURRENCY` | análises em paralelo na fila (padrão 4) |

## O que o sistema faz (casos de uso)

| Ator | Caso de uso | Onde |
|---|---|---|
| Usuário | Cadastrar conta, fazer login, **validar 2FA** (TOTP), configurar 2FA, recuperar senha, encerrar sessão, excluir conta | `auth-service.js`, telas de acesso e **Minha conta** |
| Titular | Gerenciar carteiras (validar formato e checksum EIP-55, conferir on-chain, pausar, remover) | **Carteiras** |
| Titular | Visualizar transações e risco, com filtro por nível, período, endereço e carteira, e **detalhes** da transação | **Transações** |
| Titular | Visualizar alertas (risco médio/alto), marcar como vistos e receber notificação em tempo real | **Alertas** + sino |
| Titular | Analisar risco do destino | **Analisar destino** |
| Titular | Enviar fundos: verificar o destino, **confirmar envio de alto risco**, **assinar via carteira externa** e acompanhar o status na rede | Botão **Enviar** (Send Modal) e **Envios** |
| Titular | Gerenciar whitelist | **Whitelist** |
| Titular | Comparar preços das corretoras, simular troca e ver o histórico de simulações | **Painel de preços**, **Simulador** |
| Admin | Gerenciar usuários (bloquear, promover, remover) | **Administração → Usuários** |
| Admin | Gerenciar a base de endereços maliciosos e **importar listas públicas** | **Administração → Endereços maliciosos** |
| Admin | Configurar o Motor de Risco (pesos, limiares, parâmetros das regras) | **Administração → Motor de risco** |
| Admin | Configurar corretoras, ativos e taxas (tabela versionada) | **Administração → Corretoras e taxas** |
| Admin | Visualizar o log de alterações e reprocessar a fila de mensagens mortas | **Administração → Log / Fila** |

## Arquitetura: código × diagramas

```
server/src/
├─ aplicacao/
│  ├─ config/        Config: variáveis de ambiente, regras de acesso por rota e perfil, limites de requisição
│  ├─ controllers/   Controllers: REST + webhook do Alchemy (confere o HMAC, sem regra de negócio)
│  ├─ events/        Events: mensagens.js · publisher.js · consumer.js (com fila de mensagens mortas)
│  ├─ jobs/          Jobs: coleta de cotações (30 s), listas públicas (6 h), sincronização on-chain, manutenção
│  ├─ services/      Services: auth, carteiras, transações, risco, whitelist, envio, cotações, admin
│  └─ http/          servidor HTTP, roteador, arquivos estáticos do SPA, CSP e headers de segurança
├─ motor-risco/      Motor de Risco (biblioteca pura): rules/* + score-aggregator.js
├─ comparador-cotacoes/  Comparador (biblioteca pura): orderbook-walker · fee-model · ranking (+ sugestão de split)
├─ integracoes/      Integrações: alchemy-client · reputation-client · listas-publicas-client · exchange-adapters/
└─ dados/            Dados: schema.sql (Entities) · repositories/ · seed.js

web/                 Web App (SPA)
├─ ui/pages/         UI → Pages
├─ ui/components/    UI → Componentes (Send Modal, detalhes da transação, toasts, modais)
└─ services/         Services → api-client.js (REST) · wallet-connector.js (EIP-1193: MetaMask/WalletConnect)
```

- **Três entradas, uma lógica.** Controllers, Jobs e Consumer chamam os mesmos Services (`server/src/app.js` é a raiz de composição).
- **Motores puros.** `motor-risco/` e `comparador-cotacoes/` não importam banco nem rede e são testados isoladamente.
- **Fila persistente.** A tabela `queue_messages` do SQLite faz o papel do broker: tem retentativas com espera exponencial, a fila de mensagens mortas (`status = 'dead'`) e o reprocessamento pelo Admin. Trocar por RabbitMQ/SQS mexe apenas em `publisher.js`, `consumer.js` e no repositório da fila.
- **Entrega "pelo menos uma vez".** O webhook descarta duplicatas pela chave `(carteira, hash, tipo, logIndex/trace/ativo, origem, destino)`. A gravação da transação e a publicação da mensagem acontecem na mesma transação SQL, então uma queda no meio não perde o evento.
- **Reorg.** `removed: true` marca a transação como removida (some das listagens e contagens). Se ela for minerada de novo, volta para análise. Um reorg que chega durante a análise não é sobrescrito pelo resultado.
- **Meta de 60 s.** O Consumer analisa até `QUEUE_CONCURRENCY` mensagens em paralelo. Nos testes locais cada transação foi classificada em cerca de 1 s após o webhook.
- **Sincronização sem webhook.** O Job lê a atividade em ordem crescente de bloco e só avança até onde leu por completo, então picos de mais de 100 transferências entre dois ciclos não ficam para trás.

## Decisões tomadas para os pontos em aberto do documento

| # | Ponto | Decisão implementada |
|---|---|---|
| 1 | Recuperação de senha e entrega do 2FA | Sem e-mail: o **2FA é TOTP** (app autenticador; o segredo fica cifrado com AES-GCM no banco). A **recuperação** usa **códigos de uso único** mostrados no cadastro, que podem ser regenerados. Um código de recuperação também substitui o TOTP no login. |
| 2 | Fonte de reputação fora do ar | A análise segue com os demais fatores e a tela mostra uma observação de que o fator ficou de fora. O mesmo vale para os dados de idade da conta. |
| 3 | Entidade de endereços maliciosos | Criadas as entidades `malicious_addresses` e `list_sources`. |
| 4 | Rótulos do Etherscan (pago) | Não são usados. O Etherscan (gratuito) ou o Blockscout fornecem só a idade e o histórico da conta. |
| 5 | Mercado Bitcoin | O adapter usa a API pública v4. Durante o desenvolvimento ela respondeu **HTTP 521**: a falha fica isolada e as outras corretoras seguem normalmente. |
| 6 | Status do envio | O status vem **da rede** (recibo via RPC), consultado periodicamente pela tela. |
| 7 | Pilha (diagrama de implantação) | Um processo Node.js (API + SPA estático + Consumer + Jobs) e SQLite em modo WAL. Não roda em hospedagem só estática. |
| 8 | Intervalo do Job de cotações | 30 s (`QUOTES_INTERVAL_MS`, limitado a menos de 60 s). Dados com mais de 60 s aparecem destacados. |
| 9 | Pesos iniciais | Em `server/src/motor-risco/defaults.js`: lista negra 80, reputação 65, similaridade 55, approvals 45, dust 20, idade 15. Limiares: médio a partir de 30, alto a partir de 60. A validar com o cliente. |
| 10 | Limites das APIs | Cache do GoPlus (10 min) e dos dados de conta (30 min), Job com carga constante e limitador de requisições por IP nas rotas sensíveis. |
| 11 | Defasagem das cotações | Rotas com dado de mais de 1 min, rotas incompletas e corretoras sem taxas cadastradas ficam depois das demais no ranking e não entram na "melhor estimativa", nos destaques do painel nem na sugestão de divisão. |

Outras decisões de escopo:
- **Whitelist** dispensa a análise inteira da transação cuja contraparte é confiável (como o documento descreve), inclusive fatores como token ou approval. Colocar a própria carteira na whitelist não desliga a análise dela.
- **Corretoras e ativos**: o Admin liga/desliga e mantém as taxas. Incluir uma corretora nova exige um adapter no código (`integracoes/exchange-adapters/`), por isso não há cadastro livre pela tela.
- **Conferência on-chain no cadastro da carteira**: se o RPC estiver fora do ar, a carteira é cadastrada com aviso e a conferência fica pendente.
- **Envio**: o nível de risco gravado no registro do envio é recalculado no servidor. A confirmação de alto risco acontece antes da assinatura, no navegador. Um envio sem recibo após 1 h e fora do mempool aparece como "não encontrado na rede" (provavelmente substituído ou descartado).

## Segurança

- **Chaves:** a chave privada nunca entra no sistema. O envio é assinado pela carteira via EIP-1193.
- **Webhook:** a assinatura HMAC-SHA256 é conferida, com comparação em tempo constante, antes de qualquer processamento.
- **Senhas:** guardadas com scrypt (verificação assíncrona, sem travar o servidor).
- **Tentativas:** limite por IP (IPv6 agrupado por /64) nas rotas de login e nas que conferem a senha, e bloqueio de 15 min por conta após 10 falhas (senha, 2FA ou código de recuperação). Um código TOTP não é aceito duas vezes.
- **Listas públicas:** só HTTPS, destinos (inclusive redirecionamentos) precisam resolver para IP público, download limitado a 20 MB e importação em lotes.
- **Robustez:** URL malformada responde 400; erros inesperados são registrados sem derrubar o processo.
- **Sessão:** cookie `HttpOnly` e `SameSite=Strict`, e a sessão é guardada apenas como hash no banco.
- **CSRF:** o header `X-Requested-With` é obrigatório em toda chamada que altera estado.
- **Navegador:** CSP restritiva e `frame-ancestors 'none'`.
- **Acesso:** perfis Admin e Customer conferidos pela Config, e cada usuário só acessa os próprios dados (todas as consultas filtram por `user_id`).
- **Administração:** toda alteração do Admin gera uma linha no log (quem, o quê, quando).
- **Honestidade:** o risco é sempre apresentado como **estimativa** e as cotações como **informativas** (sem ordens, sem custódia, sem cotação firme).
