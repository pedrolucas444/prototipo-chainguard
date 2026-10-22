const STORAGE_KEY = "chainguard-tcc-v1";

const icons = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 7.5h14.5A1.5 1.5 0 0 1 20 9v9a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h12v4.5"/><path d="M15 12h6v5h-6a2.5 2.5 0 0 1 0-5Z"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="3"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM14 21h-4"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M12 3 4.5 6v5.8c0 4.9 3.1 8 7.5 9.7 4.4-1.7 7.5-4.8 7.5-9.7V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  arrowIn: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M12 4v14M6 12l6 6 6-6"/></svg>',
  arrowOut: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M12 20V6M6 12l6-6 6 6"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M10.3 4.2 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 7h16M9 3h6l1 4H8l1-4ZM6 7l1 14h10l1-14M10 11v6M14 11v6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  ethereum: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="m12 2-6 10 6 3.5 6-3.5-6-10Z"/><path d="m6 13 6 9 6-9-6 3.5L6 13Z"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg>',
};

const seedState = {
  theme: "dark",
  wallets: [
    { id: "w1", label: "Carteira principal", address: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", balance: 2.483, score: 14, status: "low", last: "há 2 min" },
    { id: "w2", label: "Operações", address: "0x53d284357ec70cE289D6D64134DfAc8E511c8a3D", balance: 0.817, score: 39, status: "medium", last: "há 18 min" },
    { id: "w3", label: "Tesouraria do TCC", address: "0x281055afc982d96fAaaBdc3a82aC21Afb9C1721a", balance: 5.102, score: 8, status: "low", last: "há 1 h" },
  ],
  whitelist: [
    { id: "t1", label: "Tesouraria do cliente", address: "0x281055afc982d96fAaaBdc3a82aC21Afb9C1721a", created: "18 out 2026" },
    { id: "t2", label: "Carteira de testes", address: "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe", created: "20 out 2026" },
  ],
  alerts: [
    { id: "a1", unread: true, title: "Interação com contrato recém-criado", detail: "A carteira Operações recebeu 0,42 ETH de um endereço com pouco histórico on-chain.", address: "0x9a8d…0f21", time: "há 12 min", severity: "high" },
    { id: "a2", unread: true, title: "Frequência atípica de transações", detail: "Cinco movimentações foram detectadas em um intervalo de oito minutos.", address: "0x53d2…8a3D", time: "há 26 min", severity: "medium" },
    { id: "a3", unread: false, title: "Recebimento verificado", detail: "Transação recebida de um endereço presente na whitelist.", address: "0x2810…721a", time: "há 2 h", severity: "low" },
  ],
  history: [
    { id: "h1", type: "Recebimento", hash: "0x806f67c23cda18d852e40ecf97d219ca3dfff385f27436b647f90b6a7bc8bf1a", wallet: "Carteira principal", amount: "+0,185 ETH", score: 12, date: "Hoje, 08:31" },
    { id: "h2", type: "Análise manual", hash: "0x5ca1ab1e3f8bf72ae018d550c76446a21200885295a1d45c41b1dd0d2a99375f", wallet: "Operações", amount: "0,420 ETH", score: 67, date: "Hoje, 08:04" },
    { id: "h3", type: "Envio", hash: "0x90e9ad3da828e5e2f3a6f342e0bd9d1f5dd69c4db35fc56300c29fef6b29e381", wallet: "Tesouraria do TCC", amount: "−0,064 ETH", score: 8, date: "Ontem, 19:42" },
    { id: "h4", type: "Recebimento", hash: "0x262ca618863fcf628d201f26e274db81df4ad8233447ce4adeb2aac3bbc8b755", wallet: "Operações", amount: "+0,210 ETH", score: 43, date: "Ontem, 16:18" },
  ],
  price: null,
  priceChange: null,
  priceUpdated: null,
};

let state = loadState();
let route = getRoute();
let filters = { query: "", risk: "all", history: "all" };

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...structuredClone(seedState), ...saved, price: null, priceUpdated: null } : structuredClone(seedState);
  } catch { return structuredClone(seedState); }
}
function saveState() {
  const { price, priceUpdated, ...persistent } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistent));
  updateBadges();
}
function e(value = "") { return String(value).replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c])); }
function isAddress(value) { return /^0x[a-fA-F0-9]{40}$/.test(value.trim()); }
function isTxHash(value) { return /^0x[a-fA-F0-9]{64}$/.test(value.trim()); }
function shortAddress(value) { return `${value.slice(0, 7)}…${value.slice(-5)}`; }
function getRoute() { const value = location.hash.replace("#", ""); return ["dashboard","monitoramento","analisar","alertas","whitelist","historico","configuracoes"].includes(value) ? value : "dashboard"; }
function riskMeta(score) { return score >= 65 ? { key: "high", label: "Alto risco", tone: "var(--red)", text: "Recomendamos não prosseguir sem uma verificação adicional." } : score >= 30 ? { key: "medium", label: "Atenção", tone: "var(--amber)", text: "Há sinais que merecem revisão antes de prosseguir." } : { key: "low", label: "Baixo risco", tone: "var(--green)", text: "Nenhum indício crítico foi encontrado nesta análise." }; }
function formatBRL(value) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(value); }
function icon(name) { return `<span data-icon="${name}">${icons[name] || ""}</span>`; }
function hydrateIcons(root = document) { root.querySelectorAll("[data-icon]").forEach(node => { const name = node.dataset.icon; if (!node.innerHTML.trim() && icons[name]) node.innerHTML = icons[name]; }); }

