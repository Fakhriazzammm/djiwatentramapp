import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(code: string, message: string, status = 400) {
  return jsonResponse({ success: false, error: { code, message } }, status);
}

interface OpnameItem {
  inventoryId: string;
  name: string;
  unit: string;
  qtyBefore: number;
  qtyAfter: number;
  isChanged?: boolean;
}

function makeSourceId(prefix: string): string {
  const hex = "abcdef0123456789";
  let rnd = "";
  for (let i = 0; i < 24; i++) rnd += hex[Math.floor(Math.random() * 16)];
  return `${prefix}_${rnd}`;
}

// ─── Main handler ─────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }

  try {
    const payload = await req.json();
    const {
      userId,
      userName,
      roleName,
      shiftName,
      role,
      items = [],
      source = "karyawan_web",
    } = payload as {
      userId: string;
      userName: string;
      roleName: string;
      shiftName: string;
      role: "bar" | "kitchen" | null;
      items: OpnameItem[];
      source: string;
    };

    if (!userId || !userName) {
      return fail("VALIDATION_ERROR", "userId and userName are required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseKey) {
      return fail("CONFIG_ERROR", "Supabase not configured", 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const now = Date.now();
    const needsOpname = role === "bar" || role === "kitchen";
    const changedItems = items.filter(
      (i) => Math.abs(i.qtyAfter - i.qtyBefore) > 0.01,
    );

    // ── Step 1: Acquire distributed lock ──────────────────────
    // Uses closing_locks PK unique constraint as a lock.
    // Only one closing per (shiftName, role) can proceed at a time.

    const lockKey = `${shiftName}:${role ?? "none"}`;
    const lockScope = role ?? "none";

    if (needsOpname) {
      const { error: lockError } = await supabase
        .schema("pos")
        .from("closing_locks")
        .insert({
          shift_name: shiftName,
          role: lockScope,
          locked_at: now,
          staff_name: userName,
        });

      if (lockError) {
        // Check if lock is stale (>10 seconds)
        if (lockError.code === "23505") {
          const { data: existing } = await supabase
            .schema("pos")
            .from("closing_locks")
            .select("locked_at, staff_name")
            .eq("shift_name", shiftName)
            .eq("role", lockScope)
            .maybeSingle();

          if (existing && now - existing.locked_at > 10000) {
            // Stale lock — override
            await supabase
              .schema("pos")
              .from("closing_locks")
              .update({ locked_at: now, staff_name: userName })
              .eq("shift_name", shiftName)
              .eq("role", lockScope);
          } else {
            const who = existing?.staff_name ?? "someone else";
            return fail(
              "LOCKED",
              `${who} sedang melakukan closing untuk shift ${shiftName} (${role}). Tunggu sebentar lalu coba lagi.`,
              409,
            );
          }
        } else {
          throw lockError;
        }
      }
    }

    try {
      // ── Step 2: Save stock opname per-person ────────────────
      if (needsOpname && items.length > 0) {
        const opnameSourceId = makeSourceId("opn");
        const submitItems = changedItems.length > 0 ? changedItems : items;

        const { error: opnameError } = await supabase
          .schema("pos")
          .from("stock_opname_logs")
          .insert({
            source_id: opnameSourceId,
            shift_source_id: null,
            staff_source_id: userId,
            staff_name: userName,
            role: role,
            attendance_type: "check_out",
            is_final: false,
            items: submitItems.map((i) => ({
              inventoryId: i.inventoryId,
              name: i.name,
              unit: i.unit,
              qtyBefore: i.qtyBefore,
              qtyAfter: i.qtyAfter,
            })),
            notes: `Opname by ${userName} (${role}) — ${changedItems.length} item berubah`,
            creation_time: now,
            raw: { staffName: userName, shiftName, role },
          });

        if (opnameError) throw opnameError;
      }

      // ── Step 3: Check if last person for this shift+role ───
      let isLastPerson = false;

      if (needsOpname) {
        try {
          // Today's range in WIB
          const wibOffset = 7 * 60 * 60 * 1000;
          const wibNow = new Date(now + wibOffset);
          const todayStart = new Date(
            Date.UTC(
              wibNow.getUTCFullYear(),
              wibNow.getUTCMonth(),
              wibNow.getUTCDate(),
              0, 0, 0, 0,
            ),
          ).getTime() - wibOffset;
          const todayEnd = todayStart + 86400000;

          // Count check-ins for shift+role today
          const { data: checkIns } = await supabase
            .from("pos_attendance_logs")
            .select("userId")
            .eq("type", "check_in")
            .eq("shiftName", shiftName)
            .eq("roleName", roleName)
            .gte("timestamp", todayStart)
            .lt("timestamp", todayEnd);

          // Count check-outs for shift+role today
          const { data: checkOuts } = await supabase
            .from("pos_attendance_logs")
            .select("userId")
            .eq("type", "check_out")
            .eq("shiftName", shiftName)
            .eq("roleName", roleName)
            .gte("timestamp", todayStart)
            .lt("timestamp", todayEnd);

          const checkedInIds = new Set((checkIns ?? []).map((r) => r.userId));
          const checkedOutIds = new Set((checkOuts ?? []).map((r) => r.userId));

          // Still working = checked in but NOT checked out (excluding current user)
          const stillWorking = [...checkedInIds].filter(
            (id) => !checkedOutIds.has(id) && id !== userId,
          );

          isLastPerson = stillWorking.length === 0;
        } catch (err) {
          console.warn("[process-closing] checkIsLastPerson error, defaulting to true:", err);
          isLastPerson = true;
        }
      }

      // ── Step 4: Apply final opname if last person ───────────
      if (needsOpname && isLastPerson && changedItems.length > 0) {
        for (const item of changedItems) {
          const qtyDiff = item.qtyAfter - item.qtyBefore;
          const txSourceId = makeSourceId("invtx");

          const { error: txError } = await supabase
            .schema("pos")
            .from("inventory_transactions")
            .insert({
              source_id: txSourceId,
              inventory_source_id: item.inventoryId,
              quantity: qtyDiff,
              tx_type: "stock_opname_final",
              remaining_quantity: item.qtyAfter,
              tx_timestamp: now,
              notes:
                `[FINAL] Shift closing opname by ${userName}: ${item.qtyBefore} → ${item.qtyAfter}`,
              creation_time: now,
              raw: {
                userId,
                staffName: userName,
                qtyBefore: item.qtyBefore,
                qtyAfter: item.qtyAfter,
                type: "final",
              },
            });

          if (txError) throw txError;

          const { error: invError } = await supabase
            .schema("pos")
            .from("inventory")
            .update({ quantity: item.qtyAfter })
            .eq("source_id", item.inventoryId);

          if (invError) throw invError;
        }
      }

      // ── Step 5: Record check-out ────────────────────────────
      const docId = makeSourceId("att");

      const checkOutNotes = needsOpname
        ? `Absen keluar via ${source} (${role} — opname ${isLastPerson ? "final" : "per-person"})`
        : `Absen keluar via ${source} (tanpa opname)`;

      const { error: checkoutError } = await supabase
        .schema("legacy_mirror")
        .from("documents")
        .insert({
          table_name: "attendance",
          document_id: docId,
          creation_time: now,
          document: {
            userId,
            type: "check_out",
            timestamp: now,
            source,
            shiftName,
            roleName,
            notes: checkOutNotes,
          },
        });

      if (checkoutError) throw checkoutError;

      return jsonResponse({
        success: true,
        isLastPerson,
        staffName: userName,
        shiftName,
      });
    } finally {
      // ── Release lock ─────────────────────────────────────────
      if (needsOpname) {
        try {
          await supabase
            .schema("pos")
            .from("closing_locks")
            .delete()
            .eq("shift_name", shiftName)
            .eq("role", lockScope);
        } catch (err) {
          console.warn("[process-closing] Failed to release lock:", err);
        }
      }
    }
  } catch (err) {
    console.error("[process-closing] Error:", err);
    return jsonResponse(
      { success: false, error: { code: "INTERNAL_ERROR", message: String(err) } },
      500,
    );
  }
});
