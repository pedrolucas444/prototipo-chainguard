// Componentes de interface reutilizados pelas páginas (geram HTML a partir de dados).
import { icon } from "./icons.js";

export { icon };

export const e = (value = "") => String(value ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
export const short = (v, a = 6, b = 4) => (v ? `${v.slice(0, a)}…${v.slice(-b)}` : "—");

const nf = (min, max) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });
export const fmt = {
  num: (v, max = 6) => (v === null || v === undefined || Number.isNaN(v) ? "—" : nf(0, max).format(v)),
  money: (v, asset) => {
    if (v === null || v === undefined) return "—";
    const digits = ["BRL", "USDT", "USDC"].includes(asset) ? 2 : 6;
    return `${nf(digits === 2 ? 2 : 0, digits).format(v)} ${asset ?? ""}`.trim();
  },
  price: v => (v === null || v === undefined ? "—" : nf(2, v < 10 ? 5 : 2).format(v)),
  pct: (v, digits = 2) => (v === null || v === undefined ? "—" : `${nf(0, digits).format(v)}%`),
  date: iso => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"),
  time: iso => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"),
  ago: iso => {
    if (!iso) return "—";
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return `há ${s}s`;
    if (s < 3600) return `há ${Math.floor(s / 60)} min`;
    if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
    return `há ${Math.floor(s / 86400)} d`;
  },
};

export const RISK = {
  low: { label: "Baixo risco", tone: "var(--green)", text: "Nenhum indício relevante foi encontrado nesta análise." },
  medium: { label: "Risco médio", tone: "var(--amber)", text: "Há sinais que merecem revisão antes de prosseguir." },
  high: { label: "Alto risco", tone: "var(--red)", text: "Recomendamos não prosseguir sem verificação adicional." },
};

export function riskBadge(tx) {
  if (tx.whitelisted) return `<span class="status neutral">Whitelist</span>`;
  if (tx.status === "removed") return `<span class="status neutral">Removida (reorg)</span>`;
  if (tx.status === "pending") return `<span class="status neutral">Analisando…</span>`;
  if (tx.status === "failed") return `<span class="status medium">Falha na análise</span>`;
  const level = tx.risk_level ?? tx.level;
  return level ? `<span class="status ${level}">${RISK[level].label}</span>` : `<span class="status neutral">—</span>`;
}
export const levelBadge = level => (level ? `<span class="status ${level}">${RISK[level].label}</span>` : `<span class="status neutral">Whitelist</span>`);

export function pageHeading(eyebrow, title, copy, actions = "") {
  return `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${copy}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ""}</div>`;
}
export const emptyState = (iconName, title, copy, action = "") => `<div class="empty-state"><div class="empty-icon">${icon(iconName)}</div><h3>${title}</h3><p>${copy}</p>${action}</div>`;
export const metricCard = (iconName, label, value, foot, tone = "var(--accent)") => `<article class="card metric" style="--tone:${tone};--glow:color-mix(in srgb, ${tone} 12%, transparent)"><div class="metric-head"><span>${label}</span><span class="metric-icon">${icon(iconName)}</span></div><div class="metric-value">${value}</div><div class="metric-foot">${foot}</div></article>`;
export const banner = (iconName, html, tone = "") => `<div class="scope-banner ${tone}">${icon(iconName)}<div>${html}</div></div>`;
export const disclaimer = text => `<div class="disclaimer">${icon("info")}<span>${text}</span></div>`;
export const loading = (text = "Carregando…") => `<div class="empty-state"><div class="spinner"></div><p>${text}</p></div>`;
export const etherscanTx = hash => `https://etherscan.io/tx/${hash}`;
export const etherscanAddr = addr => `https://etherscan.io/address/${addr}`;

export function addressCell(address, label) {
  if (!address) return "—";
  return `<span class="addr" title="${e(address)}"><span class="mono-inline">${e(label ?? short(address, 8, 6))}</span><button class="mini-button tiny" data-copy="${e(address)}" aria-label="Copiar endereço">${icon("copy")}</button></span>`;
}

