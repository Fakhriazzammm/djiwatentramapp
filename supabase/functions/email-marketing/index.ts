import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
	APP_URL, BUILTIN_TEMPLATES, FREQUENCY_CAP_HOURS, FROM_DEFAULT, SEGMENTS, htmlToText, isSegment, renderTemplate,
	selectRecipients, unsubscribeUrl, validEmail, type CustomerRow, type SegmentKey,
} from "../_shared/email-marketing.ts";
import { emailSetting } from "../_shared/email-settings.ts";

type Json = Record<string, unknown>;
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase function secrets");
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const pos = () => admin.schema("pos");

const HELIPOD_BASE = "https://mail.helipod.io/api/email";
const SEND_CHUNK = 25;
const TIME_BUDGET_MS = 45_000; // edge workers are killed after 60s (main/index.ts workerTimeoutMs)
const CUSTOMER_COLUMNS = "source_id,email,name,nickname,marketing_consent,total_orders,total_spent,wallet_balance,last_active_at,last_order_at,membership_expires_at,created_at";
/** Provider errors that mean "stop the whole campaign", not "this recipient is bad". */
const CAMPAIGN_STOPPING = new Set(["DAILY_QUOTA_EXCEEDED", "MONTHLY_QUOTA_EXCEEDED", "PAYG_DISABLED", "INSUFFICIENT_BALANCE", "REPUTATION_SUSPENDED", "PLATFORM_REPUTATION", "TENANT_PAUSED", "SENDING_DISABLED", "DOMAIN_NOT_VERIFIED", "DOMAIN_NOT_FOUND", "INVALID_API_KEY", "API_KEY_EXPIRED", "NO_PLAN", "RATE_LIMITED"]);

const response = (body: Json, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const fail = (code: string, message: string, status = 400) => response({ success: false, error: { code, message } }, status);
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
class UserError extends Error { constructor(message: string, public code = "BAD_REQUEST") { super(message); } }
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function env(name: string) {
	const value = await emailSetting(admin, name);
	if (!value) throw new UserError(`Konfigurasi ${name} belum dipasang di server`, "NOT_CONFIGURED");
	return value;
}
const fromAddress = async () => (await emailSetting(admin, "EMAIL_FROM")) || FROM_DEFAULT;

// ---------- auth ----------
async function verifyStaff(payload: Json) {
	const token = text(payload.staffToken);
	let staffId = text(payload.staffSourceId);
	if (!token) throw new UserError("Sesi staff wajib diisi", "UNAUTHORIZED");
	if (token.startsWith("local_yumi_session:")) {
		try {
			const raw = token.slice("local_yumi_session:".length);
			const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))));
			if (Date.now() > Number(decoded?.expiresAt ?? 0)) throw new Error("expired");
			staffId = text(decoded?.user?._id) || staffId;
		} catch { throw new UserError("Sesi staff tidak valid", "UNAUTHORIZED"); }
	} else {
		const { data: session, error } = await admin.from("yumi_sessions").select("user_source_id").eq("token", token).gt("expires_at", new Date().toISOString()).maybeSingle();
		if (error) throw error;
		staffId = text(session?.user_source_id) || staffId;
	}
	if (!staffId) throw new UserError("Identitas staff tidak ditemukan", "UNAUTHORIZED");
	const { data: user, error: userError } = await admin.from("yumi_users").select("source_id,role_source_id,is_active").eq("source_id", staffId).maybeSingle();
	if (userError) throw userError;
	if (!user?.is_active) throw new UserError("Staff tidak aktif", "FORBIDDEN");
	const { data: role, error: roleError } = await admin.from("yumi_roles").select("name").eq("source_id", user.role_source_id).maybeSingle();
	if (roleError) throw roleError;
	if (!/(admin|manager|owner|supervisor)/.test(text(role?.name).toLowerCase())) throw new UserError("Role tidak memiliki akses email marketing", "FORBIDDEN");
	return staffId;
}

// ---------- Helipod ----------
async function helipod(path: string, init: { method?: string; body?: unknown } = {}) {
	const res = await fetch(`${HELIPOD_BASE}${path}`, {
		method: init.method ?? "GET",
		headers: { Authorization: `Bearer ${await env("HELIPOD_EMAIL_API_KEY")}`, "Content-Type": "application/json" },
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});
	const json = await res.json().catch(() => null) as { success?: boolean; data?: unknown; error?: string; code?: string } | null;
	return { status: res.status, retryAfter: Number(res.headers.get("retry-after") ?? 0), json };
}

