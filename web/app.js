// Web App (SPA): bootstrap, sessão, roteamento por hash e polling.
import { createApiClient } from "./services/api-client.js";
import { createWalletConnector } from "./services/wallet-connector.js";
import { icons } from "./ui/components/icons.js";
import { bindCopy, e, toast } from "./ui/components/ui.js";
import { renderAuth } from "./ui/pages/auth.js";
import { openSendModal } from "./ui/components/send-modal.js";

const ROUTES = {
  dashboard: { title: "Dashboard", load: () => import("./ui/pages/dashboard.js") },
  carteiras: { title: "Carteiras", load: () => import("./ui/pages/wallets.js") },
  transacoes: { title: "Transações", load: () => import("./ui/pages/transactions.js") },
  alertas: { title: "Alertas", load: () => import("./ui/pages/alerts.js") },
  analisar: { title: "Analisar destino", load: () => import("./ui/pages/analyze.js") },
  whitelist: { title: "Whitelist", load: () => import("./ui/pages/whitelist.js") },
  envios: { title: "Envios", load: () => import("./ui/pages/sends.js") },
  cotacoes: { title: "Painel de preços", load: () => import("./ui/pages/quotes.js") },
  simulador: { title: "Simulador de troca", load: () => import("./ui/pages/simulator.js") },
  conta: { title: "Minha conta", load: () => import("./ui/pages/account.js") },
  admin: { title: "Administração", load: () => import("./ui/pages/admin.js"), admin: true },
};

const NAV = [
  { label: "Visão geral", items: [["dashboard", "grid", "Dashboard"], ["carteiras", "wallet", "Carteiras", "wallet-count"], ["transacoes", "activity", "Transações"], ["alertas", "bell", "Alertas", "alert-dot"]] },
  { label: "Proteção", items: [["analisar", "scan", "Analisar destino"], ["whitelist", "shield", "Whitelist"], ["envios", "send", "Envios"]] },
  { label: "Cotações", items: [["cotacoes", "chart", "Painel de preços"], ["simulador", "calculator", "Simulador"]] },
  { label: "Administração", admin: true, items: [["admin", "sliders", "Administração"]] },
];

const api = createApiClient({ onUnauthorized: () => showAuth() });
const app = {
  api,
  user: null,
  config: null,
  wallet: null,
  refreshers: new Set(),
  navigate: path => { location.hash = `#/${path}`; },
  toast,
  openSend: prefill => openSendModal(app, prefill),
  refreshBadges: () => pollBadges(),
  setUser: user => { app.user = user; renderProfile(); renderNav(); },
  /** Página registra uma função chamada no polling (ex.: lista de transações). */
  onPoll: fn => { app.refreshers.add(fn); return () => app.refreshers.delete(fn); },
};

let cleanup = null;
let lastUnseen = null;

function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach(node => {
    if (!node.innerHTML.trim() && icons[node.dataset.icon]) node.innerHTML = icons[node.dataset.icon];
  });
}
new MutationObserver(records => records.forEach(r => r.addedNodes.forEach(n => n.nodeType === 1 && hydrateIcons(n)))).observe(document.body, { childList: true, subtree: true });

function renderNav() {
  const isAdmin = app.user?.role === "admin";
  document.getElementById("side-nav").innerHTML = NAV.filter(g => !g.admin || isAdmin).map(group => `
    <p class="nav-label">${group.label}</p>
    ${group.items.map(([route, iconName, label, badge]) => `<a href="#/${route}" data-route="${route}"><span data-icon="${iconName}"></span>${label}${badge === "wallet-count" ? '<span class="nav-count" id="wallet-count">0</span>' : badge === "alert-dot" ? '<span class="nav-count alert" id="alert-count" hidden>0</span>' : ""}</a>`).join("")}`).join("");
  hydrateIcons(document.getElementById("side-nav"));
  markActive();
}

function renderProfile() {
  const u = app.user;
  if (!u) return;
  document.getElementById("avatar").textContent = u.name.split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
  document.getElementById("profile-name").textContent = u.name;
  document.getElementById("profile-role").textContent = u.role === "admin" ? "Administrador" : "Usuário";
}

