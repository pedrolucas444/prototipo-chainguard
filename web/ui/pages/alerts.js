import { e, emptyState, fmt, icon, pageHeading, riskBadge, short } from "../components/ui.js";
import { openTransactionDetail } from "../components/tx-detail.js";

export default async function alerts(root, app) {
  async function load() {
    const items = await app.api.get("/api/alerts");
    const unseen = items.filter(a => !a.alert_seen).length;
    root.innerHTML = `${pageHeading("Proteção contínua", "Alertas", "Transações classificadas com risco médio ou alto. Marque como vistas depois de revisar.",
      unseen ? `<button class="btn ghost" data-all>${icon("check")} Marcar todos como vistos</button>` : "")}
      <div class="card"><div class="card-header"><div><h2>${unseen ? `${unseen} alerta(s) não visto(s)` : "Nenhum alerta pendente"}</h2><p>Mais recentes primeiro</p></div></div>
      <div class="alert-list">${items.length ? items.map(a => `
        <article class="alert-item ${a.alert_seen ? "" : "unread"}" data-tx="${a.id}">
          <span class="alert-symbol">${icon("warning")}</span>
          <div class="alert-content">
            <div>${riskBadge(a)} <b class="score-inline">${a.risk_score}/100</b> <strong>${e(a.risk_factors?.[0]?.title ?? "Transação suspeita")}</strong></div>
            <p>${e(a.risk_factors?.map(f => f.detail).slice(0, 2).join(" ") ?? "")}</p>
            <div class="alert-meta"><span>${e(a.wallet_label)}</span><span>${a.direction === "in" ? "recebeu" : "enviou"} ${fmt.num(a.value)} ${e(a.asset)}</span><span>${a.direction === "in" ? "de" : "para"} ${short(a.counterparty, 8, 6)}</span>
              ${a.alert_seen ? "<span>✓ visto</span>" : `<button class="text-link" data-seen="${a.id}">Marcar como visto</button>`}</div>
          </div>
          <time>${fmt.ago(a.occurred_at)}</time>
        </article>`).join("") : emptyState("bell", "Nenhum alerta", "Quando uma transação for classificada com risco médio ou alto, ela aparece aqui.")}</div></div>`;
  }
  root.addEventListener("click", async event => {
    try {
      if (event.target.closest("[data-all]")) { await app.api.post("/api/alerts/seen", {}); await load(); app.refreshBadges(); return; }
      const seen = event.target.closest("[data-seen]");
      if (seen) { event.stopPropagation(); await app.api.post("/api/alerts/seen", { ids: [Number(seen.dataset.seen)] }); await load(); app.refreshBadges(); return; }
      const item = event.target.closest("[data-tx]");
      if (item) {
        await openTransactionDetail(app, item.dataset.tx, { onChange: load });
        if (item.classList.contains("unread")) { await app.api.post("/api/alerts/seen", { ids: [Number(item.dataset.tx)] }); load(); app.refreshBadges(); }
      }
    } catch (error) {
      app.toast(error.message, "error");
    }
  });
  await load();
  app.onPoll(load);
}