async function quota() {
	try {
		const { json } = await helipod("/status");
		const data = json?.data as { usage?: { month?: number; monthlyLimit?: number; today?: number; dailyLimit?: number }; plan?: { code?: string }; subscription?: { paygEnabled?: boolean; expiredAt?: string } } | undefined;
		if (!data) return null;
		const limit = Number(data.usage?.monthlyLimit ?? 0);
		const used = Number(data.usage?.month ?? 0);
		const dailyLimit = Number(data.usage?.dailyLimit ?? 0);
		const dailyLeft = dailyLimit ? Math.max(0, dailyLimit - Number(data.usage?.today ?? 0)) : null;
		return { plan: data.plan?.code ?? "", limit, used, remaining: limit ? Math.max(0, limit - used) : null, dailyLeft, payg: Boolean(data.subscription?.paygEnabled), expiredAt: data.subscription?.expiredAt ?? null };
	} catch { return null; }
}

// ---------- data ----------
async function loadCustomers() {
	const rows: CustomerRow[] = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await admin.from("pos_customers_view").select(CUSTOMER_COLUMNS).order("source_id", { ascending: true }).range(from, from + 999);
		if (error) throw error;
		rows.push(...((data ?? []) as CustomerRow[]));
		if ((data ?? []).length < 1000) return rows;
	}
}
async function loadSuppressed() {
	const set = new Set<string>();
	for (let from = 0; ; from += 1000) {
		const { data, error } = await pos().from("email_suppressions").select("email").range(from, from + 999);
		if (error) throw error;
		for (const row of data ?? []) set.add(String(row.email).toLowerCase());
		if ((data ?? []).length < 1000) return set;
	}
}
async function loadRecentlyMailed(excludeCampaignId?: string) {
	const since = new Date(Date.now() - FREQUENCY_CAP_HOURS * 3_600_000).toISOString();
	let query = pos().from("email_campaign_recipients").select("customer_id").gte("sent_at", since).in("status", ["sent", "delivered", "bounced", "complained"]);
	if (excludeCampaignId) query = query.neq("campaign_id", excludeCampaignId);
	const { data, error } = await query.limit(5000);
	if (error) throw error;
	return new Set((data ?? []).map((row) => String(row.customer_id)));
}

async function audience(segment: SegmentKey, excludeCampaignId?: string) {
	const [rows, suppressed, recentlyMailed] = await Promise.all([loadCustomers(), loadSuppressed(), loadRecentlyMailed(excludeCampaignId)]);
	return { rows, ...selectRecipients(rows, { segment, suppressed, recentlyMailed }) };
}

// ---------- actions ----------
async function overview() {
	const [rows, suppressed, recentlyMailed, q, customTemplates] = await Promise.all([
		loadCustomers(), loadSuppressed(), loadRecentlyMailed(), quota(),
		pos().from("email_templates").select("id,name,description,subject,html,updated_at").eq("brand", "djiwatentram").order("updated_at", { ascending: false }),
	]);
	if (customTemplates.error) throw customTemplates.error;
	const segments = (Object.keys(SEGMENTS) as SegmentKey[]).map((key) => ({ key, label: SEGMENTS[key], eligible: selectRecipients(rows, { segment: key, suppressed, recentlyMailed }).recipients.length }));
	const consented = rows.filter((row) => row.marketing_consent === true).length;
	return {
		segments,
		customers: { total: rows.length, consented, suppressed: suppressed.size },
		quota: q,
		from: await fromAddress(),
		builtinTemplates: BUILTIN_TEMPLATES,
		customTemplates: customTemplates.data ?? [],
	};
}

async function previewAudience(payload: Json) {
	const segment = payload.segment;
	if (!isSegment(segment)) throw new UserError("Segmen tidak dikenal");
	const { recipients, skipped } = await audience(segment, text(payload.campaignId) || undefined);
	return { total: recipients.length, skipped, sample: recipients.slice(0, 5).map((r) => ({ name: r.name, email: r.email })) };
}