function currentRoute() {
  const [path, queryString = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const [name, ...rest] = path.split("/");
  return { name: ROUTES[name] ? name : "dashboard", params: rest, query: Object.fromEntries(new URLSearchParams(queryString)) };
}

function markActive() {
  const { name } = currentRoute();
  document.querySelectorAll("[data-route]").forEach(link => link.classList.toggle("active", link.dataset.route === name));
}

async function renderRoute() {
  if (!app.user) return;
  const route = currentRoute();
  const def = ROUTES[route.name];
  if (def.admin && app.user.role !== "admin") return app.navigate("dashboard");
  document.getElementById("page-crumb").textContent = def.title;
  document.title = `${def.title} · ChainGuard`;
  markActive();
  closeMobileNav();
  cleanup?.();
  cleanup = null;
  app.refreshers.clear();
  // Elemento novo a cada rota: descarta os listeners registrados pela página anterior.
  const previous = document.getElementById("app");
  const root = previous.cloneNode(false);
  previous.replaceWith(root);
  root.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
  try {
    const mod = await def.load();
    if (currentRoute().name !== route.name) return; // usuário trocou de página no meio do carregamento
    cleanup = (await mod.default(root, app, route)) ?? null;
    hydrateIcons(root);
    window.scrollTo({ top: 0 });
  } catch (error) {
    root.innerHTML = `<div class="card pad"><h2>Não foi possível carregar a página</h2><p class="muted">${e(error.message)}</p></div>`;
  }
}

async function pollBadges() {
  if (!app.user) return;
  try {
    const [alerts, wallets] = await Promise.all([api.get("/api/alerts", { unseen: "1" }), api.get("/api/wallets")]);
    const unseen = alerts.length;
    const top = document.getElementById("top-alert-count");
    const side = document.getElementById("alert-count");
    top.hidden = !unseen;
    top.textContent = unseen > 99 ? "99+" : unseen;
    if (side) { side.hidden = !unseen; side.textContent = unseen; }
    const wc = document.getElementById("wallet-count");
    if (wc) wc.textContent = wallets.length;
    if (lastUnseen !== null && unseen > lastUnseen) {
      const newest = alerts[0];
      toast(`Novo alerta: transação de ${newest.risk_level === "high" ? "ALTO" : "médio"} risco em "${newest.wallet_label}".`, "error");
    }
    lastUnseen = unseen;
    document.getElementById("sync-time").textContent = `Atualizado ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  } catch { /* offline momentâneo */ }
}

function closeMobileNav() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("mobile-overlay").classList.remove("open");
}

function showAuth() {
  app.user = null;
  cleanup?.();
  document.getElementById("app-shell").hidden = true;
  const root = document.getElementById("auth-root");
  root.hidden = false;
  renderAuth(root, app, { onAuthenticated: user => enterApp(user) });
  hydrateIcons(root);
}

function enterApp(user) {
  app.setUser(user);
  document.getElementById("auth-root").hidden = true;
  document.getElementById("auth-root").innerHTML = "";
  document.getElementById("app-shell").hidden = false;
  document.getElementById("sync-mode").textContent = app.config?.monitoringMode === "webhook" ? "Monitoramento (webhook)" : "Monitoramento (sincronização)";
  if (!location.hash || location.hash === "#" || location.hash.startsWith("#/login")) location.hash = "#/dashboard";
  renderRoute();
  pollBadges();
}

async function boot() {
  try { if (localStorage.getItem("cg-theme") === "light") document.body.classList.add("light"); } catch { /* sem storage */ }
  hydrateIcons(document);
  bindCopy(document.body);
  app.config = await api.get("/api/config/public").catch(() => ({}));
  app.wallet = createWalletConnector({ walletConnectProjectId: app.config.walletConnectProjectId });
  document.getElementById("boot").remove();
  try {
    enterApp(await api.get("/api/me"));
  } catch {
    showAuth();
  }
}

window.addEventListener("hashchange", renderRoute);
document.getElementById("mobile-menu").addEventListener("click", () => {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("mobile-overlay").classList.add("open");
});
document.getElementById("mobile-overlay").addEventListener("click", closeMobileNav);
document.getElementById("theme-button").addEventListener("click", () => {
  const light = document.body.classList.toggle("light");
  try { localStorage.setItem("cg-theme", light ? "light" : "dark"); } catch { /* sem storage */ }
});
document.getElementById("send-button").addEventListener("click", () => app.openSend());
document.getElementById("logout-button").addEventListener("click", async () => {
  await api.post("/api/auth/logout").catch(() => {});
  await app.wallet?.disconnect();
  location.hash = "";
  showAuth();
});

// Polling: badges a cada 20 s; a página atual decide o que mais atualizar (15 s).
setInterval(pollBadges, 20_000);
setInterval(() => { if (!document.hidden) app.refreshers.forEach(fn => fn()); }, 15_000);

boot();
