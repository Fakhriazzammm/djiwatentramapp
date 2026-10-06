import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};
const REVIEW_STATUSES = new Set(["pending", "published", "hidden", "reported"]);
const ADMIN_ROLES = new Set(["admin", "administrator", "owner", "superadmin", "super admin"]);
const COMPLETED_ORDER_STATUSES = new Set(["completed", "settled", "paid"]);

type Json = Record<string, unknown>;
type Actor = { sourceId: string; name: string; customerId: string | null };
type AdminActor = { sourceId: string; name: string; role: string };

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}
function fail(code: string, message: string, status = 400) {
  return response({ success: false, error: { code, message } }, status);
}
function text(value: unknown, max = 200) {
  const result = typeof value === "string" ? value.trim() : "";
  return result.length <= max ? result : "";
}
function requiredText(value: unknown, field: string, max = 200) {
  const result = text(value, max);
  if (!result) throw new RequestError("INVALID_INPUT", `${field} wajib diisi`);
  return result;
}
class RequestError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; }
}
function ensureDb() {
  if (!db) throw new Error("SERVER_NOT_CONFIGURED");
  return db;
}
function bearer(req: Request) {
  const value = req.headers.get("authorization") ?? "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

async function adminActor(req: Request): Promise<AdminActor | null> {
  const token = bearer(req);
  if (!token) return null;
  const admin = ensureDb();
  const { data: session } = await admin.from("yumi_sessions")
    .select("user_source_id").eq("token", token).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!session?.user_source_id) return null;
  const { data: user } = await admin.from("yumi_users")
    .select("source_id,name,role_source_id,is_active").eq("source_id", session.user_source_id).maybeSingle();
  if (!user || user.is_active === false) return null;
  const { data: role } = await admin.from("yumi_roles")
    .select("name,permissions").eq("source_id", user.role_source_id).maybeSingle();
  if (!role) return null;
  const roleName = text(role.name, 80).toLowerCase();
  const permissions = Array.isArray(role.permissions) ? role.permissions.map(String) : [];
  if (!ADMIN_ROLES.has(roleName) && !permissions.some((p) => ["reviews:moderate", "products:manage", "users:manage"].includes(p))) return null;
  return { sourceId: String(user.source_id), name: text(user.name, 160) || "Admin", role: roleName };
}

function safeReview(row: Json): Json {
  return {
    id: row.id,
    product_source_id: row.product_source_id,
    rating: row.rating,
    comment: row.comment ?? null,
    customer_display_name: row.customer_display_name ?? "Customer",
    created_at: row.created_at,
    verified_purchase: row.verified_purchase === true,
    status: row.status,
  };
}
function publicReview(row: Json): Json {
  return {
    id: row.id,
    product_source_id: row.product_source_id,
    rating: row.rating,
    comment: row.comment ?? null,
    customer_display_name: row.customer_display_name ?? "Customer",
    created_at: row.created_at,
  };
}
function adminReview(row: Json): Json {
  return {
    id: row.id,
    product_source_id: row.product_source_id,
    rating: row.rating,
    comment: row.comment ?? null,
    created_at: row.created_at,
    verified_purchase: row.verified_purchase === true,
    status: row.status,
    moderation_note: row.moderation_note ?? null,
    moderated_by: row.moderated_by ?? null,
    moderated_at: row.moderated_at ?? null,
  };
}

async function summary(body: Json) {
  const productId = requiredText(body.product_source_id ?? body.productSourceId, "product_source_id", 160);
  const admin = ensureDb();
  const { data, error } = await admin.from("pos_product_review_summary")
    .select("product_source_id,published_count,rating_average,rating_1_count,rating_2_count,rating_3_count,rating_4_count,rating_5_count,last_reviewed_at")
    .eq("product_source_id", productId).maybeSingle();
  if (error) throw error;
  return { summary: data ?? { product_source_id: productId, published_count: 0, rating_average: null, rating_1_count: 0, rating_2_count: 0, rating_3_count: 0, rating_4_count: 0, rating_5_count: 0, last_reviewed_at: null } };
}

async function listPublic(body: Json) {
  const productId = requiredText(body.product_source_id ?? body.productSourceId, "product_source_id", 160);
  const limitValue = Number(body.limit ?? 10);
  const offsetValue = Number(body.cursor ?? body.offset ?? 0);
  if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 50 || !Number.isSafeInteger(offsetValue) || offsetValue < 0 || offsetValue > Number.MAX_SAFE_INTEGER - limitValue) throw new RequestError("INVALID_INPUT", "Pagination tidak valid");
  const admin = ensureDb();
  const { data, error } = await admin.from("pos_product_reviews")
    .select("id,product_source_id,rating,comment,customer_display_name,created_at")
    .eq("product_source_id", productId).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offsetValue, offsetValue + limitValue);
  if (error) throw error;
  const hasMore = (data ?? []).length > limitValue;
  return { reviews: (data ?? []).slice(0, limitValue).map((row) => publicReview(row as Json)), hasMore, nextCursor: hasMore ? String(offsetValue + limitValue) : null };
}

