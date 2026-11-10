import { e, icon, pageHeading, riskResultCard } from "../components/ui.js";

export default async function analyze(root, app, route) {
  root.innerHTML = `${pageHeading("Motor de Risco", "Analisar destino", "Antes de enviar fundos, verifique o endereço de destino. O resultado vem na hora, com a lista de fatores que motivaram a nota.")}
    <div class="analyze-layout">
      <form class="card form-card" data-form>
        <h2>Endereço de destino</h2>
        <p>Consultamos a base local de endereços maliciosos, o serviço de reputação (GoPlus), a idade da carteira e se o endereço parece com algum que você já usa (address poisoning).</p>
        <div class="form-grid">
          <label class="wide">Endereço Ethereum <input name="address" required spellcheck="false" autocomplete="off" placeholder="0x…" value="${e(route.query.address ?? "")}" /></label>
          <label>Valor (opcional) <input name="amount" inputmode="decimal" placeholder="0,00" /></label>
          <label>Ativo <select name="asset"><option>ETH</option><option>USDT</option><option>USDC</option></select></label>
        </div>
        <p class="field-error" data-error></p>
        <button class="btn primary form-submit" type="submit">${icon("scan")} Verificar destino</button>
      </form>
      <div class="card analysis-placeholder" data-output><div><div class="empty-icon">${icon("shield")}</div><h3>Resultado explicável</h3><p>Informe o endereço para ver o nível de risco e os fatores que influenciaram a análise.</p></div></div>
    </div>`;

  const form = root.querySelector("[data-form]");
  const output = root.querySelector("[data-output]");
  let last = null;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    const errorNode = root.querySelector("[data-error]");
    errorNode.textContent = "";
    button.disabled = true;
    output.className = "card analysis-placeholder";
    output.innerHTML = `<div><div class="spinner"></div><p>Consultando base local, reputação e histórico…</p></div>`;
    try {
      const data = Object.fromEntries(new FormData(form));
      last = await app.api.post("/api/risk/check", { address: data.address, amount: data.amount ? Number(String(data.amount).replace(",", ".")) : undefined, asset: data.asset });
      output.className = "card";
      output.innerHTML = `${riskResultCard(last)}<div class="result-actions">
        <button class="btn primary" data-send>${icon("send")} Enviar para este endereço</button>
        ${last.whitelisted ? "" : `<button class="btn ghost" data-trust>${icon("shield")} Adicionar à whitelist</button>`}
      </div>`;
    } catch (error) {
      errorNode.textContent = error.message;
      output.innerHTML = `<div><div class="empty-icon">${icon("warning")}</div><h3>Não foi possível analisar</h3><p>${e(error.message)}</p></div>`;
    } finally {
      button.disabled = false;
    }
  });

  output.addEventListener("click", async event => {
    if (event.target.closest("[data-send]")) app.openSend({ to: last.address, amount: form.amount.value, asset: form.asset.value, check: last });
    if (event.target.closest("[data-trust]")) {
      const { openAddWhitelist } = await import("./whitelist.js");
      openAddWhitelist(app, { address: last.address }, () => form.requestSubmit());
    }
  });

  if (route.query.address) form.requestSubmit();
}
