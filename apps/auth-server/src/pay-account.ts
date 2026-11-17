import type { Hono } from "hono";
import type { Pool } from "pg";

/**
 * Djiwa Pay account and PIN. One Better Auth user serves Djiwa Tentram, Djiwa Travel and Djiwa Pay, so profile data lives in
 * pos.customers (shared) and the PIN in pos.customer_pins. The PIN is checked on the server for every payment that moves money.
 */
declare const Bun: { password: { hash(password: string, options?: unknown): Promise<string>; verify(password: string, hash: string): Promise<boolean> } };
type Session = { userId: string; customer: Record<string, any> };
export type PayAccountDeps = {
  app: Hono; pool: Pool; auth: any; privateJson: (body: Record<string, unknown>, status?: number) => Response;
  requirePaySession: (headers: Headers) => Promise<Session | null>; revokePaySessions: (userId: string) => void;
};

const MAX_ATTEMPTS = 5, LOCK_MINUTES = 15;
const WEAK = new Set(["000000", "111111", "222222", "333333", "444444", "555555", "666666", "777777", "888888", "999999", "123456", "654321", "012345", "543210", "112233", "121212", "123123"]);
export const isValidPin = (pin: unknown): pin is string => typeof pin === "string" && /^\d{6}$/.test(pin);
export const isWeakPin = (pin: string) => WEAK.has(pin);

export type PinVerdict = { ok: true } | { ok: false; status: number; error: "PIN_REQUIRED" | "PIN_NOT_SET" | "PIN_INVALID" | "PIN_LOCKED"; attemptsLeft?: number; lockedUntil?: string };

/** Checks a PIN for a customer, counting wrong tries and locking after too many. */
export async function checkPin(pool: Pool, customerId: string, pin: unknown): Promise<PinVerdict> {
  const row = (await pool.query("SELECT pin_hash, failed_attempts, locked_until FROM pos.customer_pins WHERE customer_id = $1", [customerId])).rows[0];
  if (!row) return { ok: false, status: 403, error: "PIN_NOT_SET" };
  if (row.locked_until && new Date(row.locked_until) > new Date()) return { ok: false, status: 423, error: "PIN_LOCKED", lockedUntil: new Date(row.locked_until).toISOString() };
  if (!isValidPin(pin)) return { ok: false, status: 403, error: "PIN_REQUIRED", attemptsLeft: MAX_ATTEMPTS - Number(row.failed_attempts) };
  const good = await Bun.password.verify(pin, row.pin_hash).catch(() => false);
  if (good) { if (Number(row.failed_attempts) > 0 || row.locked_until) await pool.query("UPDATE pos.customer_pins SET failed_attempts = 0, locked_until = NULL WHERE customer_id = $1", [customerId]); return { ok: true }; }
  const failed = Number(row.failed_attempts) + 1, lock = failed >= MAX_ATTEMPTS;
  await pool.query("UPDATE pos.customer_pins SET failed_attempts = $2, locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE NULL END WHERE customer_id = $1", [customerId, lock ? 0 : failed, lock, LOCK_MINUTES]);
  return lock ? { ok: false, status: 423, error: "PIN_LOCKED", lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() } : { ok: false, status: 403, error: "PIN_INVALID", attemptsLeft: MAX_ATTEMPTS - failed };
}
type PinFail = Exclude<PinVerdict, { ok: true }>;
export const pinResponse = (json: PayAccountDeps["privateJson"], verdict: PinVerdict) => { if (verdict.ok) return json({ success: true }); const v = verdict as PinFail; return json({ success: false, error: v.error, ...(v.attemptsLeft !== undefined ? { attemptsLeft: v.attemptsLeft } : {}), ...(v.lockedUntil ? { lockedUntil: v.lockedUntil } : {}) }, v.status); };

export const normalizePhone = (raw: unknown): string | null => {
  const d = String(raw ?? "").replace(/[^\d+]/g, "").replace(/^\+62/, "0").replace(/^62/, "0");
  return /^0\d{8,13}$/.test(d) ? d : null;
};
const text = (v: unknown, max: number) => { const s = String(v ?? "").trim(); return s.length > max ? s.slice(0, max) : s; };