async function createReview(body: Json, actor: Actor) {
  const productId = requiredText(body.product_source_id ?? body.productSourceId, "product_source_id", 160);
  const orderId = requiredText(body.order_source_id ?? body.orderSourceId, "order_source_id", 160);
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new RequestError("INVALID_RATING", "Rating harus berupa bilangan bulat 1 sampai 5");
  const commentRaw = typeof body.comment === "string" ? body.comment.trim() : "";
  if (commentRaw.length > 500) throw new RequestError("COMMENT_TOO_LONG", "Komentar maksimal 500 karakter");
  if (!actor.customerId) throw new RequestError("CUSTOMER_ID_UNSUPPORTED", "Akun customer belum memiliki identitas yang kompatibel", 403);
  const admin = ensureDb();

  const { data: product, error: productError } = await admin.schema("pos").from("products").select("source_id").eq("source_id", productId).maybeSingle();
  if (productError) throw productError;
  if (!product) throw new RequestError("PRODUCT_NOT_FOUND", "Produk tidak ditemukan", 404);
  const { data: order, error: orderError } = await admin.schema("pos").from("orders")
    .select("source_id,customer_source_id,status").eq("source_id", orderId).maybeSingle();
  if (orderError) throw orderError;
  if (!order || String(order.customer_source_id ?? "") !== actor.customerId || !COMPLETED_ORDER_STATUSES.has(String(order.status ?? "").toLowerCase())) throw new RequestError("ORDER_NOT_ELIGIBLE", "Review hanya dapat dibuat untuk order milik customer yang sudah selesai atau lunas", 403);
  const { data: item, error: itemError } = await admin.schema("pos").from("order_items")
    .select("product_source_id,status").eq("order_source_id", orderId).eq("product_source_id", productId).or("status.is.null,status.not.in.(cancelled,canceled)").gt("quantity", 0).limit(1).maybeSingle();
  if (itemError) throw itemError;
  if (!item) throw new RequestError("PRODUCT_NOT_IN_ORDER", "Produk tidak terdapat pada order tersebut", 403);

  const { data: duplicate, error: duplicateError } = await admin.schema("pos").from("product_reviews")
    .select("id,status").eq("order_source_id", orderId).eq("product_source_id", productId).eq("customer_user_id", actor.customerId).maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate) throw new RequestError("DUPLICATE_REVIEW", "Produk pada order ini sudah pernah diulas", 409);

  const row = {
    source_id: crypto.randomUUID(), product_source_id: productId, order_source_id: orderId,
    customer_user_id: actor.customerId, customer_display_name: actor.name.split(/\s+/)[0]?.slice(0, 80) || "Customer",
    rating, comment: commentRaw || null, status: "pending", verified_purchase: true,
  };
  const { data: inserted, error } = await admin.schema("pos").from("product_reviews")
    .insert(row).select("id,product_source_id,rating,comment,customer_display_name,created_at,verified_purchase,status").single();
  if (error) {
    if (String(error.code) === "23505") throw new RequestError("DUPLICATE_REVIEW", "Produk pada order ini sudah pernah diulas", 409);
    throw error;
  }
  return { review: safeReview(inserted as Json), message: "Ulasan dikirim untuk ditinjau" };
}

