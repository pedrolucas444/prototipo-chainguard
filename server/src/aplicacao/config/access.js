/**
 * Config de acesso: decide quais rotas exigem login e qual perfil pode acessá-las.
 * A primeira regra que casar vence. O padrão para /api é exigir login (Customer ou Admin).
 */
export const ACCESS_RULES = [
  { prefix: "/api/health", access: "public" },
  { prefix: "/api/config/public", access: "public" },
  { prefix: "/api/auth/", access: "public" },
  { prefix: "/webhooks/", access: "public" },        // protegido por assinatura HMAC no Controller
  { prefix: "/api/admin/", access: "admin" },
  { prefix: "/api/", access: "user" },
];

export function accessFor(pathname) {
  const rule = ACCESS_RULES.find(r => pathname === r.prefix.replace(/\/$/, "") || pathname.startsWith(r.prefix));
  return rule?.access ?? "public";
}

/** Limites de requisição por IP (proteção contra abuso). */
export const RATE_LIMITS = [
  { prefix: "/api/auth/", windowMs: 15 * 60_000, max: 30 },
  // Operações que conferem a senha atual (trocar senha, 2FA, códigos de recuperação, excluir conta).
  { prefix: "/api/me", methods: ["POST", "PUT", "PATCH", "DELETE"], windowMs: 15 * 60_000, max: 20 },
  { prefix: "/api/risk/check", windowMs: 60_000, max: 30 },
  { prefix: "/api/quotes/simulate", windowMs: 60_000, max: 30 },
];