function cleanContent(payload: Json) {
	const name = text(payload.name).slice(0, 120);
	const subject = text(payload.subject).slice(0, 300);
	const html = typeof payload.html === "string" ? payload.html : "";
	if (!subject) throw new UserError("Subjek wajib diisi");
	if (html.trim().length < 20) throw new UserError("Isi email terlalu pendek");
	if (html.length > 400_000) throw new UserError("Isi email terlalu besar");
	if (!html.includes("{{{unsubscribe_url}}}")) throw new UserError("Template wajib memuat link berhenti berlangganan: {{{unsubscribe_url}}}");
	return { name, subject, html };
}

async function saveTemplate(payload: Json, staffId: string) {
	const content = cleanContent({ ...payload, name: payload.name || "x" });
	const name = text(payload.name).slice(0, 120);
	if (!name) throw new UserError("Nama template wajib diisi");
	const row = { name, description: text(payload.description).slice(0, 300), subject: content.subject, html: content.html, updated_at: new Date().toISOString() };
	const id = text(payload.id);
	const query = id ? pos().from("email_templates").update(row).eq("id", id) : pos().from("email_templates").insert({ ...row, created_by: staffId });
	const { data, error } = await query.select("id,name,description,subject,html,updated_at").single();
	if (error) throw error;
	return { template: data };
}
async function deleteTemplate(payload: Json) {
	const id = text(payload.id);
	if (!id) throw new UserError("Template wajib dipilih");
	const { error } = await pos().from("email_templates").delete().eq("id", id);
	if (error) throw error;
	return { deleted: true };
}

async function createCampaign(payload: Json, staffId: string) {
	const content = cleanContent(payload);
	if (!content.name) throw new UserError("Nama kampanye wajib diisi");
	if (!isSegment(payload.segment)) throw new UserError("Segmen tidak dikenal");
	let scheduledAt: string | null = null;
	if (payload.scheduledAt) {
		const date = new Date(String(payload.scheduledAt));
		if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 60_000) throw new UserError("Jadwal harus minimal 1 menit dari sekarang");
		scheduledAt = date.toISOString();
	}
	const { data, error } = await pos().from("email_campaigns").insert({
		...content, template_id: text(payload.templateId) || null, segment: payload.segment, status: scheduledAt ? "scheduled" : "draft",
		scheduled_at: scheduledAt, from_address: await fromAddress(), created_by: staffId,
	}).select("*").single();
	if (error) throw error;
	return { campaign: data };
}

async function listCampaigns() {
	const { data, error } = await pos().from("email_campaigns").select("*").eq("brand", "djiwatentram").order("created_at", { ascending: false }).limit(100);
	if (error) throw error;
	const campaigns = data ?? [];
	const stats: Record<string, Record<string, number>> = {};
	if (campaigns.length) {
		const { data: counts, error: countError } = await pos().rpc("email_campaign_status_counts", { p_campaign_ids: campaigns.map((c) => c.id) });
		if (countError) throw countError;
		for (const row of (counts ?? []) as { campaign_id: string; status: string; n: number }[]) (stats[row.campaign_id] ??= {})[row.status] = Number(row.n);
	}
	return { campaigns: campaigns.map((campaign) => ({ ...campaign, stats: stats[campaign.id] ?? {} })) };
}

async function getCampaign(payload: Json) {
	const id = text(payload.id);
	const { data: campaign, error } = await pos().from("email_campaigns").select("*").eq("id", id).maybeSingle();
	if (error) throw error;
	if (!campaign) throw new UserError("Kampanye tidak ditemukan", "NOT_FOUND");
	const status = text(payload.status);
	let query = pos().from("email_campaign_recipients").select("id,customer_id,email,name,status,error,sent_at,delivered_at,opened_at,clicked_at").eq("campaign_id", id).order("id").limit(300);
	if (status) query = query.eq("status", status);
	const [{ data: recipients, error: recipientError }, { data: counts, error: countError }] = await Promise.all([query, pos().rpc("email_campaign_status_counts", { p_campaign_ids: [id] })]);
	if (recipientError) throw recipientError;
	if (countError) throw countError;
	const stats: Record<string, number> = {};
	for (const row of (counts ?? []) as { status: string; n: number }[]) stats[row.status] = Number(row.n);
	const { count: opened } = await pos().from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).not("opened_at", "is", null);
	const { count: clicked } = await pos().from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).not("clicked_at", "is", null);
	return { campaign, recipients: recipients ?? [], stats, opened: opened ?? 0, clicked: clicked ?? 0 };
}

