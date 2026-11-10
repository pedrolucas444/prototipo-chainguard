import { confirmDialog, e, fmt, icon, openModal, pageHeading } from "../components/ui.js";

function codesModal(codes) {
  openModal({
    title: "Novos códigos de recuperação", eyebrow: "Guarde em local seguro", iconName: "key", tone: "success", hideSubmit: true, cancelLabel: "Fechar",
    body: `<p class="modal-copy">Os códigos anteriores deixaram de valer. Cada código funciona uma única vez, para redefinir a senha ou entrar sem o 2FA.</p>
      <div class="codes-grid">${codes.map(c => `<code>${e(c)}</code>`).join("")}</div>
      <div class="modal-inline-actions"><button class="btn ghost" type="button" data-copy="${e(codes.join("\n"))}">${icon("copy")} Copiar todos</button></div>`,
  });
}

export default async function account(root, app) {
  async function load() {
    const me = await app.api.get("/api/me");
    app.setUser(me);
    root.innerHTML = `${pageHeading("Conta e acesso", "Minha conta", "Dados da conta, segurança do acesso e exclusão dos seus dados.")}
      <div class="grid cols-2">
        <section class="card form-card">
          <h2>Perfil</h2><p>${e(me.email)} · ${me.role === "admin" ? "Administrador" : "Usuário"} · desde ${fmt.date(me.createdAt).split(" ")[0]}</p>
          <form data-form="profile"><label>Nome <input name="name" required maxlength="60" value="${e(me.name)}" /></label><button class="btn ghost form-submit" type="submit">Salvar nome</button></form>
        </section>
        <section class="card form-card">
          <h2>Senha</h2><p>Ao trocar a senha, as outras sessões abertas são encerradas.</p>
          <form data-form="password">
            <label>Senha atual <input name="currentPassword" type="password" autocomplete="current-password" required /></label>
            <label>Nova senha <input name="newPassword" type="password" autocomplete="new-password" required minlength="8" /></label>
            <button class="btn ghost form-submit" type="submit">Trocar senha</button>
          </form>
        </section>
        <section class="card form-card">
          <h2>Autenticação em dois fatores (2FA)</h2>
          <p>Use um app autenticador (Google Authenticator, Authy, 1Password…) para gerar o código pedido no login.</p>
          <div class="state-row">${me.twoFactorEnabled ? '<span class="status low">2FA ativo</span>' : '<span class="status medium">2FA desativado</span>'}</div>
          <button class="btn ${me.twoFactorEnabled ? "danger" : "primary"} form-submit" data-2fa>${icon("lock")} ${me.twoFactorEnabled ? "Desativar 2FA" : "Ativar 2FA"}</button>
        </section>
        <section class="card form-card">
          <h2>Códigos de recuperação</h2>
          <p>Servem para redefinir a senha ou entrar sem o celular. Restam <b>${me.recoveryCodesRemaining}</b> código(s) não usado(s).</p>
          <button class="btn ghost form-submit" data-codes>${icon("key")} Gerar novos códigos</button>
        </section>
      </div>
      <section class="card form-card danger-zone" style="margin-top:16px">
        <h2>Excluir conta</h2>
        <p>Remove a sua conta e todos os seus dados: carteiras (que saem do monitoramento), whitelist, transações, envios e simulações. Não é possível desfazer.</p>
        <button class="btn danger" data-delete>${icon("trash")} Excluir minha conta</button>
      </section>`;
  }

  root.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form));
    try {
      if (form.dataset.form === "profile") { await app.api.patch("/api/me", data); app.toast("Nome atualizado."); }
      if (form.dataset.form === "password") { await app.api.put("/api/me/password", data); app.toast("Senha alterada. Outras sessões foram encerradas."); form.reset(); }
      await load();
    } catch (error) {
      app.toast(error.message, "error");
    }
  });

  root.addEventListener("click", async event => {
    const t = event.target.closest("button");
    if (!t) return;
    try {
      if (t.hasAttribute("data-2fa")) {
        if (app.user.twoFactorEnabled) {
          openModal({
            title: "Desativar 2FA", iconName: "lock", submitLabel: "Desativar", submitClass: "danger",
            body: `<label>Senha <input name="password" type="password" autocomplete="current-password" required /></label><label>Código atual do autenticador <input name="code" inputmode="numeric" maxlength="6" required /></label>`,
            onSubmit: async data => { await app.api.post("/api/me/2fa/disable", Object.fromEntries(data)); app.toast("2FA desativado."); load(); },
          });
        } else {
          const setup = await app.api.post("/api/me/2fa/setup");
          openModal({
            title: "Ativar 2FA", eyebrow: "Passo a passo", iconName: "lock", tone: "success", submitLabel: "Ativar", submitClass: "primary success",
            body: `<ol class="steps">
                <li>No app autenticador, adicione uma conta pela <b>chave de configuração</b> (ou toque no link no celular).</li>
                <li>Chave: <code class="secret">${e(setup.secret.match(/.{1,4}/g).join(" "))}</code> <button type="button" class="mini-button tiny" data-copy="${e(setup.secret)}" aria-label="Copiar chave">${icon("copy")}</button></li>
                <li><a class="text-link inline" href="${e(setup.otpauthUrl)}">Abrir no app autenticador</a> (no celular)</li>
                <li>Digite abaixo o código de 6 dígitos que aparecer.</li>
              </ol>
              <label>Código <input name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required /></label>`,
            onSubmit: async data => { await app.api.post("/api/me/2fa/enable", { code: data.get("code") }); app.toast("2FA ativado. Ele será pedido no próximo login."); load(); },
          });
        }
      }
      if (t.hasAttribute("data-codes")) {
        const ok = await confirmDialog({ title: "Gerar novos códigos", message: "Os códigos atuais deixarão de funcionar.", confirmLabel: "Gerar", requirePassword: true });
        if (!ok) return;
        const { recoveryCodes } = await app.api.post("/api/me/recovery-codes", ok);
        codesModal(recoveryCodes);
        load();
      }
      if (t.hasAttribute("data-delete")) {
        const ok = await confirmDialog({ title: "Excluir conta", message: "Todos os seus dados serão apagados permanentemente. Confirme com a sua senha.", confirmLabel: "Excluir definitivamente", danger: true, requirePassword: true });
        if (!ok) return;
        await app.api.del("/api/me", ok);
        app.toast("Conta excluída.");
        setTimeout(() => location.reload(), 800);
      }
    } catch (error) {
      app.toast(error.message, "error");
    }
  });
  await load();
}
