import { banner, e, emptyState, fmt, icon, metricCard, pageHeading, riskBadge, short, txTable } from "../components/ui.js";
import { openTransactionDetail } from "../components/tx-detail.js";
import { openAddWallet } from "./wallets.js";

export default async function dashboard(root, app) {
  async function load() {
    const [data, prices] = await Promise.all([app.api.get("/api/dashboard"), app.api.get("/api/quotes/prices").catch(() => null)]);
    const { summary, wallets, recent, alerts } = data;
    const ethUsdt = prices?.pairs.find(p => p.pair === "ETH/USDT");
    const ethBrl = prices?.pairs.find(p => p.pair === "ETH/BRL");
    const best = pair => pair ? Math.max(...pair.exchanges.map(x => x.bestBid ?? 0)) : null;
    const analyzed = (summary.low ?? 0) + (summary.medium ?? 0) + (summary.high ?? 0);
    const monitored = wallets.filter(w => w.status === "monitored").length;
    const firstName = e(app.user.name.split(" ")[0]);

    root.innerHTML = `${pageHeading("Visão geral", `Olá, ${firstName}.`, "Acompanhe o risco das transações das suas carteiras Ethereum em um só lugar.",
      `<a class="btn ghost" href="#/analisar">${icon("scan")} Analisar destino</a><button class="btn primary" data-add-wallet>${icon("plus")} Adicionar carteira</button>`)}
      ${app.config?.monitoringMode === "sync" ? banner("info", "<strong>Modo de sincronização.</strong> O webhook do Alchemy não está configurado neste servidor, então um Job consulta a rede periodicamente. O fluxo de análise (fila → Motor de Risco) é o mesmo.") : ""}
      <section class="grid cols-4" aria-label="Indicadores">
        ${metricCard("wallet", "Carteiras monitoradas", monitored, wallets.length > monitored ? `${wallets.length - monitored} pausada(s)` : `<span class="good">●</span> todas ativas`, "var(--purple)")}
        ${metricCard("activity", "Transações analisadas", analyzed, summary.pending ? `<span>${summary.pending} em análise</span>` : `${summary.whitelisted ?? 0} ignorada(s) pela whitelist`, "var(--blue)")}
        ${metricCard("bell", "Alertas não vistos", summary.unseen_alerts ?? 0, summary.high ? `<span class="bad">${summary.high} de alto risco no total</span>` : `<span class="good">Nenhum alto risco</span>`, "var(--red)")}
        ${metricCard("ethereum", "ETH agora", ethUsdt ? `${fmt.price(best(ethUsdt))} <small>USDT</small>` : "—", ethBrl ? `≈ R$ ${fmt.price(best(ethBrl))} · <a class="text-link inline" href="#/cotacoes">ver corretoras</a>` : `<a class="text-link inline" href="#/cotacoes">ver corretoras</a>`, "var(--green)")}
      </section>
      <section class="grid main-grid" style="margin-top:16px">
        <div class="stack">
          <div class="card"><div class="card-header"><div><h2>Transações recentes</h2><p>Nível de risco e explicação de cada uma</p></div><a class="text-link" href="#/transacoes">Ver todas →</a></div>${txTable(recent, { compact: true })}</div>
          <div class="card"><div class="card-header"><div><h2>Carteiras</h2><p>Endereços públicos monitorados</p></div><a class="text-link" href="#/carteiras">Gerenciar →</a></div>
            ${wallets.length ? `<div class="table-wrap"><table><tbody>${wallets.slice(0, 5).map(w => `<tr><td><div class="identity"><span class="identity-icon">${icon("ethereum")}</span><span><strong>${e(w.label)}</strong><small>${short(w.address, 8, 6)}</small></span></div></td><td>${w.balance_eth === null ? "—" : `${fmt.num(w.balance_eth, 4)} ETH`}</td><td>${w.status === "monitored" ? '<span class="status low">Monitorada</span>' : '<span class="status neutral">Pausada</span>'}</td><td>${w.high_count ? `<span class="status high">${w.high_count} alto risco</span>` : ""}</td></tr>`).join("")}</tbody></table></div>`
              : emptyState("wallet", "Nenhuma carteira cadastrada", "Adicione um endereço público Ethereum para começar. O ChainGuard nunca pede a sua chave privada.", `<button class="btn primary" data-add-wallet>${icon("plus")} Adicionar carteira</button>`)}
          </div>
        </div>
        <div class="stack">
          <div class="card"><div class="card-header"><div><h2>Alertas pendentes</h2><p>Transações de risco médio ou alto</p></div><a class="text-link" href="#/alertas">Abrir →</a></div>
            <div class="feed">${alerts.length ? alerts.map(a => `<button class="feed-item as-button" data-tx="${a.id}"><span class="feed-icon warn">${icon("warning")}</span><span class="feed-copy"><strong>${e(a.risk_factors?.[0]?.title ?? "Transação suspeita")}</strong><small>${e(a.wallet_label)} · ${short(a.counterparty, 8, 6)}</small></span><span class="feed-value">${riskBadge(a)}<small>${fmt.ago(a.occurred_at)}</small></span></button>`).join("") : `<p class="muted small" style="padding:14px 0">Nenhum alerta pendente. 🎉</p>`}</div>
          </div>
          <div class="card risk-overview">
            <div class="risk-title"><h2>Distribuição de risco</h2></div>
            <div class="dist">${["low", "medium", "high"].map(level => {
              const n = summary[level] ?? 0;
              const pct = analyzed ? Math.round((n / analyzed) * 100) : 0;
              return `<div class="dist-row"><span class="status ${level}">${level === "low" ? "Baixo" : level === "medium" ? "Médio" : "Alto"}</span><span class="dist-bar"><i style="width:${pct}%;background:var(--${level === "low" ? "green" : level === "medium" ? "amber" : "red"})"></i></span><b>${n}</b></div>`;
            }).join("")}</div>
            <p class="muted small" style="margin-top:14px">O nível é uma estimativa por heurísticas e dados públicos, não uma garantia.</p>
          </div>
        </div>
      </section>`;
  }

  root.addEventListener("click", event => {
    if (event.target.closest("[data-add-wallet]")) openAddWallet(app, load);
    const tx = event.target.closest("[data-tx]");
    if (tx && !event.target.closest("a,[data-copy]")) openTransactionDetail(app, tx.dataset.tx, { onChange: load });
  });
  await load();
  app.onPoll(load);
}
