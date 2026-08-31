import { createClient } from "@yumipos/web-shared";

// ─── Types ──────────────────────────────────────────────────

export interface OpnameItem {
  inventoryId: string;
  name: string;
  unit: string;
  qtyBefore: number;
  qtyAfter: number;
  isChanged: boolean;
  baseUnit?: string;
  conversionFactor?: number;
  operationalUnit?: string;
  operationalQtyBefore?: number;
  operationalQtyAfter?: number;
  baseQuantityBefore?: number;
  baseQuantityAfter?: number;
}

export interface KebersihanPhoto {
  url: string;
  area: string;
  uploadedAt: number;
}

export interface ClosingArgs {
  shiftSourceId: string;
  opnameItems: OpnameItem[];
  kebersihan: Record<string, unknown>;
  photoUrls: KebersihanPhoto[];
  notes: string;
}

export interface ClosingEdgeResponse {
  success: boolean;
  isLastPerson: boolean;
  staffName: string;
  shiftName: string;
  attendanceSaved?: boolean;
  reportNotified?: boolean;
  reportMessageId?: number;
  personalNotified?: boolean;
  personalMessageId?: number;
  error?: { code: string; message: string };
}

export class ClosingSubmitError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ClosingSubmitError";
    this.code = code;
  }
}

// ─── Ingredient sets ────────────────────────────────────────

const BAR_INGREDIENTS = new Set([
  "Air Galon", "Apple Juice", "Arabica Beans", "Beans Robusta",
  "C1000 Apple", "Es Batu", "Fresh Milk Greenfield", "Gula Aren",
  "Le Mineral", "Lemon Tea Max Tea", "Matcha Powder", "Peach Tea Max Tea",
  "Richgold Label", "Robusta Beans", "SKM Carnation 488gr", "Sirup Green Apple",
  "Sirup Peach", "Soda Water Schweppes", "Sprite", "Sunquick Lemon",
  "Susu Coconut", "Susu Kental Manis", "White Cream",
]);

const KITCHEN_INGREDIENTS = new Set([
  "Barbeque Sauce", "Baso Sapi", "Bawang Daun", "Bawang Goreng",
  "Beras", "Biji Wijen", "Bubur Base", "Butter", "Coklat Powder",
  "Daging Ayam", "Fla", "Garam", "Gula Pasir Putih", "Kecap Asin",
  "Kecap Ikan", "Kecap Manis", "Kemangi Instant", "Kentang", "Kerupuk",
  "Kulit Pangsit (Cap Jempol)", "Mayonaise", "Merica", "Micin",
  "Minyak Bawang Putih", "Mix Vegetable", "Nasi Ayam Chasiu Sauce",
  "Nasi Ayam Mentega Sauce", "Nasi Ayam Rempah Kemangi  Sauce",
  "Nasi Goreng Sauce", "Nasi Telor Omega Pontianak Sauce",
  "Patty Hamburg", "Pisang", "Roti (Bread Co)",
  "Saus Sambel (Del Monte)", "Saus Tiram (Mahsuri)",
  "Saus Tomat (Del Monte)", "Selada (Ibu Teti Pasar)", "Sosis (Salam)",
  "Telor Ayam (Yogya)", "Telor Omega (Happy Egg)", "Telur Ayam",
  "Tepung Terigu", "Timun", "Tongcai", "Ubi Cilembu", "Yamin Base",
]);

function getIngredientSet(role: "bar" | "kitchen"): Set<string> {
  return role === "bar" ? BAR_INGREDIENTS : KITCHEN_INGREDIENTS;
}

// ─── Helpers ────────────────────────────────────────────────

