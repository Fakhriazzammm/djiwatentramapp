import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-admin-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const fail = (code: string, message: string, status = 400) => out({ success: false, error: { code, message } }, status);
const ok = (data: Record<string, unknown>) => out({ success: true, ...data });
const MAX_DISTANCE_KM = 100;

type Proof = { mime: string; raw: Uint8Array };
type OcrResult = {
  owner_name: string;
  activity_date: string;
  activity_type: "running" | "walking";
  distance_km: number;
  duration_seconds: number | null;
  pace_seconds_per_km: number | null;
  location_text: string;
  route_visible: boolean;
  confidence: number;
  quality_flags: string[];
};

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = 6371000, rad = (v: number) => v * Math.PI / 180;
  const dLat = rad(bLat-aLat), dLng = rad(bLng-aLng);
  const x = Math.sin(dLat/2)**2 + Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLng/2)**2;
  return 2*r*Math.asin(Math.sqrt(x));
}
function dataUrl(value: string): Proof {
  const m = value.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/s);
  if (!m) throw new Error("proof_base64 harus berupa data URL gambar PNG/JPEG/WEBP");
  const raw = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  if (raw.byteLength > 10 * 1024 * 1024) throw new Error("Ukuran bukti maksimal 10 MB");
  const mime = m[1] ?? "image/jpeg";
  return { mime: mime === "image/jpg" ? "image/jpeg" : mime, raw };
}
function bytesToBase64(raw: Uint8Array) {
  let encoded = "";
  for (let offset = 0; offset < raw.length; offset += 0x8000) encoded += btoa(String.fromCharCode(...raw.subarray(offset, offset + 0x8000)));
  return encoded;
}
async function sha256(raw: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
async function userId(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const { data, error } = await admin.auth.getUser(auth.slice(7));
  return error || !data.user ? null : data.user.id;
}
async function findOwnedCustomer(sourceId: string, email: string) {
  const result = await admin.schema("pos").from("customers").select("source_id,email,name").eq("source_id", sourceId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  const row = result.data as { source_id?: string; email?: string | null; name?: string | null } | null;
  if (!row || !email || !row.email || row.email.toLowerCase() !== email.toLowerCase()) return null;
  return row;
}
async function customerRecord(sourceId: string) {
  const result = await admin.schema("pos").from("customers").select("source_id,email,name").eq("source_id", sourceId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as { source_id: string; email?: string | null; name?: string | null } | null;
}
async function geofence(lat: number, lng: number) {
  const { data, error } = await admin.from("pos_site_settings").select("raw").limit(1).maybeSingle();
  if (error) throw new Error(`Geofence settings unavailable: ${error.message}`);
  const raw = (data?.raw ?? {}) as Record<string, unknown>;
  const n = (keys: string[]) => { for (const k of keys) { const v = raw[k]; if (v !== undefined && v !== null && v !== "") return Number(v); } return NaN; };
  const baseLat = n(["attendance_lat", "attendanceLat"]), baseLng = n(["attendance_lng", "attendanceLng"]), radius = n(["attendance_radius", "attendanceRadius"]);
  if (![baseLat, baseLng, radius].every(Number.isFinite) || radius <= 0) throw new Error("Geofence settings belum dikonfigurasi");
  const d = distanceMeters(lat, lng, baseLat, baseLng);
  return { status: d <= radius ? "inside" : "outside", distance: Number(d.toFixed(2)), radius: Number(radius.toFixed(2)) };
}

function normalizeName(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function ownerMatches(ocrName: string, customerName: string | null | undefined) {
  const ocr = normalizeName(ocrName), customer = normalizeName(customerName ?? "");
  if (!ocr || !customer) return false;
  return ocr === customer || ocr.includes(customer) || customer.includes(ocr) || customer.split(" ").filter(Boolean).every((part) => ocr.includes(part));
}
function dateOnly(value: unknown) {
  const date = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}
function parseOcrContent(content: unknown): OcrResult {
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((part: any) => part?.text ?? "").join("") : "";
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: any;
  try { parsed = JSON.parse(cleaned); } catch { throw new Error("Vision AI mengembalikan JSON yang tidak valid"); }
  const result: OcrResult = {
    owner_name: typeof parsed.owner_name === "string" ? parsed.owner_name.trim() : "",
    activity_date: dateOnly(parsed.activity_date),
    activity_type: parsed.activity_type === "walking" ? "walking" : parsed.activity_type === "running" ? "running" : ("" as OcrResult["activity_type"]),
    distance_km: Number(parsed.distance_km),
    duration_seconds: parsed.duration_seconds == null ? null : Number(parsed.duration_seconds),
    pace_seconds_per_km: parsed.pace_seconds_per_km == null ? null : Number(parsed.pace_seconds_per_km),
    location_text: typeof parsed.location_text === "string" ? parsed.location_text.trim() : "",
    route_visible: parsed.route_visible === true,
    confidence: Number(parsed.confidence),
    quality_flags: Array.isArray(parsed.quality_flags) && parsed.quality_flags.every((v: unknown) => typeof v === "string") ? parsed.quality_flags : [],
  };
  if (!result.owner_name || !result.activity_date || !result.activity_type || !Number.isFinite(result.distance_km) || result.distance_km <= 0 || result.distance_km > MAX_DISTANCE_KM || (result.duration_seconds !== null && (!Number.isInteger(result.duration_seconds) || result.duration_seconds <= 0)) || (result.pace_seconds_per_km !== null && (!Number.isInteger(result.pace_seconds_per_km) || result.pace_seconds_per_km <= 0)) || !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) throw new Error("Hasil Vision AI tidak memenuhi format atau batas validasi");
  return result;
}
async function callVision(proof: Proof): Promise<OcrResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("AI_UNAVAILABLE");
  const baseUrl = (Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = Deno.env.get("OPENAI_MODEL_VISION") || "gpt-4o";
  const image = `data:${proof.mime};base64,${bytesToBase64(proof.raw)}`;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 800,
      response_format: { type: "json_schema", json_schema: { name: "djiwa_run_ocr", strict: true, schema: { type: "object", additionalProperties: false, properties: {
        owner_name: { type: "string" }, activity_date: { type: "string" }, activity_type: { type: "string", enum: ["running", "walking"] }, distance_km: { type: "number" }, duration_seconds: { type: ["integer", "null"] }, pace_seconds_per_km: { type: ["integer", "null"] }, location_text: { type: "string" }, route_visible: { type: "boolean" }, confidence: { type: "number" }, quality_flags: { type: "array", items: { type: "string" } },
      }, required: ["owner_name", "activity_date", "activity_type", "distance_km", "duration_seconds", "pace_seconds_per_km", "location_text", "route_visible", "confidence", "quality_flags"] } } },
      messages: [{ role: "system", content: "Extract only the running/walking proof fields. Never guess unreadable values; use quality_flags and low confidence. Return only the requested JSON." }, { role: "user", content: [{ type: "text", text: "OCR this fitness activity screenshot." }, { type: "image_url", image_url: { url: image } }] }],
    }),
  });
  if (!response.ok) throw new Error(`AI_UNAVAILABLE_${response.status}`);
  const data = await response.json() as any;
  return parseOcrContent(data.choices?.[0]?.message?.content);
}
async function loadProof(body: Record<string, any>, expectedCustomerId: string): Promise<Proof> {
  if (typeof body.proof_base64 === "string") return dataUrl(body.proof_base64);
  const path = String(body.proof_storage_path ?? "");
  if (!path) throw new Error("proof_base64 atau proof_storage_path wajib diisi");
  if (!path.startsWith(`${expectedCustomerId}/`)) throw new Error("Proof bukan milik customer");
  const downloaded = await admin.storage.from("run-proofs").download(path);
  if (downloaded.error || !downloaded.data) throw new Error("Bukti tidak dapat dibaca");
  const mime = downloaded.data.type || "image/jpeg";
  if (!/^image\/(png|jpeg|webp)$/.test(mime)) throw new Error("Format bukti tidak didukung");
  return { mime, raw: new Uint8Array(await downloaded.data.arrayBuffer()) };
}
async function campaign(campaignId: string) {
  const result = await admin.schema("pos").from("run_campaigns").select("id,starts_at,ends_at,status").eq("id", campaignId).eq("status", "active").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as { id: string; starts_at: string; ends_at: string; status: string } | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
function requiredText(value: unknown, field: string, max = 160) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) throw new Error(`${field} wajib diisi dan maksimal ${max} karakter`);
  return text;
}
function validUuid(value: unknown, field: string) {
  const text = requiredText(value, field, 64);
  if (!UUID_RE.test(text)) throw new Error(`${field} harus berupa UUID`);
  return text;
}
function validIso(value: unknown, field: string) {
  const text = requiredText(value, field, 64);
  if (!ISO_RE.test(text) || !Number.isFinite(Date.parse(text))) throw new Error(`${field} harus berupa tanggal ISO yang valid`);
  return new Date(text).toISOString();
}
function boundedNumber(value: unknown, field: string, min: number, max: number, integer = false) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) throw new Error(`${field} tidak valid`);
  return number;
}
function jsonObject(value: unknown, field: string) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} harus berupa object JSON`);
  return value as Record<string, unknown>;
}
function productIds(value: unknown) {
  if (!Array.isArray(value) || value.length > 500 || value.some((item) => typeof item !== "string" || !item.trim() || item.length > 120)) throw new Error("eligible_product_ids harus berupa array ID produk");
  return value.map((item) => item.trim());
}
function actor(body: Record<string, any>) { return typeof body.actor_id === "string" && body.actor_id.trim() ? body.actor_id.trim().slice(0, 120) : "admin"; }
async function audit(action: string, entityType: string, entityId: string, actorId: string, oldValues: unknown, newValues: unknown, reason?: unknown) {
  const result = await admin.schema("pos").from("run_audit_logs").insert({ actor_type: "admin", actor_id: actorId, entity_type: entityType, entity_id: entityId, action, old_values: oldValues ?? null, new_values: newValues ?? null, reason: typeof reason === "string" ? reason.slice(0, 500) : null });
  if (result.error) throw new Error(`Audit gagal: ${result.error.message}`);
}

async function checkoutRewardAction(action: "reserve" | "release" | "finalize", body: Record<string, any>, customerId: string) {
  const rewardId = validUuid(body.reward_id ?? body.rewardId, "reward_id");
  const orderId = requiredText(body.order_id ?? body.orderId, "order_id", 160);
  const key = requiredText(body.idempotency_key ?? body.idempotencyKey, "idempotency_key", 160);
  const reservationId = action === "reserve" ? null : requiredText(body.reservation_id ?? body.reservationId, "reservation_id", 160);
  const rpc = action === "reserve" ? "run_reward_reserve" : action === "release" ? "run_reward_release" : "run_reward_finalize";
  const params = action === "reserve"
    ? { p_reward_id: rewardId, p_customer_source_id: customerId, p_order_id: orderId, p_idempotency_key: key }
    : action === "release"
      ? { p_reward_id: rewardId, p_customer_source_id: customerId, p_reservation_id: reservationId, p_reason: requiredText(body.reason ?? "Checkout dibatalkan", "reason", 240) }
      : { p_reward_id: rewardId, p_customer_source_id: customerId, p_reservation_id: reservationId, p_order_id: orderId };
  const result = await admin.schema("pos").rpc(rpc, params);
  if (result.error) throw new Error(result.error.message);
  const data = (result.data ?? {}) as Record<string, any>;
  const current = await admin.schema("pos").from("orders").select("receipt_meta,customer_source_id").eq("source_id", orderId).eq("customer_source_id", customerId).maybeSingle();
  if (current.error) throw new Error(current.error.message);
  if (!current.data) throw new Error("Order reward tidak ditemukan");
  const metadata = { ...((current.data.receipt_meta && typeof current.data.receipt_meta === "object") ? current.data.receipt_meta : {}), djiwaRunReward: { rewardId, reservationId: data.reservation_id ?? reservationId, amount: data.amount ?? null, status: action === "reserve" ? "reserved" : action === "release" ? "released" : "redeemed" } };
  const updated = await admin.schema("pos").from("orders").update({ receipt_meta: metadata }).eq("source_id", orderId).eq("customer_source_id", customerId);
  if (updated.error) {
    if (action === "reserve" && data.reservation_id) {
      await admin.schema("pos").rpc("run_reward_release", { p_reward_id: rewardId, p_customer_source_id: customerId, p_reservation_id: data.reservation_id, p_reason: "Metadata order gagal disimpan" }).catch(() => undefined);
    }
    throw new Error(updated.error.message);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return out({ ok: true });
  if (!url || !key) return fail("MISCONFIGURED", "Supabase environment belum dikonfigurasi", 500);
  try {
    const body = await req.json() as Record<string, any>;
    const action = String(body.action ?? "");
    const adminSecret = Deno.env.get("DJIWA_RUN_ADMIN_SECRET");
    const isAdmin = !!adminSecret && req.headers.get("x-admin-secret") === adminSecret;
    const bodyCustomer = String(body.customer_source_id ?? body.customerSourceId ?? "");
    const bodyEmail = String(body.customer_email ?? body.customerEmail ?? "");
    const uid = isAdmin ? null : await userId(req);
    if (!isAdmin && uid && bodyCustomer && bodyCustomer !== uid) return fail("FORBIDDEN", "Customer ownership tidak valid", 403);
    const customerIdentity = isAdmin ? bodyCustomer : (uid ?? bodyCustomer);
    let customer = customerIdentity ? await customerRecord(customerIdentity) : null;
    if (!isAdmin && !uid) customer = await findOwnedCustomer(customerIdentity, bodyEmail) as typeof customer;
    if (!isAdmin && (!customerIdentity || !customer)) return fail("UNAUTHORIZED", "Customer session/ownership tidak valid", 401);

    if (action === "admin_save_campaign") {
      if (!isAdmin) return fail("FORBIDDEN", "Admin secret required", 403);
      const id = body.id ? validUuid(body.id, "id") : crypto.randomUUID();
      const name = requiredText(body.name, "name");
      const periodType = body.period_type === "monthly" ? "monthly" : body.period_type === "weekly" ? "weekly" : (() => { throw new Error("period_type tidak valid"); })();
      const startsAt = validIso(body.starts_at, "starts_at"), endsAt = validIso(body.ends_at, "ends_at");
      if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("ends_at harus setelah starts_at");
      const status = ["draft", "active", "ended", "archived"].includes(String(body.status)) ? String(body.status) : (() => { throw new Error("status campaign tidak valid"); })();
      const payload = { brand_slug: typeof body.brand_slug === "string" && body.brand_slug.trim() ? body.brand_slug.trim().slice(0, 80) : "djiwa", name, period_type: periodType, starts_at: startsAt, ends_at: endsAt, timezone: requiredText(body.timezone || "Asia/Jakarta", "timezone", 80), status, settings: jsonObject(body.settings, "settings"), updated_at: new Date().toISOString() };
      const existing = await admin.schema("pos").from("run_campaigns").select("*").eq("id", id).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      const result = existing.data ? await admin.schema("pos").from("run_campaigns").update(payload).eq("id", id).select().single() : await admin.schema("pos").from("run_campaigns").insert({ id, ...payload, created_by: actor(body) }).select().single();
      if (result.error) throw new Error(result.error.message);
      await audit(existing.data ? "update" : "create", "run_campaign", id, actor(body), existing.data, result.data, body.reason);
      return ok({ campaign: result.data });
    }
    if (action === "admin_delete_campaign") {
      if (!isAdmin) return fail("FORBIDDEN", "Admin secret required", 403);
      const id = validUuid(body.id, "id");
      const existing = await admin.schema("pos").from("run_campaigns").select("*").eq("id", id).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (!existing.data) return fail("NOT_FOUND", "Campaign tidak ditemukan", 404);
      if (existing.data.status === "active") return fail("INVALID_STATE", "Campaign aktif tidak dapat dihapus", 409);
      const result = await admin.schema("pos").from("run_campaigns").delete().eq("id", id);
      if (result.error) throw new Error(result.error.message);
      await audit("delete", "run_campaign", id, actor(body), existing.data, null, body.reason);
      return ok({ deleted: id });
    }
    if (action === "admin_save_tier") {
      if (!isAdmin) return fail("FORBIDDEN", "Admin secret required", 403);
      const campaignId = validUuid(body.campaign_id, "campaign_id"), id = body.id ? validUuid(body.id, "id") : crypto.randomUUID();
      const name = requiredText(body.name, "name"), code = requiredText(body.code, "code", 80).toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      const periodScope = body.period_scope === "monthly" ? "monthly" : body.period_scope === "weekly" ? "weekly" : (() => { throw new Error("period_scope tidak valid"); })();
      const rewardCategory = body.reward_category === null || body.reward_category === "" ? null : ["coffee", "breakfast", "merchandise"].includes(String(body.reward_category)) ? String(body.reward_category) : (() => { throw new Error("reward_category tidak valid"); })();
      const maxAmount = body.max_amount === null || body.max_amount === "" || body.max_amount === undefined ? null : boundedNumber(body.max_amount, "max_amount", 0, 2_000_000_000, true);
      const expiryHours = body.expiry_hours === null || body.expiry_hours === "" || body.expiry_hours === undefined ? null : boundedNumber(body.expiry_hours, "expiry_hours", 1, 8760, true);
      const payload = { campaign_id: campaignId, code, name, target_km: boundedNumber(body.target_km, "target_km", 0.01, MAX_DISTANCE_KM, false), period_scope: periodScope, sort_order: boundedNumber(body.sort_order ?? 0, "sort_order", -100000, 100000, true), reward_category: rewardCategory, reward_config: jsonObject(body.reward_config, "reward_config"), eligible_product_ids: productIds(body.eligible_product_ids ?? []), max_amount: maxAmount, expiry_hours: expiryHours, badge_key: body.badge_key ? requiredText(body.badge_key, "badge_key", 120) : null, upgrade_group: body.upgrade_group ? requiredText(body.upgrade_group, "upgrade_group", 120) : null, is_active: body.is_active !== false, updated_at: new Date().toISOString() };
      const existing = await admin.schema("pos").from("run_tiers").select("*").eq("id", id).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      const result = existing.data ? await admin.schema("pos").from("run_tiers").update(payload).eq("id", id).select().single() : await admin.schema("pos").from("run_tiers").insert({ id, ...payload }).select().single();
      if (result.error) throw new Error(result.error.message);
      await audit(existing.data ? "update" : "create", "run_tier", id, actor(body), existing.data, result.data, body.reason);
      return ok({ tier: result.data });
    }
    if (action === "admin_delete_tier") {
      if (!isAdmin) return fail("FORBIDDEN", "Admin secret required", 403);
      const id = validUuid(body.id, "id");
      const existing = await admin.schema("pos").from("run_tiers").select("*").eq("id", id).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (!existing.data) return fail("NOT_FOUND", "Tier tidak ditemukan", 404);
      const result = await admin.schema("pos").from("run_tiers").delete().eq("id", id);
      if (result.error) throw new Error(result.error.message);
      await audit("delete", "run_tier", id, actor(body), existing.data, null, body.reason);
      return ok({ deleted: id });
    }
    if (action === "admin_overview") {
      if (!isAdmin) return fail("FORBIDDEN", "Admin secret required", 403);
      const [campaigns, tiers, progress, rewards, activities] = await Promise.all([
        admin.schema("pos").from("run_campaigns").select("*").order("starts_at", { ascending: false }), admin.schema("pos").from("run_tiers").select("*").order("sort_order", { ascending: true }), admin.schema("pos").from("run_progress").select("*").order("updated_at", { ascending: false }).limit(500), admin.schema("pos").from("run_rewards").select("*").order("updated_at", { ascending: false }).limit(500), admin.schema("pos").from("run_activities").select("*").order("created_at", { ascending: false }).limit(500),
      ]);
      const error = [campaigns.error, tiers.error, progress.error, rewards.error, activities.error].find(Boolean); if (error) throw new Error(error!.message);
      return ok({ campaigns: campaigns.data ?? [], tiers: tiers.data ?? [], progress: progress.data ?? [], rewards: rewards.data ?? [], activities: activities.data ?? [] });
    }
    if (action === "get_progress") {
      const customerId = customerIdentity;
      const [camp, t, p, r, b, a] = await Promise.all([
        admin.schema("pos").from("run_campaigns").select("id,name,starts_at,ends_at,timezone").eq("status", "active").order("starts_at", { ascending: false }).limit(1).maybeSingle(), admin.schema("pos").from("run_tiers").select("id,code,name,target_km,reward_category").eq("is_active", true).order("sort_order", { ascending: true }), admin.schema("pos").from("run_progress").select("*").eq("customer_source_id", customerId), admin.schema("pos").from("run_rewards").select("*").eq("customer_source_id", customerId), admin.schema("pos").from("run_badges").select("*").eq("customer_source_id", customerId), admin.schema("pos").from("run_activities").select("*").eq("customer_source_id", customerId).order("created_at", { ascending: false }).limit(50),
      ]);
      const err = [camp.error,t.error,p.error,r.error,b.error,a.error].find(Boolean); if (err) throw new Error(err!.message);
      const progressRows = (p.data ?? []) as Array<Record<string, any>>, rewardRows = (r.data ?? []) as Array<Record<string, any>>;
      const tiers = (t.data ?? []).map((tier: Record<string, any>) => { const progress = progressRows.find(row => row.tier_id === tier.id); const reward = rewardRows.find(row => row.tier_id === tier.id); return { code: tier.code, name: tier.name, target_km: tier.target_km, distance_km: progress?.distance_km ?? 0, status: progress?.status ?? "in_progress", reward_name: tier.reward_category, reward_status: reward?.status ?? null, expires_at: reward?.expires_at ?? null }; });
      const topReward = rewardRows.find(reward => ["unlocked", "credited", "reserved"].includes(reward.status));
      return ok({ campaignId: camp.data?.id ?? null, campaignName: camp.data?.name ?? "Djiwa Run", periodLabel: camp.data ? `${String(camp.data.starts_at).slice(0,10)} – ${String(camp.data.ends_at).slice(0,10)}` : "Periode aktif", tiers, rewards: rewardRows, badges: b.data ?? [], activities: a.data ?? [], rewardStatus: topReward?.status ?? null, rewardName: topReward?.reward_category ?? null, rewardExpiresAt: topReward?.expires_at ?? null });
    }
    if (["reserve_checkout_reward", "release_checkout_reward", "finalize_checkout_reward"].includes(action)) {
      if (isAdmin || !customerIdentity) return fail("FORBIDDEN", "Customer session required", 403);
      const operation = action === "reserve_checkout_reward" ? "reserve" : action === "release_checkout_reward" ? "release" : "finalize";
      return ok({ result: await checkoutRewardAction(operation, body, customerIdentity) });
    }
    if (action === "upload_proof") {
      const campaignId = String(body.campaign_id ?? ""), idem = String(body.idempotency_key ?? "");
      const lat = Number(body.latitude), lng = Number(body.longitude);
      if (!campaignId || !idem || !body.proof_base64 || ![lat,lng].every(Number.isFinite)) return fail("INVALID_INPUT", "campaign_id, idempotency_key, proof_base64, latitude, longitude wajib diisi");
      const prior = await admin.schema("pos").from("run_activities").select("*").eq("idempotency_key", idem).maybeSingle(); if (prior.data) return ok({ activity: prior.data, deduplicated: true });
      const fence = await geofence(lat, lng);
      await admin.schema("pos").from("run_audit_logs").insert({ actor_type: "customer", actor_id: customerIdentity, entity_type: "run_upload", entity_id: idem, action: `geofence_${fence.status}`, new_values: { latitude: lat, longitude: lng, distance_m: fence.distance, radius_m: fence.radius } });
      if (fence.status !== "inside") return fail("OUTSIDE_AREA", "Kamu belum berada di area Djiwa Tentram", 422);
      const file = dataUrl(String(body.proof_base64)), proofSha256 = await sha256(file.raw), path = `${customerIdentity}/${campaignId}/${crypto.randomUUID()}`;
      const uploaded = await admin.storage.from("run-proofs").upload(path, file.raw, { contentType: file.mime, upsert: false }); if (uploaded.error) throw new Error(`Proof upload gagal: ${uploaded.error.message}`);
      return ok({ proof_storage_path: path, proof_sha256: proofSha256, geofence: fence, status: "uploaded", processing_status: "review_required", message: "Bukti tersimpan. Panggil ocr_proof untuk ekstraksi Vision AI." });
    }
    if (action === "ocr_proof") {
      const file = await loadProof(body, customerIdentity), proofSha256 = await sha256(file.raw);
      const prior = await admin.schema("pos").from("run_activities").select("*").eq("customer_source_id", customerIdentity).eq("proof_sha256", proofSha256).maybeSingle(); if (prior.data) return ok({ activity: prior.data, proof_sha256: proofSha256, deduplicated: true });
      let extracted: OcrResult;
      try { extracted = await callVision(file); } catch (error) { const unavailable = error instanceof Error && (error.message === "AI_UNAVAILABLE" || error.message.startsWith("AI_UNAVAILABLE_")); return ok({ processing_status: unavailable ? "unavailable" : "review_required", review_required: true, proof_sha256: proofSha256, reason: unavailable ? "Vision AI unavailable" : "Vision AI response invalid", message: "Tidak ada aktivitas yang dibuat; lanjutkan review manual." }); }
      if (!ownerMatches(extracted.owner_name, customer?.name)) return ok({ processing_status: "review_required", review_required: true, proof_sha256: proofSha256, extracted_data: extracted, reason: "OWNER_MISMATCH", message: "Nama pada bukti tidak cocok dengan customer." });
      const camp = await campaign(String(body.campaign_id ?? ""));
      if (!camp) return fail("CAMPAIGN_NOT_ACTIVE", "Campaign tidak aktif", 422);
      if (extracted.activity_date < String(camp.starts_at).slice(0,10) || extracted.activity_date > String(camp.ends_at).slice(0,10)) return ok({ processing_status: "review_required", review_required: true, proof_sha256: proofSha256, extracted_data: extracted, reason: "DATE_OUT_OF_PERIOD" });
      if (!extracted.route_visible || extracted.confidence < 0.7 || extracted.quality_flags.length > 0) return ok({ processing_status: "review_required", review_required: true, proof_sha256: proofSha256, extracted_data: extracted, reason: "QUALITY_REVIEW_REQUIRED" });
      return ok({ processing_status: "confirmation_required", proof_sha256: proofSha256, extracted_data: extracted, message: "Data terbaca. Kirim confirm_activity dengan confirmed=true untuk membuat aktivitas." });
    }
    if (action === "confirm_activity" || action === "confirm_run_activity") {
      if (body.confirmed !== true) return fail("CONFIRMATION_REQUIRED", "Customer confirmation wajib bernilai true");
      const campaignId = String(body.campaign_id ?? ""), idem = String(body.idempotency_key ?? ""), lat = Number(body.latitude), lng = Number(body.longitude);
      if (!campaignId || !idem || ![lat,lng].every(Number.isFinite)) return fail("INVALID_INPUT", "campaign_id, idempotency_key, latitude, longitude wajib valid");
      const existing = await admin.schema("pos").from("run_activities").select("*").eq("idempotency_key", idem).maybeSingle(); if (existing.data) return ok({ activity: existing.data, deduplicated: true });
      const file = await loadProof(body, customerIdentity), proofSha256 = await sha256(file.raw), duplicate = await admin.schema("pos").from("run_activities").select("*").eq("customer_source_id", customerIdentity).eq("proof_sha256", proofSha256).maybeSingle(); if (duplicate.data) return ok({ activity: duplicate.data, deduplicated: true });
      const extracted = parseOcrContent(body.extracted_data), camp = await campaign(campaignId); if (!camp) return fail("CAMPAIGN_NOT_ACTIVE", "Campaign tidak aktif", 422);
      if (!ownerMatches(extracted.owner_name, customer?.name)) return fail("OWNER_MISMATCH", "Nama pada bukti tidak cocok dengan customer.", 422);
      if (extracted.activity_date < String(camp.starts_at).slice(0,10) || extracted.activity_date > String(camp.ends_at).slice(0,10)) return fail("DATE_OUT_OF_PERIOD", "Tanggal aktivitas di luar periode campaign", 422);
      if (!extracted.route_visible || extracted.confidence < 0.7 || extracted.quality_flags.length > 0) return fail("REVIEW_REQUIRED", "Bukti memerlukan review manual", 422);
      const fence = await geofence(lat, lng); if (fence.status !== "inside") return fail("OUTSIDE_AREA", "Lokasi di luar area Djiwa Tentram", 422);
      const row = { customer_source_id: customerIdentity, campaign_id: campaignId, activity_date: extracted.activity_date, distance_km: Number(extracted.distance_km.toFixed(2)), activity_type: extracted.activity_type, duration_seconds: extracted.duration_seconds, pace_seconds_per_km: extracted.pace_seconds_per_km, source: "screenshot_ai", source_app: body.source_app ?? null, proof_storage_path: body.proof_storage_path ?? null, proof_sha256: proofSha256, location_lat: lat, location_lng: lng, location_accuracy_m: body.location_accuracy_m ?? null, geofence_distance_m: fence.distance, geofence_radius_m: fence.radius, geofence_status: fence.status, location_checked_at: new Date().toISOString(), extracted_data: extracted, ai_confidence: extracted.confidence, status: "review", idempotency_key: idem, metadata: { ai_authority: "vision_ocr_customer_confirmed", manual_review_required: true } };
      const ins = await admin.schema("pos").from("run_activities").insert(row).select().single();
      if (ins.error) { const retry = await admin.schema("pos").from("run_activities").select("*").eq("idempotency_key", idem).maybeSingle(); if (retry.data) return ok({ activity: retry.data, deduplicated: true }); throw new Error(ins.error.message); }
      return ok({ activity: ins.data, processing_status: "review", progress_updated: false });
    }
    if (action === "log_activity") {
      const campaignId = String(body.campaign_id ?? ""), idem = String(body.idempotency_key ?? ""), km = Number(body.distance_km), lat = Number(body.latitude), lng = Number(body.longitude);
      if (!campaignId || !idem || !Number.isFinite(km) || km <= 0 || km > MAX_DISTANCE_KM || ![lat,lng].every(Number.isFinite)) return fail("INVALID_INPUT", "campaign_id, idempotency_key, distance_km, latitude, longitude wajib valid");
      const existing = await admin.schema("pos").from("run_activities").select("*").eq("idempotency_key", idem).maybeSingle(); if (existing.data) return ok({ activity: existing.data, deduplicated: true });
      const fence = await geofence(lat,lng); if (fence.status !== "inside") return fail("OUTSIDE_AREA", "Lokasi di luar area Djiwa Tentram", 422);
      const camp = await campaign(campaignId); if (!camp) return fail("CAMPAIGN_NOT_ACTIVE", "Campaign tidak aktif", 422);
      const date = dateOnly(body.activity_date); if (!date || date < String(camp.starts_at).slice(0,10) || date > String(camp.ends_at).slice(0,10)) return fail("DATE_OUT_OF_PERIOD", "Tanggal aktivitas di luar periode campaign", 422);
      const row = { customer_source_id: customerIdentity, campaign_id: campaignId, activity_date: date, distance_km: Number(km.toFixed(2)), activity_type: body.activity_type === "walking" ? "walking" : "running", duration_seconds: body.duration_seconds ?? null, source: body.source === "admin" ? "admin" : "screenshot_ai", source_app: body.source_app ?? null, proof_storage_path: body.proof_storage_path ?? null, proof_sha256: body.proof_sha256 ?? null, location_lat: lat, location_lng: lng, location_accuracy_m: body.location_accuracy_m ?? null, geofence_distance_m: fence.distance, geofence_radius_m: fence.radius, geofence_status: fence.status, location_checked_at: new Date().toISOString(), extracted_data: body.extracted_data ?? {}, ai_confidence: body.ai_confidence ?? null, status: isAdmin ? "accepted" : "review", idempotency_key: idem, metadata: { ai_authority: "none", manual_review_required: !isAdmin } };
      const ins = await admin.schema("pos").from("run_activities").insert(row).select().single(); if (ins.error) throw new Error(ins.error.message);
      if (isAdmin) await admin.schema("pos").rpc("run_rebuild_progress", { p_customer_source_id: customerIdentity, p_campaign_id: campaignId });
      return ok({ activity: ins.data, progress_updated: isAdmin });
    }
    if (action === "admin_review_activity") {
      if (!isAdmin) return fail("FORBIDDEN", "Admin secret required", 403);
      const id = String(body.activity_id ?? ""), status = String(body.status ?? ""); if (!id || !["accepted","rejected","review"].includes(status)) return fail("INVALID_INPUT", "activity_id/status tidak valid");
      const current = await admin.schema("pos").from("run_activities").select("*").eq("id",id).single(); if (current.error) throw new Error(current.error.message);
      const upd = await admin.schema("pos").from("run_activities").update({ status, reviewed_by: body.reviewed_by ?? "admin", reviewed_at: new Date().toISOString(), review_note: body.review_note ?? null }).eq("id",id).select().single(); if (upd.error) throw new Error(upd.error.message);
      await admin.schema("pos").rpc("run_rebuild_progress", { p_customer_source_id: current.data.customer_source_id, p_campaign_id: current.data.campaign_id });
      await admin.schema("pos").from("run_audit_logs").insert({ actor_type:"admin", actor_id:body.reviewed_by ?? null, entity_type:"run_activity", entity_id:id, action:`review_${status}`, old_values:{status:current.data.status}, new_values:{status}, reason:body.review_note ?? null });
      return ok({ activity: upd.data });
    }
    return fail("UNKNOWN_ACTION", "Action tidak dikenal");
  } catch (e) { return fail("SERVER_ERROR", e instanceof Error ? e.message : String(e), 500); }
});
