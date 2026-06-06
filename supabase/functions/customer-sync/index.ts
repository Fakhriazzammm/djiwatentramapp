import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type JsonRecord = Record<string, unknown>;

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceRoleKey) {
	throw new Error("Missing Supabase function secrets");
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false,
	},
});

function json(body: JsonRecord, status = 200) {
	return new Response(JSON.stringify({ success: true, ...body }), {
		status,
		headers: {
			...corsHeaders,
			"Content-Type": "application/json",
		},
	});
}

function fail(code: string, message: string, status = 400) {
	return json({ success: false, error: { code, message } }, status);
}

function toTrimmedString(value: unknown) {
	return typeof value === "string" ? value.trim() : "";
}

/**
 * Sync a user (from auth.users) into pos.customers.
 * Idempotent: if source_id already exists, updates name/email instead.
 */
async function handleSync(payload: JsonRecord) {
	const userId = toTrimmedString(payload.userId);
	const name = toTrimmedString(payload.name);
	const email = toTrimmedString(payload.email);

	if (!userId) throw new Error("userId wajib diisi");

	// --- 1. Upsert ke pos.customers ---
	const customerPayload: Record<string, unknown> = {
		source_id: userId,
		email: email || null,
		name: name || null,
		updated_at: new Date().toISOString(),
	};

	// Set created_at only on insert
	customerPayload.created_at = new Date().toISOString();

	const { data: existingCustomer } = await supabaseAdmin
		.from("pos.customers")
		.select("source_id, total_points, lifetime_points")
		.eq("source_id", userId)
		.maybeSingle();

	const isNew = !existingCustomer;

	if (isNew) {
		// Insert new customer with signup bonus points
		const { error: insertError } = await supabaseAdmin
			.from("pos.customers")
			.insert({
				source_id: userId,
				email: email || null,
				name: name || null,
				total_points: 100,
				lifetime_points: 100,
				is_active: true,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			});

		if (insertError) throw insertError;

		// --- 2. Insert signup bonus ke point_ledger ---
		const { error: ledgerError } = await supabaseAdmin
			.from("pos.customer_point_ledger")
			.insert({
				customer_id: userId,
				points: 100,
				balance_after: 100,
				reason: "signup_bonus",
				note: "Bonus pendaftaran 100 poin",
			});

		if (ledgerError) throw ledgerError;

		return {
			message: "Customer berhasil dibuat dengan bonus 100 poin",
			isNew: true,
			customerId: userId,
			bonusPoints: 100,
		};
	}

	// --- Update existing customer (name/email) ---
	const updates: Record<string, unknown> = {
		updated_at: new Date().toISOString(),
	};
	if (email) updates.email = email;
	if (name) updates.name = name;

	const { error: updateError } = await supabaseAdmin
		.from("pos.customers")
		.update(updates)
		.eq("source_id", userId);

	if (updateError) throw updateError;

	return {
		message: "Customer sudah ada, data diperbarui",
		isNew: false,
		customerId: userId,
	};
}

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") {
		return new Response("ok", { headers: corsHeaders });
	}

	try {
		const body = (await req.json()) as JsonRecord;
		const action = body.action as string | undefined;

		switch (action) {
			case "sync":
				return json(await handleSync(body));
			default:
				return fail("UNKNOWN_ACTION", "Action tidak dikenali. Gunakan: sync", 404);
		}
	} catch (error) {
		console.error("customer-sync failed", error);
		return fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Unknown error", 400);
	}
});
