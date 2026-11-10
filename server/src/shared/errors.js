export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, message, details);
export const unauthorized = (message = "Faça login para continuar.") => new AppError(401, message);
export const forbidden = (message = "Você não tem permissão para esta ação.") => new AppError(403, message);
export const notFound = (message = "Recurso não encontrado.") => new AppError(404, message);
export const conflict = message => new AppError(409, message);
export const tooMany = (message = "Muitas tentativas. Aguarde um pouco e tente novamente.") => new AppError(429, message);
export const upstream = message => new AppError(502, message);

/** Validação mínima de payloads: lança 400 com a lista de campos inválidos. */
export function requireFields(body, spec) {
  const errors = {};
  const out = {};
  for (const [field, rule] of Object.entries(spec)) {
    const value = body?.[field];
    const { type = "string", required = true, min, max, oneOf } = rule;
    if (value === undefined || value === null || value === "") {
      if (required) errors[field] = "Campo obrigatório.";
      continue;
    }
    if (type === "string") {
      if (typeof value !== "string") { errors[field] = "Deve ser texto."; continue; }
      const trimmed = value.trim();
      if (min && trimmed.length < min) errors[field] = `Mínimo de ${min} caracteres.`;
      else if (max && trimmed.length > max) errors[field] = `Máximo de ${max} caracteres.`;
      else if (oneOf && !oneOf.includes(trimmed)) errors[field] = `Valor deve ser um de: ${oneOf.join(", ")}.`;
      else out[field] = trimmed;
    } else if (type === "number") {
      const num = typeof value === "number" ? value : Number(String(value).replace(",", "."));
      if (!Number.isFinite(num)) errors[field] = "Deve ser numérico.";
      else if (min !== undefined && num < min) errors[field] = `Deve ser no mínimo ${min}.`;
      else if (max !== undefined && num > max) errors[field] = `Deve ser no máximo ${max}.`;
      else out[field] = num;
    } else if (type === "boolean") {
      out[field] = value === true || value === "true";
    } else {
      out[field] = value;
    }
  }
  if (Object.keys(errors).length) throw badRequest("Dados inválidos.", errors);
  return out;
}
