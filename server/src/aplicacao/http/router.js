/** Roteador mínimo: "GET /api/wallets/:id" → handler(ctx). */
export function createRouter() {
  const routes = [];
  const add = (method, pattern, handler) => {
    const keys = [];
    const regex = new RegExp(`^${pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return "/([^/]+)"; })}/?$`);
    routes.push({ method, regex, keys, handler });
  };
  return {
    get: (p, h) => add("GET", p, h),
    post: (p, h) => add("POST", p, h),
    put: (p, h) => add("PUT", p, h),
    patch: (p, h) => add("PATCH", p, h),
    delete: (p, h) => add("DELETE", p, h),
    match(method, pathname) {
      let pathMatched = false;
      for (const r of routes) {
        const m = r.regex.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== method) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        return { handler: r.handler, params };
      }
      return { handler: null, methodNotAllowed: pathMatched };
    },
  };
}
