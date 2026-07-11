import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
	auth: { autoRefreshToken: false, persistSession: false },
});

function respond(data: Record<string, unknown>, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { ...corsHeaders, "Content-Type": "application/json" },
	});
}

async function login(email: string, password: string) {
	// Call GoTrue admin API via service_role — bypasses Kong, direct to auth service on localhost
	const { data, error } = await admin.auth.signInWithPassword({ email, password });
	if (error) return respond({ error: error.message }, 400);
	return respond({
		accessToken: data.session?.access_token ?? null,
		refreshToken: data.session?.refresh_token ?? null,
		user: data.user ? { id: data.user.id, email: data.user.email } : null,
	});
}

async function register(email: string, password: string, name: string) {
	const { data, error } = await admin.auth.signUp({
		email, password,
		options: { data: { name }, emailRedirectTo: "https://djiwatentram.yumme.id" },
	});
	if (error) return respond({ error: error.message }, 400);
	return respond({
		accessToken: data.session?.access_token ?? null,
		refreshToken: data.session?.refresh_token ?? null,
		user: data.user ? { id: data.user.id, email: data.user.email } : null,
	});
}

async function resetPassword(email: string) {
	const { error } = await admin.auth.resetPasswordForEmail(email, {
		redirectTo: "https://djiwatentram.yumme.id",
	});
	if (error) return respond({ error: error.message }, 400);
	return respond({ success: true });
}

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
	try {
		const { action, email, password, name } = await req.json();
		if (action === "login") return await login(email, password);
		if (action === "register") return await register(email, password, name);
		if (action === "resetPassword") return await resetPassword(email);
		return respond({ error: "Unknown action" }, 400);
	} catch (e) {
		return respond({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
	}
});