export function registerPayAccount(d: PayAccountDeps) {
  const { app, pool, auth, privateJson: json, requirePaySession } = d;

  const pinState = async (customerId: string) => {
    const r = (await pool.query("SELECT locked_until FROM pos.customer_pins WHERE customer_id = $1", [customerId])).rows[0];
    return { set: Boolean(r), lockedUntil: r?.locked_until && new Date(r.locked_until) > new Date() ? new Date(r.locked_until).toISOString() : null };
  };

  app.get("/api/pay-bridge/pin/status", async (c) => {
    const s = await requirePaySession(c.req.raw.headers); if (!s) return json({ success: false, error: "UNAUTHORIZED" }, 401);
    return json({ success: true, ...(await pinState(s.userId)) });
  });

  app.post("/api/pay-bridge/pin/set", async (c) => {
    const s = await requirePaySession(c.req.raw.headers); if (!s) return json({ success: false, error: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => ({})) as { pin?: unknown };
    if (!isValidPin(body.pin)) return json({ success: false, error: "INVALID_PIN" }, 400);
    if (isWeakPin(body.pin)) return json({ success: false, error: "WEAK_PIN" }, 400);
    const hash = await Bun.password.hash(body.pin, { algorithm: "argon2id" });
    const r = await pool.query("INSERT INTO pos.customer_pins(customer_id, pin_hash) VALUES ($1,$2) ON CONFLICT (customer_id) DO NOTHING RETURNING customer_id", [s.userId, hash]);
    if (!r.rows[0]) return json({ success: false, error: "PIN_EXISTS" }, 409);
    return json({ success: true });
  });

  app.post("/api/pay-bridge/pin/verify", async (c) => {
    const s = await requirePaySession(c.req.raw.headers); if (!s) return json({ success: false, error: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => ({})) as { pin?: unknown };
    const v = await checkPin(pool, s.userId, body.pin);
    return v.ok ? json({ success: true }) : pinResponse(json, v);
  });

  app.post("/api/pay-bridge/pin/change", async (c) => {
    const s = await requirePaySession(c.req.raw.headers); if (!s) return json({ success: false, error: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => ({})) as { pin?: unknown; newPin?: unknown };
    if (!isValidPin(body.newPin)) return json({ success: false, error: "INVALID_PIN" }, 400);
    if (isWeakPin(body.newPin)) return json({ success: false, error: "WEAK_PIN" }, 400);
    const v = await checkPin(pool, s.userId, body.pin); if (!v.ok) return pinResponse(json, v);
    await pool.query("UPDATE pos.customer_pins SET pin_hash = $2, failed_attempts = 0, locked_until = NULL, updated_at = now() WHERE customer_id = $1", [s.userId, await Bun.password.hash(body.newPin, { algorithm: "argon2id" })]);
    return json({ success: true });
  });

  /** Forgot PIN: prove who you are with the account password, then choose a new PIN. */
  app.post("/api/pay-bridge/pin/reset", async (c) => {
    const s = await requirePaySession(c.req.raw.headers); if (!s) return json({ success: false, error: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => ({})) as { password?: unknown; newPin?: unknown };
    if (!isValidPin(body.newPin)) return json({ success: false, error: "INVALID_PIN" }, 400);
    if (isWeakPin(body.newPin)) return json({ success: false, error: "WEAK_PIN" }, 400);
    const email = String(s.customer.email || ""), password = typeof body.password === "string" ? body.password : "";
    const cred = (await pool.query(`SELECT 1 FROM public.account WHERE "userId" = $1 AND "providerId" = 'credential' LIMIT 1`, [s.userId])).rows[0];
    if (!cred) return json({ success: false, error: "NO_PASSWORD" }, 409);
    const ok = password.length >= 8 && await auth.api.signInEmail({ body: { email, password } }).then(() => true).catch(() => false);
    if (!ok) return json({ success: false, error: "WRONG_PASSWORD" }, 403);
    await pool.query("INSERT INTO pos.customer_pins(customer_id, pin_hash) VALUES ($1,$2) ON CONFLICT (customer_id) DO UPDATE SET pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = NULL, updated_at = now()", [s.userId, await Bun.password.hash(body.newPin, { algorithm: "argon2id" })]);
    return json({ success: true });
  });

  app.get("/api/pay-bridge/account", async (c) => {
    const s = await requirePaySession(c.req.raw.headers); if (!s) return json({ success: false, error: "UNAUTHORIZED" }, 401);
    const [row, accounts, user, pin] = await Promise.all([
      pool.query("SELECT * FROM public.pos_customers_view WHERE source_id = $1 LIMIT 1", [s.userId]),
      pool.query(`SELECT "providerId" FROM public.account WHERE "userId" = $1`, [s.userId]),
      pool.query(`SELECT "emailVerified" FROM public."user" WHERE id = $1`, [s.userId]),
      pinState(s.userId),
    ]);
    const p = row.rows[0] ?? {}, providers = accounts.rows.map((r) => String(r.providerId));
    return json({ success: true,
      profile: { name: p.name ?? null, nickname: p.nickname ?? null, email: p.email ?? s.customer.email ?? null, phone: p.phone ?? null, birthDate: p.birth_date ? new Date(p.birth_date).toISOString().slice(0, 10) : null, gender: p.gender ?? null, address: p.address ?? null, city: p.city ?? null, province: p.province ?? null, postalCode: p.postal_code ?? null, marketingConsent: Boolean(p.marketing_consent), photoUrl: p.photo_url ?? null },
      methods: { password: providers.includes("credential"), google: providers.includes("google"), emailVerified: Boolean(user.rows[0]?.emailVerified) }, pin });
  });

  app.patch("/api/pay-bridge/account", async (c) => {
    const s = await requirePaySession(c.req.raw.headers); if (!s) return json({ success: false, error: "UNAUTHORIZED" }, 401);
    const b = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const sets: string[] = [], vals: unknown[] = [s.userId];
    const put = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    const cur = (await pool.query("SELECT name, phone FROM pos.customers WHERE source_id = $1 AND is_active = true", [s.userId])).rows[0];
    if (!cur) return json({ success: false, error: "CUSTOMER_NOT_FOUND" }, 404);
    if ("name" in b) { const n = text(b.name, 80); if (n.length < 2) return json({ success: false, error: "INVALID_NAME" }, 400); put("name", n); }
    if ("nickname" in b) put("nickname", text(b.nickname, 30) || null);
    if ("phone" in b) {
      const raw = String(b.phone ?? "").trim(), phone = raw === "" ? null : normalizePhone(raw);
      if (raw !== "" && !phone) return json({ success: false, error: "INVALID_PHONE" }, 400);
      if (phone !== (cur.phone ?? null)) { const v = await checkPin(pool, s.userId, b.pin); if (!v.ok) return pinResponse(json, v); }
      put("phone", phone);
    }
    if ("birthDate" in b) { const raw = String(b.birthDate ?? ""); if (raw && (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || raw < "1900-01-01" || raw > new Date().toISOString().slice(0, 10))) return json({ success: false, error: "INVALID_BIRTH_DATE" }, 400); put("birth_date", raw || null); }
    if ("gender" in b) { const g = String(b.gender ?? ""); if (g && !["male", "female", "other"].includes(g)) return json({ success: false, error: "INVALID_GENDER" }, 400); put("gender", g || null); }
    if ("address" in b) put("address", text(b.address, 200) || null);
    if ("city" in b) put("city", text(b.city, 60) || null);
    if ("province" in b) put("province", text(b.province, 60) || null);
    if ("postalCode" in b) { const z = String(b.postalCode ?? "").replace(/\D/g, "").slice(0, 10); put("postal_code", z || null); }
    if ("marketingConsent" in b) put("marketing_consent", Boolean(b.marketingConsent));
    if (!sets.length) return json({ success: false, error: "NOTHING_TO_UPDATE" }, 400);
    try {
      await pool.query(`UPDATE pos.customers SET ${sets.join(", ")}, updated_at = now(), profile_completed_at = COALESCE(profile_completed_at, CASE WHEN name IS NOT NULL AND phone IS NOT NULL THEN now() END) WHERE source_id = $1`, vals);
      if ("name" in b) await pool.query(`UPDATE public."user" SET name = $2, "updatedAt" = now() WHERE id = $1`, [s.userId, text(b.name, 80)]);
    } catch (e: any) { if (e?.code === "23505") return json({ success: false, error: "PHONE_TAKEN" }, 409); throw e; }
    return json({ success: true });
  });

  /** Sets a first password for someone who signed up with Google. Changing an existing one goes through Better Auth directly. */
  app.post("/api/pay-bridge/account/password", async (c) => {
    const s = await requirePaySession(c.req.raw.headers); if (!s) return json({ success: false, error: "UNAUTHORIZED" }, 401);
    const b = await c.req.json().catch(() => ({})) as { newPassword?: unknown; pin?: unknown };
    const v = await checkPin(pool, s.userId, b.pin); if (!v.ok) return pinResponse(json, v);
    const pw = typeof b.newPassword === "string" ? b.newPassword : "";
    if (pw.length < 8 || pw.length > 128) return json({ success: false, error: "WEAK_PASSWORD" }, 400);
    const has = (await pool.query(`SELECT 1 FROM public.account WHERE "userId" = $1 AND "providerId" = 'credential' LIMIT 1`, [s.userId])).rows[0];
    if (has) return json({ success: false, error: "HAS_PASSWORD" }, 409);
    try { await auth.api.setPassword({ body: { newPassword: pw }, headers: c.req.raw.headers }); } catch { return json({ success: false, error: "SESSION_REQUIRED" }, 401); }
    return json({ success: true });
  });

  /**
   * Closes the account for every Djiwa app. Needs the PIN and the word HAPUS, and an empty wallet. The row is deactivated and made
   * anonymous instead of deleted, so order history and receipts stay consistent.
   */
  app.post("/api/pay-bridge/account/delete", async (c) => {
    const s = await requirePaySession(c.req.raw.headers); if (!s) return json({ success: false, error: "UNAUTHORIZED" }, 401);
    const b = await c.req.json().catch(() => ({})) as { pin?: unknown; confirm?: unknown };
    if (b.confirm !== "HAPUS") return json({ success: false, error: "CONFIRM_REQUIRED" }, 400);
    const v = await checkPin(pool, s.userId, b.pin); if (!v.ok) return pinResponse(json, v);
    const w = (await pool.query("SELECT COALESCE(available_balance,0)::bigint AS a, COALESCE(held_balance,0)::bigint AS h FROM pos.customer_wallets WHERE customer_id = $1", [s.userId])).rows[0];
    if (w && (Number(w.a) > 0 || Number(w.h) > 0)) return json({ success: false, error: "WALLET_NOT_EMPTY" }, 409);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE pos.customers SET is_active = false, name = 'Akun dihapus', nickname = NULL, phone = NULL, address = NULL, city = NULL, province = NULL, postal_code = NULL, birth_date = NULL, photo_url = NULL, marketing_consent = false, updated_at = now() WHERE source_id = $1", [s.userId]);
      await client.query("DELETE FROM pos.customer_pins WHERE customer_id = $1", [s.userId]);
      await client.query(`DELETE FROM public.session WHERE "userId" = $1`, [s.userId]);
      await client.query(`DELETE FROM public.account WHERE "userId" = $1`, [s.userId]);
      await client.query(`UPDATE public."user" SET name = 'Akun dihapus', email = 'deleted+' || id || '@djiwapay.invalid', image = NULL, "emailVerified" = false, "updatedAt" = now() WHERE id = $1`, [s.userId]);
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
    d.revokePaySessions(s.userId);
    return json({ success: true });
  });
}