const pageNames = { dashboard: "Dashboard", monitoramento: "Carteiras monitoradas", analisar: "Análise de risco", alertas: "Central de alertas", whitelist: "Whitelist", historico: "Histórico", configuracoes: "Configurações" };

function pageHeading(eyebrow, title, copy, actions = "") {
  return `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${copy}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ""}</div>`;
}
function statusBadge(score) { const m = riskMeta(score); return `<span class="status ${m.key}">${m.label}</span>`; }
function emptyState(iconName, title, copy, action = "") { return `<div class="empty-state"><div class="empty-icon">${icon(iconName)}</div><h3>${title}</h3><p>${copy}</p>${action}</div>`; }

function renderDashboard() {
  const avg = Math.round(state.wallets.reduce((n, w) => n + w.score, 0) / Math.max(state.wallets.length, 1));
  const unread = state.alerts.filter(a => a.unread).length;
  const recent = state.history.slice(0, 4);
  return `${pageHeading("Visão geral", "Olá, equipe ChainGuard.", "Acompanhe os sinais de segurança das suas carteiras públicas Ethereum em um só lugar.", `<button class="btn ghost" data-go="analisar">${icon("scan")} Analisar transação</button><button class="btn primary" data-open="wallet">${icon("plus")} Adicionar carteira</button>`)}
    <div class="scope-banner">${icon("info")}<div><strong>Protótipo acadêmico em modo demonstrativo.</strong> Os scores atuais usam regras locais explicáveis. A arquitetura já separa a interface das futuras fontes on-chain, webhooks e motor analítico.</div></div>
    <section class="grid cols-4" aria-label="Indicadores">
      ${metricCard("wallet", "Carteiras monitoradas", state.wallets.length, `<span class="good">●</span> todas verificadas`, "var(--purple)")}
      ${metricCard("activity", "Risco médio", `${avg}/100`, avg < 30 ? `<span class="good">−6%</span> nesta semana` : `<span class="bad">requer atenção</span>`, riskMeta(avg).tone)}
      ${metricCard("bell", "Alertas pendentes", unread, unread ? `<span class="bad">${unread} para revisar</span>` : `<span class="good">Tudo certo</span>`, "var(--red)")}
      ${priceMetric()}
    </section>
    <section class="grid main-grid" style="margin-top:16px">
      <div class="stack">
        <div class="card"><div class="card-header"><div><h2>Carteiras monitoradas</h2><p>Visão consolidada de risco e atividade</p></div><button class="text-link" data-go="monitoramento">Ver todas →</button></div>${walletTable(state.wallets.slice(0,4))}</div>
        <div class="card"><div class="card-header"><div><h2>Atividade recente</h2><p>Análises e movimentações detectadas</p></div><button class="text-link" data-go="historico">Ver histórico →</button></div>${historyTable(recent, false)}</div>
      </div>
      <div class="stack">
        <div class="card risk-overview"><div class="risk-title"><h2>Postura de segurança</h2>${statusBadge(avg)}</div><div class="gauge-row"><div class="gauge" style="--score:${avg};--tone:${riskMeta(avg).tone}"><div><strong>${avg}</strong><small>de 100</small></div></div><div class="risk-copy"><h3>${avg < 30 ? "Ambiente estável" : "Revisão recomendada"}</h3><p>Score médio calculado a partir das carteiras atualmente monitoradas.</p></div></div><div class="legend"><span><i style="background:var(--green)"></i>0–29 baixo</span><span><i style="background:var(--amber)"></i>30–64 atenção</span><span><i style="background:var(--red)"></i>65–100 alto</span></div></div>
        <div class="card"><div class="card-header"><div><h2>Últimos sinais</h2><p>Eventos que alimentam o score</p></div></div><div class="feed">${state.alerts.slice(0,3).map((a, i) => `<div class="feed-item"><span class="feed-icon ${a.severity === "high" ? "warn" : i === 2 ? "in" : "out"}">${icon(a.severity === "high" ? "warning" : i === 2 ? "arrowIn" : "activity")}</span><span class="feed-copy"><strong>${e(a.title)}</strong><small>${e(a.address)}</small></span><span class="feed-value">${a.severity === "high" ? "+32 risco" : a.severity === "medium" ? "+14 risco" : "verificado"}<small>${e(a.time)}</small></span></div>`).join("")}</div></div>
      </div>
    </section>`;
}

