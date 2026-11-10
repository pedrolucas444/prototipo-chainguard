import { badRequest, conflict, notFound, requireFields } from "../../shared/errors.js";
import { validateAddress } from "../../shared/address.js";

export function createWhitelistService({ repos }) {
  return {
    list: userId => repos.whitelist.list(userId),
    add(userId, body) {
      const { label, address } = requireFields(body, { label: { min: 1, max: 32 }, address: {} });
      const check = validateAddress(address);
      if (!check.ok) throw badRequest(check.reason, { address: check.reason });
      if (repos.whitelist.find(userId, check.address)) throw conflict("Este endereço já está na whitelist.");
      const malicious = repos.malicious.findByAddress(check.address);
      const entry = repos.whitelist.create({ userId, address: check.address, label });
      return { entry, warnings: malicious ? [`Atenção: este endereço consta na base de endereços maliciosos (${malicious.source}). Ele foi adicionado mesmo assim, e as transações com ele deixarão de ser analisadas.`] : [] };
    },
    remove(userId, id) {
      if (!repos.whitelist.delete(userId, id)) throw notFound("Endereço não encontrado na whitelist.");
      return { ok: true };
    },
  };
}
