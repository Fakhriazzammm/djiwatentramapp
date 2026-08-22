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

// Closing links may be opened before the shift ends while the employee
// completes the checklist. The server still enforces active check-in,
// signature, duplicate-checkout, and authoritative close-time validation.
const HMAC_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const HMAC_MAX_FUTURE_SKEW_MS = 60 * 1000;

async function hexHmacSha256(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function signaturesEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function formatStockRemaining(qty: number, unit: string): string {
  const normalized = unit.toLowerCase().trim();
  if (qty <= 0) return "HABIS";
  if (["gram", "g"].includes(normalized))
    return qty < 1000
      ? `sisa ${qty.toFixed(0)} gram`
      : `sisa ${(qty / 1000).toFixed(1)} kg`;
  if (["ml", "milliliter"].includes(normalized))
    return qty < 1000
      ? `sisa ${qty.toFixed(0)} ml`
      : `sisa ${(qty / 1000).toFixed(1)} L`;
  if (["liter", "l"].includes(normalized)) return `sisa ${qty.toFixed(1)} L`;
  if (normalized === "kg") return `sisa ${qty.toFixed(1)} kg`;
  return `sisa ${qty.toFixed(0)} ${unit}`;
}

async function buildStockOpnameReport(
  supabase: ReturnType<typeof createClient>,
): Promise<string[]> {
  const [{ data: inventoryData }, { data: storesData }] = await Promise.all([
    supabase
      .from("pos_inventory")
      .select(
        "ingredientName,unit,quantity,lowStockThreshold,preferredStoreId",
      ),
    supabase
      .from("pos_inventory_stores")
      .select("_id,name,phone")
      .eq("isActive", true),
  ]);
  const inventory = (inventoryData ?? []) as Array<Record<string, unknown>>;
  const stores = (storesData ?? []) as Array<{
    _id?: string;
    name?: string;
    phone?: string;
  }>;
  const storeMap = new Map(stores.map((store) => [store._id ?? "", store]));
  const skipKeywords = [
    "gas",
    "baterai",
    "kresek",
    "sedotan",
    "sendok garpu",
    "botol 1",
    "ekonomi",
    "soklin",
    "lifebuoy",
    "cling",
    "bento tupai",
    "paperbowl",
    "cup 12",
    "multi tisu",
    "tutup cup",
  ];
  const urgent = new Map<string, { phone: string; items: string[] }>();
  const menipis = new Map<string, { phone: string; items: string[] }>();

  for (const item of inventory ?? []) {
    const name = String(item.ingredientName ?? "");
    if (
      !name ||
      skipKeywords.some((keyword) => name.toLowerCase().includes(keyword))
    )
      continue;
    const qty = Number(item.quantity ?? 0);
    const threshold = Number(item.lowStockThreshold ?? 0);
    if (threshold <= 0 || qty > threshold) continue;
    const store = storeMap.get(String(item.preferredStoreId ?? "")) ?? {
      name: "Lainnya",
      phone: "",
    };
    const storeName = String(store.name ?? "Lainnya");
    const group = qty <= 0 || qty <= threshold * 0.3 ? urgent : menipis;
    const current = group.get(storeName) ?? {
      phone: String(store.phone ?? ""),
      items: [],
    };
    if (store.phone) current.phone = String(store.phone);
    current.items.push(
      `${qty <= 0 || qty <= threshold * 0.3 ? "🔴" : "🟡"} ${name} — ${formatStockRemaining(qty, String(item.unit ?? ""))}`,
    );
    group.set(storeName, current);
  }

  for (const groups of [urgent, menipis]) {
    for (const group of groups.values()) {
      group.items.sort((a, b) => a.localeCompare(b));
    }
  }

  const sortStores = (
    groups: Map<string, { phone: string; items: string[] }>,
  ) =>
    [...groups.entries()].sort(
      (a, b) =>
        b[1].items.length - a[1].items.length || a[0].localeCompare(b[0]),
    );
  const lines = [
    "📋 STOCK OPNAME",
    `🔴 Urgent: ${[...urgent.values()].reduce((sum, group) => sum + group.items.length, 0)} item  |  🟡 Menipis: ${[...menipis.values()].reduce((sum, group) => sum + group.items.length, 0)} item`,
    "",
  ];
  for (const [title, groups, icon] of [
    ["URGENT", urgent, "🔴"],
    ["MENIPIS", menipis, "🟡"],
  ] as const) {
    if (!groups.size) continue;
    lines.push(`━━━ ${icon} ${title} ━━━`, "");
    sortStores(groups).forEach(([name, group], index) => {
      lines.push(
        `${index + 1}. ${name}${group.phone ? `  ☎️ ${group.phone}` : ""}`,
        ...group.items,
        "",
      );
    });
    lines.push("");
  }
  return lines;
}

async function notifyCheckoutToReportGroup(params: {
  supabase: ReturnType<typeof createClient>;
  userName: string;
  roleName: string;
  shiftName: string;
  source: string;
  timestamp: number;
  items: OpnameItem[];
  kebersihan: KebersihanArea[];
  isLastPerson: boolean;
}): Promise<void> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const chatId = Deno.env.get("TELEGRAM_REPORT_CHAT_ID") ?? "";
  if (!botToken || !chatId) {
    console.warn(
      "[process-closing] Telegram notification skipped: missing bot token or report chat id",
    );
    return;
  }

  const wib = new Date(params.timestamp + 7 * 60 * 60 * 1000);
  const date =
    wib.toISOString().slice(8, 10) + "/" + wib.toISOString().slice(5, 7);
  const time = wib.toISOString().slice(11, 16);
  const changedItems = params.items.filter(
    (item) => Math.abs(item.qtyAfter - item.qtyBefore) > 0.01,
  );
  const stockLines = [
    `📦 Stock Opname — ${params.items.length} item dicek, ${changedItems.length} berubah`,
    ...changedItems
      .slice(0, 20)
      .map(
        (item) =>
          `• ${item.name}: ${item.qtyBefore} → ${item.qtyAfter} ${item.unit}`,
      ),
  ];
  if (changedItems.length > 20) {
    stockLines.push(`• ...dan ${changedItems.length - 20} item lainnya`);
  }

  const cleaningLines = [
    "🧼 Cek Kebersihan",
    ...params.kebersihan.map((area) => {
      const icon = area.status === "bersih" ? "✅" : "⚠️";
      const note = area.catatan ? ` — ${area.catatan}` : "";
      return `${icon} ${area.label || area.id}${note}`;
    }),
  ];

  const photoAreas = params.kebersihan.filter((area) => Boolean(area.photoUrl));
  const text = [
    `📤 Absen Keluar — ${date} ${time}`,
    `👤 ${params.userName}${params.roleName ? ` • ${params.roleName}` : ""}`,
    `🕐 ${time} WIB`,
    `${params.shiftName ? `📌 ${params.shiftName}` : "📌 Tanpa shift"}`,
    `🧾 Closing Mini App (${params.source})`,
    "",
    ...stockLines,
    "",
    ...cleaningLines,
    ...(photoAreas.length > 0
      ? ["", `📸 Foto kebersihan: ${photoAreas.length} terlampir`]
      : []),
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      console.error(
        `[process-closing] Telegram notification failed (${response.status}): ${await response.text()}`,
      );
      return;
    }

    if (params.isLastPerson && (params.roleName || "").trim()) {
      const reportLines = await buildStockOpnameReport(params.supabase);
      let chunk = "";
      for (const line of reportLines) {
        if ((chunk + (chunk ? "\n" : "") + line).length > 3900) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: chunk }),
            signal: controller.signal,
          });
          chunk = line;
        } else {
          chunk += (chunk ? "\n" : "") + line;
        }
      }
      if (chunk.trim()) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: chunk }),
          signal: controller.signal,
        });
      }
    }

    for (const area of photoAreas) {
      try {
        const photoResponse = await fetch(
          `https://api.telegram.org/bot${botToken}/sendPhoto`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              photo: area.photoUrl,
              caption: `📸 ${area.label || area.id} — ${area.status === "bersih" ? "Bersih" : "Perlu Perbaikan"}`,
            }),
            signal: controller.signal,
          },
        );
        if (!photoResponse.ok) {
          console.error(
            `[process-closing] Cleaning photo failed for ${area.id} (${photoResponse.status}): ${await photoResponse.text()}`,
          );
        }
      } catch (error) {
        console.error(
          `[process-closing] Cleaning photo error for ${area.id}:`,
          error,
        );
      }
    }

    console.log(
      `[process-closing] Checkout notification sent to report group for ${params.userName}`,
    );
  } catch (error) {
    console.error("[process-closing] Telegram notification error:", error);
  } finally {
    clearTimeout(timeout);
  }
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
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : "jpg";
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
    throw new Error(
      `Upload foto ${areaId} gagal (${res.status}): ${await res.text()}`,
    );
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
      linkUid = "",
      linkTimestamp = "",
      linkSignature = "",
    } = payload as {
      userId: string;
      userName: string;
      roleName: string;
      shiftName: string;
      role: "bar" | "kitchen" | null;
      items: OpnameItem[];
      source: string;
      kebersihan: KebersihanArea[];
      linkUid?: string;
      linkTimestamp?: string | number;
      linkSignature?: string;
    };

    if (source === "telegram_mini_app") {
      if (!linkUid || !linkTimestamp || !linkSignature) {
        return fail("AUTH_REQUIRED", "Link Mini App tidak lengkap. Buka ulang dari bot.", 401);
      }
      if (String(linkUid) !== String(userId)) {
        return fail("AUTH_MISMATCH", "Identitas link tidak cocok dengan karyawan.", 403);
      }

      const timestamp = Number(linkTimestamp);
      const now = Date.now();
      if (!Number.isFinite(timestamp)) {
        return fail("AUTH_INVALID", "Timestamp link tidak valid.", 401);
      }
      if (timestamp - now > HMAC_MAX_FUTURE_SKEW_MS) {
        return fail("AUTH_INVALID", "Waktu link belum berlaku.", 401);
      }
      if (now - timestamp > HMAC_MAX_AGE_MS) {
        return fail("AUTH_EXPIRED", "Link Mini App sudah kedaluwarsa. Buka ulang dari bot.", 401);
      }

      const secret = Deno.env.get("ATTENDANCE_HMAC_SECRET") ?? "";
      if (!secret) return fail("CONFIG_ERROR", "Server attendance belum dikonfigurasi.", 500);
      const expectedSignature = await hexHmacSha256(secret, `${linkUid}:${linkTimestamp}`);
      if (!signaturesEqual(expectedSignature, String(linkSignature))) {
        return fail("AUTH_INVALID", "Signature link tidak valid. Buka ulang dari bot.", 401);
      }
    }

    if (source === "telegram_mini_app" && Array.isArray(kebersihan)) {
      const requiredAreas = ["bar_kitchen", "area_customer", "wc"];
      const areaIds = new Set(kebersihan.map((area) => area?.id));
      const hasAllAreas =
        kebersihan.length === requiredAreas.length &&
        requiredAreas.every((areaId) => areaIds.has(areaId));
      const invalidArea = kebersihan.find(
        (area) =>
          !area?.id ||
          !["bersih", "perlu_perbaikan"].includes(String(area.status)),
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

    // Server-side attendance integrity: the closing form may only close an
    // active check-in and must never create a second checkout.
    const wibOffset = 7 * 60 * 60 * 1000;
    const wibNow = new Date(now + wibOffset);
    const todayStart = Date.UTC(
      wibNow.getUTCFullYear(),
      wibNow.getUTCMonth(),
      wibNow.getUTCDate(),
    ) - wibOffset;
    const { data: todayLogs, error: attendanceError } = await supabase
      .from("pos_attendance_logs")
      .select("type,timestamp")
      .eq("userId", userId)
      .gte("timestamp", todayStart)
      .lt("timestamp", todayStart + 86400000)
      .order("timestamp", { ascending: false })
      .limit(20);
    if (attendanceError) throw attendanceError;
    const latestAttendance = todayLogs?.[0];
    if (!latestAttendance || latestAttendance.type !== "check_in") {
      return fail("NOT_CHECKED_IN", "Karyawan belum memiliki Absen Masuk aktif hari ini.");
    }

    // ── Close-time validation ──────────────────────────────────
    if (shiftName) {
      try {
        const { data: settings, error: settingsError } = await supabase
          .schema("pos")
          .from("site_settings")
          .select("raw")
          .limit(1)
          .single();
        if (settingsError || !settings?.raw) {
          return fail(
            "SHIFT_SETTINGS_UNAVAILABLE",
            "Jadwal shift belum dapat dibaca. Absen keluar ditahan, silakan coba lagi.",
            503,
          );
        }

        const schedules =
          ((
            (settings?.raw as Record<string, unknown>)?.shiftSettings as Record<
              string,
              unknown
            >
          )?.shiftSchedules as Array<Record<string, unknown>>) ?? [];

        let openTime = "";
        let closeTime = "";
        const targetShift = shiftName.trim().toUpperCase();
        for (const s of schedules) {
          const name = String(s.name ?? s.shiftName ?? s.shift_name ?? "");
          if (name.trim().toUpperCase() === targetShift) {
            openTime = String(s.openTime ?? s.open_time ?? "");
            closeTime = String(s.closeTime ?? s.close_time ?? "");
            break;
          }
        }

        if (closeTime) {
          const [ch, cm] = closeTime.split(":").map(Number);
          if (!isNaN(ch) && !isNaN(cm)) {
            const closeMin = ch * 60 + cm;
            const nowWib = new Date(Date.now() + 7 * 60 * 60 * 1000);
            const currentMin =
              nowWib.getUTCHours() * 60 + nowWib.getUTCMinutes();

            const [openHourText, openMinuteText] = openTime.split(":");
            const openMin = openTime
              ? Number(openHourText ?? "") * 60 + Number(openMinuteText ?? "")
              : -1;
            const isOvernight = openMin >= 0 && openMin > closeMin;
            const beforeClose = isOvernight
              ? currentMin >= openMin || currentMin < closeMin
              : currentMin < closeMin;

            if (beforeClose) {
              const closeHour = String(ch).padStart(2, "0");
              const closeMinStr = String(cm).padStart(2, "0");
              return fail(
                "BEFORE_CLOSE_TIME",
                `Closing belum bisa. Shift ${shiftName} tutup pukul ${closeHour}.${closeMinStr} WIB. Silakan tunggu sampai jam tutup.`,
              );
            }
          }
        }
      } catch (error) {
        console.error("[process-closing] Shift validation failed:", error);
        return fail(
          "SHIFT_SETTINGS_UNAVAILABLE",
          "Jadwal shift belum dapat diverifikasi. Absen keluar ditahan, silakan coba lagi.",
          503,
        );
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
        // Check if lock is stale (>60 seconds)
        if (lockError.code === "23505") {
          const { data: existing } = await supabase
            .schema("pos")
            .from("closing_locks")
            .select("locked_at, staff_name")
            .eq("shift_name", shiftName)
            .eq("role", lockScope)
            .maybeSingle();

          if (existing && now - existing.locked_at > 60_000) {
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
      let opnameSourceId = "";
      // ── Step 2: Save stock opname per-person ────────────────
      if (needsOpname && items.length > 0) {
        opnameSourceId = makeSourceId("opn");
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
          const todayStart =
            new Date(
              Date.UTC(
                wibNow.getUTCFullYear(),
                wibNow.getUTCMonth(),
                wibNow.getUTCDate(),
                0,
                0,
                0,
                0,
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
          console.warn(
            "[process-closing] checkIsLastPerson error, defaulting to true:",
            err,
          );
          isLastPerson = true;
        }
      }

      // ── Step 3b: Mark the final opname and preserve audit chain ──
      if (needsOpname && isLastPerson && opnameSourceId) {
        const wibOffset = 7 * 60 * 60 * 1000;
        const wibNow = new Date(now + wibOffset);
        const todayStart =
          Date.UTC(
            wibNow.getUTCFullYear(),
            wibNow.getUTCMonth(),
            wibNow.getUTCDate(),
          ) - wibOffset;
        const { data: previousLogs } = await supabase
          .schema("pos")
          .from("stock_opname_logs")
          .select("source_id")
          .eq("role", lockScope)
          .contains("raw", { shiftName, role: lockScope })
          .gte("creation_time", todayStart)
          .lt("creation_time", todayStart + 86400000)
          .neq("source_id", opnameSourceId)
          .order("creation_time", { ascending: true });
        const previousOpnameIds = (
          (previousLogs ?? []) as Array<{ source_id?: string }>
        )
          .map((row) => row.source_id)
          .filter((id): id is string => Boolean(id));
        const { error: finalLogError } = await supabase
          .schema("pos")
          .from("stock_opname_logs")
          .update({
            is_final: true,
            previous_opname_ids: previousOpnameIds,
            notes: `FINAL — Opname shift ${shiftName} oleh ${userName}; ${previousOpnameIds.length} opname sebelumnya`,
          })
          .eq("source_id", opnameSourceId);
        if (finalLogError) throw finalLogError;
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
              notes: `[FINAL] Shift closing opname by ${userName}: ${item.qtyBefore} → ${item.qtyAfter}`,
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

      // Notifikasi non-fatal: checkout tetap sukses walaupun Telegram sedang gagal.
      await notifyCheckoutToReportGroup({
        supabase,
        userName,
        roleName,
        shiftName,
        source,
        timestamp: now,
        items,
        kebersihan: kebersihanResult,
        isLastPerson,
      });

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
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: String(err) },
      },
      500,
    );
  }
});
