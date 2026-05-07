import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TransactionPayload {
  tx_type: "income" | "expense";
  amount: number;
  category?: string;
  description?: string;
  merchant?: string;
  tx_date?: number;
  payment_method?: string;
  status?: string;
  source_fingerprint?: string;
  metadata?: Record<string, unknown>;
  // Alternative camelCase keys
  type?: "income" | "expense";
  txDate?: number;
  paymentMethod?: string;
  sourceFingerprint?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(message: string, status = 400) {
  return jsonResponse({ ok: false, error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return fail("Method not allowed", 405);
  }

  try {
    const payload: TransactionPayload = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !supabaseKey) {
      return fail("Supabase not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      db: { schema: "pos" },
    });

    // ── Normalize input ─────────────────────────────────────
    const txType = payload.tx_type ?? payload.type ?? "";
    if (!txType || !["income", "expense"].includes(txType)) {
      return fail("tx_type/type harus 'income' atau 'expense'");
    }
    const amount = Number(payload.amount ?? 0);
    if (amount <= 0) {
      return fail("amount harus > 0");
    }
    const category = String(payload.category ?? "lainnya").trim() || "lainnya";
    const description = String(payload.description ?? "").trim();
    const merchant = String(payload.merchant ?? "").trim();
    const txDate = Number(payload.tx_date ?? payload.txDate ?? Date.now());
    const paymentMethod = String(
      payload.payment_method ?? payload.paymentMethod ?? "cash"
    );
    const status = String(payload.status ?? "completed");
    const metadata = payload.metadata ?? {};
    const fingerprint =
      String(payload.source_fingerprint ?? payload.sourceFingerprint ?? "").trim() || null;

    // ── Optional: compute fingerprint dari caller ────────────
    // DB trigger akan auto-compute jika null

    // ── Dedup: cek fingerprint dulu ──────────────────────────
    if (fingerprint) {
      const { data: existing } = await supabase
        .from("financial_transactions")
        .select("source_id")
        .eq("source_fingerprint", fingerprint)
        .maybeSingle();
      if (existing) {
        console.log(
          `[DEDUP] Duplicate by fingerprint ${fingerprint}, returning ${existing.source_id}`
        );
        return jsonResponse({ ok: true, sourceId: existing.source_id, dedup: true });
      }
    }

    // ── Dedup: cek kombinasi field dalam 5 menit ────────────
    if (amount > 0 && category) {
      const { data: similar } = await supabase
        .from("financial_transactions")
        .select("source_id")
        .eq("tx_type", txType)
        .eq("amount", amount)
        .eq("category", category)
        .eq("description", description)
        .gte("tx_date", txDate - 5 * 60 * 1000)
        .lte("tx_date", txDate + 60 * 1000)
        .limit(1)
        .maybeSingle();
      if (similar) {
        console.log(
          `[DEDUP] Duplicate by match: ${amount}/${category}/${description}, returning ${similar.source_id}`
        );
        return jsonResponse({ ok: true, sourceId: similar.source_id, dedup: true });
      }
    }

    // ── Insert ──────────────────────────────────────────────
    const sourceId = `fin_${crypto.randomUUID().replace(/-/g, "")}`;
    const { error } = await supabase.from("financial_transactions").insert({
      source_id: sourceId,
      tx_type: txType,
      amount,
      category,
      description: description || null,
      merchant: merchant || null,
      tx_date: txDate,
      payment_method: paymentMethod,
      status,
      source_fingerprint: fingerprint,
      metadata,
      creation_time: Date.now(),
      raw: payload as unknown as Record<string, unknown>,
    });

    if (error) {
      // Handle UNIQUE constraint violation on fingerprint
      if (
        error.message?.includes("source_fingerprint") &&
        error.code === "23505"
      ) {
        const { data: existing } = await supabase
          .from("financial_transactions")
          .select("source_id")
          .eq("source_fingerprint", fingerprint)
          .maybeSingle();
        if (existing) {
          return jsonResponse({
            ok: true,
            sourceId: existing.source_id,
            dedup: true,
          });
        }
      }
      console.error("Insert failed:", error);
      return jsonResponse({ ok: false, error: error.message }, 500);
    }

    return jsonResponse({ ok: true, sourceId });
  } catch (err) {
    console.error("record-financial-transaction error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
