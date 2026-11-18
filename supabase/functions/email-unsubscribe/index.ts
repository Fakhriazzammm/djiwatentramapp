import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { APP_URL, validEmail, verifyUnsubscribeToken } from "../_shared/email-marketing.ts";
import { emailSetting } from "../_shared/email-settings.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase function secrets");
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const page = (title: string, body: string, status = 200) => new Response(
	`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;background:#f4f4f6;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111114;display:grid;place-items:center;min-height:100vh;padding:16px}main{max-width:440px;background:#fff;border:1px solid #e6e6ea;padding:28px}h1{font-size:20px;margin:0 0 12px}button,a.btn{display:inline-block;background:#1a5dc6;color:#fff;border:0;padding:12px 22px;border-radius:10px;font:600 15px inherit;text-decoration:none;cursor:pointer}p{margin:0 0 14px}small{color:#6a6a76}</style></head><body><main>${body}</main></body></html>`,
	{ status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
);

async function unsubscribe(email: string) {
	const { error } = await admin.schema("pos").from("email_suppressions").upsert({ email, reason: "unsubscribed", source: "link" }, { onConflict: "email" });
	if (error) throw error;
	// Also withdraw consent so other channels/segments respect the choice.
	await admin.schema("pos").from("customers").update({ marketing_consent: false }).ilike("email", email);
}

Deno.serve(async (req) => {
	const url = new URL(req.url);
	let email = "", token = "";
	if (req.method === "POST") {
		// One-click (RFC 8058) posts the query string; the confirm form posts a body.
		email = url.searchParams.get("e") ?? ""; token = url.searchParams.get("t") ?? "";
		if (!email) { const form = await req.formData().catch(() => null); email = String(form?.get("e") ?? ""); token = String(form?.get("t") ?? ""); }
	} else if (req.method === "GET") {
		email = url.searchParams.get("e") ?? ""; token = url.searchParams.get("t") ?? "";
	} else return page("Metode tidak didukung", "<h1>Metode tidak didukung</h1>", 405);
	email = email.trim().toLowerCase();
	const secret = await emailSetting(admin, "EMAIL_UNSUB_SECRET");
	if (!secret) return page("Layanan belum siap", "<h1>Layanan belum siap</h1><p>Coba lagi nanti.</p>", 503);
	if (!validEmail(email) || !token || !(await verifyUnsubscribeToken(email, token, secret))) return page("Link tidak valid", "<h1>Link tidak valid</h1><p>Link berhenti berlangganan ini tidak dikenali atau sudah rusak.</p>", 400);
	if (req.method === "GET") {
		return page("Berhenti berlangganan", `<h1>Berhenti berlangganan?</h1><p>Kamu tidak akan menerima email promo dari Djiwa Tentram lagi di <strong>${esc(email)}</strong>.</p><form method="post"><input type="hidden" name="e" value="${esc(email)}"><input type="hidden" name="t" value="${esc(token)}"><button type="submit">Ya, berhenti berlangganan</button></form><p style="margin-top:16px"><small><a href="${APP_URL}">Batal, kembali ke Djiwa Tentram</a></small></p>`);
	}
	try { await unsubscribe(email); } catch (error) { console.error("[email-unsubscribe]", error); return page("Gagal", "<h1>Terjadi kesalahan</h1><p>Silakan coba lagi sebentar.</p>", 500); }
	return page("Berhasil", `<h1>Kamu sudah berhenti berlangganan</h1><p>Email promo ke <strong>${esc(email)}</strong> sudah dihentikan. Email penting seperti struk dan pesanan tetap dikirim.</p><a class="btn" href="${APP_URL}">Ke Djiwa Tentram</a>`);
});
