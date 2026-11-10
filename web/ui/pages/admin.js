// Administração: usuários, base de endereços maliciosos (+ listas públicas), motor de risco,
// corretoras/ativos/taxas, log de alterações e fila de mensagens mortas.
import { confirmDialog, e, emptyState, fmt, icon, metricCard, openModal, pageHeading, short } from "../components/ui.js";

const TABS = [
  ["overview", "grid", "Visão geral"],
  ["users", "users", "Usuários"],
  ["malicious", "database", "Endereços maliciosos"],
  ["risk", "sliders", "Motor de risco"],
  ["exchanges", "chart", "Corretoras e taxas"],
  ["log", "list", "Log de alterações"],
  ["queue", "inbox", "Fila"],
];
const WEIGHT_LABELS = {
  blacklist: ["Lista negra", "Endereço/contrato na base local de golpes"],
  reputation: ["Reputação", "Flags do GoPlus (phishing, sancionado, mixer…)"],
  similarity: ["Similaridade", "Address poisoning: mesmo início e fim de um endereço conhecido"],
  approvals: ["Approvals", "Aprovação ilimitada de tokens"],
  dust: ["Dust", "Valor ínfimo recebido"],
  walletAge: ["Idade da carteira", "Contraparte nova ou sem histórico"],
};