async function reportReview(body: Json, actor: Actor) {
  const reviewId = requiredText(body.review_id ?? body.reviewId, "review_id", 160);
  const reason = text(body.reason, 240) || "Reported by customer";
  const admin = ensureDb();
  const { data: review, error: reviewError } = await admin.schema("pos").from("product_reviews")
    .select("id,status,customer_user_id").eq("id", reviewId).maybeSingle();
  if (reviewError) throw reviewError;
  if (!review || !(review.status === "published" || (review.status === "pending" && review.customer_user_id === actor.customerId))) throw new RequestError("REVIEW_NOT_FOUND", "Ulasan tidak ditemukan", 404);
  const { data: updated, error } = await admin.schema("pos").from("product_reviews").update({ status: "reported", moderation_note: reason.slice(0, 240), moderated_by: `customer:${actor.sourceId}`, moderated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", reviewId).eq("status", review.status).select("id").maybeSingle();
  if (error) throw error;
  if (!updated) throw new RequestError("REVIEW_ALREADY_CHANGED", "Status ulasan sudah berubah", 409);
  return { review_id: reviewId, reported: true };
}

async function moderate(body: Json, actor: AdminActor) {
  const status = text(body.status, 32).toLowerCase();
  if (!REVIEW_STATUSES.has(status) || status === "pending") throw new RequestError("INVALID_STATUS", "Status moderasi tidak valid");
  const reviewId = requiredText(body.review_id ?? body.reviewId, "review_id", 160);
  const note = text(body.moderation_note ?? body.note, 1000);
  const admin = ensureDb();
  const { data, error } = await admin.schema("pos").from("product_reviews").update({ status, moderation_note: note || null, moderated_by: actor.sourceId, moderated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", reviewId)
    .select("id,product_source_id,rating,comment,created_at,verified_purchase,status,moderation_note,moderated_by,moderated_at").maybeSingle();
  if (error) throw error;
  if (!data) throw new RequestError("REVIEW_NOT_FOUND", "Ulasan tidak ditemukan", 404);
  return { review: adminReview(data as Json), message: "Status ulasan diperbarui" };
}

async function adminList(body: Json) {
  const status = text(body.status, 32).toLowerCase();
  const rawSearch = typeof body.search === "string" ? body.search.trim() : "";
  if (rawSearch.length > 100) throw new RequestError("INVALID_INPUT", "Pencarian maksimal 100 karakter");
  const search = rawSearch.replace(/[\\%_]/g, "\\$&");
  const admin = ensureDb();
  const reviewQuery = () => {
    let query = admin.schema("pos").from("product_reviews")
      .select("id,product_source_id,rating,comment,created_at,verified_purchase,status,moderation_note,moderated_by,moderated_at")
      .order("created_at", { ascending: false }).limit(200);
    if (status) {
      if (!REVIEW_STATUSES.has(status)) throw new RequestError("INVALID_STATUS", "Status filter tidak valid");
      query = query.eq("status", status);
    }
    return query;
  };

  let rows: Array<Record<string, unknown>>;
  if (search) {
    const isReviewId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search);
    const [commentMatches, productIdMatches, namedProducts, reviewIdMatch] = await Promise.all([
      reviewQuery().ilike("comment", `%${search}%`),
      reviewQuery().ilike("product_source_id", `%${search}%`),
      admin.schema("pos").from("products").select("source_id").ilike("name", `%${search}%`).limit(500),
      isReviewId ? reviewQuery().eq("id", search) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [commentMatches, productIdMatches, namedProducts, reviewIdMatch]) if (result.error) throw result.error;
    const productIds = [...new Set((namedProducts.data ?? []).map((product) => String(product.source_id)).filter(Boolean))];
    const namedReviews = productIds.length ? await reviewQuery().in("product_source_id", productIds) : { data: [], error: null };
    if (namedReviews.error) throw namedReviews.error;
    const byId = new Map<string, Record<string, unknown>>();
    for (const row of [...(commentMatches.data ?? []), ...(productIdMatches.data ?? []), ...(reviewIdMatch.data ?? []), ...(namedReviews.data ?? [])]) byId.set(String(row.id), row as Record<string, unknown>);
    rows = [...byId.values()].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))).slice(0, 200);
  } else {
    const { data, error } = await reviewQuery();
    if (error) throw error;
    rows = (data ?? []) as Array<Record<string, unknown>>;
  }
  if (!rows.length) return { reviews: [] };
  const productIds = [...new Set(rows.map((row) => String(row.product_source_id ?? "")).filter(Boolean))];
  const { data: products, error: productError } = await admin.schema("pos").from("products")
    .select("source_id,name").in("source_id", productIds);
  if (productError) throw productError;
  const productNames = new Map((products ?? []).map((product) => [String(product.source_id), text(product.name, 160)]));
  return { reviews: rows.map((row) => ({ ...adminReview(row as Json), product_name: productNames.get(String(row.product_source_id)) ?? null })) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return response({ ok: true });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "POST required", 405);
  if (!db) return fail("SERVER_NOT_CONFIGURED", "Konfigurasi server belum lengkap", 500);
  try {
    const body = await req.json() as Json;
    const action = text(body.action, 40);
    if (action === "summary") return response({ success: true, ...(await summary(body)) });
    if (action === "list") return response({ success: true, ...(await listPublic(body)) });
    if (action === "moderate" || action === "moderation_list" || action === "moderate_list") {
      const actor = await adminActor(req);
      if (!actor) return fail("UNAUTHORIZED", "Sesi admin tidak valid atau permission tidak cukup", 401);
      const isList = action === "moderation_list" || action === "moderate_list";
      return response({ success: true, ...(isList ? await adminList(body) : await moderate(body, actor)) });
    }
    return fail("UNKNOWN_ACTION", "Action tidak dikenal");
  } catch (error) {
    if (error instanceof RequestError) return fail(error.code, error.message, error.status);
    console.error("product-reviews request failed", error instanceof Error ? error.message : "unknown error");
    return fail("REQUEST_FAILED", "Permintaan review tidak dapat diproses", 400);
  }
});
