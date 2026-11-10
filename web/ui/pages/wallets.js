import { confirmDialog, e, emptyState, etherscanAddr, fmt, icon, openModal, pageHeading, short } from "../components/ui.js";

export function openAddWallet(app, onDone) {
  openModal({
    title: "Adicionar carteira", eyebrow: "Novo monitoramento", iconName: "wallet",
    body: `<p class="modal-copy">Informe um endereço público da rede Ethereum. O ChainGuard confere o endereço on-chain, cadastra no monitoramento e analisa cada transação nova. <strong>Nunca</strong> peça ou informe sua chave privada ou frase-semente.</p>
      <label>Identificação <input name="label" required maxlength="32" placeholder="Ex.: Carteira principal" /></label>
      <label>Endereço Ethereum <input name="address" required spellcheck="false" autocomplete="off" placeholder="0x…" /><span class="helper">Endereços com letras maiúsculas e minúsculas têm o checksum (EIP-55) conferido.</span></label>
      <label class="check"><input type="checkbox" name="importHistory" checked /> <span>Importar e analisar as movimentações recentes</span></label>`,
    submitLabel: "Começar monitoramento",
    onSubmit: async data => {
      const result = await app.api.post("/api/wallets", { label: data.get("label"), address: data.get("address"), importHistory: data.get("importHistory") === "on" });
      app.toast("Carteira adicionada ao monitoramento.");
      for (const w of result.warnings ?? []) app.toast(w, "info");
      app.refreshBadges();
      onDone?.();
    },
  });
}

export default async function wallets(root, app) {
  let items = [];
  const draw = () => {
    root.innerHTML = `${pageHeading("Monitoramento", "Carteiras", "Cadastre endereços públicos. Cada transação nova é classificada pelo Motor de Risco. Pause para parar de monitorar sem perder o histórico.",
      `<button class="btn primary" data-add>${icon("plus")} Adicionar carteira</button>`)}
      <div class="card">${items.length ? `<div class="table-wrap"><table><thead><tr><th>Carteira</th><th>Saldo</th><th>Situação</th><th>Transações</th><th>Última atividade</th><th></th></tr></thead><tbody>
        ${items.map(w => `<tr>
          <td><div class="identity"><span class="identity-icon">${icon("ethereum")}</span><span><strong>${e(w.label)}${w.is_contract ? ' <em class="live-tag warn">CONTRATO</em>' : ""}</strong><small>${short(w.address, 10, 8)}</small></span></div></td>
          <td>${w.balance_eth === null ? '<span class="muted">indisponível</span>' : `<strong>${fmt.num(w.balance_eth, 6)} ETH</strong>`}</td>
          <td>${w.status === "monitored" ? '<span class="status low">Monitorada</span>' : '<span class="status neutral">Pausada</span>'}</td>
          <td><a class="text-link inline" href="#/transacoes?walletId=${w.id}">${w.tx_count}</a>${w.high_count ? ` <span class="status high">${w.high_count} alto</span>` : ""}</td>
          <td>${w.last_activity_at ? fmt.ago(w.last_activity_at) : "—"}</td>
          <td><div class="row-actions">
            <button class="mini-button" data-copy="${e(w.address)}" aria-label="Copiar endereço" title="Copiar">${icon("copy")}</button>
            <a class="mini-button" href="${etherscanAddr(e(w.address))}" target="_blank" rel="noreferrer" aria-label="Abrir no Etherscan" title="Etherscan">${icon("external")}</a>
            <button class="mini-button" data-rename="${w.id}" aria-label="Renomear" title="Renomear">${icon("edit")}</button>
            <button class="mini-button" data-toggle="${w.id}" aria-label="${w.status === "monitored" ? "Pausar" : "Retomar"}" title="${w.status === "monitored" ? "Pausar monitoramento" : "Retomar monitoramento"}">${icon(w.status === "monitored" ? "pause" : "play")}</button>
            <button class="mini-button danger" data-remove="${w.id}" aria-label="Remover" title="Remover">${icon("trash")}</button>
          </div></td></tr>`).join("")}
      </tbody></table></div>` : emptyState("wallet", "Nenhuma carteira cadastrada", "Adicione um endereço público Ethereum para iniciar o monitoramento.", `<button class="btn primary" data-add>${icon("plus")} Adicionar carteira</button>`)}</div>`;
  };
  const load = async () => { items = await app.api.get("/api/wallets"); draw(); };

  root.addEventListener("click", async event => {
    const t = event.target.closest("button");
    if (!t) return;
    const find = id => items.find(w => w.id === Number(id));
    try {
      if (t.hasAttribute("data-add")) openAddWallet(app, load);
      if (t.dataset.toggle) {
        const w = find(t.dataset.toggle);
        await app.api.patch(`/api/wallets/${w.id}`, { status: w.status === "monitored" ? "paused" : "monitored" });
        app.toast(w.status === "monitored" ? "Monitoramento pausado." : "Monitoramento retomado.");
        await load();
      }
      if (t.dataset.rename) {
        const w = find(t.dataset.rename);
        openModal({ title: "Renomear carteira", iconName: "edit", body: `<label>Identificação <input name="label" required maxlength="32" value="${e(w.label)}" /></label>`, onSubmit: async data => { await app.api.patch(`/api/wallets/${w.id}`, { label: data.get("label") }); await load(); } });
      }
      if (t.dataset.remove) {
        const w = find(t.dataset.remove);
        if (!(await confirmDialog({ title: "Remover carteira", message: `Remover <strong>${e(w.label)}</strong>? O endereço sai do monitoramento e o histórico de transações dela é apagado.`, confirmLabel: "Remover", danger: true }))) return;
        await app.api.del(`/api/wallets/${w.id}`);
        app.toast("Carteira removida.");
        app.refreshBadges();
        await load();
      }
    } catch (error) {
      app.toast(error.message, "error");
    }
  });
  await load();
  app.onPoll(load);
}
