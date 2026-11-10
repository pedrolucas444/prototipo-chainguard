import { disclaimer, e, emptyState, fmt, icon, pageHeading } from "../components/ui.js";

function resultView(r) {
  const best = r.ranking[0];
  const unit = r.toAsset;
  return `
    <div class="sim-summary">
      <div><span class="eyebrow">Melhor estimativa</span><h2>${fmt.money(best.net, unit)}</h2>
      <p class="muted small">${fmt.num(r.amount)} ${e(r.fromAsset)} → ${e(unit)} na <b>${e(best.exchangeName)}</b>${best.complete ? "" : " (livro incompleto)"}${best.stale ? " (dados com mais de 1 min)" : ""}${best.feesKnown === false ? " (taxas não cadastradas)" : ""} · preço médio efetivo ${fmt.price(best.avgPrice)} ${e(best.pair.split("/")[1])}/${e(best.pair.split("/")[0])}</p></div>
      <span class="muted small">Calculado ${fmt.date(r.computedAt ?? r.createdAt)}</span>
    </div>
    <div class="table-wrap"><table class="ranking"><thead><tr><th>#</th><th>Corretora</th><th>Par</th><th>Preço médio efetivo</th><th>Bruto</th><th>Taxas</th><th>Líquido estimado</th><th>Dados de</th></tr></thead><tbody>
      ${r.ranking.map(x => `<tr class="${x.position === 1 ? "winner" : ""}">
        <td><b>${x.position}º</b></td>
        <td><strong>${e(x.exchangeName)}</strong>${x.complete ? "" : ' <em class="live-tag warn">INCOMPLETO</em>'}${x.stale ? ' <em class="live-tag warn">DESATUALIZADO</em>' : ""}${x.feesKnown === false ? ' <em class="live-tag warn">SEM TAXAS</em>' : ""}</td>
        <td>${e(x.pair)} <span class="muted small">${x.side === "sell" ? "venda" : "compra"}</span></td>
        <td>${fmt.price(x.avgPrice)}<br><span class="muted small">vitrine ${fmt.price(x.bestPrice)} · slippage ${fmt.pct(x.slippagePct, 3)}</span></td>
        <td>${fmt.money(x.grossOutput, unit)}</td>
        <td>−${fmt.money(x.tradingFee + x.withdrawalFee, unit)}<br><span class="muted small">negociação ${fmt.pct(x.tradingFeeRate * 100, 2)}${x.withdrawalFee ? ` + saque ${fmt.num(x.withdrawalFee)}` : ""}</span></td>
        <td><strong>${fmt.money(x.net, unit)}</strong>${x.position > 1 ? `<br><span class="bad small">${fmt.money(x.diffFromBest, unit)} (${fmt.pct(x.diffFromBestPct, 3)})</span>` : ""}</td>
        <td>${x.stale ? `<span class="status medium">${fmt.time(x.fetchedAt)}</span>` : fmt.time(x.fetchedAt)}</td>
      </tr>`).join("")}
    </tbody></table></div>
    ${r.split?.worthIt ? `<div class="split-box"><h3>${icon("activity")} Sugestão: dividir entre corretoras</h3>
      <p class="muted small">Ganho estimado de <b>${fmt.money(r.split.gainVsBest, unit)}</b> em relação à melhor corretora isolada.</p>
      <ul>${r.split.allocations.map(a => `<li><b>${e(a.exchangeName)}</b>: ${fmt.num(a.input)} ${e(r.fromAsset)} (${fmt.pct(a.sharePct, 1)}) → ${fmt.money(a.net, unit)}</li>`).join("")}</ul></div>` : ""}
    <h3 class="section-title">Premissas</h3>
    <ul class="assumptions">${r.assumptions.map(a => `<li>${e(a)}</li>`).join("")}${[...new Set(r.ranking.flatMap(x => x.assumptions))].map(a => `<li>${e(a)}</li>`).join("")}</ul>
    ${disclaimer("Estimativa informativa, não é cotação firme nem recomendação. Nenhuma ordem é executada.")}`;
}