/** Lista de fatores do Motor de Risco (explicação da nota). */
export function factorList(factors = [], notes = []) {
  const items = factors.map(f => `
    <div class="factor">
      <span style="color:${f.points ? "var(--red)" : "var(--muted)"};background:${f.points ? "rgba(255,93,114,.08)" : "rgba(255,255,255,.04)"}">${icon(f.points ? "warning" : "info")}</span>
      <span><strong>${e(f.title)}</strong><small>${e(f.detail)}</small><small class="rule-tag">${e(f.ruleLabel ?? f.rule)}</small></span>
      <b>${f.points ? `+${f.points}` : "0"}</b>
    </div>`).join("");
  const noteItems = notes.map(n => `<div class="note">${icon("info")}<span>${e(n)}</span></div>`).join("");
  if (!items && !noteItems) return `<div class="factor-list"><div class="factor ok"><span style="color:var(--green);background:rgba(68,213,154,.08)">${icon("check")}</span><span><strong>Nenhum fator de risco disparado</strong><small>As regras configuradas não encontraram sinais suspeitos.</small></span><b>0</b></div></div>`;
  return `<div class="factor-list">${items}${noteItems}</div>`;
}

/** Cartão de resultado (verificar destino). */
export function riskResultCard(result) {
  if (result.whitelisted) {
    return `<div class="analysis-result"><div class="result-score"><div class="gauge" style="--score:0;--tone:var(--blue)"><div><strong>—</strong><small>whitelist</small></div></div>
      <div><span class="status neutral">Na whitelist</span><h2>${e(result.whitelistLabel ?? "Endereço confiável")}</h2><p>O endereço está na sua whitelist, então a análise foi dispensada.</p></div></div>
      ${factorList([], result.notes)}${disclaimer("A whitelist dispensa a análise. Se esse endereço for comprometido, o ChainGuard não vai alertar.")}</div>`;
  }
  const meta = RISK[result.level];
  return `<div class="analysis-result"><div class="result-score"><div class="gauge" style="--score:${result.score};--tone:${meta.tone}"><div><strong>${result.score}</strong><small>de 100</small></div></div>
    <div>${levelBadge(result.level)}<h2>${meta.label}</h2><p>${meta.text}</p><p class="muted small">Limiares: médio a partir de ${result.thresholds?.medium}, alto a partir de ${result.thresholds?.high}.</p></div></div>
    ${factorList(result.factors, result.notes)}
    ${disclaimer(e(result.disclaimer ?? "Classificação estimada a partir de heurísticas e dados públicos. Não é garantia."))}</div>`;
}

// ---------------- Toast ----------------
export function toast(message, type = "success") {
  const region = document.getElementById("toast-region");
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.innerHTML = `${icon(type === "error" ? "warning" : type === "info" ? "info" : "check")}<span>${e(message)}</span>`;
  region.append(node);
  setTimeout(() => node.remove(), type === "error" ? 6000 : 4000);
}

// ---------------- Modal genérico ----------------
/**
 * Abre um <dialog> com formulário. onSubmit(formData, dialog) pode lançar erro (mostrado no rodapé);
 * se resolver sem erro, o modal fecha.
 */
