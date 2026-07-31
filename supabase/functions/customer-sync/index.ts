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

async function loadLoyaltyRewards(): Promise<Array<Record<string, unknown>>> {
	const { data, error } = await supabaseAdmin
		.schema("pos")
		.from("site_settings")
		.select("raw")
		.not("raw->shiftSettings", "is", null)
		.order("_id", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error) throw error;
	const raw = (data?.raw ?? {}) as Record<string, unknown>;
	const rewards = raw.loyaltyRewards;
	return Array.isArray(rewards) ? (rewards as Array<Record<string, unknown>>) : [];
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

/** Atomically redeem points for a loyalty reward. */
async function handleRedeem(payload: JsonRecord) {
	const sourceId = toTrimmedString(payload.sourceId);
	const email = toTrimmedString(payload.email);
	const rewardId = toTrimmedString(payload.rewardId);

	if (!sourceId || !email || !rewardId) {
		throw new Error("sourceId, email, dan rewardId wajib diisi");
	}

	const { customer, error: ownershipError } = await findOwnedCustomer(sourceId, email);
	if (ownershipError || !customer) {
		throw new Error("Tidak dapat memverifikasi kepemilikan akun");
	}

	const rewards = await loadLoyaltyRewards();
	const reward = rewards.find(
		(r) => String(r.id ?? "") === rewardId && r.enabled !== false,
	);
	if (!reward) throw new Error("Reward tidak ditemukan atau tidak aktif");

	const cost = Math.max(1, Number(reward.cost ?? 0));

	const voucherCode = `DJW-${String(rewardId).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4) || "RWRD"}-${Math.random().toString(36).toUpperCase().slice(2, 8)}`;
	const redemptionId = `rdm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
	const nowIso = new Date().toISOString();

	// Atomic redeem via pos.redeem_points RPC — locks the row, verifies
	// ownership (email), checks balance, deducts, and writes the ledger
	// inside a single transaction.
	const { data: rpcResult, error: rpcError } = await supabaseAdmin
		.schema("pos")
		.rpc("redeem_points", {
			p_source_id: sourceId,
			p_email: email,
			p_reward_id: rewardId,
			p_reward_name: String(reward.name ?? "Reward"),
			p_cost: cost,
			p_voucher_code: voucherCode,
			p_reference_id: redemptionId,
		});

	if (rpcError) throw rpcError;

	const result = (rpcResult ?? {}) as { ok?: boolean; error?: string; remaining?: number };
	if (!result.ok) {
		if (result.error === "INSUFFICIENT_POINTS") {
			throw new Error("Poin tidak mencukupi untuk reward ini");
		}
		throw new Error("Tidak dapat memverifikasi kepemilikan akun");
	}

	const remaining = Number(result.remaining ?? 0);

	// Redemption request record (mirror pattern — admin confirms fulfillment)
	const { error: mirrorError } = await supabaseAdmin
		.schema("legacy_mirror")
		.from("documents")
		.insert({
			table_name: "pointRedemptions",
			document_id: redemptionId,
			creation_time: Date.now(),
			document: {
				_id: redemptionId,
				sourceId,
				email,
				rewardId,
				rewardName: reward.name ?? "Reward",
				cost,
				voucherCode,
				status: "pending",
				createdAt: nowIso,
			},
		});
	if (mirrorError) throw mirrorError;

	return {
		message: "Poin berhasil ditukar",
		voucherCode,
		remainingPoints: remaining,
		redemptionId,
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
				return json(await handleRedeem(body));
			default:
				return fail("UNKNOWN_ACTION", "Action tidak dikenali. Gunakan: sync, updateProfile, redeem", 404);
		}
	} catch (error) {
		console.error("customer-sync failed", error);
		return fail("INTERNAL_ERROR", error instanceof Error ? error.message : typeof error === "object" && error !== null ? JSON.stringify(error) : String(error), 400);
	}
});