export default async function simulator(root, app) {
  const options = await app.api.get("/api/quotes/options");
  root.innerHTML = `${pageHeading("Cotações (informativo)", "Simulador de troca", "Informe o que quer trocar. Percorremos o livro de ofertas de cada corretora, aplicamos as taxas e ordenamos pelo valor líquido estimado.")}
    <div class="sim-layout">
      <div class="stack">
        <form class="card form-card" data-form>
          <h2>Quero trocar</h2>
          <p>Pares disponíveis: ${options.pairs.map(e).join(", ")}.</p>
          <div class="form-grid">
            <label>Quantidade <input name="amount" required inputmode="decimal" placeholder="1" value="1" /></label>
            <label>De <select name="fromAsset">${options.assets.map(a => `<option ${a === "ETH" ? "selected" : ""}>${e(a)}</option>`).join("")}</select></label>
            <label class="wide">Para <select name="toAsset">${options.assets.map(a => `<option ${a === "USDT" ? "selected" : ""}>${e(a)}</option>`).join("")}</select></label>
            <label class="check wide"><input type="checkbox" name="includeWithdrawal" /> <span>Incluir taxa de saque do ativo recebido (tabela estática)</span></label>
          </div>
          <p class="field-error" data-error></p>
          <button class="btn primary form-submit" type="submit">${icon("calculator")} Simular</button>
        </form>
        <div class="card"><div class="card-header"><div><h2>Histórico de simulações</h2><p>Clique para rever o resultado salvo</p></div></div><div data-history></div></div>
      </div>
      <div class="card" data-output><div class="analysis-placeholder"><div><div class="empty-icon">${icon("calculator")}</div><h3>Ranking das corretoras</h3><p>O resultado mostra o preço médio efetivo, as taxas, o valor líquido e o horário dos dados.</p></div></div></div>
    </div>`;

  const form = root.querySelector("[data-form]");
  const output = root.querySelector("[data-output]");

  async function loadHistory() {
    const items = await app.api.get("/api/simulations");
    root.querySelector("[data-history]").innerHTML = items.length
      ? `<div class="history-list">${items.slice(0, 12).map(s => `<button class="history-item" data-sim="${s.id}"><span><b>${fmt.num(s.amount)} ${e(s.fromAsset)} → ${e(s.toAsset)}</b><small>${fmt.date(s.createdAt)}</small></span><span>${s.best ? `${e(s.best.exchangeName)}<small>${fmt.money(s.best.net, s.toAsset)}</small>` : "—"}</span></button>`).join("")}</div>`
      : emptyState("history", "Nenhuma simulação ainda", "Suas simulações ficam salvas aqui.");
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const errorNode = root.querySelector("[data-error]");
    errorNode.textContent = "";
    const data = Object.fromEntries(new FormData(form));
    output.innerHTML = `<div class="analysis-placeholder"><div><div class="spinner"></div><p>Percorrendo os livros de ofertas…</p></div></div>`;
    try {
      const result = await app.api.post("/api/quotes/simulate", { fromAsset: data.fromAsset, toAsset: data.toAsset, amount: Number(String(data.amount).replace(",", ".")), includeWithdrawal: data.includeWithdrawal === "on" });
      output.innerHTML = `<div class="analysis-result">${resultView(result)}</div>`;
      loadHistory();
    } catch (error) {
      errorNode.textContent = error.message;
      output.innerHTML = `<div class="analysis-placeholder"><div><div class="empty-icon">${icon("warning")}</div><h3>Não foi possível simular</h3><p>${e(error.message)}</p></div></div>`;
    }
  });
  root.addEventListener("click", async event => {
    const item = event.target.closest("[data-sim]");
    if (!item) return;
    const result = await app.api.get(`/api/simulations/${item.dataset.sim}`);
    output.innerHTML = `<div class="analysis-result"><p class="muted small">Simulação salva: os dados abaixo são do momento em que ela foi feita.</p>${resultView(result)}</div>`;
  });
  await loadHistory();
}
