/**
 * Controllers (entrada síncrona): recebem a requisição, delegam ao Service e devolvem a resposta.
 * Sem regra de negócio aqui. Quem decide login/perfil por rota é a Config (config/access.js).
 */
import { AppError, badRequest } from "../../shared/errors.js";

const id = ctx => {
  const n = Number(ctx.params.id);
  if (!Number.isInteger(n) || n <= 0) throw badRequest("Identificador inválido.");
  return n;
};

export function registerControllers(router, { services, integrations, config }) {
  const { auth, wallets, transactions, whitelist, risk, sends, quotes, admin } = services;

  // ---------------- Público ----------------
  router.get("/api/health", () => ({ ok: true, time: new Date().toISOString() }));
  router.get("/api/config/public", () => ({
    network: "Ethereum Mainnet",
    chainId: 1,
    walletConnectProjectId: config.walletConnectProjectId || null,
    monitoringMode: integrations.alchemy.webhookEnabled ? "webhook" : "sync",
  }));

  // ---------------- Conta e acesso ----------------
  router.post("/api/auth/register", ctx => {
    const { user, token, recoveryCodes } = auth.register(ctx.body);
    ctx.setSession(token);
    return { user, recoveryCodes };
  });
  router.post("/api/auth/login", async ctx => {
    const result = await auth.login(ctx.body);
    if (result.twoFactorRequired) return result;
    ctx.setSession(result.token);
    return { user: result.user };
  });
  router.post("/api/auth/login/2fa", ctx => {
    const { user, token } = auth.loginTwoFactor(ctx.body);
    ctx.setSession(token);
    return { user };
  });
  router.post("/api/auth/logout", ctx => {
    auth.logout(ctx.token);
    ctx.clearSession();
    return { ok: true };
  });
  router.post("/api/auth/recover", ctx => auth.recoverPassword(ctx.body));

  router.get("/api/me", ctx => auth.publicUser(ctx.user));
  router.patch("/api/me", ctx => auth.updateProfile(ctx.user, ctx.body));
  router.put("/api/me/password", async ctx => {
    const { token } = await auth.changePassword(ctx.user, ctx.body);
    ctx.setSession(token);
    return { ok: true };
  });
  router.post("/api/me/2fa/setup", ctx => auth.setupTwoFactor(ctx.user));
  router.post("/api/me/2fa/enable", ctx => auth.enableTwoFactor(ctx.user, ctx.body));
  router.post("/api/me/2fa/disable", ctx => auth.disableTwoFactor(ctx.user, ctx.body));
  router.post("/api/me/recovery-codes", ctx => auth.regenerateRecoveryCodes(ctx.user, ctx.body));
  router.delete("/api/me", async ctx => {
    await auth.deleteAccount(ctx.user, ctx.body);
    ctx.clearSession();
    return { ok: true };
  });

  // ---------------- Painel ----------------
  router.get("/api/dashboard", async ctx => ({
    summary: transactions.summary(ctx.user.id),
    wallets: await wallets.list(ctx.user.id),
    recent: transactions.list(ctx.user.id, { limit: 8 }).items,
    alerts: transactions.alerts(ctx.user.id, { unseen: "1" }).slice(0, 5),
  }));

  // ---------------- Carteiras ----------------
  router.get("/api/wallets", ctx => wallets.list(ctx.user.id));
  router.post("/api/wallets", ctx => wallets.add(ctx.user.id, ctx.body));
  router.patch("/api/wallets/:id", ctx => wallets.update(ctx.user.id, id(ctx), ctx.body));
  router.delete("/api/wallets/:id", ctx => wallets.remove(ctx.user.id, id(ctx)));

  // ---------------- Transações e alertas ----------------
  router.get("/api/transactions", ctx => transactions.list(ctx.user.id, ctx.query));
  router.get("/api/transactions/:id", ctx => transactions.get(ctx.user.id, id(ctx)));
  router.post("/api/transactions/:id/reanalyze", ctx => transactions.reanalyze(ctx.user.id, id(ctx)));
  router.get("/api/alerts", ctx => transactions.alerts(ctx.user.id, ctx.query));
  router.post("/api/alerts/seen", ctx => transactions.markAlertsSeen(ctx.user.id, ctx.body));

  // ---------------- Whitelist ----------------
  router.get("/api/whitelist", ctx => whitelist.list(ctx.user.id));
  router.post("/api/whitelist", ctx => whitelist.add(ctx.user.id, ctx.body));
  router.delete("/api/whitelist/:id", ctx => whitelist.remove(ctx.user.id, id(ctx)));

  // ---------------- Risco (síncrono) e envio ----------------
  router.post("/api/risk/check", ctx => risk.checkDestination(ctx.user.id, ctx.body));
  router.get("/api/assets", () => sends.assets());
  router.get("/api/sends", ctx => sends.list(ctx.user.id));
  router.post("/api/sends", ctx => sends.record(ctx.user.id, ctx.body));
  router.get("/api/sends/:hash/status", ctx => sends.status(ctx.user.id, ctx.params.hash));

  // ---------------- Cotações ----------------
  router.get("/api/quotes/prices", () => quotes.prices());
  router.get("/api/quotes/options", () => quotes.options());
  router.post("/api/quotes/simulate", ctx => quotes.simulate(ctx.user.id, ctx.body));
  router.get("/api/simulations", ctx => quotes.history(ctx.user.id));
  router.get("/api/simulations/:id", ctx => quotes.getSimulation(ctx.user.id, id(ctx)));

  // ---------------- Administração ----------------
  router.get("/api/admin/overview", () => ({ ...admin.overview(), jobs: services.scheduler?.status() ?? {} }));
  router.get("/api/admin/users", ctx => admin.listUsers(ctx.query));
  router.patch("/api/admin/users/:id", ctx => admin.updateUser(ctx.user, id(ctx), ctx.body));
  router.delete("/api/admin/users/:id", ctx => admin.deleteUser(ctx.user, id(ctx), wallets));

  router.get("/api/admin/malicious", ctx => admin.listMalicious(ctx.query));
  router.get("/api/admin/malicious/categories", () => admin.categories());
  router.get("/api/admin/malicious/:id", ctx => admin.getMalicious(id(ctx)));
  router.post("/api/admin/malicious", ctx => admin.createMalicious(ctx.user, ctx.body));
  router.put("/api/admin/malicious/:id", ctx => admin.updateMalicious(ctx.user, id(ctx), ctx.body));
  router.delete("/api/admin/malicious/:id", ctx => admin.deleteMalicious(ctx.user, id(ctx)));

  router.get("/api/admin/list-sources", () => admin.listSources());
  router.post("/api/admin/list-sources", ctx => admin.createSource(ctx.user, ctx.body));
  router.put("/api/admin/list-sources/:id", ctx => admin.updateSource(ctx.user, id(ctx), ctx.body));
  router.delete("/api/admin/list-sources/:id", ctx => admin.deleteSource(ctx.user, id(ctx)));
  router.post("/api/admin/list-sources/sync", ctx => admin.syncLists(ctx.user, { onlyId: Number(ctx.body?.id) || undefined }));

  router.get("/api/admin/risk-params", () => admin.riskParams());
  router.put("/api/admin/risk-params", ctx => admin.updateRiskParams(ctx.user, ctx.body));
  router.post("/api/admin/risk-params/reset", ctx => admin.resetRiskParams(ctx.user));

  router.get("/api/admin/catalog", () => admin.catalog());
  router.patch("/api/admin/exchanges/:id", ctx => admin.setExchangeEnabled(ctx.user, ctx.params.id, ctx.body));
  router.patch("/api/admin/assets/:id", ctx => admin.setAssetEnabled(ctx.user, ctx.params.id.toUpperCase(), ctx.body));
  router.get("/api/admin/fees", () => admin.feeTables());
  router.post("/api/admin/fees", ctx => admin.createFeeTable(ctx.user, ctx.body));
  router.post("/api/admin/fees/:id/activate", ctx => admin.activateFeeTable(ctx.user, id(ctx)));
  router.post("/api/admin/quotes/collect", async ctx => {
    const result = await quotes.collect();
    admin.recordAction(ctx.user, "collect", "quotes", null, result);
    return result;
  });

  router.get("/api/admin/audit-log", ctx => admin.auditLog(ctx.query));
  router.get("/api/admin/queue", () => admin.queue());
  router.post("/api/admin/queue/:id/retry", ctx => admin.retryDead(ctx.user, id(ctx)));

  // ---------------- Webhook do Alchemy (entrada assíncrona) ----------------
  router.post("/webhooks/alchemy", ctx => {
    if (!integrations.alchemy.signingEnabled) throw new AppError(503, "Webhook não configurado (ALCHEMY_SIGNING_KEY ausente).");
    // Confere a assinatura HMAC antes de qualquer processamento.
    if (!integrations.alchemy.verifySignature(ctx.rawBody, ctx.req.headers["x-alchemy-signature"])) throw new AppError(401, "Assinatura inválida.");
    let payload;
    try { payload = JSON.parse(ctx.rawBody.toString("utf8")); } catch { throw badRequest("JSON inválido."); }
    return transactions.handleWebhook(payload);
  });
}
