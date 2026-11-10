import { banner, confirmDialog, e, emptyState, fmt, icon, openModal, pageHeading } from "../components/ui.js";

export function openAddWhitelist(app, prefill = {}, onDone) {
  openModal({
    title: "Adicionar à whitelist", eyebrow: "Endereço confiável", iconName: "shield", tone: "success",
    body: `<p class="modal-copy">Transações de ou para endereços da whitelist <strong>não passam pela análise</strong>, e o envio para eles dispensa a verificação. Use só para endereços que você conhece, como a sua exchange ou um familiar.</p>
      <label>Nome <input name="label" required maxlength="32" placeholder="Ex.: Minha conta na exchange" value="${e(prefill.label ?? "")}" /></label>
      <label>Endereço Ethereum <input name="address" required spellcheck="false" autocomplete="off" placeholder="0x…" value="${e(prefill.address ?? "")}" /></label>`,
    submitLabel: "Adicionar endereço", submitClass: "primary success",
    onSubmit: async data => {
      const result = await app.api.post("/api/whitelist", { label: data.get("label"), address: data.get("address") });
      app.toast("Endereço adicionado à whitelist.");
      for (const w of result.warnings ?? []) app.toast(w, "error");
      onDone?.();
    },
  });
}

export default async function whitelist(root, app) {
  async function load() {
    const items = await app.api.get("/api/whitelist");
    root.innerHTML = `${pageHeading("Endereços confiáveis", "Whitelist", "Endereços que você conhece e em que confia. As transações com eles não geram alerta e a tela indica que a análise foi ignorada.",
      `<button class="btn primary success" data-add>${icon("plus")} Adicionar endereço</button>`)}
      ${banner("info", "<strong>Use com cuidado.</strong> A whitelist dispensa a análise. Se um endereço confiável for comprometido, o ChainGuard não vai alertar sobre ele.")}
      <div class="card whitelist-card">${items.length ? `<div class="address-cards">${items.map(item => `
        <article class="address-card">
          <div class="address-card-top"><span class="address-symbol">${icon("shield")}</span>
            <div class="row-actions"><button class="mini-button" data-copy="${e(item.address)}" aria-label="Copiar endereço">${icon("copy")}</button><button class="mini-button danger" data-remove="${item.id}" data-label="${e(item.label)}" aria-label="Remover da whitelist">${icon("trash")}</button></div></div>
          <h3>${e(item.label)}</h3><div class="mono">${e(item.address)}</div>
          <footer><span>Ethereum Mainnet</span><span>Adicionado em ${fmt.date(item.created_at).split(" ")[0]}</span></footer>
        </article>`).join("")}</div>` : emptyState("shield", "Whitelist vazia", "Adicione endereços que você conhece para não receber alertas sobre eles.", `<button class="btn primary success" data-add>${icon("plus")} Adicionar endereço</button>`)}</div>`;
  }
  root.addEventListener("click", async event => {
    if (event.target.closest("[data-add]")) openAddWhitelist(app, {}, load);
    const remove = event.target.closest("[data-remove]");
    if (remove) {
      if (!(await confirmDialog({ title: "Remover da whitelist", message: `Remover <strong>${e(remove.dataset.label)}</strong>? As próximas transações com esse endereço voltam a ser analisadas.`, confirmLabel: "Remover", danger: true }))) return;
      try {
        await app.api.del(`/api/whitelist/${remove.dataset.remove}`);
        app.toast("Endereço removido da whitelist.");
        load();
      } catch (error) {
        app.toast(error.message, "error");
      }
    }
  });
  await load();
}