function metricCard(iconName, label, value, foot, tone) {
  return `<article class="card metric" style="--tone:${tone};--glow:color-mix(in srgb, ${tone} 12%, transparent)"><div class="metric-head"><span>${label}</span><span class="metric-icon">${icon(iconName)}</span></div><div class="metric-value">${value}</div><div class="metric-foot">${foot}</div></article>`;
}
function priceMetric() {
  if (!state.price) return `<article class="card metric price"><div class="metric-head"><span>Ethereum agora</span><span class="metric-icon" style="--tone:var(--blue)">${icon("ethereum")}</span></div><div class="metric-value skeleton" style="width:130px">R$ 00.000,00</div><div class="metric-foot">Consultando CoinGecko…</div></article>`;
  const sign = state.priceChange >= 0 ? "+" : "";
  return `<article class="card metric price" style="--tone:var(--blue)"><div class="metric-head"><span>Ethereum agora</span><span class="api-state">COINGECKO</span></div><div class="metric-value">${formatBRL(state.price)}</div><div class="metric-foot"><span class="${state.priceChange >= 0 ? "good" : "bad"}">${sign}${state.priceChange.toFixed(2)}%</span> em 24h · 1 ETH</div></article>`;
}

function walletTable(wallets) {
  if (!wallets.length) return emptyState("wallet", "Nenhuma carteira encontrada", "Adicione um endereço público Ethereum para iniciar o monitoramento.", `<button class="btn primary" data-open="wallet">${icon("plus")} Adicionar carteira</button>`);
  return `<div class="table-wrap"><table><thead><tr><th>Carteira</th><th>Saldo</th><th>Risco</th><th>Última verificação</th><th></th></tr></thead><tbody>${wallets.map(w => `<tr><td><div class="identity"><span class="identity-icon">${icon("ethereum")}</span><span><strong>${e(w.label)}</strong><small>${shortAddress(w.address)}</small></span></div></td><td><strong>${Number(w.balance).toFixed(3)} ETH</strong></td><td><div class="score-cell">${statusBadge(w.score)}<span class="score-bar"><i style="width:${w.score}%;--tone:${riskMeta(w.score).tone}"></i></span><b>${w.score}</b></div></td><td>${e(w.last)}</td><td><div class="row-actions"><button class="mini-button" data-copy="${e(w.address)}" aria-label="Copiar endereço">${icon("copy")}</button><button class="mini-button" data-analyze-address="${e(w.address)}" aria-label="Analisar carteira">${icon("scan")}</button><button class="mini-button danger" data-delete-wallet="${w.id}" aria-label="Remover carteira">${icon("trash")}</button></div></td></tr>`).join("")}</tbody></table></div>`;
}
function historyTable(items, actions = true) {
  if (!items.length) return emptyState("history", "Nenhum registro", "As análises e movimentações aparecerão aqui.");
  return `<div class="table-wrap"><table><thead><tr><th>Evento</th><th>Identificador</th><th>Valor</th><th>Score</th><th>Data</th>${actions ? "<th></th>" : ""}</tr></thead><tbody>${items.map(h => `<tr><td><div class="identity"><span class="identity-icon">${icon(h.type === "Recebimento" ? "arrowIn" : h.type === "Envio" ? "arrowOut" : "scan")}</span><span><strong>${e(h.type)}</strong><small>${e(h.wallet)}</small></span></div></td><td class="mono">${shortAddress(h.hash)}</td><td><strong>${e(h.amount)}</strong></td><td>${statusBadge(h.score)} <b style="margin-left:5px">${h.score}</b></td><td>${e(h.date)}</td>${actions ? `<td><button class="mini-button" data-copy="${e(h.hash)}" aria-label="Copiar hash">${icon("copy")}</button></td>` : ""}</tr>`).join("")}</tbody></table></div>`;
}

