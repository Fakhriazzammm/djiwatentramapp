import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { AUTOMATIONS, automationDef, jakartaDate, selectCandidates, type AutomationDef, type BookingRow, type Candidate, type LeadRow, type OrderItemRow, type OrderRow, type SelectCtx } from "../_shared/email-automation.ts";
import { FREQUENCY_CAP_HOURS, FROM_DEFAULT, APP_URL, htmlToText, renderTemplate, unsubscribeUrl, validEmail, type CustomerRow } from "../_shared/email-marketing.ts";
import { emailSetting } from "../_shared/email-settings.ts";

type Json = Record<string, unknown>;
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase function secrets");
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const pos = () => admin.schema("pos");

const HELIPOD_BASE = "https://mail.helipod.io/api/email";
const BATCH = 25;
const TIME_BUDGET_MS = 40_000; // edge workers are killed after 60s
/** Marketing automations leave this much monthly quota untouched for manual campaigns. */
const CAMPAIGN_RESERVE = 300;
const CUSTOMER_COLUMNS = "source_id,email,name,nickname,marketing_consent,total_orders,total_spent,wallet_balance,last_active_at,last_order_at,membership_expires_at,created_at";
const STOPPING = new Set(["DAILY_QUOTA_EXCEEDED", "MONTHLY_QUOTA_EXCEEDED", "PAYG_DISABLED", "INSUFFICIENT_BALANCE", "REPUTATION_SUSPENDED", "PLATFORM_REPUTATION", "TENANT_PAUSED", "SENDING_DISABLED", "DOMAIN_NOT_VERIFIED", "DOMAIN_NOT_FOUND", "INVALID_API_KEY", "API_KEY_EXPIRED", "NO_PLAN", "RATE_LIMITED"]);

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

// ---------- auth (same rules as email-marketing) ----------
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
		const data = json?.data as { usage?: { month?: number; monthlyLimit?: number; today?: number; dailyLimit?: number }; subscription?: { paygEnabled?: boolean } } | undefined;
		if (!data) return null;
		const limit = Number(data.usage?.monthlyLimit ?? 0);
		return { remaining: limit ? Math.max(0, limit - Number(data.usage?.month ?? 0)) : null, payg: Boolean(data.subscription?.paygEnabled) };
	} catch { return null; }
}

// ---------- data ----------
async function paged<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
	const rows: T[] = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await build(from, from + 999);
		if (error) throw error;
		rows.push(...(data ?? []));
		if ((data ?? []).length < 1000) return rows;
	}
}
const loadCustomers = () => paged<CustomerRow>((a, b) => admin.from("pos_customers_view").select(CUSTOMER_COLUMNS).order("source_id", { ascending: true }).range(a, b));
const loadLeads = () => paged<LeadRow>((a, b) => pos().from("customer_leads").select("source_id,email,name,marketing_consent,created_at").order("source_id", { ascending: true }).range(a, b));

async function loadBookings(now: number) {
	const from = jakartaDate(now, -2);
	const { data, error } = await pos().from("booking_orders").select("source_id,customer_name,customer_email,booking_code,booking_date,arrival_time,guest_count,booking_status").gte("booking_date", from).in("booking_status", ["confirmed", "completed"]).limit(1000);
	if (error) throw error;
	return (data ?? []) as BookingRow[];
}

async function loadOrders(now: number) {
	const since = new Date(now - 26 * 3_600_000).toISOString();
	const { data, error } = await pos().from("orders").select("source_id,order_number,total_amount,status,payment_method,customer_name,customer_email,customer_source_id,created_at,discount_amount,tax_amount,service_charge_amount,shipping_fee_amount")
		.gte("created_at", since).in("status", ["paid", "completed"]).order("created_at", { ascending: false }).limit(500);
	if (error) throw error;
	const orders = (data ?? []) as OrderRow[];
	const ids = orders.map((o) => o.source_id).filter((id): id is string => Boolean(id));
	const items: OrderItemRow[] = [];
	for (let i = 0; i < ids.length; i += 100) {
		const { data: part, error: itemError } = await pos().from("order_items").select("order_source_id,product_name,variant,quantity,price").in("order_source_id", ids.slice(i, i + 100));
		if (itemError) throw itemError;
		items.push(...((part ?? []) as OrderItemRow[]));
	}
	return { orders, items };
}