async function deleteCampaign(payload: Json) {
	const id = text(payload.id);
	const { data, error } = await pos().from("email_campaigns").select("status").eq("id", id).maybeSingle();
	if (error) throw error;
	if (!data) throw new UserError("Kampanye tidak ditemukan", "NOT_FOUND");
	if (!["draft", "scheduled", "canceled"].includes(data.status)) throw new UserError("Hanya draf, terjadwal, atau dibatalkan yang bisa dihapus");
	const { error: deleteError } = await pos().from("email_campaigns").delete().eq("id", id);
	if (deleteError) throw deleteError;
	return { deleted: true };
}

async function sendTest(payload: Json) {
	const to = text(payload.to).toLowerCase();
	if (!validEmail(to)) throw new UserError("Alamat email uji tidak valid");
	const content = cleanContent({ ...payload, name: "uji" });
	const secret = await env("EMAIL_UNSUB_SECRET");
	const vars = { nama: "Tes", saldo: "Rp25.000", exp_member: "31 Desember 2026", link: APP_URL, hari_tidak_aktif: "45", unsubscribe_url: await unsubscribeUrl(to, secret) };
	const html = renderTemplate(content.html, vars);
	const { status, json } = await helipod("/send", { method: "POST", body: { from: await fromAddress(), to: [to], subject: `[UJI] ${renderTemplate(content.subject, vars)}`, html, text: htmlToText(html) } });
	if (!json?.success) throw new UserError(`Email uji ditolak: ${json?.error ?? status}`, json?.code ?? "PROVIDER_ERROR");
	return { sent: true };
}

/** Freezes the audience into recipient rows so a campaign can be resumed without double-sending. */
async function materialize(campaign: { id: string; segment: string }) {
	const segment = campaign.segment as SegmentKey;
	const { recipients } = await audience(segment, campaign.id);
	if (!recipients.length) throw new UserError("Tidak ada penerima yang memenuhi syarat untuk segmen ini");
	for (let i = 0; i < recipients.length; i += 500) {
		const { error } = await pos().from("email_campaign_recipients").upsert(
			recipients.slice(i, i + 500).map((r) => ({ campaign_id: campaign.id, customer_id: r.customerId, email: r.email, name: r.name, vars: r.vars })),
			{ onConflict: "campaign_id,customer_id", ignoreDuplicates: true },
		);
		if (error) throw error;
	}
	return recipients.length;
}

async function startCampaign(payload: Json) {
	const id = text(payload.id);
	const { data: campaign, error } = await pos().from("email_campaigns").select("*").eq("id", id).maybeSingle();
	if (error) throw error;
	if (!campaign) throw new UserError("Kampanye tidak ditemukan", "NOT_FOUND");
	if (!["draft", "scheduled", "paused"].includes(campaign.status)) throw new UserError(`Kampanye berstatus ${campaign.status} dan tidak bisa dimulai`);
	const q = await quota();
	if (q?.remaining !== null && q?.remaining !== undefined && !q.payg) {
		const { count } = await pos().from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "queued");
		const planned = campaign.status === "paused" ? count ?? 0 : (await audience(campaign.segment as SegmentKey, id)).recipients.length;
		if (planned > q.remaining) throw new UserError(`Kuota bulan ini tersisa ${q.remaining} email, sedangkan kampanye butuh ${planned}. Kurangi segmen, aktifkan pay-as-you-go, atau tunggu periode berikutnya.`, "QUOTA");
	}
	const total = campaign.status === "paused" ? campaign.total_recipients : await materialize(campaign);
	const { error: updateError } = await pos().from("email_campaigns").update({ status: "sending", total_recipients: total, started_at: campaign.started_at ?? new Date().toISOString(), scheduled_at: null, last_error: null }).eq("id", id);
	if (updateError) throw updateError;
	return await processCampaign({ id });
}

