import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildTelegramMessage, type TelegramTarget } from "./messages.ts";

type Json = Record<string, unknown>;
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase function secrets");
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const db = admin.schema("pos");

const json = (body: Json, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const fail = (code: string, message: string, status = 400) => json({ success: false, error: { code, message } }, status);
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const ALLOWED_RETURN_HOSTS = [/(^|\.)djiwatentram\.web\.id$/, /^localhost$/];

async function ownedCustomer(sourceId: string, email: string) {
  if (!sourceId || !email) throw new Error("Silakan masuk terlebih dahulu");
  const { data, error } = await db.from("customers").select("source_id,email,name,phone").eq("source_id", sourceId).maybeSingle();
  if (error) throw error;
  if (!data || text(data.email).toLowerCase() !== email.toLowerCase()) throw new Error("Akun tidak dikenali");
  return data;
}

async function rpc<T = unknown>(name: string, args: Json = {}): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function safeReturnUrl(value: unknown, donationId: string): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!ALLOWED_RETURN_HOSTS.some((re) => re.test(url.hostname))) return undefined;
    url.searchParams.set("d", donationId);
    return url.toString();
  } catch {
    return undefined;
  }
}

// ───────────────────────── customer actions ─────────────────────────
async function overview(body: Json) {
  const sourceId = text(body.sourceId);
  const email = text(body.email);
  let customerId: string | null = null;
  if (sourceId && email) {
    try { customerId = (await ownedCustomer(sourceId, email)).source_id as string; } catch { customerId = null; }
  }
  return await rpc("jumat_berkah_overview", { p_customer_id: customerId });
}

async function createDonation(body: Json) {
  const sourceId = text(body.sourceId);
  const email = text(body.email);
  const customer = await ownedCustomer(sourceId, email);
  const portions = Number(body.portions);
  if (!Number.isInteger(portions)) throw new Error("Jumlah porsi tidak valid");
  const key = text(body.idempotencyKey) || crypto.randomUUID();
  const donation = await rpc<Json>("jumat_berkah_create_donation", {
    p_customer_id: sourceId, p_portions: portions, p_show_name: body.showName !== false, p_prayer: text(body.prayer) || null, p_idempotency_key: key,
  });
  const donationId = String(donation.donation_id);
  // Idempotent replay: invoice already issued for this key.
  if (donation.invoice_url) return { donationId, status: donation.status, invoiceUrl: donation.invoice_url, amount: donation.amount };

  const amount = Number(donation.amount);
  const invoiceResponse = await fetch(`${supabaseUrl}/functions/v1/mayar-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
    body: JSON.stringify({
      action: "create-invoice",
      name: text(customer.name) || "Sahabat Djiwa",
      email,
      mobile: text(customer.phone),
      redirectUrl: safeReturnUrl(body.returnUrl, donationId),
      description: `Jumat Berkah · ${portions} porsi`,
      expiredAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      extraData: { jumatBerkahDonationId: donationId, customerId: sourceId },
      items: [{ quantity: portions, rate: Number(donation.unit_price), description: "Jumat Berkah · sedekah 1 porsi makanan" }],
    }),
  });
  const invoice: any = await invoiceResponse.json().catch(() => ({}));
  if (!invoiceResponse.ok || !invoice?.data?.id || !invoice?.data?.link) {
    await db.from("jumat_berkah_donations").update({ status: "cancelled" }).eq("donation_id", donationId).eq("status", "pending");
    const detail = invoice?.error && typeof invoice.error === "object" ? invoice.error.message : invoice?.messages || invoice?.message;
    throw new Error(typeof detail === "string" && detail.trim() ? detail : "Gagal menyiapkan pembayaran. Silakan coba lagi.");
  }
  await rpc("jumat_berkah_attach_invoice", { p_donation_id: donationId, p_invoice_id: invoice.data.id, p_transaction_id: invoice.data.transactionId ?? "", p_invoice_url: invoice.data.link });
  return { donationId, status: "pending", invoiceUrl: invoice.data.link, amount };
}

async function donationStatus(body: Json) {
  const sourceId = text(body.sourceId);
  await ownedCustomer(sourceId, text(body.email));
  return await rpc("jumat_berkah_donation_status", { p_donation_id: text(body.donationId), p_customer_id: sourceId });
}

async function toggleAmin(body: Json) {
  const sourceId = text(body.sourceId);
  await ownedCustomer(sourceId, text(body.email));
  return await rpc("jumat_berkah_toggle_amin", { p_prayer_id: text(body.prayerId), p_customer_id: sourceId });
}

// ───────────────────────── telegram outbox ─────────────────────────
// ID grup disimpan di pengaturan (bisa diubah dari admin); variabel lingkungan hanya cadangan.
async function chatId(target: TelegramTarget): Promise<string> {
  const column = target === "kitchen" ? "telegram_kitchen_chat_id" : "telegram_transaction_chat_id";
  const { data } = await db.from("jumat_berkah_settings").select(column).eq("id", 1).maybeSingle();
  return text((data as Record<string, unknown> | null)?.[column]) || text(Deno.env.get(target === "kitchen" ? "KITCHEN_GROUP_ID" : "TRANSACTION_GROUP_ID"));
}

async function sendTelegram(chat: string, message: string) {
  // Bot supervisor adalah administrator di grup Transaksi dan Kitchen.
  const token = text(Deno.env.get("TELEGRAM_SUPERVISOR_BOT_TOKEN")) || text(Deno.env.get("TELEGRAM_BOT_TOKEN"));
  if (!token) throw new Error("Token bot Telegram belum diatur");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: message, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Telegram ${response.status}: ${detail.slice(0, 120)}`);
  }
}

