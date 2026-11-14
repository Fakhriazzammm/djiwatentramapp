/** Resolves the signed-in user by asking the existing auth-server (it owns the in-memory pay session). */
export type Resolver = (cookie: string) => Promise<string | null>;
const cache = new Map<string, { id: string; until: number }>();

export function authServerResolver(base = process.env.AUTH_URL || "http://127.0.0.1:3001", fetchImpl: typeof fetch = fetch, ttlMs = 20_000): Resolver {
  return async (cookie) => {
    if (!/djiwa_pay_session=/.test(cookie)) return null;
    const hit = cache.get(cookie);
    if (hit && hit.until > Date.now()) return hit.id;
    const res = await fetchImpl(`${base}/api/pay-bridge/profile`, { headers: { cookie } }).catch(() => null);
    if (!res || !res.ok) { cache.delete(cookie); return null; }
    const body = (await res.json().catch(() => null)) as { customer?: { source_id?: string } } | null;
    const id = body?.customer?.source_id;
    if (!id || typeof id !== "string") return null;
    if (cache.size > 500) cache.clear();
    cache.set(cookie, { id, until: Date.now() + ttlMs });
    return id;
  };
}