function renderMonitoring() {
  const filtered = state.wallets.filter(w => (w.label + w.address).toLowerCase().includes(filters.query.toLowerCase()) && (filters.risk === "all" || w.status === filters.risk));
  return `${pageHeading("Monitoramento on-chain", "Carteiras Ethereum", "Cadastre endereços públicos para centralizar sinais de atividade e risco. Nenhuma chave privada é necessária.", `<button class="btn primary" data-open="wallet">${icon("plus")} Adicionar carteira</button>`)}
    <div class="card"><div class="toolbar"><div class="search">${icon("search")}<input id="wallet-search" value="${e(filters.query)}" placeholder="Buscar nome ou endereço…" /></div><select id="risk-filter"><option value="all">Todos os riscos</option><option value="low" ${filters.risk === "low" ? "selected" : ""}>Baixo risco</option><option value="medium" ${filters.risk === "medium" ? "selected" : ""}>Atenção</option><option value="high" ${filters.risk === "high" ? "selected" : ""}>Alto risco</option></select></div>${walletTable(filtered)}</div>`;
}

function renderAnalyze() {
  return `${pageHeading("Motor explicável", "Analisar risco", "Simule a avaliação de uma transação Ethereum e veja quais sinais contribuíram para o resultado.")}
    <div class="analyze-layout">
      <form class="card form-card" id="analysis-form">
        <h2>Dados da transação</h2><p>Use o hash de uma transação ou preencha os dados básicos para uma análise preventiva.</p>
        <div class="form-grid">
          <label class="wide">Hash da transação <input name="hash" spellcheck="false" autocomplete="off" placeholder="0x… (opcional para a simulação)" /><span class="helper">Quando informado, deve possuir 66 caracteres.</span></label>
          <label>Carteira de origem <input name="from" spellcheck="false" value="${e(state.wallets[0]?.address || "")}" placeholder="0x…" /></label>
          <label>Carteira de destino <input name="to" spellcheck="false" placeholder="0x…" required /></label>
          <label>Valor <input name="amount" type="number" min="0" step="0.0001" placeholder="0,00" required /></label>
          <label>Ativo <select name="asset" disabled><option>ETH — Ethereum</option></select><span class="helper">O ChainGuard analisa somente Ethereum.</span></label>
        </div>
        <p class="field-error" id="analysis-error"></p>
        <button class="btn primary form-submit" type="submit">${icon("scan")} Calcular risk score</button>
      </form>
      <div class="card analysis-placeholder" id="analysis-output"><div><div class="empty-icon">${icon("shield")}</div><h3>Resultado explicável</h3><p>Preencha a transação para visualizar o score, a classificação e os fatores que influenciaram a análise.</p></div></div>
    </div>`;
}

function renderAlerts() {
  const unread = state.alerts.filter(a => a.unread).length;
  return `${pageHeading("Proteção contínua", "Central de alertas", "Priorize eventos detectados nas carteiras monitoradas e registre a revisão da equipe.", unread ? `<button class="btn ghost" data-mark-all>${icon("check")} Marcar todos como revisados</button>` : "")}
    <div class="card"><div class="card-header"><div><h2>${unread ? `${unread} alertas pendentes` : "Nenhum alerta pendente"}</h2><p>Ordenados por criticidade e horário de detecção</p></div></div><div class="alert-list">${state.alerts.length ? state.alerts.map(a => `<article class="alert-item ${a.unread ? "unread" : ""}"><span class="alert-symbol">${icon(a.severity === "low" ? "check" : "warning")}</span><div class="alert-content"><div>${statusBadge(a.severity === "high" ? 78 : a.severity === "medium" ? 46 : 10)} <strong>${e(a.title)}</strong></div><p>${e(a.detail)}</p><div class="alert-meta"><span>${e(a.address)}</span>${a.unread ? `<button class="text-link" data-review-alert="${a.id}">Marcar como revisado</button>` : "<span>✓ revisado</span>"}</div></div><time>${e(a.time)}</time></article>`).join("") : emptyState("bell", "Nenhum alerta", "Os eventos de segurança detectados aparecerão aqui.")}</div></div>`;
}