export default async function admin(root, app, route) {
  let tab = TABS.some(t => t[0] === route.params[0]) ? route.params[0] : "overview";
  root.innerHTML = `${pageHeading("Administrador", "Administração", "Usuários, base de endereços maliciosos, parâmetros do Motor de Risco, corretoras, ativos e taxas. Toda alteração fica registrada no log.")}
    <nav class="tabs" data-tabs>${TABS.map(([id, ic, label]) => `<a href="#/admin/${id}" data-tab="${id}" class="${id === tab ? "active" : ""}">${icon(ic)}${label}</a>`).join("")}</nav>
    <div data-panel></div>`;
  const panel = root.querySelector("[data-panel]");
  const api = app.api;
  const fail = error => app.toast(error.message, "error");

  const views = {
    async overview() {
      const o = await api.get("/api/admin/overview");
      panel.innerHTML = `<section class="grid cols-4">
          ${metricCard("users", "Usuários", o.users, `${o.wallets} carteiras · ${o.monitoredWallets} monitoradas`, "var(--purple)")}
          ${metricCard("activity", "Transações", o.transactions, `<span class="bad">${o.highRiskTransactions} de alto risco</span>`, "var(--blue)")}
          ${metricCard("database", "Endereços maliciosos", fmt.num(o.maliciousAddresses, 0), o.maliciousBySource.slice(0, 3).map(s => `${e(s.source)}: ${fmt.num(s.n, 0)}`).join(" · ") || "base vazia", "var(--red)")}
          ${metricCard("inbox", "Fila", o.queue.pending ?? 0, `${o.queue.dead ? `<span class="bad">${o.queue.dead} na fila de mortas</span>` : '<span class="good">nenhuma mensagem morta</span>'}`, "var(--amber)")}
        </section>
        <div class="grid cols-2" style="margin-top:16px">
          <div class="card"><div class="card-header"><div><h2>Integrações</h2><p>Como este servidor está configurado</p></div></div><div class="kv">
            <div><span>Webhook do Alchemy</span><b>${o.integrations.alchemyWebhook ? '<span class="status low">configurado</span>' : '<span class="status medium">não configurado (Job de sincronização ativo)</span>'}</b></div>
            <div><span>Assinatura HMAC do webhook</span><b>${o.integrations.alchemySigning ? '<span class="status low">chave definida</span>' : '<span class="status medium">sem chave</span>'}</b></div>
            <div><span>Reputação</span><b>GoPlus</b></div>
            <div><span>Dados da conta (idade/histórico)</span><b>${e(o.integrations.explorer)}</b></div>
            <div><span>Snapshots de livros guardados</span><b>${fmt.num(o.snapshots, 0)}</b></div>
          </div></div>
          <div class="card"><div class="card-header"><div><h2>Jobs</h2><p>Execuções agendadas</p></div></div><div class="kv">
            ${Object.entries(o.jobs).map(([name, j]) => `<div><span>${e(name)} <small class="muted">a cada ${j.intervalMs >= 60000 ? `${Math.round(j.intervalMs / 60000)} min` : `${Math.round(j.intervalMs / 1000)} s`}</small></span><b>${j.lastError ? `<span class="status high" title="${e(j.lastError)}">erro</span>` : j.lastRunAt ? `<span class="muted">${fmt.ago(j.lastRunAt)}</span>` : '<span class="muted">aguardando</span>'}</b></div>`).join("") || '<div><span class="muted">Jobs desligados (JOBS=off).</span></div>'}
          </div></div>
        </div>`;
    },

    async users() {
      const users = await api.get("/api/admin/users");
      panel.innerHTML = `<div class="card"><div class="table-wrap"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th>2FA</th><th>Carteiras</th><th>Último login</th><th></th></tr></thead><tbody>
        ${users.map(u => `<tr><td><div class="identity"><span class="identity-icon">${icon("user")}</span><span><strong>${e(u.name)}${u.id === app.user.id ? ' <em class="live-tag">VOCÊ</em>' : ""}</strong><small>${e(u.email)}</small></span></div></td>
          <td>${u.role === "admin" ? '<span class="status neutral">Admin</span>' : "Usuário"}</td>
          <td>${u.status === "active" ? '<span class="status low">Ativo</span>' : '<span class="status high">Bloqueado</span>'}</td>
          <td>${u.totp_enabled ? "Sim" : "Não"}</td><td>${u.wallet_count} · ${u.tx_count} tx</td><td>${u.last_login_at ? fmt.ago(u.last_login_at) : "—"}</td>
          <td><div class="row-actions">${u.id === app.user.id ? "" : `
            <button class="btn ghost compact" data-user-status="${u.id}" data-next="${u.status === "active" ? "blocked" : "active"}">${u.status === "active" ? "Bloquear" : "Desbloquear"}</button>
            <button class="btn ghost compact" data-user-role="${u.id}" data-next="${u.role === "admin" ? "customer" : "admin"}">${u.role === "admin" ? "Tornar usuário" : "Tornar admin"}</button>
            <button class="mini-button danger" data-user-delete="${u.id}" data-email="${e(u.email)}" title="Remover">${icon("trash")}</button>`}</div></td></tr>`).join("")}
      </tbody></table></div></div>`;
    },

    async malicious(search = "") {
      const [list, sources, categories] = await Promise.all([api.get("/api/admin/malicious", { search, limit: 50 }), api.get("/api/admin/list-sources"), api.get("/api/admin/malicious/categories")]);
      panel.innerHTML = `<div class="grid main-grid">
        <div class="card">
          <div class="toolbar"><div class="search">${icon("search")}<input data-mal-search value="${e(search)}" placeholder="Buscar endereço ou rótulo…" /></div><button class="btn primary" data-mal-add>${icon("plus")} Incluir</button></div>
          ${list.items.length ? `<div class="table-wrap"><table><thead><tr><th>Endereço</th><th>Rótulo</th><th>Categoria</th><th>Fonte</th><th></th></tr></thead><tbody>
            ${list.items.map(m => `<tr><td class="mono">${short(m.address, 10, 8)} <button class="mini-button tiny" data-copy="${e(m.address)}">${icon("copy")}</button></td><td>${e(m.label ?? "—")}</td><td><span class="status high">${e(m.category)}</span></td><td>${e(m.source)}</td>
              <td><div class="row-actions"><button class="mini-button" data-mal-edit="${m.id}" title="Editar">${icon("edit")}</button><button class="mini-button danger" data-mal-delete="${m.id}" title="Remover">${icon("trash")}</button></div></td></tr>`).join("")}
          </tbody></table></div><p class="muted small pad-x">${fmt.num(list.total, 0)} endereço(s)${list.total > list.items.length ? `, mostrando os ${list.items.length} mais recentes. Use a busca para filtrar.` : ""}</p>` : emptyState("database", "Nada encontrado", "Inclua endereços manualmente ou importe as listas públicas.")}
        </div>
        <div class="card"><div class="card-header"><div><h2>Listas públicas</h2><p>Importadas em lote pelo Job (a cada 6 h)</p></div><button class="btn ghost compact" data-sync-all>${icon("download")} Importar agora</button></div>
          <div class="source-list">${sources.map(s => `<div class="source-item"><div><b>${e(s.name)}</b> ${s.enabled ? "" : '<span class="status neutral">desativada</span>'}<small class="mono">${e(s.url)}</small>
            <small>${s.last_sync_at ? `${fmt.ago(s.last_sync_at)} · ${s.last_status === "ok" ? `${fmt.num(s.last_count, 0)} endereços` : e(s.last_status)}` : "nunca sincronizada"}</small></div>
            <div class="row-actions"><button class="mini-button" data-src-toggle="${s.id}" data-enabled="${s.enabled}" title="${s.enabled ? "Desativar" : "Ativar"}">${icon(s.enabled ? "pause" : "play")}</button><button class="mini-button danger" data-src-delete="${s.id}" title="Remover fonte">${icon("trash")}</button></div></div>`).join("")}</div>
          <div class="pad"><button class="btn ghost compact" data-src-add>${icon("plus")} Nova fonte</button></div>
        </div></div>`;
      panel.dataset.categories = JSON.stringify(categories);
    },

    async risk() {
      const p = await api.get("/api/admin/risk-params");
      panel.innerHTML = `<form class="card form-card" data-risk-form>
        <h2>Pesos das regras</h2><p>Cada regra disparada soma peso × severidade (0 a 1). A soma, limitada a 100, define o nível pelos limiares abaixo.</p>
        <div class="weights">${Object.entries(WEIGHT_LABELS).map(([key, [label, help]]) => `
          <label class="weight"><span><b>${label}</b><small>${help}</small></span><input type="range" min="0" max="100" name="w.${key}" value="${p.weights[key]}" /><output>${p.weights[key]}</output></label>`).join("")}</div>
        <div class="form-grid" style="margin-top:20px">
          <label>Risco médio a partir de <input type="number" min="1" max="99" name="t.medium" value="${p.thresholds.medium}" /></label>
          <label>Risco alto a partir de <input type="number" min="2" max="100" name="t.high" value="${p.thresholds.high}" /></label>
          <label>Dust: ETH abaixo de <input type="number" step="any" min="0" name="dust.ethMax" value="${p.dust.ethMax}" /></label>
          <label>Dust: stablecoin abaixo de <input type="number" step="any" min="0" name="dust.stableMax" value="${p.dust.stableMax}" /></label>
          <label>Similaridade: caracteres iniciais <input type="number" min="2" max="10" name="sim.prefix" value="${p.similarity.prefix}" /></label>
          <label>Similaridade: caracteres finais <input type="number" min="2" max="10" name="sim.suffix" value="${p.similarity.suffix}" /></label>
          <label>Idade mínima da carteira (dias) <input type="number" min="0" max="365" name="age.minDays" value="${p.walletAge.minDays}" /></label>
        </div>
        <div class="modal-actions"><button class="btn ghost" type="button" data-risk-reset>Restaurar padrão</button><button class="btn primary" type="submit">Salvar parâmetros</button></div>
      </form>`;
      panel.querySelectorAll('input[type="range"]').forEach(r => r.addEventListener("input", () => (r.nextElementSibling.value = r.value)));
    },

    async exchanges() {
      const [catalog, fees] = await Promise.all([api.get("/api/admin/catalog"), api.get("/api/admin/fees")]);
      const data = fees.active?.data?.exchanges ?? {};
      const assetSymbols = catalog.assets.map(a => a.symbol);
      panel.innerHTML = `<div class="grid cols-2">
        <div class="card"><div class="card-header"><div><h2>Corretoras</h2><p>Definem o que o Job coleta</p></div><button class="btn ghost compact" data-collect>${icon("refresh")} Coletar agora</button></div><div class="kv">
          ${catalog.exchanges.map(x => `<div><span><b>${e(x.name)}</b>${x.note ? `<small class="muted">${e(x.note)}</small>` : ""}</span><label class="switch"><input type="checkbox" data-exchange="${x.id}" ${x.enabled ? "checked" : ""} /><i></i></label></div>`).join("")}</div></div>
        <div class="card"><div class="card-header"><div><h2>Ativos</h2><p>Habilitados no painel e no simulador</p></div></div><div class="kv">
          ${catalog.assets.map(a => `<div><span><b>${e(a.symbol)}</b> <small class="muted">${e(a.name)}${a.contract_address ? ` · ${short(a.contract_address)}` : ""}</small></span><label class="switch"><input type="checkbox" data-asset="${a.symbol}" ${a.enabled ? "checked" : ""} /><i></i></label></div>`).join("")}</div></div>
      </div>
      <form class="card form-card" style="margin-top:16px" data-fee-form>
        <h2>Tabela de taxas ${fees.active ? `<span class="status neutral">v${fees.active.version} ativa</span>` : ""}</h2>
        <p>Tabela estática e versionada (as APIs públicas não informam saque e rede). Salvar cria uma nova versão; as anteriores ficam no histórico.</p>
        <div class="table-wrap"><table class="fee-table"><thead><tr><th>Corretora</th><th>Taxa de negociação (%)</th>${assetSymbols.map(s => `<th>Saque ${e(s)}</th>`).join("")}</tr></thead><tbody>
          ${catalog.exchanges.map(x => `<tr><td><b>${e(x.name)}</b></td><td><input type="number" step="any" min="0" max="5" name="${x.id}.taker" value="${data[x.id] ? +(data[x.id].taker * 100).toFixed(4) : ""}" /></td>
            ${assetSymbols.map(s => `<td><input type="number" step="any" min="0" name="${x.id}.w.${s}" value="${data[x.id]?.withdrawal?.[s] ?? ""}" placeholder="—" /></td>`).join("")}</tr>`).join("")}
        </tbody></table></div>
        <label style="margin-top:14px">Nota da versão <input name="note" maxlength="200" placeholder="Ex.: atualização das taxas de saque de novembro" /></label>
        <div class="modal-actions"><button class="btn primary" type="submit">Salvar como nova versão</button></div>
        <h3 class="section-title">Versões</h3>
        <div class="kv">${fees.versions.map(v => `<div><span>v${v.version} · ${fmt.date(v.created_at)}${v.note ? ` · ${e(v.note)}` : ""}</span><b>${v.active ? '<span class="status low">ativa</span>' : `<button type="button" class="text-link" data-fee-activate="${v.version}">Ativar</button>`}</b></div>`).join("")}</div>
      </form>`;
    },

    async log() {
      const { items, total } = await api.get("/api/admin/audit-log", { limit: 200 });
      panel.innerHTML = `<div class="card">${items.length ? `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Entidade</th><th>Detalhes</th></tr></thead><tbody>
        ${items.map(l => `<tr><td>${fmt.date(l.created_at)}</td><td>${e(l.actor_email)}</td><td><span class="status neutral">${e(l.action)}</span></td><td>${e(l.entity)}${l.entity_id ? ` #${e(l.entity_id)}` : ""}</td><td class="details-cell"><code>${e(JSON.stringify(l.details ?? {})).slice(0, 220)}</code></td></tr>`).join("")}
      </tbody></table></div><p class="muted small pad-x">${total} registro(s)</p>` : emptyState("list", "Nenhuma alteração registrada", "As alterações feitas pelo Administrador aparecem aqui.")}</div>`;
    },

    async queue() {
      const q = await api.get("/api/admin/queue");
      panel.innerHTML = `<section class="grid cols-4">${["pending", "processing", "done", "dead"].map(s => metricCard(s === "dead" ? "warning" : "inbox", { pending: "Pendentes", processing: "Processando", done: "Concluídas", dead: "Mortas (DLQ)" }[s], q.stats[s] ?? 0, "", s === "dead" ? "var(--red)" : "var(--blue)")).join("")}</section>
        <div class="card" style="margin-top:16px"><div class="card-header"><div><h2>Fila de mensagens mortas</h2><p>Mensagens que falharam ${5} vezes. Reprocessar devolve à fila.</p></div></div>
        ${q.dead.length ? `<div class="table-wrap"><table><thead><tr><th>ID</th><th>Tipo</th><th>Payload</th><th>Tentativas</th><th>Último erro</th><th></th></tr></thead><tbody>
          ${q.dead.map(m => `<tr><td>#${m.id}</td><td>${e(m.type)}</td><td><code>${e(JSON.stringify(m.payload))}</code></td><td>${m.attempts}</td><td class="details-cell">${e(m.last_error ?? "")}</td><td><button class="btn ghost compact" data-retry="${m.id}">${icon("refresh")} Reprocessar</button></td></tr>`).join("")}
        </tbody></table></div>` : emptyState("check", "Nenhuma mensagem morta", "Todas as transações recebidas foram processadas.")}</div>`;
    },
  };

  async function show(name) {
    tab = name;
    root.querySelectorAll("[data-tab]").forEach(a => a.classList.toggle("active", a.dataset.tab === name));
    panel.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    try { await views[name](); } catch (error) { panel.innerHTML = `<div class="card pad">${e(error.message)}</div>`; }
  }

  const maliciousForm = (m = {}) => {
    const categories = JSON.parse(panel.dataset.categories || "[]");
    return `${m.id ? `<p class="modal-copy mono">${e(m.address)}</p>` : `<label>Endereço <input name="address" required spellcheck="false" placeholder="0x…" /></label>`}
      <label>Rótulo <input name="label" maxlength="80" value="${e(m.label ?? "")}" placeholder="Ex.: Fake phishing #123" /></label>
      <label>Categoria <select name="category">${categories.map(c => `<option ${c === (m.category ?? "scam") ? "selected" : ""}>${e(c)}</option>`).join("")}</select></label>`;
  };

  let searchTimer;
  panel.addEventListener("input", event => {
    if (event.target.matches("[data-mal-search]")) {
      clearTimeout(searchTimer);
      const value = event.target.value;
      searchTimer = setTimeout(async () => { await views.malicious(value).catch(fail); const input = panel.querySelector("[data-mal-search]"); input.focus(); input.setSelectionRange(value.length, value.length); }, 300);
    }
  });

  panel.addEventListener("change", async event => {
    const t = event.target;
    try {
      if (t.dataset.exchange) { await api.patch(`/api/admin/exchanges/${t.dataset.exchange}`, { enabled: t.checked }); app.toast("Corretora atualizada."); }
      if (t.dataset.asset) { await api.patch(`/api/admin/assets/${t.dataset.asset}`, { enabled: t.checked }); app.toast("Ativo atualizado."); }
    } catch (error) { t.checked = !t.checked; fail(error); }
  });

  panel.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form));
    try {
      if (form.matches("[data-risk-form]")) {
        const weights = Object.fromEntries(Object.keys(WEIGHT_LABELS).map(k => [k, Number(data[`w.${k}`])]));
        await api.put("/api/admin/risk-params", {
          weights, thresholds: { medium: Number(data["t.medium"]), high: Number(data["t.high"]) },
          dust: { ethMax: Number(data["dust.ethMax"]), stableMax: Number(data["dust.stableMax"]) },
          similarity: { prefix: Number(data["sim.prefix"]), suffix: Number(data["sim.suffix"]) },
          walletAge: { minDays: Number(data["age.minDays"]) },
        });
        app.toast("Parâmetros salvos. Valem para as próximas análises.");
        show("risk");
      }
      if (form.matches("[data-fee-form]")) {
        const exchanges = {};
        for (const [key, value] of Object.entries(data)) {
          const [id, kind, asset] = key.split(".");
          if (key === "note" || value === "") continue;
          exchanges[id] ??= { taker: 0, withdrawal: {} };
          if (kind === "taker") exchanges[id].taker = Number(value) / 100;
          if (kind === "w") exchanges[id].withdrawal[asset] = Number(value);
        }
        const table = await api.post("/api/admin/fees", { data: { exchanges }, note: data.note });
        app.toast(`Tabela de taxas v${table.version} criada e ativada.`);
        show("exchanges");
      }
    } catch (error) { fail(error); }
  });

  panel.addEventListener("click", async event => {
    const t = event.target.closest("button");
    if (!t) return;
    const d = t.dataset;
    try {
      if (d.userStatus) { await api.patch(`/api/admin/users/${d.userStatus}`, { status: d.next }); app.toast(d.next === "blocked" ? "Usuário bloqueado (sessões encerradas)." : "Usuário desbloqueado."); show("users"); }
      if (d.userRole) { await api.patch(`/api/admin/users/${d.userRole}`, { role: d.next }); app.toast("Perfil alterado."); show("users"); }
      if (d.userDelete) {
        if (!(await confirmDialog({ title: "Remover usuário", message: `Remover <b>${e(d.email)}</b> e todos os dados dele?`, confirmLabel: "Remover", danger: true }))) return;
        await api.del(`/api/admin/users/${d.userDelete}`); app.toast("Usuário removido."); show("users");
      }
      if (t.hasAttribute("data-mal-add")) openModal({ title: "Incluir endereço malicioso", iconName: "database", body: maliciousForm(), submitLabel: "Incluir", onSubmit: async f => { await api.post("/api/admin/malicious", Object.fromEntries(f)); app.toast("Endereço incluído na base."); show("malicious"); } });
      if (d.malEdit) {
        const m = await api.get(`/api/admin/malicious/${Number(d.malEdit)}`);
        openModal({ title: "Editar endereço", iconName: "edit", body: maliciousForm(m), onSubmit: async f => { await api.put(`/api/admin/malicious/${m.id}`, Object.fromEntries(f)); app.toast("Endereço atualizado."); show("malicious"); } });
      }
      if (d.malDelete) {
        if (!(await confirmDialog({ title: "Remover da base", message: "Remover este endereço da base de endereços maliciosos?", confirmLabel: "Remover", danger: true }))) return;
        await api.del(`/api/admin/malicious/${d.malDelete}`); app.toast("Endereço removido."); show("malicious");
      }
      if (t.hasAttribute("data-sync-all")) {
        t.disabled = true;
        t.innerHTML = `<span class="spinner tiny"></span> Importando…`;
        const results = await api.post("/api/admin/list-sources/sync", {});
        app.toast(results.map(r => (r.ok ? `${r.name}: ${r.inserted} novo(s) de ${r.total}` : `${r.name}: ${r.error}`)).join(" · "), results.every(r => r.ok) ? "success" : "error");
        show("malicious");
      }
      if (t.hasAttribute("data-src-add")) openModal({ title: "Nova fonte de lista pública", iconName: "download", body: `<label>Nome <input name="name" required maxlength="60" /></label><label>URL (HTTPS) <input name="url" required placeholder="https://…" /></label><p class="helper">Qualquer arquivo JSON ou texto: o importador extrai todos os endereços 0x… encontrados.</p>`, submitLabel: "Adicionar", onSubmit: async f => { await api.post("/api/admin/list-sources", Object.fromEntries(f)); app.toast("Fonte adicionada."); show("malicious"); } });
      if (d.srcToggle) { await api.put(`/api/admin/list-sources/${d.srcToggle}`, { enabled: d.enabled !== "1" }); show("malicious"); }
      if (d.srcDelete) {
        if (!(await confirmDialog({ title: "Remover fonte", message: "Os endereços já importados continuam na base.", confirmLabel: "Remover", danger: true }))) return;
        await api.del(`/api/admin/list-sources/${d.srcDelete}`); show("malicious");
      }
      if (t.hasAttribute("data-risk-reset")) {
        if (!(await confirmDialog({ title: "Restaurar padrão", message: "Voltar pesos e limiares para os valores padrão?", confirmLabel: "Restaurar" }))) return;
        await api.post("/api/admin/risk-params/reset"); app.toast("Parâmetros restaurados."); show("risk");
      }
      if (t.hasAttribute("data-collect")) { const r = await api.post("/api/admin/quotes/collect"); app.toast(`Coleta concluída: ${r.ok} ok, ${r.failed} falha(s).`, r.failed ? "error" : "success"); }
      if (d.feeActivate) { await api.post(`/api/admin/fees/${d.feeActivate}/activate`); app.toast(`Tabela v${d.feeActivate} ativada.`); show("exchanges"); }
      if (d.retry) { await api.post(`/api/admin/queue/${d.retry}/retry`); app.toast("Mensagem devolvida à fila."); show("queue"); }
    } catch (error) { fail(error); show(tab); }
  });

  root.querySelector("[data-tabs]").addEventListener("click", event => {
    const a = event.target.closest("[data-tab]");
    if (!a) return;
    event.preventDefault();
    history.replaceState(null, "", `#/admin/${a.dataset.tab}`);
    show(a.dataset.tab);
  });
  await show(tab);
}
