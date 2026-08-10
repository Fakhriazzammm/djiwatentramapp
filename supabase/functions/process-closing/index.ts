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

interface KebersihanArea {
  id: string;
  label?: string;
  status?: string;
  catatan?: string;
  photoBase64?: string;
  photoContentType?: string;
  photoUrl?: string;
}

const CLOSING_PHOTO_BUCKET = "shift-closing-photos";
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Base URL yang bisa dibuka browser. SUPABASE_URL di dalam container adalah
 * http://kong:8000 (hanya valid antar-container), dan SUPABASE_PUBLIC_URL di
 * server ini menunjuk ke app POS, bukan API gateway.
 */
const publicSupabaseUrl = (
  Deno.env.get("YUMI_PUBLIC_SUPABASE_URL") ?? "https://supabase.yumme.id"
).replace(/\/+$/, "");

/**
 * Upload foto kebersihan pakai service role. Wajib di server: `anon` tidak
 * punya hak tulis ke storage.objects sama sekali, jadi upload langsung dari
 * browser selalu ditolak 403.
 */
async function uploadClosingPhoto(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  areaId: string,
  base64: string,
  contentType: string,
): Promise<string> {
  if (!ALLOWED_PHOTO_TYPES.includes(contentType)) {
    throw new Error(`Format foto ${areaId} harus JPG, PNG, atau WEBP`);
  }

  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  if (bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new Error(`Ukuran foto ${areaId} melebihi 5MB`);
  }

  const ext =
    contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${Date.now()}_${areaId}.${ext}`;

  const res = await fetch(
    `${supabaseUrl}/storage/v1/object/${CLOSING_PHOTO_BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: bytes,
    },
  );
  if (!res.ok) {
    throw new Error(`Upload foto ${areaId} gagal (${res.status}): ${await res.text()}`);
  }

  return `${publicSupabaseUrl}/storage/v1/object/public/${CLOSING_PHOTO_BUCKET}/${path}`;
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
      kebersihan = [],
    } = payload as {
      userId: string;
      userName: string;
      roleName: string;
      shiftName: string;
      role: "bar" | "kitchen" | null;
      items: OpnameItem[];
      source: string;
      kebersihan: KebersihanArea[];
    };

    if (source === "telegram_mini_app" && Array.isArray(kebersihan)) {
      const requiredAreas = ["bar_kitchen", "area_customer", "wc"];
      const areaIds = new Set(kebersihan.map((area) => area?.id));
      const hasAllAreas =
        kebersihan.length === requiredAreas.length &&
        requiredAreas.every((areaId) => areaIds.has(areaId));
      const invalidArea = kebersihan.find(
        (area) => !area?.id || !["bersih", "perlu_perbaikan"].includes(String(area.status)),
      );
      if (!hasAllAreas || invalidArea) {
        return fail(
          "CHECKLIST_INCOMPLETE",
          "Checklist wajib berisi Bar & Kitchen, Area Customer, dan Toilet/WC dengan status Bersih atau Perlu Perbaikan.",
        );
      }
    }

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

    // ── Close-time validation ──────────────────────────────────
    if (shiftName) {
      try {
        const { data: settings } = await supabase
          .schema("pos")
          .from("site_settings")
          .select("raw")
          .limit(1)
          .single();

        const schedules =
          ((settings?.raw as Record<string, unknown>)?.shiftSettings as Record<string, unknown>)
            ?.shiftSchedules as Array<Record<string, unknown>> ?? [];

        let closeTime = "";
        for (const s of schedules) {
          const name = String(s.name ?? s.shiftName ?? s.shift_name ?? "");
          if (name === shiftName) {
            closeTime = String(s.closeTime ?? s.close_time ?? "");
            break;
          }
        }

        if (closeTime) {
          const [ch, cm] = closeTime.split(":").map(Number);
          if (!isNaN(ch) && !isNaN(cm)) {
            const closeMin = ch * 60 + cm;
            const currentMin = new Date().getHours() * 60 + new Date().getMinutes();

            if (currentMin < closeMin) {
              const closeHour = String(ch).padStart(2, "0");
              const closeMinStr = String(cm).padStart(2, "0");
              return fail(
                "BEFORE_CLOSE_TIME",
                `Closing belum bisa. Shift ${shiftName} tutup pukul ${closeHour}.${closeMinStr} WIB. Silakan tunggu sampai jam tutup.`,
              );
            }
          }
        }
      } catch {
        // If validation fails (e.g. no schedules configured), allow
      }
    }

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

      // ── Step 4b: Upload foto kebersihan ─────────────────────
      // Sebelumnya data kebersihan (status, catatan, foto) hanya hidup di state
      // halaman dan hilang saat submit — tidak pernah dikirim ke server.
      const kebersihanResult: KebersihanArea[] = [];
      for (const area of Array.isArray(kebersihan) ? kebersihan : []) {
        if (!area?.id) continue;
        const entry: KebersihanArea = {
          id: area.id,
          label: area.label,
          status: area.status,
          catatan: area.catatan,
        };
        if (area.photoBase64) {
          entry.photoUrl = await uploadClosingPhoto(
            supabaseUrl,
            supabaseKey,
            userId,
            area.id,
            area.photoBase64,
            area.photoContentType || "image/jpeg",
          );
        } else if (area.photoUrl) {
          entry.photoUrl = area.photoUrl;
        }
        kebersihanResult.push(entry);
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
            ...(kebersihanResult.length > 0
              ? { closing: { kebersihan: kebersihanResult, closedAt: now } }
              : {}),
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