function renderWhitelist() {
  return `${pageHeading("Confiança contextual", "Whitelist", "Gerencie endereços conhecidos. A whitelist influencia o contexto do score, mas nunca desativa a análise.", `<button class="btn primary success" data-open="whitelist">${icon("plus")} Adicionar endereço</button>`)}
    <div class="scope-banner">${icon("shield")}<div><strong>Camada de proteção, não exceção absoluta.</strong> Mesmo endereços confiáveis podem ser comprometidos; por isso, o ChainGuard continua avaliando comportamento, frequência e contrato envolvido.</div></div>
    <div class="card whitelist-card">${state.whitelist.length ? `<div class="address-cards">${state.whitelist.map(item => `<article class="address-card"><div class="address-card-top"><span class="address-symbol">${icon("shield")}</span><div class="row-actions"><button class="mini-button" data-copy="${e(item.address)}" aria-label="Copiar endereço">${icon("copy")}</button><button class="mini-button danger" data-delete-trusted="${item.id}" aria-label="Remover da whitelist">${icon("trash")}</button></div></div><h3>${e(item.label)}</h3><div class="mono">${e(item.address)}</div><footer><span>Ethereum Mainnet</span><span>Adicionado em ${e(item.created)}</span></footer></article>`).join("")}</div>` : emptyState("shield", "Whitelist vazia", "Adicione endereços reconhecidos para enriquecer a análise contextual.", `<button class="btn primary success" data-open="whitelist">${icon("plus")} Adicionar endereço</button>`)}</div>`;
}

function renderHistory() {
  const items = state.history.filter(h => filters.history === "all" || h.type === filters.history).filter(h => (h.wallet + h.hash).toLowerCase().includes(filters.query.toLowerCase()));
  return `${pageHeading("Rastreabilidade", "Histórico de análises", "Consulte os resultados produzidos pelo protótipo e os eventos associados às carteiras monitoradas.")}
    <div class="card"><div class="toolbar"><div class="search">${icon("search")}<input id="history-search" value="${e(filters.query)}" placeholder="Buscar carteira ou hash…" /></div><select id="history-filter"><option value="all">Todos os eventos</option><option ${filters.history === "Recebimento" ? "selected" : ""}>Recebimento</option><option ${filters.history === "Envio" ? "selected" : ""}>Envio</option><option ${filters.history === "Análise manual" ? "selected" : ""}>Análise manual</option></select></div>${historyTable(items)}</div>`;
}

