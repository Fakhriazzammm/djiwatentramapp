import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyHelipodSignature } from "../_shared/email-marketing.ts";
import { emailSetting } from "../_shared/email-settings.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase function secrets");
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const pos = () => admin.schema("pos");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const FIELD: Record<string, { status?: string; column: string }> = {
	"email.delivered": { status: "delivered", column: "delivered_at" },
	"email.opened": { column: "opened_at" },
	"email.clicked": { column: "clicked_at" },
	"email.bounced": { status: "bounced", column: "delivered_at" },
	"email.complained": { status: "complained", column: "delivered_at" },
	"email.rejected": { status: "failed", column: "delivered_at" },
};

Deno.serve(async (req) => {
	if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
	const secret = await emailSetting(admin, "EMAIL_WEBHOOK_SECRET");
	if (!secret) return json({ error: "WEBHOOK_NOT_CONFIGURED" }, 503);
	const raw = await req.text();
	if (!(await verifyHelipodSignature(raw, req.headers.get("helipod-signature") ?? "", secret))) return json({ error: "UNAUTHORIZED" }, 401);
	let event: { type?: string; createdAt?: string; data?: { recipients?: string[]; notification?: { bounce?: { bounceType?: string }; complaint?: unknown } } };
	try { event = JSON.parse(raw); } catch { return json({ error: "INVALID_JSON" }, 400); }
	const map = FIELD[event.type ?? ""];
	if (!map) return json({ ok: true, ignored: event.type ?? null });
	const at = event.createdAt && !Number.isNaN(Date.parse(event.createdAt)) ? event.createdAt : new Date().toISOString();
	const permanentBounce = event.type === "email.bounced" && event.data?.notification?.bounce?.bounceType === "Permanent";
	let updated = 0;
	for (const recipient of event.data?.recipients ?? []) {
		const email = String(recipient).trim().toLowerCase();
		if (!email) continue;
		// Helipod's messageId differs from the id returned by /send, so match the newest delivered-to-provider row for that address.
		const [{ data: campaignRow }, { data: autoRow }] = await Promise.all([
			pos().from("email_campaign_recipients").select("id,status,sent_at").eq("email", email).in("status", ["sent", "delivered"]).order("sent_at", { ascending: false }).limit(1).maybeSingle(),
			pos().from("email_automation_sends").select("id,status,sent_at").eq("email", email).in("status", ["sent", "delivered"]).order("sent_at", { ascending: false }).limit(1).maybeSingle(),
		]);
		// An address can have both a campaign and an automation mail: credit the most recently sent one.
		const useAuto = Boolean(autoRow) && (!campaignRow || Date.parse(String(autoRow!.sent_at ?? 0)) >= Date.parse(String(campaignRow.sent_at ?? 0)));
		const row = useAuto ? autoRow : campaignRow;
		if (row) {
			const patch: Record<string, unknown> = { [map.column]: at };
			// never downgrade a final negative status back to delivered/opened
			if (map.status) patch.status = map.status;
			const { error } = await pos().from(useAuto ? "email_automation_sends" : "email_campaign_recipients").update(patch).eq("id", row.id);
			if (error) { console.error("[email-webhook] update failed", error); return json({ error: "UPDATE_FAILED" }, 500); }
			updated++;
		}
		if (event.type === "email.complained" || permanentBounce) {
			await pos().from("email_suppressions").upsert({ email, reason: event.type === "email.complained" ? "complaint" : "bounce", source: "webhook" }, { onConflict: "email", ignoreDuplicates: true });
		}
	}
	return json({ ok: true, updated });
});