async function deliver(eventType: string, payload: Json) {
  const message = buildTelegramMessage({ event_type: eventType, payload });
  if (!message) return;
  const errors: string[] = [];
  let attempted = 0;
  for (const target of message.targets) {
    const chat = await chatId(target);
    if (!chat) { errors.push(`ID grup Telegram ${target === "kitchen" ? "Kitchen" : "Transaksi"} belum diatur`); continue; }
    attempted += 1;
    try { await sendTelegram(chat, message.text); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  if (errors.length > 0 && (attempted === 0 || errors.length === message.targets.length)) throw new Error(errors.join("; "));
  if (errors.length > 0) console.warn("jumat-berkah partial telegram delivery", errors);
}

async function drain(limit = 20) {
  const rows = await rpc<Array<{ outbox_id: number; event_type: string; payload: Json }>>("jumat_berkah_outbox_claim", { p_limit: limit });
  let sent = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    try {
      await deliver(row.event_type, row.payload);
      await rpc("jumat_berkah_outbox_ack", { p_outbox_id: row.outbox_id, p_ok: true });
      sent += 1;
    } catch (error) {
      await rpc("jumat_berkah_outbox_ack", { p_outbox_id: row.outbox_id, p_ok: false, p_error: error instanceof Error ? error.message : String(error) });
      failed += 1;
    }
  }
  return { claimed: rows?.length ?? 0, sent, failed };
}

// ───────────────────────── admin actions ─────────────────────────
async function adminSummary() {
  const [settings, campaign] = await Promise.all([
    db.from("jumat_berkah_settings").select("enabled,price_per_portion,target_portions,max_portions_per_donation,reservation_minutes,telegram_transaction_chat_id,telegram_kitchen_chat_id").eq("id", 1).single(),
    rpc<Json>("jumat_berkah_ensure_campaign"),
  ]);
  if (settings.error) throw settings.error;
  const campaignId = String(campaign.campaign_id);
  const [donations, history, pendingPrayers, outbox] = await Promise.all([
    db.from("jumat_berkah_donations").select("amount,portions,status").eq("campaign_id", campaignId),
    db.from("jumat_berkah_campaigns").select("campaign_id,distribution_date,target_portions,status,closes_at,price_per_portion").order("distribution_date", { ascending: false }).limit(12),
    db.from("jumat_berkah_prayers").select("prayer_id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("jumat_berkah_outbox").select("status", { count: "exact" }).in("status", ["pending", "failed"]),
  ]);
  const paid = (donations.data ?? []).filter((d: Json) => d.status === "paid");
  return {
    settings: settings.data, campaign,
    totals: { paidPortions: paid.reduce((s: number, d: Json) => s + Number(d.portions), 0), paidAmount: paid.reduce((s: number, d: Json) => s + Number(d.amount), 0), donors: paid.length },
    history: history.data ?? [], pendingPrayers: pendingPrayers.count ?? 0,
    outbox: { waiting: (outbox.data ?? []).filter((o: Json) => o.status === "pending").length, failed: (outbox.data ?? []).filter((o: Json) => o.status === "failed").length },
  };
}

async function adminDonations(body: Json) {
  let query = db.from("jumat_berkah_donations").select("donation_id,campaign_id,donor_name,display_name,show_name,portions,amount,status,prayer_text,created_at,paid_at").order("created_at", { ascending: false }).limit(300);
  const campaignId = text(body.campaignId);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const status = text(body.status);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return { donations: data ?? [] };
}

async function adminPrayers(body: Json) {
  let query = db.from("jumat_berkah_prayers").select("*").order("created_at", { ascending: false }).limit(200);
  const status = text(body.status);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return { prayers: data ?? [] };
}

async function adminPrayerUpdate(body: Json) {
  const prayerId = text(body.prayerId);
  if (!prayerId) throw new Error("prayerId wajib");
  const patch: Json = {};
  if (["approved", "hidden", "pending"].includes(text(body.status))) patch.status = text(body.status);
  if (typeof body.isPinned === "boolean") patch.is_pinned = body.isPinned;
  if (Object.keys(patch).length === 0) throw new Error("Tidak ada perubahan");
  const { error } = await db.from("jumat_berkah_prayers").update(patch).eq("prayer_id", prayerId);
  if (error) throw error;
  return { ok: true };
}

async function adminSeedPrayer(body: Json) {
  const bodyText = text(body.body);
  if (!bodyText || bodyText.length > 140) throw new Error("Doa 1 sampai 140 karakter");
  const { error } = await db.from("jumat_berkah_prayers").insert({ prayer_id: `jbp_${crypto.randomUUID().replaceAll("-", "")}`, display_name: text(body.displayName) || "Hamba Allah", body: bodyText, status: "approved", is_seed: true });
  if (error) throw error;
  return { ok: true };
}

async function adminSettings(body: Json) {
  const patch: Json = { updated_at: new Date().toISOString() };
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  for (const [key, column] of [["telegramTransactionChatId", "telegram_transaction_chat_id"], ["telegramKitchenChatId", "telegram_kitchen_chat_id"]] as const) {
    if (body[key] === undefined) continue;
    const value = text(body[key]);
    if (value && !/^-?\d{5,20}$/.test(value)) throw new Error(`${key} harus berupa angka chat ID Telegram`);
    patch[column] = value || null;
  }
  for (const [key, column, min, max] of [["pricePerPortion", "price_per_portion", 1000, 500000], ["targetPortions", "target_portions", 1, 5000], ["maxPortionsPerDonation", "max_portions_per_donation", 1, 1000], ["reservationMinutes", "reservation_minutes", 5, 240]] as const) {
    if (body[key] === undefined) continue;
    const value = Number(body[key]);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} harus ${min}-${max}`);
    patch[column] = value;
  }
  const { error } = await db.from("jumat_berkah_settings").update(patch).eq("id", 1);
  if (error) throw error;
  // Kampanye yang sedang terbuka mengikuti pengaturan: target selalu, harga hanya selama belum ada donasi terbayar.
  const campaign = await rpc<Json>("jumat_berkah_ensure_campaign");
  const campaignId = String(campaign.campaign_id);
  const sync: Json = {};
  if (patch.target_portions !== undefined) sync.target_portions = patch.target_portions;
  if (patch.price_per_portion !== undefined) {
    const { count } = await db.from("jumat_berkah_donations").select("donation_id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "paid");
    if ((count ?? 0) === 0) sync.price_per_portion = patch.price_per_portion;
  }
  if (Object.keys(sync).length > 0) {
    const { error: syncError } = await db.from("jumat_berkah_campaigns").update({ ...sync, updated_at: new Date().toISOString() }).eq("campaign_id", campaignId);
    if (syncError) throw syncError;
  }
  return { ok: true };
}

async function adminRecordDistribution(body: Json) {
  return await rpc("jumat_berkah_record_distribution", {
    p_campaign_id: text(body.campaignId), p_portions_given: Number(body.portionsGiven), p_location: text(body.location), p_notes: text(body.notes), p_recorded_by: text(body.recordedBy) || "admin",
  });
}

async function adminGallery() {
  const { data, error } = await db.from("jumat_berkah_gallery").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return { photos: data ?? [] };
}

async function adminGalleryUpload(body: Json) {
  const contentType = text(body.contentType);
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) throw new Error("Format foto harus JPG, PNG, atau WebP");
  const base64 = text(body.dataBase64);
  if (!base64) throw new Error("Foto kosong");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  if (bytes.byteLength > 3 * 1024 * 1024) throw new Error("Foto maksimal 3 MB");
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const photoId = `jbg_${crypto.randomUUID().replaceAll("-", "")}`;
  const path = `gallery/${new Date().toISOString().slice(0, 10)}/${photoId}.${ext}`;
  const { error: uploadError } = await admin.storage.from("jumat-berkah").upload(path, bytes, { contentType, upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await db.from("jumat_berkah_gallery").insert({ photo_id: photoId, campaign_id: text(body.campaignId) || null, image_url: path, caption: text(body.caption).slice(0, 160) || null, created_by: text(body.recordedBy) || "admin" });
  if (error) { await admin.storage.from("jumat-berkah").remove([path]); throw error; }
  return { photoId, path };
}

async function adminGalleryUpdate(body: Json) {
  const photoId = text(body.photoId);
  if (!photoId) throw new Error("photoId wajib");
  if (body.delete === true) {
    const { data } = await db.from("jumat_berkah_gallery").select("image_url").eq("photo_id", photoId).maybeSingle();
    const { error } = await db.from("jumat_berkah_gallery").delete().eq("photo_id", photoId);
    if (error) throw error;
    if (data?.image_url) await admin.storage.from("jumat-berkah").remove([String(data.image_url)]);
    return { ok: true };
  }
  const patch: Json = {};
  if (typeof body.isPublished === "boolean") patch.is_published = body.isPublished;
  if (typeof body.caption === "string") patch.caption = body.caption.trim().slice(0, 160) || null;
  const { error } = await db.from("jumat_berkah_gallery").update(patch).eq("photo_id", photoId);
  if (error) throw error;
  return { ok: true };
}

async function adminTestTelegram() {
  await deliver("test", {});
  return { ok: true };
}

async function adminRetryOutbox() {
  const { error } = await db.from("jumat_berkah_outbox").update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString() }).eq("status", "failed");
  if (error) throw error;
  return await drain(20);
}

async function cronAuthorized(req: Request): Promise<boolean> {
  const token = req.headers.get("x-jb-cron") ?? "";
  if (!token) return false;
  const { data } = await db.from("jumat_berkah_settings").select("cron_token").eq("id", 1).maybeSingle();
  const expected = text(data?.cron_token);
  return Boolean(expected) && expected.length === token.length && expected === token;
}

function adminAuthorized(req: Request): boolean {
  const expected = Deno.env.get("ONBOARDING_ADMIN_SECRET") ?? "";
  const received = req.headers.get("x-admin-secret") ?? "";
  return Boolean(expected) && received.length === expected.length && received === expected;
}

const CUSTOMER_ACTIONS: Record<string, (body: Json) => Promise<unknown>> = {
  overview, "create-donation": createDonation, status: donationStatus, "toggle-amin": toggleAmin,
};
const ADMIN_ACTIONS: Record<string, (body: Json) => Promise<unknown>> = {
  "admin-summary": () => adminSummary(), "admin-donations": adminDonations, "admin-prayers": adminPrayers, "admin-prayer-update": adminPrayerUpdate,
  "admin-seed-prayer": adminSeedPrayer, "admin-settings": adminSettings, "admin-record-distribution": adminRecordDistribution, "admin-gallery": () => adminGallery(),
  "admin-gallery-upload": adminGalleryUpload, "admin-gallery-update": adminGalleryUpdate, "admin-test-telegram": () => adminTestTelegram(), "admin-retry-outbox": () => adminRetryOutbox(),
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "POST required", 405);
  try {
    const body = (await req.json()) as Json;
    const action = text(body.action);
    if (action === "drain") {
      if (!(await cronAuthorized(req)) && !adminAuthorized(req)) return fail("UNAUTHORIZED", "Tidak diizinkan", 401);
      return json({ success: true, ...(await drain()) });
    }
    if (ADMIN_ACTIONS[action]) {
      if (!adminAuthorized(req)) return fail("UNAUTHORIZED", "Otorisasi admin gagal", 401);
      return json({ success: true, result: await ADMIN_ACTIONS[action](body) });
    }
    if (CUSTOMER_ACTIONS[action]) return json({ success: true, result: await CUSTOMER_ACTIONS[action](body) });
    return fail("UNKNOWN_ACTION", "Action tidak dikenali", 404);
  } catch (error) {
    console.error("jumat-berkah failed", error);
    return fail("JUMAT_BERKAH_ERROR", error instanceof Error ? error.message : "Gagal memproses permintaan", 400);
  }
});
