// Telas de acesso: login (+ 2FA), cadastro (com códigos de recuperação) e recuperação de senha.
import { e, icon } from "../components/ui.js";

const shell = (title, subtitle, body, footer = "") => `
  <div class="auth-card card">
    <div class="auth-brand">
      <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 36"><path d="M16 2 5 6.6v8.8c0 7.2 4.6 13.8 11 17.6 6.4-3.8 11-10.4 11-17.6V6.6L16 2Z"/><path d="m16 8-5.2 8 5.2 3 5.2-3L16 8Zm0 12.2-5.2-3.1L16 27l5.2-9.9-5.2 3.1Z"/></svg></span>
      <span><strong>ChainGuard</strong><small>Ethereum security</small></span>
    </div>
    <h1>${title}</h1><p class="auth-sub">${subtitle}</p>
    ${body}
    ${footer ? `<div class="auth-footer">${footer}</div>` : ""}
  </div>
  <aside class="auth-aside">
    <span class="eyebrow">Não custodial</span>
    <h2>Monitoramento contínuo e explicável para carteiras Ethereum.</h2>
    <ul>
      <li>${icon("shield")}<span><b>Nunca pedimos sua chave privada.</b> Quem assina os envios é a sua carteira.</span></li>
      <li>${icon("activity")}<span><b>Cada transação recebe um nível de risco</b> e a lista de fatores que motivaram a nota.</span></li>
      <li>${icon("chart")}<span><b>Comparador de cotações informativo.</b> Nada é executado.</span></li>
    </ul>
  </aside>`;

export function renderAuth(root, app, { onAuthenticated }) {
  let view = "login";
  let challenge = null;
  let recoveryCodes = null;
  let pendingUser = null;

  function draw(message = "") {
    const error = message ? `<p class="field-error">${e(message)}</p>` : `<p class="field-error"></p>`;
    if (view === "login") {
      root.innerHTML = shell("Entrar", "Acesse o painel das suas carteiras.", `
        <form class="auth-form" data-form="login">
          <label>E-mail <input name="email" type="email" autocomplete="username" required autofocus /></label>
          <label>Senha <input name="password" type="password" autocomplete="current-password" required /></label>
          ${error}
          <button class="btn primary form-submit" type="submit">${icon("lock")} Entrar</button>
        </form>`, `<button class="text-link" data-view="recover">Esqueci a senha</button><span>Novo por aqui? <button class="text-link" data-view="register">Criar conta</button></span>`);
    } else if (view === "2fa") {
      root.innerHTML = shell("Verificação em duas etapas", "Digite o código de 6 dígitos do seu app autenticador. Sem acesso ao celular? Use um código de recuperação.", `
        <form class="auth-form" data-form="2fa">
          <label>Código <input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required autofocus placeholder="000000" /></label>
          ${error}
          <button class="btn primary form-submit" type="submit">${icon("key")} Verificar</button>
        </form>`, `<button class="text-link" data-view="login">Voltar</button>`);
    } else if (view === "register") {
      root.innerHTML = shell("Criar conta", "Cadastre-se para monitorar suas carteiras.", `
        <form class="auth-form" data-form="register">
          <label>Nome <input name="name" autocomplete="name" required maxlength="60" autofocus /></label>
          <label>E-mail <input name="email" type="email" autocomplete="email" required /></label>
          <label>Senha <input name="password" type="password" autocomplete="new-password" required minlength="8" /><span class="helper">Mínimo de 8 caracteres, com letras e números.</span></label>
          ${error}
          <button class="btn primary form-submit" type="submit">${icon("plus")} Criar conta</button>
        </form>`, `<span>Já tem conta? <button class="text-link" data-view="login">Entrar</button></span>`);
    } else if (view === "codes") {
      root.innerHTML = shell("Guarde seus códigos de recuperação", "Eles são a única forma de redefinir a senha (ou entrar sem o 2FA). Cada código funciona uma vez. Eles não serão mostrados de novo.", `
        <div class="codes-grid">${recoveryCodes.map(c => `<code>${e(c)}</code>`).join("")}</div>
        <div class="auth-actions">
          <button class="btn ghost" data-copy="${e(recoveryCodes.join("\n"))}">${icon("copy")} Copiar</button>
          <button class="btn ghost" data-download>${icon("download")} Baixar .txt</button>
        </div>
        <label class="check"><input type="checkbox" data-ack /> <span>Guardei os códigos em local seguro.</span></label>
        <button class="btn primary form-submit" data-continue disabled>Continuar para o painel</button>`);
    } else if (view === "recover") {
      root.innerHTML = shell("Recuperar senha", "Use um dos códigos de recuperação que você recebeu ao criar a conta.", `
        <form class="auth-form" data-form="recover">
          <label>E-mail <input name="email" type="email" autocomplete="username" required autofocus /></label>
          <label>Código de recuperação <input name="recoveryCode" required placeholder="XXXXX-XXXXX" autocomplete="off" /></label>
          <label>Nova senha <input name="newPassword" type="password" autocomplete="new-password" required minlength="8" /></label>
          ${error}
          <button class="btn primary form-submit" type="submit">${icon("key")} Redefinir senha</button>
        </form>`, `<button class="text-link" data-view="login">Voltar para o login</button>`);
    }
  }

  root.onclick = event => {
    const target = event.target.closest("[data-view],[data-download],[data-continue]");
    if (!target) return;
    if (target.dataset.view) { view = target.dataset.view; draw(); }
    if (target.hasAttribute("data-download")) {
      const blob = new Blob([`ChainGuard: códigos de recuperação\n${pendingUser?.email ?? ""}\n\n${recoveryCodes.join("\n")}\n`], { type: "text/plain" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "chainguard-codigos-recuperacao.txt" });
      a.click();
      URL.revokeObjectURL(a.href);
    }
    if (target.hasAttribute("data-continue")) onAuthenticated(pendingUser);
  };
  root.onchange = event => {
    if (event.target.matches("[data-ack]")) root.querySelector("[data-continue]").disabled = !event.target.checked;
  };
  root.onsubmit = async event => {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form));
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      if (form.dataset.form === "login") {
        const result = await app.api.post("/api/auth/login", data);
        if (result.twoFactorRequired) { challenge = result.challenge; view = "2fa"; return draw(); }
        onAuthenticated(result.user);
      } else if (form.dataset.form === "2fa") {
        const result = await app.api.post("/api/auth/login/2fa", { challenge, code: data.code });
        onAuthenticated(result.user);
      } else if (form.dataset.form === "register") {
        const result = await app.api.post("/api/auth/register", data);
        recoveryCodes = result.recoveryCodes;
        pendingUser = result.user;
        view = "codes";
        draw();
      } else if (form.dataset.form === "recover") {
        const result = await app.api.post("/api/auth/recover", data);
        view = "login";
        draw();
        app.toast(`Senha redefinida. Restam ${result.recoveryCodesRemaining} códigos de recuperação.`);
      }
    } catch (error) {
      if (form.dataset.form === "2fa" && /expirou|Muitas/.test(error.message)) view = "login";
      draw(error.message);
    } finally {
      if (form.isConnected) button.disabled = false;
    }
  };
  draw();
}
