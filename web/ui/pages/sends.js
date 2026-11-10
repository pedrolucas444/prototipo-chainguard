import { banner, e, emptyState, etherscanTx, fmt, icon, levelBadge, pageHeading, short } from "../components/ui.js";

const STATUS = { pending: '<span class="status neutral">Pendente</span>', confirmed: '<span class="status low">Confirmado</span>', failed: '<span class="status high">Falhou</span>' };

export default async function sends(root, app) {
  async function load() {
    const items = await app.api.get("/api/sends");
    root.innerHTML = `${pageHeading("Envio de fundos", "Envios", "Envie ETH, USDT ou USDC com verificação do destino antes da assinatura. A assinatura e o envio à rede acontecem na sua carteira.",
      `<button class="btn primary" data-send>${icon("send")} Novo envio</button>`)}
      ${banner("shield", `<strong>Não custodial.</strong> O ChainGuard verifica o destino e pede à sua carteira (MetaMask${app.config?.walletConnectProjectId ? " ou WalletConnect" : ""}) que assine. A chave privada nunca sai da carteira.`)}
      <div class="card">${items.length ? `<div class="table-wrap"><table><thead><tr><th>Destino</th><th>Valor</th><th>Risco na verificação</th><th>Status na rede</th><th>Data</th><th></th></tr></thead><tbody>
        ${items.map(s => `<tr><td class="mono">${short(s.to_address, 10, 8)}</td><td><strong>${fmt.num(s.amount)} ${e(s.asset)}</strong></td>
          <td>${s.whitelisted ? '<span class="status neutral">Whitelist</span>' : s.risk_level ? levelBadge(s.risk_level) : "—"}${s.confirmed_high_risk ? ' <em class="live-tag warn">CONFIRMADO</em>' : ""}</td>
          <td>${STATUS[s.status]}${s.block_number ? ` <span class="muted small">bloco ${s.block_number}</span>` : ""}</td><td>${fmt.date(s.created_at)}</td>
          <td><div class="row-actions">${s.status === "pending" ? `<button class="mini-button" data-refresh="${e(s.hash)}" title="Atualizar status">${icon("refresh")}</button>` : ""}<a class="mini-button" href="${etherscanTx(e(s.hash))}" target="_blank" rel="noreferrer" title="Etherscan">${icon("external")}</a></div></td></tr>`).join("")}
      </tbody></table></div>` : emptyState("send", "Nenhum envio ainda", "Os envios feitos pelo ChainGuard aparecem aqui com o status vindo da rede.", `<button class="btn primary" data-send>${icon("send")} Novo envio</button>`)}</div>`;
  }
  root.addEventListener("click", async event => {
    if (event.target.closest("[data-send]")) app.openSend();
    const r = event.target.closest("[data-refresh]");
    if (r) {
      const st = await app.api.get(`/api/sends/${r.dataset.refresh}/status`).catch(err => { app.toast(err.message, "error"); return null; });
      if (st?.dropped) app.toast(`Transação ${st.network}.`, "error");
      load();
    }
  });
  await load();
  app.onPoll(async () => {
    const items = await app.api.get("/api/sends");
    await Promise.all(items.filter(s => s.status === "pending").map(s => app.api.get(`/api/sends/${s.hash}/status`).catch(() => null)));
    load();
  });
}
