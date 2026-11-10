import { AppError, badRequest, conflict, forbidden, requireFields, unauthorized } from "../../shared/errors.js";
import { generateRecoveryCodes, hashPassword, normalizeRecoveryCode, randomToken, sha256, verifyPassword } from "../../shared/security.js";
import { generateTotpSecret, matchTotp, otpauthUrl } from "../../shared/totp.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_CHALLENGE_ATTEMPTS = 5;
// Bloqueio por conta (além do limite por IP): 10 falhas em 15 min bloqueiam novas tentativas por 15 min.
const ACCOUNT_MAX_FAILURES = 10;
const ACCOUNT_WINDOW_MS = 15 * 60_000;
// Hash fixo para gastar o mesmo tempo quando o e-mail não existe (evita descobrir contas pelo tempo de resposta).
const DUMMY_HASH = hashPassword("chainguard-dummy-password");

function checkPasswordStrength(password) {
  if (password.length < 8) throw badRequest("A senha precisa ter pelo menos 8 caracteres.", { password: "Mínimo de 8 caracteres." });
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) throw badRequest("Use letras e números na senha.", { password: "Use letras e números." });
}

export function createAuthService({ repos, config, cipher, walletService }) {
  const failures = new Map(); // e-mail → { count, reset }
  const lockedOut = key => { const f = failures.get(key); return Boolean(f && f.reset > Date.now() && f.count >= ACCOUNT_MAX_FAILURES); };
  const recordFailure = key => {
    const now = Date.now();
    const f = failures.get(key);
    if (!f || f.reset < now) failures.set(key, { count: 1, reset: now + ACCOUNT_WINDOW_MS });
    else f.count++;
    if (failures.size > 10_000) for (const [k, v] of failures) if (v.reset < now) failures.delete(k);
  };
  const accountLocked = () => new AppError(429, "Muitas tentativas para esta conta. Aguarde 15 minutos e tente de novo.");

  /** Confere o TOTP e grava o passo usado (o mesmo código não serve duas vezes). */
  function useTotp(user, secret, code) {
    const fresh = repos.users.findById(user.id);
    const step = secret ? matchTotp(secret, code, { afterStep: fresh?.totp_last_step ?? -1 }) : null;
    if (step === null) return false;
    repos.users.update(user.id, { totpLastStep: step });
    return true;
  }
  const publicUser = user => user && ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    twoFactorEnabled: Boolean(user.totp_enabled),
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    recoveryCodesRemaining: repos.users.remainingRecoveryCodes(user.id),
  });

  function issueSession(user) {
    const token = randomToken();
    repos.users.createSession({ token, userId: user.id, ttlMs: config.sessionTtlMs });
    repos.users.update(user.id, { lastLoginAt: new Date().toISOString() });
    return token;
  }

  function issueRecoveryCodes(userId) {
    const codes = generateRecoveryCodes();
    repos.users.replaceRecoveryCodes(userId, codes.map(c => sha256(normalizeRecoveryCode(c))));
    return codes;
  }

  async function requirePassword(user, password) {
    const key = `user:${user.id}`;
    if (lockedOut(key)) throw accountLocked();
    if (!password || !(await verifyPassword(password, user.password_hash))) {
      recordFailure(key);
      throw forbidden("Senha incorreta.");
    }
  }

  return {
    publicUser,

    register(body) {
      const { name, email, password } = requireFields(body, { name: { min: 2, max: 60 }, email: { max: 120 }, password: { min: 1, max: 200 } });
      if (!EMAIL_RE.test(email)) throw badRequest("E-mail inválido.", { email: "E-mail inválido." });
      checkPasswordStrength(password);
      if (repos.users.findByEmail(email)) throw conflict("Já existe uma conta com este e-mail.");
      const user = repos.users.create({ email: email.toLowerCase(), name, passwordHash: hashPassword(password) });
      const recoveryCodes = issueRecoveryCodes(user.id);
      return { user: publicUser(user), token: issueSession(user), recoveryCodes };
    },

    async login(body) {
      const { email, password } = requireFields(body, { email: {}, password: {} });
      const key = `email:${email.toLowerCase()}`;
      if (lockedOut(key)) throw accountLocked();
      const user = repos.users.findByEmail(email);
      const ok = (await verifyPassword(password, user?.password_hash ?? DUMMY_HASH)) && Boolean(user);
      if (!ok) {
        recordFailure(key);
        throw unauthorized("E-mail ou senha incorretos.");
      }
      if (user.status === "blocked") throw forbidden("Conta bloqueada pelo administrador.");
      if (user.totp_enabled) {
        const challenge = randomToken();
        repos.users.createSession({ token: challenge, userId: user.id, kind: "challenge", ttlMs: CHALLENGE_TTL_MS });
        return { twoFactorRequired: true, challenge };
      }
      return { user: publicUser(user), token: issueSession(user) };
    },

    /** Segundo passo do login: código TOTP (ou um código de recuperação, se o celular foi perdido). */
    loginTwoFactor(body) {
      const { challenge, code } = requireFields(body, { challenge: {}, code: { max: 20 } });
      const session = repos.users.findSession(challenge, "challenge");
      if (!session) throw unauthorized("O desafio expirou. Faça login novamente.");
      if (session.attempts >= MAX_CHALLENGE_ATTEMPTS) {
        repos.users.deleteSessionById(session.id);
        throw unauthorized("Muitas tentativas. Faça login novamente.");
      }
      const user = repos.users.findById(session.user_id);
      if (!user || user.status === "blocked") throw forbidden("Conta indisponível.");
      // Falhas de 2FA contam para a conta: pedir desafios novos não renova as tentativas.
      const key = `email:${user.email.toLowerCase()}`;
      if (lockedOut(key)) throw accountLocked();
      const secret = user.totp_secret_enc ? cipher.decrypt(user.totp_secret_enc) : null;
      const valid = useTotp(user, secret, code) || repos.users.useRecoveryCode(user.id, sha256(normalizeRecoveryCode(code)));
      if (!valid) {
        repos.users.bumpChallengeAttempts(session.id);
        recordFailure(key);
        throw unauthorized("Código inválido.");
      }
      repos.users.deleteSessionById(session.id);
      return { user: publicUser(user), token: issueSession(user) };
    },

    logout(token) {
      if (token) repos.users.deleteSession(token);
    },

    authenticate(token) {
      if (!token) return null;
      const session = repos.users.findSession(token, "session");
      if (!session) return null;
      const user = repos.users.findById(session.user_id);
      if (!user || user.status !== "active") return null;
      return user;
    },

    /**
     * Recuperação de senha sem e-mail: o usuário recebe códigos de recuperação de uso único
     * no cadastro (e pode gerar novos). Decisão registrada para o ponto em aberto nº 1.
     */
    recoverPassword(body) {
      const { email, recoveryCode, newPassword } = requireFields(body, { email: {}, recoveryCode: { max: 20 }, newPassword: { max: 200 } });
      checkPasswordStrength(newPassword);
      const key = `email:${email.toLowerCase()}`;
      if (lockedOut(key)) throw accountLocked();
      const user = repos.users.findByEmail(email);
      const used = user && repos.users.useRecoveryCode(user.id, sha256(normalizeRecoveryCode(recoveryCode)));
      if (!used) {
        recordFailure(key);
        throw unauthorized("E-mail ou código de recuperação inválido.");
      }
      repos.users.update(user.id, { passwordHash: hashPassword(newPassword) });
      repos.users.deleteSessionsOfUser(user.id);
      return { ok: true, recoveryCodesRemaining: repos.users.remainingRecoveryCodes(user.id) };
    },

    setupTwoFactor(user) {
      if (user.totp_enabled) throw conflict("O 2FA já está ativo.");
      const secret = generateTotpSecret();
      repos.users.update(user.id, { totpPendingEnc: cipher.encrypt(secret) });
      return { secret, otpauthUrl: otpauthUrl({ secret, account: user.email }) };
    },

    enableTwoFactor(user, body) {
      const { code } = requireFields(body, { code: { max: 10 } });
      if (!user.totp_pending_enc) throw badRequest("Gere a chave do autenticador primeiro.");
      const secret = cipher.decrypt(user.totp_pending_enc);
      if (!useTotp(user, secret, code)) throw badRequest("Código incorreto. Confira o horário do celular e tente de novo.", { code: "Código incorreto." });
      repos.users.update(user.id, { totpSecretEnc: user.totp_pending_enc, totpPendingEnc: null, totpEnabled: 1 });
      return publicUser(repos.users.findById(user.id));
    },

    async disableTwoFactor(user, body) {
      const { password, code } = requireFields(body, { password: {}, code: { max: 20 } });
      await requirePassword(user, password);
      const secret = user.totp_secret_enc ? cipher.decrypt(user.totp_secret_enc) : null;
      if (!useTotp(user, secret, code)) throw badRequest("Código incorreto.", { code: "Código incorreto." });
      repos.users.update(user.id, { totpSecretEnc: null, totpPendingEnc: null, totpEnabled: 0 });
      return publicUser(repos.users.findById(user.id));
    },

    async regenerateRecoveryCodes(user, body) {
      await requirePassword(user, body?.password);
      return { recoveryCodes: issueRecoveryCodes(user.id) };
    },

    async changePassword(user, body) {
      const { currentPassword, newPassword } = requireFields(body, { currentPassword: {}, newPassword: { max: 200 } });
      await requirePassword(user, currentPassword);
      checkPasswordStrength(newPassword);
      repos.users.update(user.id, { passwordHash: hashPassword(newPassword) });
      repos.users.deleteSessionsOfUser(user.id);
      return { token: issueSession(user) };
    },

    updateProfile(user, body) {
      const { name } = requireFields(body, { name: { min: 2, max: 60 } });
      return publicUser(repos.users.update(user.id, { name }));
    },

    /** Exclusão da conta e de todos os dados do usuário (carteiras, whitelist, transações, simulações). */
    async deleteAccount(user, body) {
      await requirePassword(user, body?.password);
      if (user.role === "admin" && repos.users.countAdmins() <= 1) throw conflict("Você é o único administrador ativo. Promova outro antes de excluir a conta.");
      await walletService.removeAllForUser(user.id);
      repos.users.delete(user.id);
      return { ok: true };
    },
  };
}
