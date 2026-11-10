import { banner, e, emptyState, fmt, icon, pageHeading } from "../components/ui.js";

export default async function quotes(root, app) {
  async function load() {
    const data = await app.api.get("/api/quotes/prices");
    const failures = (data.collector?.results ?? []).filter(r => !r.ok);
    const failedExchanges = [...new Set(failures.map(f => f.exchangeId))];
    root.innerHTML = `${pageHeading("Cotações (informativo)", "Painel de preços", "Melhor preço de compra e de venda em cada corretora, com fonte e horário da coleta. Os livros de ofertas são coletados a cada ~30 s.",
      `<a class="btn primary" href="#/simulador">${icon("calculator")} Simular troca</a>`)}
      ${banner("info", `<strong>Somente informativo.</strong> ${e(data.disclaimer)} O ChainGuard não executa ordens nem intermedeia operações.`)}
      ${failedExchanges.length ? banner("warning", `<strong>Coleta com falha:</strong> ${failedExchanges.map(e).join(", ")}. Exibimos o último dado disponível com o horário da coleta.`, "warn") : ""}
      ${data.pairs.length ? `<div class="pairs-grid">${data.pairs.map(p => `
        <article class="card">
          <div class="card-header"><div><h2>${e(p.pair)}</h2><p>Preço em ${e(p.quote)} por 1 ${e(p.base)}</p></div></div>
          <div class="table-wrap"><table><thead><tr><th>Corretora</th><th>Venda (bid)</th><th>Compra (ask)</th><th>Spread</th><th>Coleta</th></tr></thead><tbody>
            ${p.exchanges.map(x => `<tr>
              <td><strong>${e(x.exchangeName)}</strong></td>
              <td class="${p.bestSell === x.exchangeId && p.exchanges.length > 1 ? "best" : ""}">${fmt.price(x.bestBid)}${p.bestSell === x.exchangeId && p.exchanges.length > 1 ? ' <em class="live-tag">MELHOR VENDA</em>' : ""}</td>
              <td class="${p.bestBuy === x.exchangeId && p.exchanges.length > 1 ? "best" : ""}">${fmt.price(x.bestAsk)}${p.bestBuy === x.exchangeId && p.exchanges.length > 1 ? ' <em class="live-tag">MELHOR COMPRA</em>' : ""}</td>
              <td>${fmt.pct(x.spreadPct, 4)}</td>
              <td title="${e(x.fetchedAt)}">${x.stale ? `<span class="status medium">${fmt.time(x.fetchedAt)}</span>` : `<span class="muted">${fmt.time(x.fetchedAt)}</span>`}</td>
            </tr>`).join("")}
          </tbody></table></div>
        </article>`).join("")}</div>
        <p class="muted small" style="margin-top:12px">Horários em destaque amarelo indicam dado com mais de ${data.maxAgeSeconds} s (defasagem máxima aceita). Última coleta: ${fmt.time(data.collector?.at)}.</p>`
      : `<div class="card">${emptyState("chart", "Nenhuma cotação coletada ainda", "O Job de coleta roda a cada ~30 s. Aguarde a primeira coleta ou verifique se há corretoras habilitadas.")}</div>`}`;
  }
  await load();
  app.onPoll(load);
}