function renderSettings() {
  return `${pageHeading("Evolução técnica", "Integrações e configurações", "Acompanhe o que já está conectado e as próximas etapas do desenvolvimento do ChainGuard.")}
    <div class="card pad"><div class="integration-grid">
      ${integration("ethereum", "Cotação Ethereum", "CoinGecko", "Cotação atual de ETH em BRL e variação de 24 horas. O comparador por corretora será construído em uma etapa separada.", "live", "Conectado", "var(--blue)")}
      ${integration("activity", "Motor de risk score", "Regras explicáveis", "Versão demonstrativa determinística, com fatores visíveis e histórico local de resultados.", "live", "Protótipo ativo", "var(--green)")}
      ${integration("link", "Dados on-chain", "Provedor RPC + webhooks", "Vai substituir os eventos de demonstração por transações reais e monitoramento contínuo do backend.", "future", "Próxima etapa", "var(--purple)")}
      ${integration("wallet", "MetaMask", "Assinatura não custodial", "Será integrada depois para analisar a intenção antes da confirmação do envio pelo usuário.", "future", "Planejado", "var(--amber)")}
      ${integration("ethereum", "Comparador de corretoras", "Somente ETH", "Vai comparar preço, taxas e valor líquido recebido. O botão de melhor compra permanece desativado nesta versão.", "future", "Planejado", "var(--accent)")}
      ${integration("shield", "Persistência e autenticação", "API + banco de dados", "Vai guardar monitoramentos, regras, alertas e auditoria por usuário, fora do navegador.", "future", "Próxima etapa", "var(--red)")}
    </div></div>
    <div class="card pad" style="margin-top:16px"><div class="card-header" style="padding:0 0 17px;min-height:0"><div><h2>Limpar dados da demonstração</h2><p>Restaura carteiras, whitelist, alertas e histórico iniciais.</p></div><button class="btn danger" data-reset>${icon("trash")} Restaurar demonstração</button></div></div>`;
}
function integration(iconName, title, name, copy, phase, label, tone) { return `<article class="integration"><span class="integration-icon" style="--tone:${tone}">${icon(iconName)}</span><div><h3>${title}</h3><p><strong style="color:var(--muted-2)">${name}.</strong> ${copy}</p></div><footer><span class="phase ${phase === "live" ? "live" : ""}">${label}</span><button class="btn ghost" disabled>${phase === "live" ? "Ativo" : "Em breve"}</button></footer></article>`; }

function render() {
  route = getRoute();
  document.getElementById("page-crumb").textContent = pageNames[route];
  document.querySelectorAll("[data-route]").forEach(link => link.classList.toggle("active", link.dataset.route === route));
  const views = { dashboard: renderDashboard, monitoramento: renderMonitoring, analisar: renderAnalyze, alertas: renderAlerts, whitelist: renderWhitelist, historico: renderHistory, configuracoes: renderSettings };
  document.getElementById("app").innerHTML = views[route]();
  hydrateIcons();
  updateBadges();
}

function updateBadges() {
  const unread = state.alerts.filter(a => a.unread).length;
  document.getElementById("wallet-count").textContent = state.wallets.length;
  document.getElementById("top-alert-count").textContent = unread;
  document.getElementById("top-alert-count").style.display = unread ? "grid" : "none";
  document.getElementById("alert-dot").classList.toggle("empty", !unread);
}

function closeMobileNav() { document.getElementById("sidebar").classList.remove("open"); document.getElementById("mobile-overlay").classList.remove("open"); }
function toast(message, type = "success") {
  const node = document.createElement("div"); node.className = `toast ${type}`; node.innerHTML = `${icon(type === "error" ? "warning" : "check")}<span>${e(message)}</span>`; document.getElementById("toast-region").append(node); hydrateIcons(node); setTimeout(() => node.remove(), 3500);
}

function deterministicRisk({ hash = "", from = "", to = "", amount = 0 }) {
  const trusted = state.whitelist.some(i => i.address.toLowerCase() === to.toLowerCase());
  const source = `${hash}${from}${to}`.toLowerCase();
  const entropy = [...source].reduce((n, c, i) => (n + c.charCodeAt(0) * (i + 3)) % 997, 0);
  const amountRisk = Number(amount) >= 5 ? 24 : Number(amount) >= 1 ? 14 : Number(amount) >= .25 ? 7 : 2;
  const noveltyRisk = entropy % 25;
  const contractRisk = source.includes("dead") || source.includes("bad") ? 28 : entropy % 3 === 0 ? 16 : 4;
  const frequencyRisk = entropy % 5 === 0 ? 13 : 3;
  const trustReduction = trusted ? 32 : 0;
  const score = Math.max(3, Math.min(96, 12 + amountRisk + noveltyRisk + contractRisk + frequencyRisk - trustReduction));
  return { score, factors: [
    { icon: "activity", title: "Histórico do endereço", detail: trusted ? "Destino reconhecido na whitelist." : "Endereço sem confiança explícita cadastrada.", value: trusted ? "−32" : `+${noveltyRisk}`, tone: trusted ? "var(--green)" : "var(--amber)" },
    { icon: "ethereum", title: "Valor movimentado", detail: `${Number(amount).toLocaleString("pt-BR")} ETH considerado na exposição financeira.`, value: `+${amountRisk}`, tone: amountRisk > 15 ? "var(--red)" : "var(--purple)" },
    { icon: "link", title: "Interação contratual", detail: contractRisk > 10 ? "Padrão compatível com contrato de pouco histórico." : "Nenhum padrão contratual crítico identificado.", value: `+${contractRisk}`, tone: contractRisk > 10 ? "var(--red)" : "var(--green)" },
    { icon: "history", title: "Frequência simulada", detail: frequencyRisk > 5 ? "Sequência atípica detectada na janela analisada." : "Frequência dentro do comportamento esperado.", value: `+${frequencyRisk}`, tone: frequencyRisk > 5 ? "var(--amber)" : "var(--green)" },
  ]};
}