async function loadSuppressed() {
	const rows = await paged<{ email: string; reason: string }>((a, b) => pos().from("email_suppressions").select("email,reason").range(a, b));
	const all = new Set<string>(), hard = new Set<string>();
	for (const row of rows) {
		const email = String(row.email).toLowerCase();
		all.add(email);
		if (row.reason !== "unsubscribed") hard.add(email);
	}
	return { all, hard };
}

async function loadRecentEmails(marketingKeys: string[]) {
	const since = new Date(Date.now() - FREQUENCY_CAP_HOURS * 3_600_000).toISOString();
	const set = new Set<string>();
	const [{ data: campaign, error: e1 }, { data: auto, error: e2 }] = await Promise.all([
		pos().from("email_campaign_recipients").select("email").gte("sent_at", since).in("status", ["sent", "delivered", "bounced", "complained"]).limit(5000),
		pos().from("email_automation_sends").select("email").in("automation_key", marketingKeys).gte("sent_at", since).limit(5000),
	]);
	if (e1) throw e1;
	if (e2) throw e2;
	for (const row of [...(campaign ?? []), ...(auto ?? [])]) set.add(String(row.email).toLowerCase());
	return set;
}

async function loadSentRefs(key: string) {
	return new Set((await paged<{ ref_key: string }>((a, b) => pos().from("email_automation_sends").select("ref_key").eq("automation_key", key).range(a, b))).map((r) => r.ref_key));
}

type AutomationRow = { key: string; name: string; description: string; kind: "marketing" | "transactional"; enabled: boolean; delay_hours: number; daily_limit: number; subject: string | null; html: string | null; enabled_at: string | null; last_run_at: string | null; last_error: string | null };
async function loadRows() {
	const { data, error } = await pos().from("email_automations").select("*");
	if (error) throw error;
	return (data ?? []) as AutomationRow[];
}
const effective = (def: AutomationDef, row: AutomationRow) => ({ subject: row.subject || def.subject, html: row.html || def.html });

type World = { customers: CustomerRow[]; leads: LeadRow[]; bookings: BookingRow[]; orders: OrderRow[]; orderItems: OrderItemRow[]; suppressed: { all: Set<string>; hard: Set<string> }; recent: Set<string> };
async function loadWorld(now: number): Promise<World> {
	const marketingKeys = AUTOMATIONS.filter((a) => a.kind === "marketing").map((a) => a.key);
	const [customers, leads, bookings, suppressed, recent, orderData] = await Promise.all([loadCustomers(), loadLeads(), loadBookings(now), loadSuppressed(), loadRecentEmails(marketingKeys), loadOrders(now)]);
	return { customers, leads, bookings, orders: orderData.orders, orderItems: orderData.items, suppressed, recent };
}
async function candidatesFor(def: AutomationDef, row: AutomationRow, world: World, now: number) {
	const ctx: SelectCtx = { now, suppressedAll: world.suppressed.all, suppressedHard: world.suppressed.hard, recentEmails: world.recent, sent: await loadSentRefs(def.key), customers: world.customers, leads: world.leads, bookings: world.bookings, orders: world.orders, orderItems: world.orderItems, delayHours: row.delay_hours };
	return selectCandidates(def.key, ctx);
}

// ---------- sending ----------
async function sendToday(key: string, now: number) {
	const since = new Date(`${jakartaDate(now)}T00:00:00+07:00`).toISOString();
	const { count, error } = await pos().from("email_automation_sends").select("id", { count: "exact", head: true }).eq("automation_key", key).gte("created_at", since);
	if (error) throw error;
	return count ?? 0;
}

