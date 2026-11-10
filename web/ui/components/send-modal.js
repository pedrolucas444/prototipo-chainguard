/**
 * Send Modal (caso de uso "Enviar Fundos"):
 *   1. destino + valor → 2. verificação do destino (include "Analisar Risco do Destino";
 *   dispensada se estiver na whitelist) → 3. confirmação adicional se o risco for alto
 *   (extend "Confirmar Envio de Alto Risco") → 4. assinatura na carteira externa
 *   (include "Assinar via Carteira Externa") → 5. status vindo da rede.
 */
import { e, icon, riskResultCard, toast } from "./ui.js";
import { parseUnits } from "../../services/wallet-connector.js";

const CONFIRM_PHRASE = "ENTENDO O RISCO";

export async function openSendModal(app, prefill = {}) {
  const assets = await app.api.get("/api/assets").catch(() => [{ symbol: "ETH", decimals: 18 }]);
  const wallet = app.wallet;
  let check = prefill.check ?? null;
  let step = "form";
  let hash = null;
  let statusTimer = null;

  const dialog = document.createElement("dialog");
  dialog.className = "modal wide";
  document.body.append(dialog);

  const close = () => { clearInterval(statusTimer); dialog.close(); dialog.remove(); };
  dialog.addEventListener("cancel", () => { clearInterval(statusTimer); setTimeout(() => dialog.remove(), 0); });

  function walletBox() {
    if (wallet.account) {
      return `<div class="wallet-box ok">${icon("wallet")}<span><b>Carteira conectada</b><small class="mono-inline">${e(wallet.account)}</small></span><button type="button" class="text-link" data-disconnect>Desconectar</button></div>`;
    }
    return `<div class="wallet-box">${icon("wallet")}<span><b>Conecte a sua carteira</b><small>Quem assina é a carteira. O ChainGuard nunca vê a sua chave.</small></span>
      <div class="wallet-buttons"><button type="button" class="btn ghost compact" data-connect="injected" ${wallet.hasInjected() ? "" : "disabled title=\"Nenhuma carteira injetada encontrada\""}>MetaMask</button>
      ${wallet.walletConnectAvailable() ? `<button type="button" class="btn ghost compact" data-connect="walletconnect">WalletConnect</button>` : ""}</div></div>`;
  }

  function render(error = "") {
    const asset = dialog.querySelector('[name="asset"]')?.value ?? prefill.asset ?? "ETH";
    const to = dialog.querySelector('[name="to"]')?.value ?? prefill.to ?? "";
    const amount = dialog.querySelector('[name="amount"]')?.value ?? prefill.amount ?? "";
    const high = check && !check.whitelisted && check.level === "high";
    let body;
    if (step === "sent") {
      body = `<div class="send-status" data-status><div class="spinner"></div><h3>Transação enviada à rede</h3><p class="mono-inline">${e(hash)}</p><p class="muted small">Aguardando inclusão em um bloco. O status vem direto da rede.</p>
        <a class="btn ghost" href="https://etherscan.io/tx/${e(hash)}" target="_blank" rel="noreferrer">${icon("external")} Acompanhar no Etherscan</a></div>`;
    } else {
      body = `${walletBox()}
        <div class="form-grid">
          <label class="wide">Destino <input name="to" required spellcheck="false" autocomplete="off" placeholder="0x…" value="${e(to)}" ${step !== "form" ? "readonly" : ""} /></label>
          <label>Valor <input name="amount" required inputmode="decimal" placeholder="0,00" value="${e(amount)}" ${step !== "form" ? "readonly" : ""} /></label>
          <label>Ativo <select name="asset" ${step !== "form" ? "disabled" : ""}>${assets.map(a => `<option ${a.symbol === asset ? "selected" : ""}>${e(a.symbol)}</option>`).join("")}</select></label>
        </div>
        ${check ? `<div class="send-check">${riskResultCard(check)}</div>` : ""}
        ${high ? `<div class="high-confirm"><p>${icon("warning")} <b>Envio de alto risco.</b> Para continuar mesmo assim, digite <code>${CONFIRM_PHRASE}</code>:</p><input name="confirm" autocomplete="off" placeholder="${CONFIRM_PHRASE}" /></div>` : ""}`;
    }
    const actions = step === "sent"
      ? `<button class="btn primary" type="button" data-close>Fechar</button>`
      : step === "form"
        ? `<button class="btn ghost" type="button" data-close>Cancelar</button><button class="btn primary" type="submit" data-action="check">${icon("scan")} Verificar destino</button>`
        : `<button class="btn ghost" type="button" data-edit>Alterar dados</button><button class="btn ${high ? "danger" : "primary"}" type="submit" data-action="sign" ${wallet.account ? "" : "disabled"}>${icon("send")} ${wallet.account ? "Assinar na carteira" : "Conecte a carteira"}</button>`;

    dialog.innerHTML = `<form method="dialog" novalidate>
      <div class="modal-head"><div class="modal-icon">${icon("send")}</div><div><span class="eyebrow">Não custodial</span><h2>Enviar fundos</h2></div><button class="icon-button" type="button" data-close aria-label="Fechar">${icon("x")}</button></div>
      <div class="modal-body">${body}</div>
      <p class="field-error">${e(error)}</p>
      <div class="modal-actions">${actions}</div></form>`;
  }

  async function pollStatus() {
    try {
      const s = await app.api.get(`/api/sends/${hash}/status`);
      if (s.status === "pending") {
        if (s.dropped) {
          clearInterval(statusTimer);
          const box = dialog.querySelector("[data-status]");
          if (box) box.innerHTML = `<div class="empty-icon">${icon("warning")}</div><h3>Transação não encontrada na rede</h3><p class="muted small">${e(s.network)}. Confira na carteira.</p><p class="mono-inline">${e(hash)}</p>`;
        }
        return;
      }
      clearInterval(statusTimer);
      const box = dialog.querySelector("[data-status]");
      if (box) box.innerHTML = s.status === "confirmed"
        ? `<div class="empty-icon ok">${icon("check")}</div><h3>Envio confirmado</h3><p class="muted small">Incluído no bloco ${s.block_number}.</p><p class="mono-inline">${e(hash)}</p>`
        : `<div class="empty-icon">${icon("warning")}</div><h3>A transação falhou na rede</h3><p class="muted small">Bloco ${s.block_number}. Os fundos não foram transferidos (só a taxa de gas foi cobrada).</p>`;
      toast(s.status === "confirmed" ? "Envio confirmado na rede." : "A transação falhou na rede.", s.status === "confirmed" ? "success" : "error");
    } catch { /* tenta de novo no próximo ciclo */ }
  }

  dialog.addEventListener("click", async event => {
    const t = event.target.closest("button");
    if (!t) return;
    if (t.hasAttribute("data-close")) return close();
    if (t.hasAttribute("data-edit")) { step = "form"; check = null; return render(); }
    if (t.hasAttribute("data-disconnect")) { await wallet.disconnect(); return render(); }
    if (t.dataset.connect) {
      t.disabled = true;
      try { await wallet.connect(t.dataset.connect); render(); } catch (error) { render(error.message); }
    }
  });

  dialog.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('[type="submit"]');
    const to = form.to.value.trim();
    const amountText = form.amount.value.trim();
    const asset = assets.find(a => a.symbol === form.asset.value) ?? assets[0];
    button.disabled = true;
    try {
      if (step === "form") {
        // Mesma validação usada na assinatura (parseUnits): o que passa aqui também passa na carteira.
        if (!(parseUnits(amountText, asset.decimals ?? 18) > 0n)) throw new Error("Informe um valor maior que zero.");
        const amount = Number(amountText.replace(",", "."));
        check = await app.api.post("/api/risk/check", { address: to, amount, asset: asset.symbol });
        step = "review";
        prefill = { to, amount: amountText, asset: asset.symbol };
        return render();
      }
      // step === "review" → assinar
      const high = !check.whitelisted && check.level === "high";
      if (high && form.confirm?.value.trim().toUpperCase() !== CONFIRM_PHRASE) throw new Error(`Digite "${CONFIRM_PHRASE}" para confirmar o envio de alto risco.`);
      if (!wallet.account) throw new Error("Conecte a carteira primeiro.");
      hash = await wallet.send({ to: check.address, amount: amountText, asset });
      let recorded = true;
      await app.api.post("/api/sends", {
        hash, from: wallet.account, to: check.address, amount: Number(amountText.replace(",", ".")), asset: asset.symbol,
        riskLevel: check.level ?? undefined, whitelisted: Boolean(check.whitelisted), confirmedHighRisk: high,
      }).catch(error => {
        recorded = false;
        toast(`A transação foi enviada, mas não conseguimos registrá-la no ChainGuard (${error.message}). Acompanhe pelo Etherscan.`, "error");
      });
      step = "sent";
      render();
      if (recorded) statusTimer = setInterval(pollStatus, 6000);
      else {
        const box = dialog.querySelector("[data-status]");
        box?.querySelector(".spinner")?.remove();
        box?.querySelector("p.muted")?.replaceWith(Object.assign(document.createElement("p"), { className: "muted small", textContent: "Não foi possível registrar o envio. O status pode ser acompanhado no Etherscan." }));
      }
    } catch (error) {
      const message = error?.code === 4001 ? "Assinatura recusada na carteira." : error.message;
      render(message);
    }
  });

  if (check && prefill.to && prefill.amount) step = "review";
  render();
  dialog.showModal();
}
