import { createClient } from "jsr:@supabase/supabase-js@2";

type Db = ReturnType<typeof createClient>;

/** Toleransi keterlambatan (menit), sama dengan bot HRD Telegram. */
export const LATE_TOLERANCE_MIN = 5;

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

export type Penalty = { lateMinutes: number; penaltyAmount: number; baseShiftRate: number; onTime: boolean };

/**
 * Denda telat: ((telat − toleransi) / durasi shift) × tarif shift peran. Sama dengan rumus bot HRD,
 * tarif diambil dari aturan gaji aktif karyawan (yang dipakai slip), bukan dari tabel peran lama.
 */
export async function computeLatePenalty(db: Db, userId: string, shiftStart: string | null | undefined, shiftEnd: string | null | undefined, atMs: number): Promise<Penalty> {
  if (!shiftStart) return { lateMinutes: 0, penaltyAmount: 0, baseShiftRate: 0, onTime: true };
  const wib = new Date(atMs + 7 * 3600_000);
  const nowMin = wib.getUTCHours() * 60 + wib.getUTCMinutes();
  const open = toMin(shiftStart.slice(0, 5));
  const lateMinutes = Math.max(0, nowMin - open);
  if (lateMinutes <= LATE_TOLERANCE_MIN) return { lateMinutes, penaltyAmount: 0, baseShiftRate: 0, onTime: true };
  let rate = 0;
  try {
    const { data } = await db.schema("pos").from("pos_payroll_staff_active_view").select("base_shift_rate").eq("user_id", userId).maybeSingle();
    rate = Number(data?.base_shift_rate ?? 0);
  } catch { /* tarif tidak tersedia: denda 0 */ }
  const duration = shiftEnd ? (toMin(shiftEnd.slice(0, 5)) - open) || 480 : 480;
  const penaltyAmount = rate > 0 && duration > 0 ? Math.floor(((lateMinutes - LATE_TOLERANCE_MIN) / duration) * rate) : 0;
  return { lateMinutes, penaltyAmount, baseShiftRate: rate, onTime: false };
}

const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

/** Laporan absen ke grup [Report] Djiwa Tentram, format sama dengan bot HRD. Mengembalikan true bila Telegram menerima. */
export async function sendAttendanceReport(p: {
  type: "check_in" | "check_out";
  atMs: number;
  name: string;
  roleName?: string;
  shiftLine?: string;
  penalty?: Penalty;
  extraLines?: string[];
  photo?: { bytes: Uint8Array; contentType: string } | null;
}): Promise<boolean> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const chat = Deno.env.get("TELEGRAM_REPORT_CHAT_ID") ?? "";
  if (!token || !chat) { console.warn("[attendance-report] token/chat belum diatur"); return false; }
  const wib = new Date(p.atMs + 7 * 3600_000).toISOString();
  const date = `${wib.slice(8, 10)}/${wib.slice(5, 7)}`;
  const time = wib.slice(11, 16);
  const label = p.type === "check_in" ? "Absen Masuk" : "Absen Keluar";
  const lines = [
    `${p.type === "check_in" ? "🚶‍➡️" : "📤"} ${label} — ${date} ${time}`,
    `👤 ${p.name}${p.roleName ? ` • ${p.roleName}` : ""}`,
    `🕐 ${time} WIB`,
  ];
  if (p.shiftLine) lines.push(`📌 ${p.shiftLine}`);
  if (p.type === "check_in" && p.penalty) {
    if (p.penalty.onTime) lines.push("✅ Tepat waktu");
    else {
      lines.push(`⚠️ Terlambat ${p.penalty.lateMinutes} menit`);
      if (p.penalty.penaltyAmount > 0) lines.push(`💰 Potongan shift: ${rupiah(p.penalty.penaltyAmount)}`);
    }
  }
  for (const l of p.extraLines ?? []) lines.push(l);
  const text = lines.join("\n");
  try {
    let res: Response;
    if (p.photo) {
      const form = new FormData();
      form.set("chat_id", chat);
      form.set("caption", text);
      form.set("photo", new Blob([p.photo.bytes], { type: p.photo.contentType }), "absen.jpg");
      res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form });
    } else {
      res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text }) });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) { console.error("[attendance-report] telegram", res.status, JSON.stringify(data).slice(0, 300)); return false; }
    return true;
  } catch (e) {
    console.error("[attendance-report] kirim gagal", e);
    return false;
  }
}

/** Unggah foto absen ke bucket attendance-photos (sama dengan bot). Mengembalikan URL publik atau null. */
export async function uploadAttendancePhoto(db: Db, userId: string, atMs: number, bytes: Uint8Array, contentType: string): Promise<string | null> {
  try {
    const path = `attendance/${userId}/${atMs}.jpg`;
    const { error } = await db.storage.from("attendance-photos").upload(path, bytes, { contentType, upsert: true });
    if (error) { console.error("[attendance-report] upload", error); return null; }
    return db.storage.from("attendance-photos").getPublicUrl(path).data.publicUrl;
  } catch (e) { console.error("[attendance-report] upload", e); return null; }
}