export function openModal({ title, eyebrow = "", iconName = "info", tone = "", body, submitLabel = "Salvar", submitClass = "primary", onSubmit, onOpen, wide = false, cancelLabel = "Cancelar", hideSubmit = false }) {
  const dialog = document.createElement("dialog");
  dialog.className = `modal${wide ? " wide" : ""}`;
  dialog.innerHTML = `<form method="dialog" novalidate>
    <div class="modal-head"><div class="modal-icon ${tone}">${icon(iconName)}</div><div><span class="eyebrow">${eyebrow}</span><h2>${title}</h2></div><button class="icon-button" value="cancel" type="button" data-close aria-label="Fechar">${icon("x")}</button></div>
    <div class="modal-body">${body}</div>
    <p class="field-error" data-error></p>
    <div class="modal-actions"><button class="btn ghost" type="button" data-close>${cancelLabel}</button>${hideSubmit ? "" : `<button class="btn ${submitClass}" type="submit">${submitLabel}</button>`}</div>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form");
  const errorNode = dialog.querySelector("[data-error]");
  const close = () => { dialog.close(); dialog.remove(); };
  dialog.addEventListener("cancel", () => setTimeout(() => dialog.remove(), 0));
  dialog.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", close));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!onSubmit) return close();
    const submit = form.querySelector('[type="submit"]');
    errorNode.textContent = "";
    submit && (submit.disabled = true);
    try {
      const keepOpen = await onSubmit(new FormData(form), { dialog, form, close, setError: m => (errorNode.textContent = m) });
      if (keepOpen !== true) close();
    } catch (error) {
      errorNode.textContent = error.message;
      if (error.details) for (const [field, msg] of Object.entries(error.details)) {
        const input = form.querySelector(`[name="${field}"]`);
        if (input) input.setAttribute("aria-invalid", "true"), (errorNode.textContent = `${error.message} ${msg}`);
      }
    } finally {
      submit && (submit.disabled = false);
    }
  });
  dialog.showModal();
  onOpen?.({ dialog, form, close });
  return { dialog, form, close };
}

export function confirmDialog({ title, message, confirmLabel = "Confirmar", danger = false, requirePassword = false }) {
  return new Promise(resolve => {
    let done = false;
    const { dialog } = openModal({
      title, eyebrow: "Confirmação", iconName: danger ? "warning" : "info", tone: danger ? "" : "success",
      body: `<p class="modal-copy">${message}</p>${requirePassword ? `<label>Sua senha <input name="password" type="password" autocomplete="current-password" required /></label>` : ""}`,
      submitLabel: confirmLabel, submitClass: danger ? "danger" : "primary",
      onSubmit: data => { done = true; resolve(requirePassword ? { password: data.get("password") } : true); },
    });
    dialog.addEventListener("close", () => { if (!done) resolve(false); });
  });
}

export function bindCopy(root) {
  root.addEventListener("click", async event => {
    const btn = event.target.closest("[data-copy]");
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      toast("Copiado para a área de transferência.");
    } catch {
      toast("Não foi possível copiar.", "error");
    }
  });
}

/** Tabela de transações (dashboard e tela de transações). */
export function txTable(items, { compact = false } = {}) {
  if (!items.length) return emptyState("activity", "Nenhuma transação ainda", "Quando houver atividade nas carteiras monitoradas, ela aparece aqui com o nível de risco e a explicação.");
  return `<div class="table-wrap"><table><thead><tr><th>Movimento</th><th>Contraparte</th><th>Valor</th><th>Risco</th><th>Data</th>${compact ? "" : "<th></th>"}</tr></thead><tbody>
    ${items.map(tx => `<tr class="clickable" data-tx="${tx.id}">
      <td><div class="identity"><span class="identity-icon ${tx.direction}">${icon(tx.direction === "in" ? "arrowIn" : tx.direction === "out" ? "arrowOut" : "refresh")}</span><span><strong>${tx.direction === "in" ? "Recebido" : tx.direction === "out" ? "Enviado" : "Própria carteira"}</strong><small>${e(tx.wallet_label ?? "")} · ${short(tx.hash, 8, 6)}</small></span></div></td>
      <td class="mono">${short(tx.counterparty, 8, 6)}</td>
      <td><strong>${fmt.num(tx.value)} ${e(tx.asset)}</strong></td>
      <td><div class="score-cell">${riskBadge(tx)}${tx.risk_score !== null && tx.risk_score !== undefined && !tx.whitelisted ? `<b>${tx.risk_score}</b>` : ""}</div></td>
      <td>${fmt.date(tx.occurred_at)}</td>
      ${compact ? "" : `<td><div class="row-actions"><a class="mini-button" href="${etherscanTx(e(tx.hash))}" target="_blank" rel="noreferrer" aria-label="Abrir no Etherscan">${icon("external")}</a></div></td>`}
    </tr>`).join("")}
  </tbody></table></div>`;
}