function showAnalysisResult(data, result) {
  const meta = riskMeta(result.score);
  const output = document.getElementById("analysis-output");
  output.className = "card analysis-result";
  output.innerHTML = `<div class="result-score"><div class="gauge" style="--score:${result.score};--tone:${meta.tone}"><div><strong>${result.score}</strong><small>de 100</small></div></div><div><span class="status ${meta.key}">${meta.label}</span><h2>${meta.key === "high" ? "Transação sensível" : meta.key === "medium" ? "Revisão recomendada" : "Sinais controlados"}</h2><p>${meta.text}</p></div></div><div class="factor-list">${result.factors.map(f => `<div class="factor"><span style="color:${f.tone};background:color-mix(in srgb, ${f.tone} 10%, transparent)">${icon(f.icon)}</span><div><strong>${f.title}</strong><small>${f.detail}</small></div><b style="color:${f.tone}">${f.value}</b></div>`).join("")}</div><div class="disclaimer">${icon("info")}<span>Este score é uma estimativa de apoio à decisão, não uma garantia contra fraude. Nesta versão, os fatores usam regras demonstrativas determinísticas.</span></div>`;
  hydrateIcons(output);
}

async function fetchEthPrice() {
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=brl&include_24hr_change=true", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("price unavailable");
    const data = await response.json();
    state.price = data.ethereum.brl;
    state.priceChange = data.ethereum.brl_24h_change || 0;
    state.priceUpdated = new Date();
    if (route === "dashboard") render();
  } catch {
    state.price = 0;
    state.priceChange = 0;
    if (route === "dashboard") {
      const card = document.querySelector(".metric.price");
      if (card) card.innerHTML = `<div class="metric-head"><span>Ethereum agora</span><span class="metric-icon" style="--tone:var(--blue)">${icon("ethereum")}</span></div><div class="metric-value">Indisponível</div><div class="metric-foot"><span class="bad">Falha temporária</span> · tente novamente</div>`;
      hydrateIcons(card);
    }
  }
}

document.addEventListener("click", event => {
  const go = event.target.closest("[data-go]");
  if (go) { location.hash = go.dataset.go; closeMobileNav(); return; }
  const open = event.target.closest("[data-open]");
  if (open) { document.getElementById(`${open.dataset.open}-dialog`).showModal(); return; }
  const copy = event.target.closest("[data-copy]");
  if (copy) { navigator.clipboard?.writeText(copy.dataset.copy); toast("Identificador copiado."); return; }
  const analyze = event.target.closest("[data-analyze-address]");
  if (analyze) { sessionStorage.setItem("chainguard-analysis-address", analyze.dataset.analyzeAddress); location.hash = "analisar"; return; }
  const deleteWallet = event.target.closest("[data-delete-wallet]");
  if (deleteWallet) { state.wallets = state.wallets.filter(w => w.id !== deleteWallet.dataset.deleteWallet); saveState(); render(); toast("Carteira removida do monitoramento."); return; }
  const deleteTrusted = event.target.closest("[data-delete-trusted]");
  if (deleteTrusted) { state.whitelist = state.whitelist.filter(w => w.id !== deleteTrusted.dataset.deleteTrusted); saveState(); render(); toast("Endereço removido da whitelist."); return; }
  const review = event.target.closest("[data-review-alert]");
  if (review) { const item = state.alerts.find(a => a.id === review.dataset.reviewAlert); if (item) item.unread = false; saveState(); render(); return; }
  if (event.target.closest("[data-mark-all]")) { state.alerts.forEach(a => a.unread = false); saveState(); render(); toast("Alertas marcados como revisados."); return; }
  if (event.target.closest("[data-reset]")) { state = structuredClone(seedState); saveState(); document.body.classList.remove("light"); render(); fetchEthPrice(); toast("Dados de demonstração restaurados."); }
});