async function runAutomation(def: AutomationDef, row: AutomationRow, world: World, opts: { deadline: number; maxSend?: number }) {
	const now = Date.now();
	const result = { key: def.key, sent: 0, failed: 0, eligible: 0, note: "" };
	const remainingToday = row.daily_limit - await sendToday(def.key, now);
	if (remainingToday <= 0) return { ...result, note: "batas harian tercapai" };
	const candidates = await candidatesFor(def, row, world, now);
	result.eligible = candidates.length;
	if (!candidates.length) return result;

	let allowed = Math.min(remainingToday, opts.maxSend ?? 200, candidates.length);
	if (def.kind === "marketing") {
		const q = await quota();
		if (q && q.remaining !== null && !q.payg) allowed = Math.min(allowed, Math.max(0, q.remaining - CAMPAIGN_RESERVE));
		if (allowed <= 0) return { ...result, note: "kuota dicadangkan untuk kampanye manual" };
	}
	const secret = await env("EMAIL_UNSUB_SECRET");
	const from = await fromAddress();
	const content = effective(def, row);
	let stopped = "";

	for (let offset = 0; offset < allowed && !stopped && Date.now() < opts.deadline; offset += BATCH) {
		const chunk = candidates.slice(offset, Math.min(offset + BATCH, allowed));
		// Claim the rows first: UNIQUE(automation_key, ref_key) guarantees two overlapping runs never send the same email.
		const { data: claimed, error } = await pos().from("email_automation_sends").upsert(
			chunk.map((c) => ({ automation_key: def.key, ref_key: c.refKey, customer_id: c.customerId, email: c.email, name: c.name })),
			{ onConflict: "automation_key,ref_key", ignoreDuplicates: true },
		).select("id,ref_key");
		if (error) throw error;
		const idByRef = new Map((claimed ?? []).map((r) => [r.ref_key as string, r.id as number]));
		const mine = chunk.filter((c) => idByRef.has(c.refKey));
		if (!mine.length) continue;

		const messages = await Promise.all(mine.map(async (c: Candidate) => {
			const vars: Record<string, string> = {};
			for (const [k, v] of Object.entries(c.vars)) vars[k] = String(v).replaceAll("{{", "{ {");
			const headers: Record<string, string> = {};
			if (def.kind === "marketing") {
				vars.unsubscribe_url = await unsubscribeUrl(c.email, secret);
				headers["List-Unsubscribe"] = `<${vars.unsubscribe_url}>`;
				headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
			}
			const html = renderTemplate(content.html, vars);
			return { from, to: [c.email], subject: renderTemplate(content.subject, vars), html, text: htmlToText(html), headers, metadata: { automation: def.key }, idempotencyKey: `auto-${def.key}-${c.refKey}`.slice(0, 128) };
		}));

		const res = await helipod("/send/batch", { method: "POST", body: { messages } });
		type Item = { id?: string; error?: string; code?: string };
		const data = res.json?.data;
		const items: Item[] | null = Array.isArray(data) ? data as Item[] : Array.isArray((data as { results?: Item[] } | undefined)?.results) ? (data as { results: Item[] }).results : null;
		const ids = mine.map((c) => idByRef.get(c.refKey)!);
		if (!items) {
			const code = res.json?.code ?? `HTTP_${res.status}`;
			// Nothing was sent: release the claim so the next run retries.
			await pos().from("email_automation_sends").delete().in("id", ids);
			if (STOPPING.has(code) || [401, 402, 403, 429].includes(res.status)) { stopped = `${code}: ${res.json?.error ?? "ditolak penyedia email"}`; if (res.status === 429) await sleep(Math.min(10, Math.max(1, res.retryAfter || 2)) * 1000); }
			else { result.failed += mine.length; stopped = `${code}`; }
			break;
		}
		for (let i = 0; i < mine.length; i++) {
			const item = items[i] ?? {};
			const id = ids[i];
			if (item.id) {
				await pos().from("email_automation_sends").update({ status: "sent", provider_id: item.id, sent_at: new Date().toISOString() }).eq("id", id);
				result.sent++;
			} else if (item.code === "RECIPIENT_SUPPRESSED") {
				await pos().from("email_automation_sends").update({ status: "skipped", error: item.error ?? item.code }).eq("id", id);
				await pos().from("email_suppressions").upsert({ email: mine[i].email, reason: "bounce", source: "provider" }, { onConflict: "email", ignoreDuplicates: true });
			} else if (item.code && STOPPING.has(item.code)) {
				await pos().from("email_automation_sends").delete().eq("id", id);
				stopped = `${item.code}: ${item.error ?? ""}`;
			} else {
				await pos().from("email_automation_sends").update({ status: "failed", error: String(item.error ?? item.code ?? "unknown").slice(0, 300) }).eq("id", id);
				result.failed++;
			}
		}
		for (const c of mine) world.recent.add(c.email); // frequency cap also across automations in this run
		await sleep(800);
	}
	await pos().from("email_automations").update({ last_run_at: new Date().toISOString(), last_error: stopped || null }).eq("key", def.key);
	return { ...result, note: stopped };
}