function makeSourceId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${random.slice(0, 24)}`;
}

/** Today's start in WIB epoch ms */
function getTodayStartMs(): number {
  const now = Date.now();
  const wibOffset = 7 * 60 * 60 * 1000;
  const wibNow = new Date(now + wibOffset);
  const ws = `${wibNow.getUTCFullYear()}-${String(wibNow.getUTCMonth() + 1).padStart(2, "0")}-${String(wibNow.getUTCDate()).padStart(2, "0")}T00:00:00+07:00`;
  return new Date(ws).getTime();
}

// ══════════════════════════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════════════════════════

/**
 * Fetch inventory items filtered by role ingredient set.
 */
export async function fetchOpnameItems(
  role: "bar" | "kitchen",
): Promise<OpnameItem[]> {
  const supabase = createClient().schema("pos");
  const ingredients = getIngredientSet(role);
  const factorFor = (item: any) => Number(item.content_to_base_factor ?? item.conversion_factor ?? 1) || 1;

  const operationalQuery = await supabase
    .from("inventory")
    .select("source_id, ingredient_name, quantity, unit, operational_unit, operational_quantity, operational_area, base_unit, content_to_base_factor, conversion_factor")
    .limit(500);
  let data: any[] = operationalQuery.data ?? [];
  if (operationalQuery.error) {
    const legacyQuery = await supabase.from("inventory").select("source_id, ingredient_name, quantity, unit").limit(500);
    if (legacyQuery.error) throw legacyQuery.error;
    data = legacyQuery.data ?? [];
  }

  const scoped = operationalQuery.error ? [] : data.filter((item: any) => item.operational_area === role || item.operational_area === "general");
  const source = scoped.length > 0 ? scoped : data.filter((item) => ingredients.has(item.ingredient_name));
  return source.map((item: any) => {
    const factor = factorFor(item);
    const base = Number(item.quantity ?? 0);
    const operational = item.operational_quantity == null ? base / factor : Number(item.operational_quantity);
    return { inventoryId: item.source_id, name: item.ingredient_name, unit: item.base_unit ?? item.unit ?? "pcs", qtyBefore: base, qtyAfter: base, isChanged: false, baseUnit: item.base_unit ?? item.unit ?? "pcs", conversionFactor: factor, operationalUnit: item.operational_unit ?? item.unit ?? "pcs", operationalQtyBefore: operational, operationalQtyAfter: operational, baseQuantityBefore: base, baseQuantityAfter: base };
  });
}

// ────────────────────────────────────────────────────────────
//  1. Save per-person opname to stock_opname_logs
//     (inventory TIDAK berubah — hanya log)
// ────────────────────────────────────────────────────────────

export async function submitOpnamePerPerson(
  items: OpnameItem[],
  params: {
    userId: string;
    staffName: string;
    role: "bar" | "kitchen";
    shiftSourceId: string;
    shiftName: string;
    notes?: string;
  },
): Promise<string> {
  const supabase = createClient().schema("pos");
  const sourceId = makeSourceId("opn");
  const now = Date.now();

  const { error } = await supabase.from("stock_opname_logs").insert({
    source_id: sourceId,
    shift_source_id: params.shiftSourceId || null,
    staff_source_id: params.userId,
    staff_name: params.staffName,
    role: params.role,
    attendance_type: "check_out",
    is_final: false,
    items: items.map((i) => ({
      inventoryId: i.inventoryId,
      name: i.name,
      unit: i.unit,
      qtyBefore: i.qtyBefore,
      qtyAfter: i.qtyAfter,
      baseQuantityBefore: i.baseQuantityBefore ?? i.qtyBefore,
      baseQuantityAfter: i.baseQuantityAfter ?? i.qtyAfter,
      operationalUnit: i.operationalUnit ?? i.unit,
      operationalQtyBefore: i.operationalQtyBefore,
      operationalQtyAfter: i.operationalQtyAfter,
    })),
    notes: params.notes || `Opname by ${params.staffName} (${params.role})`,
    creation_time: now,
    raw: { staffName: params.staffName, shiftName: params.shiftName, role: params.role },
  });

  if (error) throw error;
  return sourceId;
}

// ────────────────────────────────────────────────────────────
//  2. Check if current person is the LAST for shift+role today
// ────────────────────────────────────────────────────────────

export async function checkIsLastPerson(
  userId: string,
  shiftName: string,
  role: string,
): Promise<{ isLast: boolean; remainingCount: number }> {
  const supabase = createClient();
  const todayStart = getTodayStartMs();
  const todayEnd = todayStart + 86400000;

  // All check-ins today for this shift+role
  const { data: checkIns, error: ciErr } = await supabase
    .from("pos_attendance_logs")
    .select("userId")
    .eq("type", "check_in")
    .eq("shiftName", shiftName)
    .eq("roleName", role)
    .gte("timestamp", todayStart)
    .lt("timestamp", todayEnd);

  if (ciErr) throw ciErr;
  if (!checkIns || checkIns.length === 0) {
    return { isLast: true, remainingCount: 0 };
  }

  // All check-outs today for this shift+role
  const { data: checkOuts, error: coErr } = await supabase
    .from("pos_attendance_logs")
    .select("userId")
    .eq("type", "check_out")
    .eq("shiftName", shiftName)
    .eq("roleName", role)
    .gte("timestamp", todayStart)
    .lt("timestamp", todayEnd);

  if (coErr) throw coErr;

  const checkedInIds = new Set(checkIns.map((r) => r.userId));
  const checkedOutIds = new Set((checkOuts || []).map((r) => r.userId));

  // Still working = checked in but NOT yet checked out (excluding current user)
  const stillWorking = [...checkedInIds].filter(
    (id) => !checkedOutIds.has(id) && id !== userId,
  );

  return {
    isLast: stillWorking.length === 0,
    remainingCount: stillWorking.length,
  };
}

// ────────────────────────────────────────────────────────────
//  3. Apply FINAL opname to inventory (only when last person)
// ────────────────────────────────────────────────────────────

export async function applyFinalOpname(
  items: OpnameItem[],
  staffName: string,
  userId: string,
): Promise<void> {
  void items; void staffName; void userId;
  throw new ClosingSubmitError("Final opname harus diproses melalui process-closing server-side", "SERVER_SIDE_REQUIRED");
}

// ────────────────────────────────────────────────────────────
//  4. Record check-out in pos_attendance_logs
// ────────────────────────────────────────────────────────────

export async function recordCheckOut(params: {
  userId: string;
  userName: string;
  roleName: string;
  shiftName: string;
  notes?: string;
}): Promise<void> {
  const supabase = createClient();
  const now = Date.now();
  const docId = makeSourceId("att");

  // pos_attendance_logs adalah VIEW — INSERT langsung tidak bisa.
  // Gunakan legacy_mirror.documents seperti bot & POS app.
  const { error } = await supabase
    .schema("legacy_mirror")
    .from("documents")
    .insert({
      table_name: "attendance",
      document_id: docId,
      creation_time: now,
      document: {
        userId: params.userId,
        type: "check_out",
        timestamp: now,
        source: "karyawan_web",
        shiftName: params.shiftName,
        notes: params.notes || "Check-out via absen keluar",
      },
    });

  if (error) throw error;
}

// ══════════════════════════════════════════════════════════════
//  DEPRECATED — use submitOpnamePerPerson + applyFinalOpname
//  instead. This function directly updates inventory per-person.
// ══════════════════════════════════════════════════════════════

/**
 * @deprecated Gunakan submitOpnamePerPerson() + applyFinalOpname().
 *   Fungsi ini langsung update inventory — tidak sesuai flow
 *   "last person only".
 */
export async function submitOpname(
  items: OpnameItem[],
  userId: string,
  staffName: string,
): Promise<void> {
  void items; void userId; void staffName;
  throw new ClosingSubmitError("Gunakan submitClosingViaEdge untuk finalisasi opname", "SERVER_SIDE_REQUIRED");
}

// ────────────────────────────────────────────────────────────
//  5. Kebersihan photo — dikecilkan lalu dikirim ke edge function
// ────────────────────────────────────────────────────────────

export type KebersihanPhotoPayload = {
  photoBase64: string;
  photoContentType: string;
};

/**
 * Kecilkan foto dari kamera HP jadi JPEG maks 1280px sebelum dikirim.
 * Foto mentah bisa 3–5MB; tiga area sekaligus akan membuat request terlalu besar.
 *
 * Upload TIDAK dilakukan di sini: `anon` tidak punya hak tulis ke
 * storage.objects, jadi upload langsung dari browser selalu ditolak 403.
 * Edge function `process-closing` yang meng-upload dengan service role.
 */
export async function prepareKebersihanPhoto(
  file: File,
  maxDimension = 1280,
  quality = 0.8,
): Promise<KebersihanPhotoPayload> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gagal memproses foto");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const comma = dataUrl.indexOf(",");
  return {
    photoBase64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
    photoContentType: "image/jpeg",
  };
}

// ────────────────────────────────────────────────────────────
//  6. Save closing data to shift raw JSONB (unchanged)
// ────────────────────────────────────────────────────────────

export async function submitClosing(args: ClosingArgs): Promise<void> {
  const supabase = createClient().schema("pos");

  const { data: shift, error: fetchError } = await supabase
    .from("shifts")
    .select("raw")
    .eq("source_id", args.shiftSourceId)
    .single();

  if (fetchError) throw fetchError;

  const updatedRaw = {
    ...(shift?.raw ?? {}),
    closingTasks: {
      opname: args.opnameItems,
      kebersihan: args.kebersihan,
      photos: args.photoUrls,
      notes: args.notes,
      closedAt: Date.now(),
    },
  };

  const { error: updateError } = await supabase
    .from("shifts")
    .update({ raw: updatedRaw })
    .eq("source_id", args.shiftSourceId);

  if (updateError) throw updateError;
}

// ────────────────────────────────────────────────────────────
//  7. Process closing via Edge Function (single call)
//     Combines: stock opname log + last-person check +
//     final opname + check-out in one server-side call
// ────────────────────────────────────────────────────────────

export type KebersihanSubmitArea = {
  id: string;
  label?: string;
  status?: string;
  catatan?: string;
  photoBase64?: string;
  photoContentType?: string;
};

export async function submitClosingViaEdge(params: {
  userId: string;
  userName: string;
  roleName: string;
  shiftName: string;
  role: "bar" | "kitchen" | null;
  items: OpnameItem[];
  source?: string;
  kebersihan?: KebersihanSubmitArea[];
  linkUid?: string;
  linkTimestamp?: string | number;
  linkSignature?: string;
}): Promise<ClosingEdgeResponse> {
  const supabaseUrl = "https://supabase.yumme.id";
  const response = await fetch(`${supabaseUrl}/functions/v1/process-closing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: params.userId,
      userName: params.userName,
      roleName: params.roleName,
      shiftName: params.shiftName,
      role: params.role,
      items: params.items,
      source: params.source || "karyawan_web",
      kebersihan: params.kebersihan ?? [],
      linkUid: params.linkUid,
      linkTimestamp: params.linkTimestamp,
      linkSignature: params.linkSignature,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new ClosingSubmitError(
      result.error?.message || "Gagal memproses closing",
      result.error?.code,
    );
  }
  return result as ClosingEdgeResponse;
}