document.addEventListener("input", event => {
  if (event.target.id === "wallet-search") { filters.query = event.target.value; render(); document.getElementById("wallet-search")?.focus(); }
  if (event.target.id === "history-search") { filters.query = event.target.value; render(); document.getElementById("history-search")?.focus(); }
});
document.addEventListener("change", event => {
  if (event.target.id === "risk-filter") { filters.risk = event.target.value; render(); }
  if (event.target.id === "history-filter") { filters.history = event.target.value; render(); }
});
document.addEventListener("submit", event => {
  if (event.target.id !== "analysis-form") return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const error = document.getElementById("analysis-error"); error.textContent = "";
  if (data.hash && !isTxHash(data.hash)) { error.textContent = "O hash informado não possui o formato de uma transação Ethereum."; return; }
  if (!isAddress(data.from) || !isAddress(data.to)) { error.textContent = "Informe endereços Ethereum válidos para origem e destino."; return; }
  if (Number(data.amount) <= 0) { error.textContent = "O valor deve ser maior que zero."; return; }
  const result = deterministicRisk(data); showAnalysisResult(data, result);
  const hash = data.hash || `0x${Array.from({length:64}, (_, i) => ((result.score * (i + 7) + i * 13) % 16).toString(16)).join("")}`;
  state.history.unshift({ id: crypto.randomUUID(), type: "Análise manual", hash, wallet: shortAddress(data.from), amount: `${Number(data.amount).toLocaleString("pt-BR")} ETH`, score: result.score, date: "Agora" });
  saveState(); toast("Análise concluída e registrada no histórico.");
});

document.getElementById("wallet-form").addEventListener("submit", event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); const error = document.getElementById("wallet-error");
  if (!isAddress(data.address)) { error.textContent = "Informe um endereço Ethereum válido (0x + 40 caracteres hexadecimais)."; return; }
  if (state.wallets.some(w => w.address.toLowerCase() === data.address.toLowerCase())) { error.textContent = "Esta carteira já está sendo monitorada."; return; }
  const score = 8 + [...data.address].reduce((n,c) => n + c.charCodeAt(0), 0) % 48;
  state.wallets.unshift({ id: crypto.randomUUID(), label: data.label.trim(), address: data.address.trim(), balance: 0, score, status: riskMeta(score).key, last: "agora" });
  saveState(); event.target.reset(); document.getElementById("wallet-dialog").close(); if (route !== "monitoramento") location.hash = "monitoramento"; else render(); toast("Carteira adicionada ao monitoramento.");
});
document.getElementById("whitelist-form").addEventListener("submit", event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); const error = document.getElementById("whitelist-error");
  if (!isAddress(data.address)) { error.textContent = "Informe um endereço Ethereum válido."; return; }
  if (state.whitelist.some(w => w.address.toLowerCase() === data.address.toLowerCase())) { error.textContent = "Este endereço já está na whitelist."; return; }
  state.whitelist.unshift({ id: crypto.randomUUID(), label: data.label.trim(), address: data.address.trim(), created: "hoje" });
  saveState(); event.target.reset(); document.getElementById("whitelist-dialog").close(); render(); toast("Endereço adicionado à whitelist.");
});

window.addEventListener("hashchange", () => { filters.query = ""; render(); closeMobileNav(); const address = sessionStorage.getItem("chainguard-analysis-address"); if (getRoute() === "analisar" && address) { requestAnimationFrame(() => { const input = document.querySelector('[name="from"]'); if (input) input.value = address; }); sessionStorage.removeItem("chainguard-analysis-address"); } });
document.getElementById("mobile-menu").addEventListener("click", () => { document.getElementById("sidebar").classList.add("open"); document.getElementById("mobile-overlay").classList.add("open"); });
document.getElementById("mobile-overlay").addEventListener("click", closeMobileNav);
document.getElementById("theme-button").addEventListener("click", () => { state.theme = state.theme === "light" ? "dark" : "light"; document.body.classList.toggle("light", state.theme === "light"); saveState(); });

document.body.classList.toggle("light", state.theme === "light");
hydrateIcons(); render(); fetchEthPrice();
setInterval(() => { document.getElementById("sync-time").textContent = "Atualizado há poucos segundos"; }, 30000);