async function processCampaign(payload: Json) {
	const id = text(payload.id);
	const deadline = Date.now() + TIME_BUDGET_MS;
	const secret = await env("EMAIL_UNSUB_SECRET");
	const from = await fromAddress();
	let sentNow = 0;
	let stopped: string | null = null;
	for (;;) {
		const { data: campaign, error } = await pos().from("email_campaigns").select("*").eq("id", id).maybeSingle();
		if (error) throw error;
		if (!campaign) throw new UserError("Kampanye tidak ditemukan", "NOT_FOUND");
		if (campaign.status !== "sending") break;
		const { data: batch, error: batchError } = await pos().from("email_campaign_recipients").select("id,customer_id,email,name,vars,attempts").eq("campaign_id", id).eq("status", "queued").order("id").limit(SEND_CHUNK);
		if (batchError) throw batchError;
		if (!batch?.length) {
			await pos().from("email_campaigns").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", id).eq("status", "sending");
			break;
		}
		const messages = await Promise.all(batch.map(async (row) => {
			const vars: Record<string, string> = {};
			for (const [key, value] of Object.entries((row.vars ?? {}) as Record<string, string>)) vars[key] = String(value).replaceAll("{{", "{ {");
			vars.unsubscribe_url = await unsubscribeUrl(row.email, secret);
			const html = renderTemplate(campaign.html, vars);
			return {
				from, to: [row.email], subject: renderTemplate(campaign.subject, vars), html, text: htmlToText(html),
				headers: { "List-Unsubscribe": `<${vars.unsubscribe_url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
				metadata: { campaignId: id },
				idempotencyKey: `${id}-${row.customer_id}`.slice(0, 128),
			};
		}));
		const result = await helipod("/send/batch", { method: "POST", body: { messages } });
		type Item = { id?: string; error?: string; code?: string };
		const items: Item[] | null = Array.isArray(result.json?.data) ? result.json!.data as Item[] : Array.isArray((result.json?.data as { results?: Item[] } | undefined)?.results) ? (result.json!.data as { results: Item[] }).results : null;
		if (result.status === 429) { await sleep(Math.min(10, Math.max(1, result.retryAfter || 2)) * 1000); continue; }
		if (!items) {
			const code = result.json?.code ?? `HTTP_${result.status}`;
			if (CAMPAIGN_STOPPING.has(code) || result.status === 401 || result.status === 402 || result.status === 403) { stopped = `${code}: ${result.json?.error ?? "ditolak penyedia email"}`; break; }
			for (const row of batch) await markAttempt(row.id, row.attempts, `${code}`);
			if (Date.now() > deadline) break;
			continue;
		}
		for (let i = 0; i < batch.length; i++) {
			const row = batch[i], item = items[i] ?? {};
			if (item.id) {
				await pos().from("email_campaign_recipients").update({ status: "sent", provider_id: item.id, sent_at: new Date().toISOString(), attempts: row.attempts + 1, error: null }).eq("id", row.id);
				sentNow++;
			} else if (item.code === "RECIPIENT_SUPPRESSED") {
				await pos().from("email_campaign_recipients").update({ status: "skipped", error: item.error ?? item.code }).eq("id", row.id);
				await pos().from("email_suppressions").upsert({ email: row.email, reason: "bounce", source: "provider" }, { onConflict: "email", ignoreDuplicates: true });
			} else if (item.code && CAMPAIGN_STOPPING.has(item.code)) {
				stopped = `${item.code}: ${item.error ?? ""}`;
			} else {
				await markAttempt(row.id, row.attempts, item.error ?? item.code ?? "unknown");
			}
		}
		if (stopped || Date.now() > deadline) break;
		await sleep(1200);
	}
	if (stopped) await pos().from("email_campaigns").update({ status: "paused", last_error: stopped }).eq("id", id).eq("status", "sending");
	const detail = await getCampaign({ id });
	return { ...detail, sentNow, stopped };
}

async function markAttempt(rowId: number, attempts: number, error: string) {
	const next = attempts + 1;
	await pos().from("email_campaign_recipients").update({ attempts: next, error: error.slice(0, 300), status: next >= 3 ? "failed" : "queued" }).eq("id", rowId);
}

async function setStatus(payload: Json, to: "paused" | "canceled") {
	const id = text(payload.id);
	const allowed = to === "paused" ? ["sending"] : ["draft", "scheduled", "sending", "paused"];
	const { data, error } = await pos().from("email_campaigns").update({ status: to, ...(to === "canceled" ? { finished_at: new Date().toISOString() } : {}) }).eq("id", id).in("status", allowed).select("id").maybeSingle();
	if (error) throw error;
	if (!data) throw new UserError("Status kampanye tidak bisa diubah");
	if (to === "canceled") await pos().from("email_campaign_recipients").update({ status: "skipped", error: "kampanye dibatalkan" }).eq("campaign_id", id).eq("status", "queued");
	return await getCampaign({ id });
}

async function listSuppressions() {
	const { data, error } = await pos().from("email_suppressions").select("*").order("created_at", { ascending: false }).limit(500);
	if (error) throw error;
	return { suppressions: data ?? [] };
}
async function addSuppression(payload: Json) {
	const email = text(payload.email).toLowerCase();
	if (!validEmail(email)) throw new UserError("Alamat email tidak valid");
	const { error } = await pos().from("email_suppressions").upsert({ email, reason: "manual", source: "admin" }, { onConflict: "email" });
	if (error) throw error;
	return await listSuppressions();
}
async function removeSuppression(payload: Json) {
	const { error } = await pos().from("email_suppressions").delete().eq("email", text(payload.email).toLowerCase());
	if (error) throw error;
	return await listSuppressions();
}

/** Cron entrypoint: start due scheduled campaigns, then keep sending ones moving. */
async function processDue() {
	const now = new Date().toISOString();
	const { data: due } = await pos().from("email_campaigns").select("id").eq("brand", "djiwatentram").eq("status", "scheduled").lte("scheduled_at", now).limit(3);
	const started: string[] = [];
	for (const campaign of due ?? []) {
		try { await startCampaign({ id: campaign.id }); started.push(campaign.id); }
		catch (error) { await pos().from("email_campaigns").update({ status: "paused", last_error: error instanceof Error ? error.message : String(error) }).eq("id", campaign.id); }
	}
	const { data: sending } = await pos().from("email_campaigns").select("id").eq("brand", "djiwatentram").eq("status", "sending").limit(3);
	for (const campaign of sending ?? []) if (!started.includes(campaign.id)) await processCampaign({ id: campaign.id }).catch((error) => console.warn("[email-marketing] process failed", campaign.id, error));
	return { started: started.length, sending: (sending ?? []).length };
}

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return response({ ok: true });
	if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
	let payload: Json;
	try { payload = await req.json(); } catch { return fail("INVALID_JSON", "Body harus JSON"); }
	const action = text(payload.action);
	try {
		if (action === "process-due") {
			// CRON_SECRET in the functions container is empty (compose var unset); the secret lives in pos.email_settings like the other email secrets.
			const cronSecret = Deno.env.get("CRON_SECRET") || await emailSetting(admin, "CRON_SECRET") || "";
			if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) return fail("UNAUTHORIZED", "Unauthorized", 401);
			return response({ success: true, ...(await processDue()) });
		}
		const staffId = await verifyStaff(payload);
		const handlers: Record<string, () => Promise<Json>> = {
			overview, "preview-audience": () => previewAudience(payload), "save-template": () => saveTemplate(payload, staffId), "delete-template": () => deleteTemplate(payload),
			"create-campaign": () => createCampaign(payload, staffId), "list-campaigns": listCampaigns, "get-campaign": () => getCampaign(payload), "delete-campaign": () => deleteCampaign(payload),
			"send-test": () => sendTest(payload), "start-campaign": () => startCampaign(payload), "process-campaign": () => processCampaign(payload),
			"pause-campaign": () => setStatus(payload, "paused"), "cancel-campaign": () => setStatus(payload, "canceled"),
			"list-suppressions": listSuppressions, "add-suppression": () => addSuppression(payload), "remove-suppression": () => removeSuppression(payload),
		};
		const handler = handlers[action];
		if (!handler) return fail("UNKNOWN_ACTION", `Action tidak dikenal: ${action}`);
		return response({ success: true, ...(await handler()) });
	} catch (error) {
		if (error instanceof UserError) return fail(error.code, error.message, error.code === "UNAUTHORIZED" ? 401 : error.code === "FORBIDDEN" ? 403 : 400);
		console.error("[email-marketing]", error);
		return fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Terjadi kesalahan", 500);
	}
});
