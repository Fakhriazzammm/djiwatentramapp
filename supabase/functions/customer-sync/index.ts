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

function normalizeGuestPhone(value: string) {
	return value.replace(/[^\d+]/g, "");
}

async function guestSourceId(email: string, phone: string) {
	const identity = `${email.toLowerCase()}|${normalizeGuestPhone(phone)}`;
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
	const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
	return `guest_${hex}`;
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
		.select("source_id, email, name, phone, customer_description, nickname, birth_date, gender, address, city, province, postal_code, marketing_consent, profile_completed_at, total_points, lifetime_points")
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

/** Capture a guest identity without creating an authenticated member account. */
async function handleCaptureGuest(payload: JsonRecord) {
	const name = toTrimmedString(payload.name);
	const email = toTrimmedString(payload.email).toLowerCase();
	const phone = normalizeGuestPhone(toTrimmedString(payload.phone));
	const customerDescription = toTrimmedString(payload.customerDescription).slice(0, 160);
	const guestSessionId = toTrimmedString(payload.guestSessionId).slice(0, 120);
	const marketingConsent = payload.marketingConsent === true;

	if (!name) throw new Error("Nama guest wajib diisi");
	if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Email guest tidak valid");
	if (phone.replace(/\D/g, "").length < 10) throw new Error("Nomor WhatsApp guest tidak valid");
	if (!customerDescription) throw new Error("Ciri khusus customer wajib diisi");

	const sourceId = await guestSourceId(email, phone);
	const now = new Date().toISOString();
	const { error } = await supabaseAdmin
		.schema("pos")
		.from("customer_leads")
		.upsert({
			source_id: sourceId,
			name,
			email,
			phone,
			customer_description: customerDescription,
			marketing_consent: marketingConsent,
			guest_session_id: guestSessionId || null,
			source: "customer_guest_checkout",
			last_seen_at: now,
			updated_at: now,
		}, { onConflict: "source_id" });

	if (error) throw error;
	return { message: "Data guest tersimpan", customerSourceId: sourceId };
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
	const customerDescription = toTrimmedString(payload.customerDescription).slice(0, 160);
	const nickname = toTrimmedString(payload.nickname);
	const birthDate = toTrimmedString(payload.birthDate);
	const gender = toTrimmedString(payload.gender);
	const address = toTrimmedString(payload.address);
	const city = toTrimmedString(payload.city);
	const province = toTrimmedString(payload.province);
	const postalCode = toTrimmedString(payload.postalCode);
	const marketingConsent = typeof payload.marketingConsent === "boolean" ? payload.marketingConsent : undefined;

	if (!sourceId || !email) throw new Error("sourceId dan email wajib diisi");
	if (!name && !phone && !customerDescription && !nickname && !birthDate && !gender && !address && !city && !province && !postalCode && marketingConsent === undefined) throw new Error("Tidak ada field yang diubah");

	const { customer, error: ownershipError } = await findOwnedCustomer(sourceId, email);
	if (ownershipError || !customer) {
		throw new Error("Tidak dapat memverifikasi kepemilikan akun");
	}

	const updates: Record<string, unknown> = {
		updated_at: new Date().toISOString(),
	};
	if (name) updates.name = name;
	if (phone) updates.phone = phone;
	if (customerDescription) updates.customer_description = customerDescription;
	if (nickname) updates.nickname = nickname;
	if (birthDate) updates.birth_date = birthDate;
	if (gender) updates.gender = gender;
	if (address) updates.address = address;
	if (city) updates.city = city;
	if (province) updates.province = province;
	if (postalCode) updates.postal_code = postalCode;
	if (marketingConsent !== undefined) updates.marketing_consent = marketingConsent;
	if ((name || String((customer as Record<string, unknown>).name ?? "").trim()) && (phone || String((customer as Record<string, unknown>).phone ?? "").replace(/[^\d]/g, "").length >= 10)) {
		updates.profile_completed_at = new Date().toISOString();
	}

	const { data, error } = await supabaseAdmin
		.schema("pos")
		.from("customers")
		.update(updates)
		.eq("source_id", sourceId)
		.select("source_id, name, email, phone, customer_description, nickname, birth_date, gender, address, city, province, postal_code, marketing_consent, profile_completed_at, total_points, lifetime_points")
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
			case "captureGuest":
				return json(await handleCaptureGuest(body));
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
