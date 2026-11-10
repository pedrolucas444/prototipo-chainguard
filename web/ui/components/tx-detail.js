// Detalhes da transação (caso de uso "Visualizar Detalhes da Transação").
import { addressCell, e, etherscanTx, factorList, fmt, openModal, riskBadge, RISK } from "./ui.js";

export async function openTransactionDetail(app, id, { onChange } = {}) {
  const tx = await app.api.get(`/api/transactions/${id}`);
  const meta = tx.risk_level ? RISK[tx.risk_level] : null;
  const body = `
    <div class="detail-head">
      ${tx.whitelisted || !meta ? "" : `<div class="gauge small" style="--score:${tx.risk_score};--tone:${meta.tone}"><div><strong>${tx.risk_score}</strong><small>de 100</small></div></div>`}
      <div>${riskBadge(tx)}<p class="muted small">${tx.whitelisted ? "Origem ou destino está na sua whitelist: a análise foi dispensada." : meta ? e(meta.text) : tx.status === "failed" ? "A análise falhou repetidas vezes. Você pode pedir uma nova análise." : "A análise está em andamento."}</p></div>
    </div>
    <dl class="detail-grid">
      <dt>Hash</dt><dd>${addressCell(tx.hash, fmt.num ? `${tx.hash.slice(0, 14)}…${tx.hash.slice(-10)}` : tx.hash)}</dd>
      <dt>Carteira</dt><dd>${e(tx.wallet_label)} · <span class="mono-inline">${e(tx.wallet_address.slice(0, 10))}…</span></dd>
      <dt>Direção</dt><dd>${tx.direction === "in" ? "Recebida" : tx.direction === "out" ? "Enviada" : "Entre a própria carteira"}</dd>
      <dt>Origem</dt><dd>${addressCell(tx.from_address)}</dd>
      <dt>Destino</dt><dd>${addressCell(tx.to_address)}</dd>
      <dt>Valor</dt><dd><strong>${fmt.num(tx.value, 8)} ${e(tx.asset)}</strong>${tx.contract_address ? ` <span class="muted small">(contrato ${e(tx.contract_address.slice(0, 10))}…)</span>` : ""}</dd>
      <dt>Momento</dt><dd>${fmt.date(tx.occurred_at)}${tx.block_number ? ` · bloco ${tx.block_number}` : ""}</dd>
      <dt>Fonte</dt><dd>${tx.source === "alchemy" ? "Webhook do Alchemy" : "Sincronização on-chain"} · analisada ${tx.analyzed_at ? fmt.date(tx.analyzed_at) : "—"}</dd>
    </dl>
    <h3 class="section-title">Por que essa nota?</h3>
    ${tx.status === "analyzed" || tx.whitelisted ? factorList(tx.risk_factors, tx.risk_notes) : `<p class="muted">Sem resultado de análise ainda.</p>`}
    <div class="disclaimer"><span data-icon="info"></span><span>Classificação estimada a partir de heurísticas e dados públicos. Não é garantia nem prova de golpe.</span></div>
    <div class="modal-inline-actions">
      <a class="btn ghost" href="${etherscanTx(e(tx.hash))}" target="_blank" rel="noreferrer"><span data-icon="external"></span>Ver no Etherscan</a>
      <button class="btn ghost" type="button" data-reanalyze><span data-icon="refresh"></span>Analisar de novo</button>
    </div>`;
  const { dialog, close } = openModal({ title: "Detalhes da transação", eyebrow: tx.direction === "in" ? "Recebimento" : "Envio", iconName: "activity", body, wide: true, hideSubmit: true, cancelLabel: "Fechar" });
  dialog.querySelector("[data-reanalyze]").addEventListener("click", async () => {
    try {
      await app.api.post(`/api/transactions/${tx.id}/reanalyze`);
      app.toast("Transação enviada para nova análise.");
      close();
      onChange?.();
    } catch (error) {
      app.toast(error.message, "error");
    }
  });
}
