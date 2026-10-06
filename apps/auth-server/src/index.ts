import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { auth, pool } from "./auth.js";
import { staffAuth } from "./staff-auth.js";
import { registerKolPortalRoutes } from "./kol-portal.js";
import { investorAuth, registerInvestorPortalRoutes } from "./investor-portal.js";
import { buildCoffeePassportStickerPrompt, generateCoffeePassportPng, stickerModel, stickerPromptVersion } from "./coffee-passport-sticker.js";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHmac } from "node:crypto";

const app = new Hono();
const MAYAR_PROXY_URL = process.env.MAYAR_PROXY_URL || "https://supabase.yumme.id/functions/v1/mayar-proxy";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const MAYAR_DEFAULT_MOBILE = process.env.MAYAR_DEFAULT_MOBILE || "";
const customerOrigins = [
  "https://djiwatentram.yumme.id",
  "https://investor.yumme.id",
  "https://merchandise.yumme.id",
  "https://booking.yumme.id",
  "https://b2b.yumme.id",
  "https://ordermieyamin.yumme.id",
  "https://500kopitasik.yumme.id",
  "https://kolmarketing.yumme.id",
  "https://rekrutmen.yumme.id",
  "http://localhost:5173",
  "http://localhost:3010",
];
const stickerRateLimit = new Map<string, number[]>();

function allowStickerRequest(key: string) {
  const now = Date.now();
  const recent = (stickerRateLimit.get(key) || []).filter((timestamp) => now - timestamp < 10 * 60 * 1000);
  if (recent.length >= 3) {
    stickerRateLimit.set(key, recent);
    return false;
  }
  recent.push(now);
  stickerRateLimit.set(key, recent);
  return true;
}

