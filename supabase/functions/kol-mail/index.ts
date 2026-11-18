// Pengirim antrean email transaksional KOL (pos.kol_email_outbox). Dipanggil cron tiap menit dengan x-cron-secret.
// Isi email dibuat dari payload yang dibekukan saat antrean dibuat (_shared/kol-mail.ts), jadi apa yang terkirim
// sama dengan yang tercatat. Kegagalan sementara dicoba ulang bertahap; kegagalan permanen ditandai gagal.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildKolEmail, type KolMailKind, type KolMailPayload } from "../_shared/kol-mail.ts";
import { emailSetting } from "../_shared/email-settings.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase function secrets");
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const pos = () => admin.schema("pos");

const HELIPOD_BASE = "https://mail.helipod.io/api/email";
const FROM_DEFAULT = "Djiwa Tentram <hello@mail.djiwatentram.web.id>";
const TIME_BUDGET_MS = 40_000; // pekerja edge dihentikan setelah 60 detik
const MAX_ATTEMPTS = 5;
const BACKOFF_MIN = [1, 5, 15, 60, 180];
/** Galat penyedia yang berarti "berhenti dulu", bukan "penerima ini bermasalah". */
const STOP_CODES = new Set(["DAILY_QUOTA_EXCEEDED", "MONTHLY_QUOTA_EXCEEDED", "PAYG_DISABLED", "INSUFFICIENT_BALANCE", "REPUTATION_SUSPENDED", "PLATFORM_PAUSED", "SENDING_DISABLED", "SUBSCRIPTION_EXPIRED"]);
const PERMANENT_CODES = new Set(["INVALID_RECIPIENT", "RECIPIENT_SUPPRESSED", "SUPPRESSED", "INVALID_EMAIL", "VALIDATION_ERROR", "INVALID_FROM"]);

type Row = { id: number; kind: KolMailKind; to_email: string | null; payload: KolMailPayload; attempts: number };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function finish(id: number, patch: Record<string, unknown>) {
  const { error } = await pos().from("kol_email_outbox").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error("kol-mail update", id, error.message);
}

type Outcome = "sent" | "retry" | "failed" | "skipped" | "stop";

async function sendOne(row: Row): Promise<Outcome> {
  const to = (row.to_email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(to)) { await finish(row.id, { status: "skipped", last_error: "EMAIL_TIDAK_VALID" }); return "skipped"; }
  const mail = buildKolEmail(row.kind, row.payload);
  const apiKey = await emailSetting(admin, "HELIPOD_EMAIL_API_KEY");
  if (!apiKey) { await finish(row.id, { status: "pending", scheduled_at: new Date(Date.now() + 15 * 60_000).toISOString(), last_error: "API_KEY_KOSONG" }); return "stop"; }
  const from = (await emailSetting(admin, "EMAIL_FROM")) || FROM_DEFAULT;
  let status = 0;
  let json: { success?: boolean; data?: { id?: string; messageId?: string }; error?: string | { code?: string; message?: string }; code?: string } | null = null;
  try {
    const res = await fetch(`${HELIPOD_BASE}/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: mail.subject, html: mail.html, text: mail.text, idempotencyKey: `kol-outbox-${row.id}` }),
    });
    status = res.status;
    json = await res.json().catch(() => null);
  } catch (error) {
    return retryLater(row, `JARINGAN: ${error instanceof Error ? error.message : "gagal"}`);
  }
  if (json?.success) {
    await finish(row.id, { status: "sent", sent_at: new Date().toISOString(), provider_message_id: json.data?.id ?? json.data?.messageId ?? null, last_error: null });
    return "sent";
  }
  const code = String(json?.code ?? (typeof json?.error === "object" ? json.error?.code : "") ?? "");
  const message = String(typeof json?.error === "string" ? json.error : json?.error?.message ?? "");
  const label = `${code || status}${message ? `: ${message}` : ""}`.slice(0, 300);
  if (STOP_CODES.has(code) || status === 402) {
    await finish(row.id, { status: "pending", attempts: Math.max(0, row.attempts - 1), scheduled_at: new Date(Date.now() + 15 * 60_000).toISOString(), last_error: label });
    return "stop";
  }
  if (PERMANENT_CODES.has(code) || (status >= 400 && status < 500 && status !== 429 && status !== 408)) {
    await finish(row.id, { status: "failed", last_error: label });
    return "failed";
  }
  return retryLater(row, label);
}

async function retryLater(row: Row, label: string): Promise<Outcome> {
  if (row.attempts >= MAX_ATTEMPTS) { await finish(row.id, { status: "failed", last_error: label }); return "failed"; }
  const wait = BACKOFF_MIN[Math.min(row.attempts - 1, BACKOFF_MIN.length - 1)] ?? 60;
  await finish(row.id, { status: "pending", scheduled_at: new Date(Date.now() + wait * 60_000).toISOString(), last_error: label.slice(0, 300) });
  return "retry";
}

async function processQueue() {
  const started = Date.now();
  const totals = { reminders: 0, sent: 0, failed: 0, retried: 0, skipped: 0, stopped: false };
  const reminders = await pos().rpc("kol_enqueue_visit_reminders");
  if (!reminders.error) totals.reminders = Number(reminders.data ?? 0);
  while (Date.now() - started < TIME_BUDGET_MS) {
    const { data, error } = await pos().rpc("kol_outbox_claim", { p_limit: 10 });
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    if (!rows.length) break;
    for (const row of rows) {
      if (Date.now() - started > TIME_BUDGET_MS) { await finish(row.id, { status: "pending", attempts: Math.max(0, row.attempts - 1) }); continue; }
      const outcome = await sendOne(row);
      if (outcome === "sent") totals.sent++;
      else if (outcome === "failed") totals.failed++;
      else if (outcome === "retry") totals.retried++;
      else if (outcome === "skipped") totals.skipped++;
      else { totals.stopped = true; }
      await new Promise((r) => setTimeout(r, 220)); // batas kecepatan Helipod: 5 email/detik
    }
    if (totals.stopped) break;
  }
  return totals;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ success: false, error: "Method tidak diizinkan" }, 405);
  const cronSecret = Deno.env.get("CRON_SECRET") || "";
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) return response({ success: false, error: "Unauthorized" }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "process";
    if (action !== "process") return response({ success: false, error: "Action tidak dikenal" }, 400);
    return response({ success: true, data: await processQueue() });
  } catch (error) {
    console.error("kol-mail", error);
    return response({ success: false, error: "Gagal memproses antrean email" }, 500);
  }
});