async function processDue() {
	const now = Date.now();
	const rows = (await loadRows()).filter((r) => r.enabled);
	if (!rows.length) return { ran: [] as unknown[] };
	const world = await loadWorld(now);
	const deadline = Date.now() + TIME_BUDGET_MS;
	const ran = [];
	// Transactional first: a booking confirmation must never wait behind a marketing backlog.
	for (const row of rows.sort((a, b) => Number(b.kind === "transactional") - Number(a.kind === "transactional"))) {
		const def = automationDef(row.key);
		if (!def || Date.now() > deadline) continue;
		try { ran.push(await runAutomation(def, row, world, { deadline })); }
		catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("[email-automation]", row.key, error);
			await pos().from("email_automations").update({ last_run_at: new Date().toISOString(), last_error: message.slice(0, 300) }).eq("key", row.key);
		}
	}
	return { ran };
}

// ---------- staff actions ----------
async function list() {
	const now = Date.now();
	const rows = await loadRows();
	const world = await loadWorld(now);
	const since30 = new Date(now - 30 * 86_400_000).toISOString();
	const { data: sends, error } = await pos().from("email_automation_sends").select("automation_key,customer_id,status,sent_at,delivered_at,opened_at,clicked_at").gte("created_at", since30).limit(10000);
	if (error) throw error;
	const customerById = new Map(world.customers.map((c) => [c.source_id, c]));
	const items = [];
	for (const def of AUTOMATIONS) {
		const row = rows.find((r) => r.key === def.key);
		if (!row) continue;
		const mine = (sends ?? []).filter((s) => s.automation_key === def.key);
		const sent = mine.filter((s) => ["sent", "delivered", "bounced", "complained"].includes(s.status));
		let returned = 0;
		for (const s of sent) {
			const last = customerById.get(s.customer_id)?.last_order_at;
			const at = s.sent_at ? Date.parse(s.sent_at) : 0;
			if (last && at && Date.parse(last) > at && Date.parse(last) - at <= 7 * 86_400_000) returned++;
		}
		const eligible = (await candidatesFor(def, row, world, now)).length;
		const content = effective(def, row);
		items.push({
			key: def.key, name: row.name, description: row.description, kind: row.kind, trigger: def.trigger, enabled: row.enabled, delayHours: row.delay_hours, dailyLimit: row.daily_limit,
			subject: content.subject, html: content.html, customized: Boolean(row.subject || row.html), defaultSubject: def.subject, defaultHtml: def.html,
			sampleVars: { link: APP_URL, unsubscribe_url: "#", ...def.sampleVars }, variables: def.variables,
			lastRunAt: row.last_run_at, lastError: row.last_error, eligibleNow: eligible,
			stats: { sent: sent.length, delivered: mine.filter((s) => s.delivered_at).length, opened: mine.filter((s) => s.opened_at).length, clicked: mine.filter((s) => s.clicked_at).length, failed: mine.filter((s) => s.status === "failed" || s.status === "bounced" || s.status === "complained").length, returned, tracksReturn: def.kind === "marketing" && def.key !== "lead_intro" },
		});
	}
	return { automations: items };
}

function parseKey(payload: Json) {
	const def = automationDef(text(payload.key));
	if (!def) throw new UserError("Otomasi tidak dikenal");
	return def;
}

