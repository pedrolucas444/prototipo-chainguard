import { e, icon, pageHeading, txTable } from "../components/ui.js";
import { openTransactionDetail } from "../components/tx-detail.js";

const PAGE = 25;

export default async function transactions(root, app, route) {
  const filters = { level: route.query.level ?? "", from: "", to: "", address: route.query.address ?? "", walletId: route.query.walletId ?? "", offset: 0 };
  const wallets = await app.api.get("/api/wallets");

  root.innerHTML = `${pageHeading("Classificação de risco", "Transações", "Todas as transações das suas carteiras, com o nível de risco e os fatores que motivaram a nota. Clique em uma linha para ver os detalhes.")}
    <div class="card">
      <form class="toolbar filters" data-filters>
        <div class="search">${icon("search")}<input name="address" value="${e(filters.address)}" placeholder="Endereço ou hash…" spellcheck="false" /></div>
        <select name="level" aria-label="Nível de risco">
          <option value="">Todos os níveis</option><option value="high">Alto risco</option><option value="medium">Risco médio</option><option value="low">Baixo risco</option><option value="whitelisted">Ignoradas (whitelist)</option><option value="pending">Em análise / falha</option>
        </select>
        <select name="walletId" aria-label="Carteira"><option value="">Todas as carteiras</option>${wallets.map(w => `<option value="${w.id}">${e(w.label)}</option>`).join("")}</select>
        <label class="inline-label">De <input type="date" name="from" /></label>
        <label class="inline-label">Até <input type="date" name="to" /></label>
        <button class="btn ghost" type="reset">${icon("x")} Limpar</button>
      </form>
      <div data-list></div>
      <div class="pager" data-pager></div>
    </div>`;
  const form = root.querySelector("[data-filters]");
  form.level.value = filters.level;
  form.walletId.value = filters.walletId;

  // Datas do filtro no fuso do navegador (início e fim do dia local), enviadas em ISO/UTC.
  const localDay = (value, endOfDay) => {
    if (!value) return "";
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d, ...(endOfDay ? [23, 59, 59, 999] : [0, 0, 0, 0])).toISOString();
  };

  async function load() {
    const { total, items } = await app.api.get("/api/transactions", { ...filters, from: localDay(filters.from, false), to: localDay(filters.to, true), limit: PAGE });
    root.querySelector("[data-list]").innerHTML = txTable(items);
    const page = Math.floor(filters.offset / PAGE) + 1;
    const pages = Math.max(1, Math.ceil(total / PAGE));
    root.querySelector("[data-pager]").innerHTML = total > PAGE
      ? `<span class="muted small">${total} transações · página ${page} de ${pages}</span><div><button class="btn ghost compact" data-prev ${page <= 1 ? "disabled" : ""}>← Anterior</button><button class="btn ghost compact" data-next ${page >= pages ? "disabled" : ""}>Próxima →</button></div>`
      : `<span class="muted small">${total} transação(ões)</span>`;
  }

  let debounce;
  form.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      Object.assign(filters, Object.fromEntries(new FormData(form)), { offset: 0 });
      load().catch(err => app.toast(err.message, "error"));
    }, 250);
  });
  form.addEventListener("reset", () => setTimeout(() => form.dispatchEvent(new Event("input")), 0));
  form.addEventListener("submit", ev => ev.preventDefault());
  root.addEventListener("click", event => {
    if (event.target.closest("[data-prev]")) { filters.offset = Math.max(0, filters.offset - PAGE); load(); }
    if (event.target.closest("[data-next]")) { filters.offset += PAGE; load(); }
    const row = event.target.closest("[data-tx]");
    if (row && !event.target.closest("a,[data-copy]")) openTransactionDetail(app, row.dataset.tx, { onChange: load }).catch(err => app.toast(err.message, "error"));
  });

  await load();
  app.onPoll(load);
}