// CORS — allow customer app domain with credentials
app.use(
  "/api/auth/*",
  cors({
    origin: customerOrigins,
    allowHeaders: ["Content-Type", "Authorization", "X-Visitor-Id", "X-Request-Id"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    credentials: true,
  }),
);

// Customer data endpoints also use the Better Auth cross-subdomain session cookie.
app.use(
  "/api/customer/*",
  cors({
    origin: customerOrigins,
    allowHeaders: ["Accept", "Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    credentials: true,
  }),
);

// CORS — passport data is requested from the 500 Kopi subdomain.
app.use(
  "/api/coffee-passport/*",
  cors({
    origin: ["https://500kopitasik.yumme.id", "http://localhost:3010"],
    allowHeaders: ["Accept", "Content-Type", "X-Request-Id"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

// Recruitment uses the same Google/customer OAuth client and callback.
app.get("/api/auth/recruitment-session", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const email = session?.user?.email?.trim().toLowerCase();
  if (!session?.user?.id || !email || !RECRUITMENT_BRIDGE_SECRET) return c.json({ success: false, error: "HRD_REQUIRED" }, 403);
  let employee = await pool.query(`SELECT source_id, is_active FROM public.yumi_users WHERE lower(btrim(email)) = $1 LIMIT 1`, [email]);
  if (!employee.rows[0]) {
    const role = await pool.query(`SELECT source_id FROM public.yumi_roles WHERE lower(btrim(name)) = 'hrd' LIMIT 1`);
    const roleId = role.rows[0]?.source_id || "role_hrd";
    if (!role.rows[0]) await pool.query(`INSERT INTO public.yumi_roles (source_id, name, permissions, raw) VALUES ($1, 'HRD', '[]'::jsonb, jsonb_build_object('source', 'recruitment_google')) ON CONFLICT DO NOTHING`, [roleId]);
    const sourceId = `hrd_${crypto.randomUUID().replace(/-/g, "")}`;
    const username = `google_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    await pool.query(`INSERT INTO public.yumi_users (source_id, username, name, role_source_id, is_active, auth_user_id, email, slug, raw) VALUES ($1, $2, $3, $4, false, $5, $6, $2, jsonb_build_object('registrationStatus', 'pending', 'registrationSource', 'recruitment_google'))`, [sourceId, username, session.user.name || email, roleId, session.user.id, email]);
    employee = await pool.query(`SELECT source_id, is_active FROM public.yumi_users WHERE source_id = $1`, [sourceId]);
  }
  if (!employee.rows[0]?.is_active) return c.json({ success: false, error: "HRD_PENDING", pending: true }, 403);
  const payload = Buffer.from(JSON.stringify({ sub: session.user.id, role: "HRD", exp: Date.now() + 8 * 60 * 60 * 1000 })).toString("base64url");
  const signature = createHmac("sha256", RECRUITMENT_BRIDGE_SECRET).update(payload).digest("base64url");
  return c.json({ success: true, token: `${payload}.${signature}`, role: "HRD" });
});

// Better Auth handler (customer)
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// Investor auth/data-room boundary. This origin list is intentionally narrower than customer CORS.
app.use(
  "/api/investor-auth/*",
  cors({
    origin: ["https://investor.yumme.id", "http://localhost:5173", "http://localhost:5174", "http://localhost:3011"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    credentials: true,
  }),
);
app.use(
  "/api/investor/*",
  cors({
    origin: ["https://investor.yumme.id", "http://localhost:5173", "http://localhost:5174", "http://localhost:3011"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    credentials: true,
  }),
);
registerInvestorPortalRoutes(app, investorAuth, pool);

// CORS — authenticated KOL profile/claim requests from kolmarketing.
app.use(
  "/api/kol/*",
  cors({
    origin: ["https://kolmarketing.yumme.id", "http://localhost:3010"],
    allowHeaders: ["Accept", "Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.post("/api/kol/claim", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const email = session?.user?.email?.trim().toLowerCase();
  if (!session?.user?.id || !email) return privateJson({ success: false, error: "UNAUTHORIZED" }, 401);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE public."user" SET user_type = 'kol' WHERE id = $1`, [session.user.id]);
    const owned = await client.query(
      `SELECT c.source_id, c.name, c.username, c.status
         FROM pos.kol_creators c
        WHERE c.auth_user_id = $1
        LIMIT 1`,
      [session.user.id],
    );
    if (owned.rows.length === 1) {
      await client.query("COMMIT");
      return privateJson({ success: true, userType: "kol", userId: session.user.id, linked: true, ambiguous: false, profile: owned.rows[0] });
    }
    const matches = await client.query(
      `SELECT c.source_id, c.name, c.username, c.status
         FROM pos.kol_creators c
         JOIN pos.kol_private_contacts p ON p.kol_id = c.source_id
        WHERE lower(btrim(p.email)) = $1
        FOR UPDATE OF c`,
      [email],
    );
    if (matches.rows.length === 1) {
      const match = matches.rows[0];
      await client.query(
        `UPDATE pos.kol_creators SET auth_user_id = $1, updated_at = now()
          WHERE source_id = $2 AND (auth_user_id IS NULL OR auth_user_id = $1)`,
        [session.user.id, match.source_id],
      );
      await client.query("COMMIT");
      return privateJson({ success: true, userType: "kol", userId: session.user.id, linked: true, ambiguous: false, profile: match });
    }
    await client.query("COMMIT");
    return privateJson({ success: true, userType: "kol", userId: session.user.id, linked: false, ambiguous: matches.rows.length > 1, profile: null });
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      return privateJson({ success: true, userType: "kol", userId: session.user.id, linked: false, ambiguous: true, profile: null });
    }
    throw error;
  } finally {
    client.release();
  }
});

registerKolPortalRoutes(app, auth, pool);

// ── Better Auth KARYAWAN (staff) ──────────────────────────────────
const RECRUITMENT_BRIDGE_SECRET = process.env.REKRUTMEN_AUTH_BRIDGE_SECRET || "";
const staffOrigins = [
  "https://karyawan.yumme.id",
  "https://rekrutmen.yumme.id",
  "http://localhost:5173",
  "http://localhost:5174",
];

app.use(
  "/api/staff-auth/*",
  cors({
    origin: staffOrigins,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    credentials: true,
  }),
);

app.get("/api/staff-auth/recruitment-session", async (c) => {
  const session = await staffAuth.api.getSession({ headers: c.req.raw.headers });
  const email = session?.user?.email?.trim().toLowerCase();
  if (!session?.user?.id || !email || !RECRUITMENT_BRIDGE_SECRET) {
    return c.json({ success: false, error: "HRD_REQUIRED" }, 403);
  }
  const employee = await pool.query(
    `SELECT source_id FROM public.yumi_users
      WHERE is_active = true AND lower(btrim(email)) = $1 LIMIT 1`,
    [email],
  );
  if (!employee.rows[0]) return c.json({ success: false, error: "HRD_REQUIRED" }, 403);
  const payload = Buffer.from(JSON.stringify({ sub: session.user.id, role: "HRD", exp: Date.now() + 8 * 60 * 60 * 1000 })).toString("base64url");
  const signature = createHmac("sha256", RECRUITMENT_BRIDGE_SECRET).update(payload).digest("base64url");
  return c.json({ success: true, token: `${payload}.${signature}`, role: "HRD" });
});

app.on(["POST", "GET"], "/api/staff-auth/*", (c) => {
  return staffAuth.handler(c.req.raw);
});

// Bridge: Better Auth staff session → Yumi session (ys_) supaya useYumiAuth jalan
app.post("/api/staff/yumi-login", async (c) => {
  const session = await staffAuth.api.getSession({ headers: c.req.raw.headers });
  const yumiSourceId = String((session?.user as { metadata?: { yumiSourceId?: string } } | undefined)?.metadata?.yumiSourceId ?? "");
  if (!session || !yumiSourceId) {
    return privateJson({ success: false, error: "UNAUTHORIZED" }, 401);
  }
  const yumi = await pool.query(
    `SELECT u.source_id, u.name, u.is_active
       FROM public.yumi_users u
      WHERE u.source_id = $1 LIMIT 1`,
    [yumiSourceId],
  );
  const staff = yumi.rows[0];
  if (!staff || !staff.is_active) {
    return privateJson({ success: false, error: "STAFF_INACTIVE" }, 403);
  }
  const token = `ys_${crypto.randomUUID().replace(/-/g, "")}_${crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 18)}`;
  await pool.query(
    `INSERT INTO public.yumi_sessions (token, user_source_id, expires_at)
     VALUES ($1, $2, now() + interval '24 hours')`,
    [token, staff.source_id],
  );
  return privateJson({ success: true, token, user: staff });
});

app.use(
  "/api/customer/*",
  cors({
    origin: customerOrigins,
    allowHeaders: ["Content-Type"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    credentials: true,
  }),
);

type PassportShop = {
  shop_id: string;
  name: string;
  slug: string;
  area: string | null;
  description: string | null;
  cover_url: string | null;
  google_maps_url: string | null;
  current_bid_amount: number;
};

async function requirePassportSession(headers: Headers) {
  const session = await requireCustomerSession(headers);
  if (!session?.user?.id) return null;
  const customer = await pool.query(
    "SELECT source_id, name, email, phone, photo_url FROM public.pos_customers_view WHERE source_id = $1 LIMIT 1",
    [session.user.id],
  );
  if (!customer.rows[0]) return null;
  return { user: session.user, customer: customer.rows[0] };
}

app.get("/api/coffee-passport/bootstrap", async (c) => {
  const session = await requirePassportSession(c.req.raw.headers);
  const shops = await pool.query<PassportShop>(
    "SELECT shop_id, name, slug, area, description, cover_url, google_maps_url, current_bid_amount FROM pos.coffee_passport_shops WHERE is_active = true AND verification_status = 'approved' ORDER BY current_bid_amount DESC, name ASC",
  );
  if (!session) {
    return privateJson({ success: true, authenticated: false, customer: null, shops: shops.rows, visits: [], collection: [], rewards: { available: 0, count: 0 } });
  }
  const [visits, collection, rewards] = await Promise.all([
    pool.query("SELECT v.visit_id, v.shop_id, s.name AS shop_name, v.photo_path, v.photo_category, v.title, v.description, v.status, v.created_at, st.sticker_id, st.sticker_path, st.status AS sticker_status FROM pos.coffee_passport_visits v JOIN pos.coffee_passport_shops s ON s.shop_id = v.shop_id LEFT JOIN pos.coffee_passport_stickers st ON st.visit_id = v.visit_id WHERE v.customer_id = $1 ORDER BY v.created_at DESC LIMIT 100", [session.user.id]),
    pool.query("SELECT v.customer_id, v.shop_id, s.name AS shop_name, s.slug AS shop_slug, min(v.created_at) AS first_visit_at, count(*)::integer AS visit_count, true AS sticker_completed FROM pos.coffee_passport_visits v JOIN pos.coffee_passport_shops s ON s.shop_id = v.shop_id JOIN pos.coffee_passport_stickers st ON st.visit_id = v.visit_id WHERE v.customer_id = $1 AND v.status IN ('sticker_pending', 'completed') AND st.status = 'completed' GROUP BY v.customer_id, v.shop_id, s.name, s.slug ORDER BY first_visit_at DESC", [session.user.id]),
    pool.query("SELECT COALESCE(sum(amount) FILTER (WHERE status = 'available'), 0)::bigint AS available, count(*) FILTER (WHERE status IN ('available','redeemed'))::integer AS count FROM pos.coffee_passport_rewards WHERE customer_id = $1", [session.user.id]),
  ]);
  return privateJson({ success: true, authenticated: true, customer: session.customer, shops: shops.rows, visits: visits.rows, collection: collection.rows, rewards: rewards.rows[0] ?? { available: 0, count: 0 } });
});

app.post("/api/coffee-passport/visits/create", async (c) => {
  const session = await requirePassportSession(c.req.raw.headers);
  if (!session) return privateJson({ success: false, message: "Silakan masuk terlebih dahulu." }, 401);
  const body = await c.req.json().catch(() => ({})) as { shop_id?: unknown; idempotency_key?: unknown; photo_data_url?: unknown };
  const shopId = typeof body.shop_id === "string" ? body.shop_id.trim() : "";
  const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  const photoDataUrl = typeof body.photo_data_url === "string" ? body.photo_data_url : "";
  if (!/^shop_[A-Za-z0-9_-]{8,120}$/.test(shopId) || !/^[A-Za-z0-9_-]{12,160}$/.test(idempotencyKey)) return privateJson({ success: false, message: "Data visit tidak valid." }, 400);
  const match = photoDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return privateJson({ success: false, message: "Foto visit wajib berupa JPG, PNG, atau WebP." }, 400);
  const rawPhoto = Buffer.from(match[2], "base64");
  if (rawPhoto.byteLength < 100 || rawPhoto.byteLength > 8 * 1024 * 1024) return privateJson({ success: false, message: "Ukuran foto harus antara 100 byte dan 8 MB." }, 413);
  const shop = await pool.query<PassportShop>("SELECT shop_id, name, slug, area, description, cover_url, google_maps_url, current_bid_amount FROM pos.coffee_passport_shops WHERE shop_id = $1 AND is_active = true AND verification_status = 'approved' LIMIT 1", [shopId]);
  if (!shop.rows[0]) return privateJson({ success: false, message: "Coffee shop official tidak ditemukan." }, 404);
  const existing = await pool.query("SELECT visit_id FROM pos.coffee_passport_visits WHERE customer_id = $1 AND idempotency_key = $2 LIMIT 1", [session.user.id, idempotencyKey]);
  if (existing.rows[0]) return privateJson({ success: true, status: "duplicate", visit_id: existing.rows[0].visit_id, shop_id: shopId });
  const visitId = `vst_${crypto.randomUUID().replace(/-/g, "")}`;
  const extension = match[1] === "image/png" ? "png" : match[1] === "image/webp" ? "webp" : "jpg";
  const photoRoot = process.env.COFFEE_PASSPORT_PHOTO_DIR || join(process.cwd(), ".runtime", "coffee-passport-photos");
  const photoFilename = `${visitId}_${crypto.randomUUID().replace(/-/g, "")}.${extension}`;
  await mkdir(photoRoot, { recursive: true, mode: 0o750 });
  await writeFile(join(photoRoot, photoFilename), rawPhoto, { mode: 0o640 });
  try {
    await pool.query("INSERT INTO pos.coffee_passport_visits (visit_id, customer_id, shop_id, photo_path, photo_category, title, status, idempotency_key, captured_at) VALUES ($1, $2, $3, $4, 'other', $5, 'recorded', $6, now())", [visitId, session.user.id, shopId, photoFilename, shop.rows[0].name, idempotencyKey]);
    return privateJson({ success: true, status: "saved", visit_id: visitId, shop_id: shopId, message: "Foto visit tersimpan. Sticker passport siap dibuat." });
  } catch (error) {
    await unlink(join(photoRoot, photoFilename)).catch(() => undefined);
    if ((error as { code?: string }).code === "23505") return privateJson({ success: false, message: "Visit sedang diproses. Coba lagi." }, 409);
    throw error;
  }
});

app.post("/api/coffee-passport/collect", async (c) => {
  const session = await requirePassportSession(c.req.raw.headers);
  if (!session) return privateJson({ success: false, message: "Silakan masuk terlebih dahulu." }, 401);
  const body = await c.req.json().catch(() => ({})) as { shop_id?: unknown; idempotency_key?: unknown };
  const shopId = typeof body.shop_id === "string" ? body.shop_id.trim() : "";
  const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  if (!/^shop_[A-Za-z0-9_-]{8,120}$/.test(shopId)) return privateJson({ success: false, message: "Pilih kedai resmi terlebih dahulu." }, 400);
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(idempotencyKey)) return privateJson({ success: false, message: "Stamp belum bisa disimpan. Coba lagi." }, 400);

  const existingRequest = await pool.query("SELECT visit_id, shop_id FROM pos.coffee_passport_visits WHERE customer_id = $1 AND idempotency_key = $2 LIMIT 1", [session.user.id, idempotencyKey]);
  if (existingRequest.rows[0]) return privateJson({ success: true, status: "saved", duplicate: true, visit_id: existingRequest.rows[0].visit_id, shop_id: existingRequest.rows[0].shop_id });

  const shop = await pool.query<PassportShop>("SELECT shop_id, name, slug, area, description, cover_url, google_maps_url, current_bid_amount FROM pos.coffee_passport_shops WHERE shop_id = $1 AND is_active = true AND verification_status = 'approved' LIMIT 1", [shopId]);
  if (!shop.rows[0]) return privateJson({ success: false, message: "Kedai official tidak ditemukan atau belum disetujui." }, 404);
  const duplicate = await pool.query("SELECT visit_id FROM pos.coffee_passport_visits WHERE customer_id = $1 AND shop_id = $2 AND status <> 'failed' LIMIT 1", [session.user.id, shop.rows[0].shop_id]);
  if (duplicate.rows[0]) return privateJson({ success: true, status: "duplicate", duplicate: true, visit_id: duplicate.rows[0].visit_id, shop_id: shop.rows[0].shop_id, message: "Kedai ini sudah ada di passport kamu." });
  try {
    const inserted = await pool.query("INSERT INTO pos.coffee_passport_visits (visit_id, customer_id, shop_id, photo_path, photo_category, title, status, idempotency_key) VALUES ($1, $2, $3, NULL, 'other', $4, 'recorded', $5) RETURNING visit_id, shop_id", [`vst_${crypto.randomUUID().replace(/-/g, "")}`, session.user.id, shop.rows[0].shop_id, shop.rows[0].name, idempotencyKey]);
    return privateJson({ success: true, status: "saved", duplicate: false, visit_id: inserted.rows[0].visit_id, shop_id: inserted.rows[0].shop_id, message: "Stamp tersimpan dari data kedai official. Lengkapi foto kunjunganmu." });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return privateJson({ success: true, status: "duplicate", duplicate: true, message: "Kedai ini sudah ada di passport kamu." });
    throw error;
  }
});

function isGoogleMapsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["maps.google.com", "www.google.com", "google.com", "maps.app.goo.gl"].includes(url.hostname.toLowerCase())
      && (url.hostname.toLowerCase() !== "google.com" || url.pathname.startsWith("/maps"));
  } catch { return false; }
}

function normalizeShopName(value: string) {
  return value.toLocaleLowerCase("id-ID").normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");
}

function canonicalMapsUrl(value: string) {
  const url = new URL(value);
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

app.post("/api/coffee-passport/shops/onboard", async (c) => {
  const session = await requirePassportSession(c.req.raw.headers);
  if (!session) return privateJson({ success: false, message: "Silakan masuk terlebih dahulu." }, 401);
  const body = await c.req.json().catch(() => ({})) as { name?: unknown; google_maps_url?: unknown; area?: unknown; mobile?: unknown; description?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const mapsUrl = typeof body.google_maps_url === "string" ? body.google_maps_url.trim() : "";
  const area = typeof body.area === "string" ? body.area.trim().slice(0, 80) : "";
  const mobile = typeof body.mobile === "string" ? body.mobile.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "";
  if (name.length < 2 || name.length > 160) return privateJson({ success: false, message: "Nama coffee shop belum lengkap." }, 400);
  if (!isGoogleMapsUrl(mapsUrl)) return privateJson({ success: false, message: "Isi link Google Maps resmi coffee shop." }, 400);
  const canonicalUrl = canonicalMapsUrl(mapsUrl);
  const normalizedName = normalizeShopName(name);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('500kopitasik:shop-onboard', 0))");
    const existing = await client.query<{ shop_id: string; name: string; google_maps_url: string | null; verification_status: string; is_active: boolean; listing_payment_id: string | null; mayar_invoice_id: string | null; mayar_invoice_url: string | null }>("SELECT s.shop_id, s.name, s.google_maps_url, s.verification_status, s.is_active, p.listing_payment_id, p.mayar_invoice_id, p.mayar_invoice_url FROM pos.coffee_passport_shops s LEFT JOIN pos.coffee_passport_listing_payments p ON p.shop_id = s.shop_id WHERE s.is_active = true OR s.verification_status = 'pending_review' FOR UPDATE OF s");
    const duplicate = existing.rows.find((row: { shop_id: string; name: string; google_maps_url: string | null; verification_status: string; is_active: boolean; listing_payment_id: string | null; mayar_invoice_id: string | null; mayar_invoice_url: string | null }) => normalizeShopName(row.name) === normalizedName || (row.google_maps_url && canonicalMapsUrl(row.google_maps_url) === canonicalUrl));
    if (duplicate) {
      await client.query("COMMIT");
      return privateJson({ success: true, status: duplicate.is_active ? "duplicate" : "pending_payment", duplicate: true, shop_id: duplicate.shop_id, listing_payment_id: duplicate.listing_payment_id, invoice_id: duplicate.mayar_invoice_id, invoice_url: duplicate.mayar_invoice_url, message: duplicate.is_active ? "Coffee shop sudah terdaftar di Jelajah." : "Coffee shop ini menunggu verifikasi pembayaran." });
    }
    const shopId = `shop_${crypto.randomUUID().replace(/-/g, "")}`;
    const listingPaymentId = `listing_${crypto.randomUUID().replace(/-/g, "")}`;
    const idempotencyKey = `listing_${crypto.randomUUID().replace(/-/g, "")}`;
    const slug = `${name.toLocaleLowerCase("id-ID").normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 70)}-${shopId.slice(-8)}`;
    await client.query("INSERT INTO pos.coffee_passport_shops (shop_id, name, slug, area, description, owner_customer_id, google_maps_url, verification_status, is_active) VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), $6, $7, 'pending_review', false)", [shopId, name, slug, area, description, session.user.id, canonicalUrl]);
    await client.query("INSERT INTO pos.coffee_passport_listing_payments (listing_payment_id, shop_id, customer_id, amount, idempotency_key) VALUES ($1, $2, $3, 1000, $4)", [listingPaymentId, shopId, session.user.id, idempotencyKey]);
    await client.query("COMMIT");
    try {
      const invoice = await createListingInvoice(listingPaymentId, name, { ...session.customer, phone: mobile || session.customer.phone });
      await pool.query("UPDATE pos.coffee_passport_listing_payments SET mayar_invoice_id = $1, mayar_invoice_url = $2 WHERE listing_payment_id = $3", [invoice.invoiceId, invoice.link, listingPaymentId]);
      return privateJson({ success: true, status: "pending_payment", duplicate: false, shop_id: shopId, listing_payment_id: listingPaymentId, amount: 1000, invoice_id: invoice.invoiceId, invoice_url: invoice.link, message: "Selesaikan pembayaran Rp1.000 agar coffee shop tampil di Jelajah." });
    } catch (error) {
      await pool.query("UPDATE pos.coffee_passport_listing_payments SET status = 'failed' WHERE listing_payment_id = $1", [listingPaymentId]);
      await pool.query("UPDATE pos.coffee_passport_shops SET verification_status = 'rejected', updated_at = now() WHERE shop_id = $1", [shopId]);
      console.error("Coffee passport listing invoice failed", error);
      return privateJson({ success: false, message: "Pembayaran belum dapat dibuat. Coba lagi." }, 502);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.post("/api/coffee-passport/stickers/generate", async (c) => {
  const session = await requirePassportSession(c.req.raw.headers);
  if (!session) return privateJson({ success: false, message: "Silakan masuk terlebih dahulu." }, 401);
  const body = await c.req.json().catch(() => ({})) as { visit_id?: unknown; idempotency_key?: unknown };
  const visitId = typeof body.visit_id === "string" ? body.visit_id.trim() : "";
  const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  if (!/^vst_[A-Za-z0-9_-]{8,120}$/.test(visitId)) return privateJson({ success: false, message: "Kunjungan tidak valid." }, 400);
  if (!/^[A-Za-z0-9_-]{12,160}$/.test(idempotencyKey)) return privateJson({ success: false, message: "Permintaan sticker tidak valid." }, 400);
  const contentLength = Number(c.req.header("content-length") || 0);
  if (contentLength > 12_000) return privateJson({ success: false, message: "Permintaan terlalu besar." }, 413);
  const forwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowStickerRequest(`${session.user.id}:${forwardedFor}`)) return privateJson({ success: false, message: "Terlalu banyak permintaan. Coba lagi beberapa menit lagi." }, 429);

  const client = await pool.connect();
  let stickerId = "";
  let prompt = "";
  try {
    await client.query("BEGIN");
    const visitResult = await client.query<{ visit_id: string; customer_id: string; title: string; status: string; shop_name: string; area: string | null }>(
      "SELECT v.visit_id, v.customer_id, v.title, v.status, s.name AS shop_name, s.area FROM pos.coffee_passport_visits v JOIN pos.coffee_passport_shops s ON s.shop_id = v.shop_id WHERE v.visit_id = $1 AND v.customer_id = $2 FOR UPDATE",
      [visitId, session.user.id],
    );
    const visit = visitResult.rows[0];
    if (!visit) {
      await client.query("ROLLBACK");
      return privateJson({ success: false, message: "Kunjungan tidak ditemukan." }, 404);
    }
    const existing = await client.query<{ sticker_id: string; sticker_path: string | null; status: string; attempt_count: number; lease_until: string | null }>(
      "SELECT sticker_id, sticker_path, status, attempt_count, lease_until FROM pos.coffee_passport_stickers WHERE visit_id = $1 OR (customer_id = $2 AND idempotency_key = $3) LIMIT 1 FOR UPDATE",
      [visitId, session.user.id, idempotencyKey],
    );
    const row = existing.rows[0];
    if (row?.status === "completed" && row.sticker_path) {
      await client.query("COMMIT");
      return privateJson({ success: true, status: "completed", sticker_id: row.sticker_id, visit_id: visitId, image_url: `/api/coffee-passport/stickers/${encodeURIComponent(row.sticker_id)}/image` });
    }
    if (row?.status === "generating" && row.lease_until && new Date(row.lease_until).getTime() > Date.now()) {
      await client.query("COMMIT");
      return privateJson({ success: true, status: "generating", sticker_id: row.sticker_id }, 202);
    }
    stickerId = row?.sticker_id || `stk_${crypto.randomUUID().replace(/-/g, "")}`;
    prompt = buildCoffeePassportStickerPrompt({ shopName: visit.shop_name, area: visit.area, visitTitle: visit.title });
    if (row) {
      await client.query("UPDATE pos.coffee_passport_stickers SET status = 'generating', error_code = NULL, failed_at = NULL, generation_started_at = now(), lease_until = now() + interval '10 minutes', attempt_count = attempt_count + 1, idempotency_key = $2 WHERE sticker_id = $1", [stickerId, idempotencyKey]);
    } else {
      await client.query("INSERT INTO pos.coffee_passport_stickers (sticker_id, visit_id, customer_id, status, provider, prompt_version, model, attempt_count, idempotency_key, generation_started_at, lease_until) VALUES ($1, $2, $3, 'generating', '9router', $4, $5, 1, $6, now(), now() + interval '10 minutes')", [stickerId, visitId, session.user.id, stickerPromptVersion(), stickerModel(), idempotencyKey]);
    }
    await client.query("UPDATE pos.coffee_passport_visits SET status = 'sticker_pending' WHERE visit_id = $1", [visitId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((error as { code?: string }).code === "23505") return privateJson({ success: false, message: "Sticker sedang diproses. Muat ulang beberapa saat lagi." }, 409);
    throw error;
  } finally {
    client.release();
  }

  const storageRoot = process.env.COFFEE_PASSPORT_STICKER_DIR || join(process.cwd(), ".runtime", "coffee-passport-stickers");
  const filename = `${stickerId}_${crypto.randomUUID().replace(/-/g, "")}.png`;
  try {
    const raw = await generateCoffeePassportPng(prompt);
    await mkdir(storageRoot, { recursive: true, mode: 0o750 });
    await writeFile(join(storageRoot, filename), raw, { mode: 0o640 });
    await pool.query("UPDATE pos.coffee_passport_stickers SET sticker_path = $1, status = 'completed', lease_until = NULL, file_size_bytes = $2, mime_type = 'image/png', completed_at = now(), error_code = NULL WHERE sticker_id = $3 AND customer_id = $4", [filename, raw.byteLength, stickerId, session.user.id]);
    await pool.query("UPDATE pos.coffee_passport_visits SET status = 'completed' WHERE visit_id = $1 AND customer_id = $2", [visitId, session.user.id]);
    await pool.query("SELECT pos.coffee_passport_reward_credit($1, $2, $3)", [session.user.id, visitId, `reward_${visitId}`]).catch((rewardError) => console.error("Coffee passport reward credit deferred", { visitId, error: String((rewardError as Error).message).slice(0, 120) }));
    return privateJson({ success: true, status: "completed", sticker_id: stickerId, visit_id: visitId, image_url: `/api/coffee-passport/stickers/${encodeURIComponent(stickerId)}/image` });
  } catch (error) {
    const errorCode = String((error as Error).message || "provider_error").slice(0, 80);
    await pool.query("UPDATE pos.coffee_passport_stickers SET status = 'failed', lease_until = NULL, error_code = $1, failed_at = now() WHERE sticker_id = $2 AND customer_id = $3", [errorCode.startsWith("provider_") || errorCode === "invalid_png" ? errorCode : "provider_error", stickerId, session.user.id]);
    console.error("Coffee passport sticker generation failed", { stickerId, errorCode });
    const status = errorCode === "provider_timeout" ? 504 : errorCode === "provider_http_503" ? 503 : 502;
    return privateJson({ success: false, status: "failed", sticker_id: stickerId, message: status === 504 ? "Proses terlalu lama. Coba lagi." : "Sticker belum berhasil dibuat. Coba lagi beberapa saat." }, status);
  }
});

app.get("/api/coffee-passport/stickers/:stickerId/image", async (c) => {
  const session = await requirePassportSession(c.req.raw.headers);
  if (!session) return privateJson({ success: false, message: "Silakan masuk terlebih dahulu." }, 401);
  const stickerId = c.req.param("stickerId");
  if (!/^stk_[A-Za-z0-9_-]{8,120}$/.test(stickerId)) return privateJson({ success: false, message: "Sticker tidak ditemukan." }, 404);
  const result = await pool.query<{ sticker_path: string | null }>("SELECT sticker_path FROM pos.coffee_passport_stickers WHERE sticker_id = $1 AND customer_id = $2 AND status = 'completed' LIMIT 1", [stickerId, session.user.id]);
  const filename = result.rows[0]?.sticker_path;
  if (!filename || filename !== filename.replace(/[^A-Za-z0-9_.-]/g, "")) return privateJson({ success: false, message: "Gambar tidak ditemukan." }, 404);
  const storageRoot = process.env.COFFEE_PASSPORT_STICKER_DIR || join(process.cwd(), ".runtime", "coffee-passport-stickers");
  try {
    const raw = await readFile(join(storageRoot, filename));
    return new Response(raw, { status: 200, headers: { "Content-Type": "image/png", "Content-Disposition": "inline", "Cache-Control": "private, no-store" } });
  } catch {
    return privateJson({ success: false, message: "Gambar tidak ditemukan." }, 404);
  }
});

app.get("/api/health", (c) => privateJson({ ok: true, service: "coffee-passport-sticker-generator" }));

app.get("/api/coffee-passport/bid/board", async (c) => {
  const requestedTab = c.req.query("tab") || "all-time";
  const tab = ["all-time", "today", "daily"].includes(requestedTab) ? requestedTab : "all-time";
  const query = (c.req.query("q") || "").trim().slice(0, 80);
  const category = (c.req.query("category") || "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(10000, Number(c.req.query("page") || 1)));
  const pageSize = Math.max(1, Math.min(50, Number(c.req.query("page_size") || 50)));
  const offset = (page - 1) * pageSize;
  const where: string[] = ["1=1"];
  const values: unknown[] = [];
  if (query) { values.push(`%${query}%`); where.push(`(name ILIKE $${values.length} OR COALESCE(description, '') ILIKE $${values.length})`); }
  if (category) { values.push(category); where.push(`COALESCE(NULLIF(trim(area), ''), 'Lainnya') = $${values.length}`); }
  const base = tab === "today"
    ? "public.pos_coffee_passport_board_view WHERE (today_clicks > 0 OR current_bid_amount > 0)"
    : tab === "daily"
      ? "public.pos_coffee_passport_board_view WHERE shop_id IN (SELECT DISTINCT shop_id FROM pos.coffee_passport_bid_activity WHERE (created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date)"
      : "public.pos_coffee_passport_board_view WHERE 1=1";
  const result = await pool.query(`SELECT *, count(*) OVER()::integer AS total_count FROM ${base} AND ${where.join(" AND ")} ORDER BY overall_rank ASC LIMIT ${pageSize} OFFSET ${offset}`, values);
  const categories = await pool.query("SELECT DISTINCT COALESCE(NULLIF(trim(area), ''), 'Lainnya') AS category FROM public.pos_coffee_passport_board_view ORDER BY 1");
  const config = await pool.query("SELECT minimum_new_bid_amount, minimum_top_increment, minimum_existing_increment, maximum_bid_amount, refund_policy FROM pos.coffee_passport_bid_config WHERE config_id = 'default'");
  const row = config.rows[0] ?? { minimum_new_bid_amount: 1000, minimum_top_increment: 1000, minimum_existing_increment: 1000, maximum_bid_amount: 999999999, refund_policy: "final_non_refundable" };
  const top = Number(result.rows[0]?.current_bid_amount || 0);
  const nextTop = top > 0 ? top + Number(row.minimum_top_increment) : Number(row.minimum_new_bid_amount);
  const activity = await pool.query("SELECT * FROM public.pos_coffee_passport_activity_view ORDER BY created_at DESC LIMIT 8");
  const dailyArchive = await pool.query("SELECT * FROM public.pos_coffee_passport_daily_view LIMIT 30");
  return privateJson({ success: true, tab, shops: result.rows, total: Number(result.rows[0]?.total_count || 0), page, page_size: pageSize, categories: categories.rows.map((item: { category: string }) => item.category), next_top_bid_amount: nextTop, minimum_new_bid_amount: Number(row.minimum_new_bid_amount), minimum_top_increment: Number(row.minimum_top_increment), minimum_existing_increment: Number(row.minimum_existing_increment), maximum_bid_amount: Number(row.maximum_bid_amount), refund_policy: row.refund_policy, activity: activity.rows, daily_archive: dailyArchive.rows });
});

app.get("/api/coffee-passport/bid/shops/:shopId", async (c) => {
  const shopId = c.req.param("shopId");
  const result = await pool.query("SELECT * FROM public.pos_coffee_passport_board_view WHERE shop_id = $1 LIMIT 1", [shopId]);
  if (!result.rows[0]) return privateJson({ success: false, message: "Kedai tidak ditemukan." }, 404);
  const today = await pool.query("SELECT count(DISTINCT click_id)::integer AS clicks FROM pos.coffee_passport_bid_clicks WHERE shop_id = $1 AND created_at >= now() - interval '24 hours'", [shopId]);
  return privateJson({ success: true, shop: { ...result.rows[0], today_clicks: Number(today.rows[0]?.clicks || 0) } });
});

app.post("/api/coffee-passport/bid/click", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { shop_id?: unknown; visitor_key?: unknown };
  const shopId = typeof body.shop_id === "string" ? body.shop_id.trim() : "";
  const visitorKey = typeof body.visitor_key === "string" ? body.visitor_key.trim() : "";
  if (!/^shop_[A-Za-z0-9_-]{8,120}$/.test(shopId) || !/^[A-Za-z0-9_-]{16,160}$/.test(visitorKey)) return privateJson({ success: false, message: "Data kunjungan tidak valid." }, 400);
  const result = await pool.query("SELECT pos.coffee_passport_record_click($1, $2) AS result", [shopId, visitorKey]);
  return privateJson({ success: true, ...(result.rows[0]?.result || {}) });
});

app.get("/api/coffee-passport/bid/leaderboard", async (c) => {
  const url = new URL(c.req.url);
  url.pathname = "/api/coffee-passport/bid/board";
  return app.fetch(new Request(url, c.req.raw));
});

app.post("/api/coffee-passport/bid/intent", async (c) => {
  const session = await requirePassportSession(c.req.raw.headers);
  if (!session) return privateJson({ success: false, message: "Silakan masuk terlebih dahulu." }, 401);
  const body = await c.req.json().catch(() => ({})) as { shop_id?: unknown; bid_amount?: unknown; idempotency_key?: unknown };
  const shopId = typeof body.shop_id === "string" ? body.shop_id.trim() : "";
  const bidAmount = Number(body.bid_amount);
  const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  if (!shopId || !Number.isSafeInteger(bidAmount) || bidAmount <= 0 || !/^[A-Za-z0-9_-]{12,100}$/.test(idempotencyKey)) return privateJson({ success: false, message: "Data bid belum lengkap." }, 400);
  if (bidAmount % 1000 !== 0) return privateJson({ success: false, message: "Kenaikan bid harus kelipatan Rp1.000." }, 400);
  const shop = await pool.query("SELECT shop_id, name, owner_customer_id FROM pos.coffee_passport_shops WHERE shop_id = $1 AND is_active = true AND verification_status = 'approved' LIMIT 1", [shopId]);
  if (!shop.rows[0]) return privateJson({ success: false, message: "Kedai official tidak ditemukan." }, 404);
  if (shop.rows[0].owner_customer_id !== session.user.id) return privateJson({ success: false, message: "Hanya pemilik kedai yang dapat melakukan bid." }, 403);
  const client = await pool.connect();
  let entryId = "";
  try {
    await client.query("BEGIN");
    const config = await client.query("SELECT minimum_bid_amount, minimum_increment, minimum_new_bid_amount, minimum_top_increment, minimum_existing_increment, maximum_bid_amount FROM pos.coffee_passport_bid_config WHERE config_id = 'default'");
    const current = await client.query("SELECT current_bid_amount FROM pos.coffee_passport_shops WHERE shop_id = $1 FOR UPDATE", [shopId]);
    const configRow = config.rows[0] || {};
    const currentBid = Number(current.rows[0]?.current_bid_amount || 0);
    const minimum = currentBid > 0
      ? currentBid + Number(configRow.minimum_existing_increment || configRow.minimum_increment || 1000)
      : Number(configRow.minimum_new_bid_amount || configRow.minimum_bid_amount || 1000);
    const topBid = Number((await client.query("SELECT COALESCE(max(current_bid_amount), 0) AS amount FROM pos.coffee_passport_shops WHERE is_active = true AND verification_status = 'approved'")).rows[0]?.amount || 0);
    const topMinimum = topBid > 0 ? topBid + Number(configRow.minimum_top_increment || 1000) : minimum;
    const enforcedMinimum = currentBid >= topBid ? Math.max(minimum, topMinimum) : minimum;
    const maximum = Number(configRow.maximum_bid_amount || 999999999);
    if (bidAmount > maximum) {
      await client.query("ROLLBACK");
      return privateJson({ success: false, message: `Bid maksimal ${formatRupiahServer(maximum)}.` }, 400);
    }
    if (bidAmount < enforcedMinimum) {
      await client.query("ROLLBACK");
      return privateJson({ success: false, message: `Bid minimum saat ini ${formatRupiahServer(enforcedMinimum)}.` }, 409);
    }
    const existing = await client.query("SELECT entry_id, status, mayar_invoice_id FROM pos.coffee_passport_bid_entries WHERE idempotency_key = $1 LIMIT 1", [idempotencyKey]);
    if (existing.rows[0]) {
      await client.query("ROLLBACK");
      return privateJson({ success: true, entry_id: existing.rows[0].entry_id, status: existing.rows[0].status, invoice_id: existing.rows[0].mayar_invoice_id, duplicate: true });
    }
    entryId = `bid_${crypto.randomUUID().replace(/-/g, "")}`;
    await client.query("INSERT INTO pos.coffee_passport_bid_entries (entry_id, shop_id, bidder_customer_id, bid_amount, idempotency_key) VALUES ($1, $2, $3, $4, $5)", [entryId, shopId, session.user.id, bidAmount, idempotencyKey]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((error as { code?: string }).code === "23505") return privateJson({ success: false, message: "Bid dengan permintaan ini sudah diproses. Coba muat ulang halaman." }, 409);
    throw error;
  } finally {
    client.release();
  }
  try {
    const invoice = await createBidInvoice(entryId, String(shop.rows[0].name), bidAmount, session.customer);
    await pool.query("UPDATE pos.coffee_passport_bid_entries SET mayar_invoice_id = $1, mayar_transaction_id = $2 WHERE entry_id = $3", [invoice.invoiceId, invoice.transactionId, entryId]);
    return privateJson({ success: true, entry_id: entryId, status: "pending_payment", amount: bidAmount, invoice_id: invoice.invoiceId, invoice_url: invoice.link, message: "Bid dibuat. Selesaikan pembayaran untuk melanjutkan." });
  } catch (error) {
    await pool.query("UPDATE pos.coffee_passport_bid_entries SET status = 'failed' WHERE entry_id = $1", [entryId]);
    return privateJson({ success: false, message: "Pembayaran belum dapat dibuat. Coba lagi." }, 502);
  }
});

async function createListingInvoice(listingPaymentId: string, shopName: string, customer: { name?: string | null; email?: string | null; phone?: string | null }) {
  if (!customer.email) throw new Error("Email customer wajib tersedia untuk invoice Mayar");
  const response = await fetch(MAYAR_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}),
    },
    body: JSON.stringify({
      action: "create-invoice",
      name: customer.name || "Pemilik coffee shop",
      email: customer.email,
      redirectUrl: `https://500kopitasik.yumme.id/?listing_payment=${encodeURIComponent(listingPaymentId)}`,
      description: `Listing Coffee Shop 500 Kopi Tasik - ${shopName}`,
      mobile: customer.phone || MAYAR_DEFAULT_MOBILE,
      items: [{ quantity: 1, rate: 1000, description: `Listing Coffee Shop - ${shopName}` }],
      extraData: { coffeePassportListingPaymentId: listingPaymentId, shopName },
    }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
  const link = data.link || data.paymentUrl || data.url;
  if (!response.ok || !payload.success || !data.id || !link) throw new Error("Invoice Mayar belum dapat dibuat. Coba lagi.");
  return { invoiceId: String(data.id), transactionId: data.transactionId ? String(data.transactionId) : null, link: String(link) };
}

async function createBidInvoice(entryId: string, shopName: string, amount: number, customer: { name?: string | null; email?: string | null }) {
  const response = await fetch(MAYAR_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}),
    },
    body: JSON.stringify({
      action: "create-invoice",
      name: customer.name || "Pemilik kedai",
      email: customer.email,
      mobile: MAYAR_DEFAULT_MOBILE,
      redirectUrl: "https://500kopitasik.yumme.id",
      description: `Bid Rank ${shopName}`,
      items: [{ quantity: 1, rate: amount, description: `Bid Rank ${shopName}` }],
      extraData: { coffeePassportBidEntryId: entryId, shopName },
    }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
  const link = data.link || data.paymentUrl || data.url;
  if (!response.ok || !payload.success || !data.id || !link) throw new Error("Invoice Mayar belum dapat dibuat. Coba lagi.");
  return { invoiceId: String(data.id), transactionId: data.transactionId ? String(data.transactionId) : null, link: String(link) };
}

function formatRupiahServer(value: number) { return `Rp${new Intl.NumberFormat("id-ID").format(value)}`; }

async function requireCustomerSession(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session?.user?.id) return null;
  return session;
}

function privateJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

const CUSTOMER_REVIEW_ORDER_STATUSES = new Set(["paid", "completed", "settled"]);

app.post("/api/customer/product-reviews", async (c) => {
  const session = await requireCustomerSession(c.req.raw.headers);
  if (!session?.user?.id) return privateJson({ success: false, error: "UNAUTHORIZED" }, 401);
  const body = await c.req.json().catch(() => ({})) as { productSourceId?: unknown; orderSourceId?: unknown; rating?: unknown; comment?: unknown };
  const productId = typeof body.productSourceId === "string" ? body.productSourceId.trim() : "";
  const orderId = typeof body.orderSourceId === "string" ? body.orderSourceId.trim() : "";
  const rating = Number(body.rating);
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (!productId || productId.length > 160 || !orderId || orderId.length > 160 || !Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 500) {
    return privateJson({ success: false, error: "INVALID_INPUT" }, 400);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const order = await client.query<{ customer_source_id: string | null; status: string | null }>(
      "SELECT customer_source_id, status FROM pos.orders WHERE source_id = $1 FOR SHARE",
      [orderId],
    );
    const eligibleOrder = order.rows[0];
    if (!eligibleOrder || eligibleOrder.customer_source_id !== session.user.id || !CUSTOMER_REVIEW_ORDER_STATUSES.has(String(eligibleOrder.status ?? "").toLowerCase())) {
      await client.query("ROLLBACK");
      return privateJson({ success: false, error: "ORDER_NOT_ELIGIBLE", message: "Review hanya dapat dibuat untuk order milik customer yang sudah selesai atau lunas." }, 403);
    }
    const product = await client.query("SELECT 1 FROM pos.products WHERE source_id = $1 LIMIT 1", [productId]);
    if (!product.rows[0]) {
      await client.query("ROLLBACK");
      return privateJson({ success: false, error: "PRODUCT_NOT_FOUND" }, 404);
    }
    const item = await client.query(
      "SELECT 1 FROM pos.order_items WHERE order_source_id = $1 AND product_source_id = $2 AND quantity > 0 AND (status IS NULL OR status NOT IN ('cancelled', 'canceled')) LIMIT 1",
      [orderId, productId],
    );
    if (!item.rows[0]) {
      await client.query("ROLLBACK");
      return privateJson({ success: false, error: "PRODUCT_NOT_IN_ORDER", message: "Produk tidak terdapat pada order tersebut." }, 403);
    }
    const displayName = String(session.user.name ?? "Customer").trim().split(/\s+/)[0]?.slice(0, 80) || "Customer";
    const inserted = await client.query(
      `INSERT INTO pos.product_reviews (product_source_id, order_source_id, customer_user_id, customer_display_name, rating, comment, status, verified_purchase)
       VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), 'pending', true)
       RETURNING id, product_source_id, rating, comment, customer_display_name, created_at, status`,
      [productId, orderId, session.user.id, displayName, rating, comment],
    );
    await client.query("COMMIT");
    return privateJson({ success: true, review: inserted.rows[0], message: "Ulasan dikirim untuk ditinjau." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((error as { code?: string }).code === "23505") return privateJson({ success: false, error: "DUPLICATE_REVIEW", message: "Produk pada order ini sudah pernah diulas." }, 409);
    console.error("Customer product review write failed", (error as Error).message);
    return privateJson({ success: false, error: "REQUEST_FAILED" }, 500);
  } finally {
    client.release();
  }
});

app.post("/api/customer/product-reviews/report", async (c) => {
  const session = await requireCustomerSession(c.req.raw.headers);
  if (!session?.user?.id) return privateJson({ success: false, error: "UNAUTHORIZED" }, 401);
  const body = await c.req.json().catch(() => ({})) as { reviewId?: unknown; reason?: unknown };
  const reviewId = typeof body.reviewId === "string" ? body.reviewId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 240) : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reviewId)) {
    return privateJson({ success: false, error: "INVALID_INPUT" }, 400);
  }
  const review = await pool.query<{ id: string; status: string; customer_user_id: string | null }>(
    "SELECT id, status, customer_user_id FROM pos.product_reviews WHERE id = $1::uuid LIMIT 1",
    [reviewId],
  );
  const row = review.rows[0];
  if (!row || !(row.status === "published" || (row.status === "pending" && row.customer_user_id === session.user.id))) {
    return privateJson({ success: false, error: "REVIEW_NOT_FOUND" }, 404);
  }
  const updated = await pool.query(
    "UPDATE pos.product_reviews SET status = 'reported', moderation_note = $2, moderated_by = $3, moderated_at = now() WHERE id = $1::uuid AND status = $4 RETURNING id",
    [reviewId, reason || "Dilaporkan customer", `customer:${session.user.id}`, row.status],
  );
  if (!updated.rows[0]) return privateJson({ success: false, error: "REVIEW_ALREADY_CHANGED" }, 409);
  return privateJson({ success: true, reviewId, reported: true });
});

app.get("/api/customer/profile", async (c) => {
  const session = await requireCustomerSession(c.req.raw.headers);
  if (!session) return privateJson({ success: false, error: "UNAUTHORIZED" }, 401);

  const result = await pool.query(
    "SELECT * FROM public.pos_customers_view WHERE source_id = $1 LIMIT 1",
    [session.user.id],
  );
  return privateJson({ success: true, customer: result.rows[0] ?? null });
});


function customerOrderTrackingSelect(whereSql: string) {
  return `
    SELECT o.*,
      COALESCE(groups.groups, '[]'::json) AS "trackingGroups",
      COALESCE(groups.total_groups, 0)::int AS "trackingGroupCount",
      COALESCE(groups.finished_groups, 0)::int AS "trackingFinishedGroupCount",
      COALESCE(est.estimated_ready_at, NULL) AS "estimatedReadyAt",
      sla.sla_started_at AS "slaStartedAt",
      sla.sla_deadline_at AS "slaDeadlineAt",
      (sla.sla_deadline_at IS NOT NULL AND sla.sla_deadline_at < now()
        AND o.status NOT IN ('completed', 'cancelled')
        AND NOT (COALESCE(groups.total_groups, 0) > 0
          AND COALESCE(groups.finished_groups, 0) = COALESCE(groups.total_groups, 0))) AS "isLate",
      CASE WHEN sla.sla_deadline_at IS NOT NULL AND sla.sla_deadline_at < now()
        AND o.status NOT IN ('completed', 'cancelled')
        AND NOT (COALESCE(groups.total_groups, 0) > 0
          AND COALESCE(groups.finished_groups, 0) = COALESCE(groups.total_groups, 0))
        THEN floor(extract(epoch from (now() - sla.sla_deadline_at)) / 60)::int ELSE 0 END AS "lateMinutes",
      CASE
        WHEN o.status = 'cancelled' THEN 'cancelled'
        WHEN o.status NOT IN ('paid', 'completed') THEN 'pending_payment'
        WHEN o.status = 'completed' AND COALESCE(groups.total_groups, 0) = 0 THEN 'completed'
        WHEN COALESCE(groups.total_groups, 0) > 0
          AND COALESCE(groups.finished_groups, 0) = COALESCE(groups.total_groups, 0)
          THEN CASE WHEN lower(COALESCE(o."orderType", '')) IN ('dine_in', 'dine-in', 'dinein')
                    THEN 'ready_for_table' ELSE 'ready_for_pickup' END
        WHEN COALESCE(groups.preparing_groups, 0) > 0 THEN 'preparing'
        ELSE 'received'
      END AS "trackingStatus"
    FROM public.pos_orders o
    LEFT JOIN (
      SELECT order_no,
        json_agg(json_build_object(
          'groupType', group_type,
          'status', status,
          'completedAt', selesai_at,
          'updatedAt', updated_at
        ) ORDER BY group_type) AS groups,
        count(*)::int AS total_groups,
        count(*) FILTER (WHERE status = 'selesai')::int AS finished_groups,
        count(*) FILTER (WHERE status = 'dibuat')::int AS preparing_groups
      FROM pos.order_status
      GROUP BY order_no
    ) groups ON groups.order_no = o."orderNumber"
    LEFT JOIN pos.order_tracking_estimates est
      ON est.order_source_id = o."_id"
    LEFT JOIN LATERAL (
      SELECT
        coalesce(paid.occurred_at, to_timestamp(o."createdAt" / 1000.0)) AS sla_started_at,
        coalesce(paid.occurred_at, to_timestamp(o."createdAt" / 1000.0)) + (coalesce(policy.sla_minutes, 30) * interval '1 minute') AS sla_deadline_at
      FROM (SELECT 1) seed
      LEFT JOIN LATERAL (
        SELECT occurred_at
        FROM pos.order_tracking_events
        WHERE order_source_id = o."_id"
          AND event_type = 'order_lifecycle'
          AND to_status = 'paid'
        ORDER BY occurred_at ASC
        LIMIT 1
      ) paid ON true
      LEFT JOIN LATERAL (
        SELECT sla_minutes
        FROM pos.order_tracking_sla_policies
        WHERE active
          AND (effective_from IS NULL OR effective_from <= now())
          AND (effective_until IS NULL OR effective_until > now())
          AND (order_type = '*' OR order_type = lower(coalesce(o."orderType", '*')))
        ORDER BY (order_type <> '*') DESC, effective_from DESC
        LIMIT 1
      ) policy ON true
    ) sla ON o.status IN ('paid', 'completed')
    ${whereSql}
    ORDER BY o."createdAt" DESC NULLS LAST
    LIMIT 50
  `;
}

app.get("/api/customer/orders", async (c) => {
  const session = await requireCustomerSession(c.req.raw.headers);
  if (!session) return privateJson({ success: false, error: "UNAUTHORIZED" }, 401);

  const result = await pool.query(
    customerOrderTrackingSelect('WHERE o."customerSourceId" = $1'),
    [session.user.id],
  );
  return privateJson({ success: true, orders: result.rows });
});

// Customer Web Push subscriptions are owned by the Better Auth identity.
// The browser never sends a customer_id; it is taken from the verified cookie session.
app.post("/api/customer/push/subscribe", async (c) => {
  const session = await requireCustomerSession(c.req.raw.headers);
  if (!session) return privateJson({ success: false, error: "UNAUTHORIZED" }, 401);
  const body = await c.req.json().catch(() => ({})) as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
    userAgent?: unknown;
  };
  const endpoint = String(body.endpoint ?? "").trim();
  const p256dh = String(body.keys?.p256dh ?? "").trim();
  const authKey = String(body.keys?.auth ?? "").trim();
  if (!endpoint.startsWith("https://") || endpoint.length > 2048 || !p256dh || !authKey) {
    return privateJson({ success: false, error: "INVALID_SUBSCRIPTION" }, 400);
  }
  await pool.query(
    `INSERT INTO public.pos_notification_push_subscriptions
      (endpoint, p256dh, auth, user_id, customer_id, app_scope, user_agent, is_active, last_seen_at, last_error, updated_at)
     VALUES ($1, $2, $3, NULL, $4, 'customer', $5, true, now(), NULL, now())
     ON CONFLICT (endpoint) DO UPDATE SET
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_id = NULL,
       customer_id = EXCLUDED.customer_id,
       app_scope = 'customer',
       user_agent = EXCLUDED.user_agent,
       is_active = true,
       last_seen_at = now(),
       last_error = NULL,
       updated_at = now()`,
    [endpoint, p256dh, authKey, session.user.id, String(body.userAgent ?? "").slice(0, 1000) || null],
  );
  return privateJson({ success: true });
});

app.post("/api/customer/push/unsubscribe", async (c) => {
  const session = await requireCustomerSession(c.req.raw.headers);
  if (!session) return privateJson({ success: false, error: "UNAUTHORIZED" }, 401);
  const body = await c.req.json().catch(() => ({})) as { endpoint?: unknown };
  const endpoint = String(body.endpoint ?? "").trim();
  if (!endpoint) return privateJson({ success: false, error: "ENDPOINT_REQUIRED" }, 400);
  await pool.query(
    `UPDATE public.pos_notification_push_subscriptions
        SET is_active = false, updated_at = now()
      WHERE endpoint = $1 AND customer_id = $2 AND app_scope = 'customer'`,
    [endpoint, session.user.id],
  );
  return privateJson({ success: true });
});

app.post("/api/customer/push/status", async (c) => {
  const session = await requireCustomerSession(c.req.raw.headers);
  if (!session) return privateJson({ success: false, error: "UNAUTHORIZED" }, 401);
  const body = await c.req.json().catch(() => ({})) as { endpoint?: unknown };
  const endpoint = String(body.endpoint ?? "").trim();
  if (!endpoint) return privateJson({ success: true, subscribed: false });
  const result = await pool.query(
    `SELECT 1 FROM public.pos_notification_push_subscriptions
      WHERE endpoint = $1 AND customer_id = $2 AND app_scope = 'customer' AND is_active = true
      LIMIT 1`,
    [endpoint, session.user.id],
  );
  return privateJson({ success: true, subscribed: result.rowCount > 0 });
});

app.post("/api/customer/guest-orders", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { orders?: unknown };
  const references = Array.isArray(body.orders)
    ? body.orders.map((value) => {
        const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return { orderId: String(item.orderId ?? ""), accessToken: String(item.accessToken ?? "") };
      }).filter((item) => /^order_[a-f0-9]{24}$/.test(item.orderId) && item.accessToken.length >= 20).slice(0, 20)
    : [];
  if (references.length === 0) return privateJson({ success: true, orders: [] });

  const result = await pool.query(
    customerOrderTrackingSelect(`WHERE EXISTS (
      SELECT 1 FROM pos.orders raw
      JOIN json_to_recordset($1::json) AS guest_ref("orderId" text, "accessToken" text)
        ON guest_ref."orderId" = raw.source_id
       AND guest_ref."accessToken" = raw.guest_access_token
      WHERE raw.source_id = o."_id"
    )`),
    [JSON.stringify(references)],
  );
  return privateJson({ success: true, orders: result.rows });
});

const PORT = parseInt(process.env.BETTER_AUTH_PORT || "3001");
console.log(`⚡ Auth server running on http://localhost:${PORT}`);
serve({ fetch: app.fetch, port: PORT });
