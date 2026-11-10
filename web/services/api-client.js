// API Client: única porta de saída do front para a ChainGuard API (REST/HTTPS).
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function createApiClient({ onUnauthorized } = {}) {
  async function request(method, path, body) {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        ...(method !== "GET" ? { "X-Requested-With": "ChainGuard" } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await response.json(); } catch { /* corpo vazio */ }
    if (!response.ok) {
      if (response.status === 401 && !path.startsWith("/api/auth/")) onUnauthorized?.();
      throw new ApiError(response.status, data?.error ?? `Erro ${response.status}`, data?.details);
    }
    return data;
  }
  const qs = params => {
    const clean = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== "");
    return clean.length ? `?${new URLSearchParams(clean)}` : "";
  };

  return {
    get: (path, params) => request("GET", `${path}${qs(params)}`),
    post: (path, body = {}) => request("POST", path, body),
    put: (path, body = {}) => request("PUT", path, body),
    patch: (path, body = {}) => request("PATCH", path, body),
    del: (path, body) => request("DELETE", path, body),
  };
}