async function update(payload: Json) {
	const def = parseKey(payload);
	const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (typeof payload.enabled === "boolean") {
		patch.enabled = payload.enabled;
		if (payload.enabled) { patch.enabled_at = new Date().toISOString(); patch.last_error = null; }
	}
	if (payload.delayHours !== undefined) {
		const n = Math.round(Number(payload.delayHours));
		if (!Number.isFinite(n) || n < 0 || n > 720) throw new UserError("Jeda harus 0–720 jam");
		patch.delay_hours = n;
	}
	if (payload.dailyLimit !== undefined) {
		const n = Math.round(Number(payload.dailyLimit));
		if (!Number.isFinite(n) || n < 1 || n > 1000) throw new UserError("Batas harian harus 1–1000");
		patch.daily_limit = n;
	}
	if (payload.reset === true) { patch.subject = null; patch.html = null; }
	else if (payload.subject !== undefined || payload.html !== undefined) {
		const subject = text(payload.subject), html = typeof payload.html === "string" ? payload.html : "";
		if (!subject) throw new UserError("Subjek wajib diisi");
		if (html.trim().length < 20 || html.length > 400_000) throw new UserError("Isi email tidak valid");
		if (def.kind === "marketing" && !html.includes("{{{unsubscribe_url}}}")) throw new UserError("Email marketing wajib memuat link berhenti berlangganan: {{{unsubscribe_url}}}");
		patch.subject = subject.slice(0, 300);
		patch.html = html;
	}
	const { error } = await pos().from("email_automations").update(patch).eq("key", def.key);
	if (error) throw error;
	return await list();
}

async function runNow(payload: Json) {
	const def = parseKey(payload);
	const row = (await loadRows()).find((r) => r.key === def.key);
	if (!row) throw new UserError("Otomasi belum terdaftar", "NOT_FOUND");
	if (!row.enabled) throw new UserError("Aktifkan otomasi dulu sebelum menjalankannya");
	const world = await loadWorld(Date.now());
	const result = await runAutomation(def, row, world, { deadline: Date.now() + TIME_BUDGET_MS });
	return { result, ...(await list()) };
}

async function recent(payload: Json) {
	const def = parseKey(payload);
	const { data, error } = await pos().from("email_automation_sends").select("id,email,name,status,error,sent_at,delivered_at,opened_at,clicked_at,created_at").eq("automation_key", def.key).order("id", { ascending: false }).limit(50);
	if (error) throw error;
	return { sends: data ?? [] };
}

async function sendTest(payload: Json) {
	const def = parseKey(payload);
	const to = text(payload.to).toLowerCase();
	if (!validEmail(to)) throw new UserError("Alamat email uji tidak valid");
	const row = (await loadRows()).find((r) => r.key === def.key);
	const content = row ? effective(def, row) : { subject: def.subject, html: def.html };
	const vars: Record<string, string> = { link: APP_URL, ...def.sampleVars, unsubscribe_url: await unsubscribeUrl(to, await env("EMAIL_UNSUB_SECRET")) };
	const html = renderTemplate(content.html, vars);
	const { status, json } = await helipod("/send", { method: "POST", body: { from: await fromAddress(), to: [to], subject: `[UJI] ${renderTemplate(content.subject, vars)}`, html, text: htmlToText(html) } });
	if (!json?.success) throw new UserError(`Email uji ditolak: ${json?.error ?? status}`, json?.code ?? "PROVIDER_ERROR");
	return { sent: true };
}

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return response({ ok: true });
	if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
	let payload: Json;
	try { payload = await req.json(); } catch { return fail("INVALID_JSON", "Body harus JSON"); }
	const action = text(payload.action);
	try {
		if (action === "process-due") {
			const cronSecret = Deno.env.get("CRON_SECRET") || "";
			if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) return fail("UNAUTHORIZED", "Unauthorized", 401);
			return response({ success: true, ...(await processDue()) });
		}
		await verifyStaff(payload);
		const handlers: Record<string, () => Promise<Json>> = { list, update: () => update(payload), "run-now": () => runNow(payload), recent: () => recent(payload), "send-test": () => sendTest(payload) };
		const handler = handlers[action];
		if (!handler) return fail("UNKNOWN_ACTION", `Action tidak dikenal: ${action}`);
		return response({ success: true, ...(await handler()) });
	} catch (error) {
		if (error instanceof UserError) return fail(error.code, error.message, error.code === "UNAUTHORIZED" ? 401 : error.code === "FORBIDDEN" ? 403 : 400);
		console.error("[email-automation]", error);
		return fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Terjadi kesalahan", 500);
	}
});
