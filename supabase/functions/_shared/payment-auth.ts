// Application authorization is required even when Supabase verify_jwt is false.
function equalSecret(actual: string, expected: string | undefined): boolean {
  if (!expected || !actual || actual.length > 4096) return false;
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ (actual.charCodeAt(i) || 0);
  return difference === 0;
}
export function trustedServer(req: Request): boolean {
  return equalSecret(req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
    || equalSecret(req.headers.get("x-mayar-internal-token") || "", Deno.env.get("MAYAR_INTERNAL_TOKEN"));
}
export async function verifiedStaff(token: unknown): Promise<string | null> {
  if (typeof token !== "string" || !token.trim() || token.length > 4096 || token.startsWith("local_yumi_session")) return null;
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) return null;
  async function row(table: string, params: Record<string, string>) {
    const res = await fetch(`${base}/rest/v1/${table}?${new URLSearchParams({ ...params, limit: "1" })}`, {
      headers: { apikey: key!, Authorization: `Bearer ${key}`, "Accept-Profile": "public" },
      signal: AbortSignal.timeout(10000), redirect: "error",
    });
    if (!res.ok) throw new Error("Staff verification unavailable");
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] : null;
  }
  const session = await row("yumi_sessions", { select: "user_source_id,expires_at", token: `eq.${token.trim()}`, expires_at: `gt.${new Date().toISOString()}` });
  if (!session?.user_source_id || !(Date.parse(session.expires_at) > Date.now())) return null;
  const user = await row("yumi_users", { select: "source_id,role_source_id,is_active", source_id: `eq.${session.user_source_id}` });
  if (user?.is_active !== true || !user.role_source_id) return null;
  const role = await row("yumi_roles", { select: "name", source_id: `eq.${user.role_source_id}` });
  if (!["owner", "admin", "manager", "supervisor"].includes(String(role?.name || "").trim().toLowerCase())) return null;
  return user.source_id;
}
