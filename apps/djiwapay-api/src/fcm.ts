import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Firebase Cloud Messaging (HTTP v1) for the Android app. Set FCM_SERVICE_ACCOUNT (the service-account JSON, as text) or
 * FCM_SERVICE_ACCOUNT_FILE (a path). Without it Android is simply "not configured": devices still register, nothing is sent.
 */
export type FcmAccount = { project_id: string; client_email: string; private_key: string };
export function fcmAccount(env: Record<string, string | undefined> = process.env): FcmAccount | null {
  try {
    let raw = env.FCM_SERVICE_ACCOUNT?.trim();
    if (!raw && env.FCM_SERVICE_ACCOUNT_FILE) raw = readFileSync(env.FCM_SERVICE_ACCOUNT_FILE, "utf8");
    if (!raw) return null;
    const j = JSON.parse(raw);
    return j.project_id && j.client_email && j.private_key ? { project_id: j.project_id, client_email: j.client_email, private_key: j.private_key } : null;
  } catch { return null; }
}

const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");
export function signJwt(acc: FcmAccount, now = Date.now()) {
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" })), iat = Math.floor(now / 1000);
  const body = b64(JSON.stringify({ iss: acc.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(acc.private_key).toString("base64url");
  return `${head}.${body}.${sig}`;
}

type F = typeof fetch;
let cached: { token: string; exp: number } | null = null;
async function accessToken(acc: FcmAccount, f: F) {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await f("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${signJwt(acc)}` });
  const j = await res.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
  if (!res.ok || !j?.access_token) throw new Error(`FCM_AUTH_${res.status}`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

export type FcmMessage = { title: string; body: string; image?: string | null; data?: Record<string, string>; channel?: string };
export type FcmResult = { ok: true } | { ok: false; dead: boolean; error: string };

/** Builds the HTTP v1 body. Data values must all be strings. */
export function fcmBody(token: string, m: FcmMessage) {
  const data: Record<string, string> = {}; for (const [k, v] of Object.entries(m.data ?? {})) data[k] = String(v);
  return { message: { token, notification: { title: m.title, body: m.body, ...(m.image ? { image: m.image } : {}) }, data, android: { priority: "HIGH", notification: { channel_id: m.channel ?? "promo", ...(m.image ? { image: m.image } : {}) } } } };
}

export async function sendFcm(token: string, m: FcmMessage, opts: { account?: FcmAccount | null; fetch?: F } = {}): Promise<FcmResult> {
  const acc = opts.account === undefined ? fcmAccount() : opts.account, f = opts.fetch ?? fetch;
  if (!acc) return { ok: false, dead: false, error: "FCM_NOT_CONFIGURED" };
  try {
    const res = await f(`https://fcm.googleapis.com/v1/projects/${acc.project_id}/messages:send`, { method: "POST", headers: { Authorization: `Bearer ${await accessToken(acc, f)}`, "Content-Type": "application/json" }, body: JSON.stringify(fcmBody(token, m)) });
    if (res.ok) return { ok: true };
    const j = await res.json().catch(() => null) as { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } } | null;
    const code = j?.error?.details?.find((x) => x.errorCode)?.errorCode ?? j?.error?.status ?? `HTTP_${res.status}`;
    return { ok: false, dead: res.status === 404 || code === "UNREGISTERED" || (res.status === 400 && code === "INVALID_ARGUMENT"), error: code };
  } catch (e) { return { ok: false, dead: false, error: e instanceof Error ? e.message.slice(0, 80) : "NETWORK" }; }
}
