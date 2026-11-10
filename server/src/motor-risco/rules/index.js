/**
 * Regras do Motor de Risco. Cada regra é uma função pura:
 *   (input, params) => Factor[]
 * Factor = { rule, severity (0..1), title, detail, evidence? }
 *
 * O `input` é montado pelo Service (que é quem busca dados em banco e APIs):
 * {
 *   kind: 'transaction' | 'destination',
 *   direction: 'in' | 'out',
 *   counterparty: '0x…',
 *   value, asset, category,
 *   approvals: [{ token, spender, unlimited, kind }],
 *   blacklistHits: [{ address, label, category, source }],
 *   reputation: { available, flags: [{ key, label, strong }], source },
 *   knownAddresses: ['0x…'],     // endereços que o usuário já usou (envios, whitelist, carteiras próprias)
 *   account: { available, hasHistory, firstSeenAt, isContract },
 *   now: ISO
 * }
 */
import { blacklistRule } from "./blacklist.js";
import { reputationRule } from "./reputation.js";
import { similarityRule } from "./similarity.js";
import { dustRule } from "./dust.js";
import { approvalsRule } from "./approvals.js";
import { walletAgeRule } from "./wallet-age.js";

export const RULES = [blacklistRule, reputationRule, similarityRule, approvalsRule, dustRule, walletAgeRule];
