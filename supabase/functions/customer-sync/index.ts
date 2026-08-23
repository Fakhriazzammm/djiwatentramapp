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
 * Verify that the caller "owns" a customer row.
 * Better Auth (not Supabase Auth) owns the session, so we use the
 * email as a practical ownership proof: to impersonate someone you would
 * need both their source_id AND their registered email.
 */
async function findOwnedCustomer(sourceId: string, email: string) {
	const { data, error } = await supabaseAdmin
		.schema("pos")
		.from("customers")
		.select("source_id, email, name, phone, total_points, lifetime_points")
		.eq("source_id", sourceId)
		.maybeSingle();

	if (error) throw error;
	if (!data) return { customer: null, error: null };
	if (!email) return { customer: null, error: "EMAIL_REQUIRED" };

	const rowEmail = toTrimmedString((data as Record<string, unknown>).email);
	if (rowEmail && rowEmail.toLowerCase() !== email.toLowerCase()) {
		return { customer: null, error: "OWNERSHIP_MISMATCH" };
	}
	// Row without email cannot be ownership-verified → reject for writes.
	if (!rowEmail) return { customer: null, error: "OWNERSHIP_MISMATCH" };
	return { customer: data, error: null };
}

// ── Actions ────────────────────────────────────────────────────

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
		.schema("pos")
		.from("customers")
		.select("source_id, total_points, lifetime_points")
		.eq("source_id", userId)
		.maybeSingle();

	const isNew = !existingCustomer;

	if (isNew) {
		const { error: insertError } = await supabaseAdmin
			.schema("pos")
			.from("customers")
			.insert({
				source_id: userId,
				email: email || null,
				name: name || null,
				is_active: true,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			});

		if (insertError) throw insertError;

		return {
			message: "Customer berhasil dibuat",
			isNew: true,
			customerId: userId,
		};
	}

	// --- Update existing customer (name/email) ---
	const updates: Record<string, unknown> = {
		updated_at: new Date().toISOString(),
	};
	if (email) updates.email = email;
	if (name) updates.name = name;

	const { error: updateError } = await supabaseAdmin
		.schema("pos")
		.from("customers")
		.update(updates)
		.eq("source_id", userId);

	if (updateError) throw updateError;

	return {
		message: "Customer sudah ada, data diperbarui",
		isNew: false,
		customerId: userId,
	};
}

/** Update the customer's own profile (name / phone). Ownership verified via email. */
async function handleUpdateProfile(payload: JsonRecord) {
	const sourceId = toTrimmedString(payload.sourceId);
	const email = toTrimmedString(payload.email);
	const name = toTrimmedString(payload.name);
	const phone = toTrimmedString(payload.phone);

	if (!sourceId || !email) throw new Error("sourceId dan email wajib diisi");
	if (!name && !phone) throw new Error("Tidak ada field yang diubah");

	const { customer, error: ownershipError } = await findOwnedCustomer(sourceId, email);
	if (ownershipError || !customer) {
		throw new Error("Tidak dapat memverifikasi kepemilikan akun");
	}

	const updates: Record<string, unknown> = {
		updated_at: new Date().toISOString(),
	};
	if (name) updates.name = name;
	if (phone) updates.phone = phone;

	const { data, error } = await supabaseAdmin
		.schema("pos")
		.from("customers")
		.update(updates)
		.eq("source_id", sourceId)
		.select("source_id, name, email, phone, total_points, lifetime_points")
		.maybeSingle();

	if (error) throw error;

	return {
		message: "Profil berhasil diperbarui",
		customer: data,
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
			case "updateProfile":
				return json(await handleUpdateProfile(body));
			case "redeem":
				return fail("POINTS_RETIRED", "Yumi Poin sudah dihentikan. Gunakan Djiwa Pay untuk saldo dan pembayaran.", 410);
			default:
				return fail("UNKNOWN_ACTION", "Action tidak dikenali. Gunakan: sync, updateProfile, redeem", 404);
		}
	} catch (error) {
		console.error("customer-sync failed", error);
		return fail("INTERNAL_ERROR", error instanceof Error ? error.message : typeof error === "object" && error !== null ? JSON.stringify(error) : String(error), 400);
	}
});
