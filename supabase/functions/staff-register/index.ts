import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

/**
 * Pendaftaran karyawan mandiri TANPA persetujuan manual.
 * Satu panggilan: validasi → buat akun aktif (PIN pilihan sendiri) → catat aplikasi + kontrak yang sudah ditandatangani.
 * Akun langsung bisa dipakai di app Karyawan. Peran dibatasi ke BARISTA / CHEF / KASIR / WAITERS / STAFF (tanpa hak istimewa); label jabatan disimpan terpisah.
 * Anti-penyalahgunaan: batas per IP, honeypot, nama ganda ditolak, PIN lemah ditolak.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Max-Age": "86400",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (code: string, message: string, status = 400) => json({ success: false, error: { code, message } }, status);

// Jabatan yang boleh didaftarkan mandiri. Semua dipetakan ke peran sistem TANPA hak istimewa:
// BARISTA/CHEF/KASIR/WAITERS (hak operasional dasar) atau STAFF (tanpa hak akses admin/POS).
// Label jabatan disimpan di raw.jabatan agar tetap tampil di Data Karyawan.
const JABATAN: Record<string, { role: string; label: string; prefix: string }> = {
  barista: { role: "BARISTA", label: "Barista", prefix: "BRT" },
  kitchen: { role: "CHEF", label: "Kitchen / Chef", prefix: "CHF" },
  kasir: { role: "KASIR", label: "Kasir", prefix: "KSR" },
  pelayan: { role: "WAITERS", label: "Pelayan / Waiter", prefix: "WTR" },
  helper_dapur: { role: "STAFF", label: "Helper Dapur", prefix: "HLP" },
  steward: { role: "STAFF", label: "Steward / Dishwasher", prefix: "STW" },
  runner: { role: "STAFF", label: "Food Runner", prefix: "RUN" },
  host: { role: "STAFF", label: "Host / Greeter", prefix: "HST" },
  cleaning: { role: "STAFF", label: "Cleaning Service", prefix: "CLN" },
  gudang: { role: "STAFF", label: "Staff Gudang", prefix: "GDG" },
  driver: { role: "STAFF", label: "Driver / Kurir", prefix: "DRV" },
  security: { role: "STAFF", label: "Security", prefix: "SCR" },
  admin: { role: "STAFF", label: "Staff Administrasi", prefix: "ADM" },
  marketing: { role: "STAFF", label: "Marketing & Konten", prefix: "MKT" },
};
const ROLE_BY_JABATAN: Record<string, string> = Object.fromEntries(Object.entries(JABATAN).map(([k, v]) => [k, v.role]));
const NIP_PREFIX: Record<string, string> = { BARISTA: "BRT", CHEF: "CHF", KASIR: "KSR", WAITERS: "WTR", STAFF: "STF" };
const MAX_PER_IP_PER_HOUR = 5;

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const sha256 = async (v: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)))).map((b) => b.toString(16).padStart(2, "0")).join("");

function weakPin(pin: string) {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const asc = "0123456789012345", desc = "9876543210987654";
  return asc.includes(pin) || desc.includes(pin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !key) return fail("CONFIG_ERROR", "Server belum dikonfigurasi", 500);
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const b = await req.json().catch(() => ({})) as Record<string, any>;
    if (b.website) return json({ success: true }); // honeypot: pura-pura berhasil

    const name = String(b.name ?? "").trim().replace(/\s+/g, " ");
    const phone = String(b.phone ?? "").replace(/[^\d+]/g, "");
    const jabatan = String(b.jabatan ?? "").toLowerCase();
    const pin = String(b.pin ?? "");
    const employmentType = b.employmentType === "part_time" ? "part_time" : "full_time";
    const signature = String(b.signature ?? "");
    const email = String(b.email ?? "").trim().toLowerCase() || null;

    if (name.length < 3 || name.length > 80) return fail("NAME_INVALID", "Nama lengkap 3–80 karakter.");
    if (!/^\+?\d{8,15}$/.test(phone)) return fail("PHONE_INVALID", "Nomor HP tidak valid.");
    if (!ROLE_BY_JABATAN[jabatan]) return fail("ROLE_INVALID", "Pilih jabatan dari daftar yang tersedia.");
    if (!/^\d{6}$/.test(pin)) return fail("PIN_INVALID", "PIN harus 6 digit angka.");
    if (weakPin(pin)) return fail("PIN_WEAK", "PIN terlalu mudah ditebak. Hindari 123456 atau angka kembar.");
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("EMAIL_INVALID", "Format email tidak valid.");
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length > 400_000) return fail("SIGNATURE_INVALID", "Tanda tangan belum ada atau tidak valid.");
    if (b.consent !== true) return fail("CONSENT_REQUIRED", "Setujui kontrak dan pemrosesan data untuk melanjutkan.");

    // Batas per IP
    const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from("employee_onboarding_applications").select("id", { count: "exact", head: true }).eq("raw->>ip", ip).gte("created_at", since);
    if ((count ?? 0) >= MAX_PER_IP_PER_HOUR) return fail("RATE_LIMITED", "Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti.", 429);

    // Nama ganda
    const { data: users } = await db.from("yumi_users").select("name,is_active");
    if ((users ?? []).some((u) => u.is_active !== false && norm(String(u.name ?? "")) === norm(name))) {
      return fail("NAME_TAKEN", "Nama ini sudah terdaftar. Masuk lewat halaman login, atau hubungi supervisor bila itu bukan kamu.", 409);
    }

    const roleName = ROLE_BY_JABATAN[jabatan];
    const { data: role } = await db.from("yumi_roles").select("source_id").eq("name", roleName).maybeSingle();
    if (!role?.source_id) return fail("ROLE_MISSING", "Peran belum tersedia. Hubungi supervisor.", 500);

    // Slug unik
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "karyawan";
    let slug = base;
    for (let i = 2; i < 50; i++) {
      const { data: hit } = await db.from("yumi_users").select("source_id").or(`slug.eq.${slug},username.eq.${slug}`).limit(1);
      if (!hit?.length) break;
      slug = `${base}-${i}`;
    }

    const sourceId = `user_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const now = new Date().toISOString();
    const raw = {
      requiresPinChange: false, selfRegistered: true, registeredAt: now,
      phone, email, identityNumber: String(b.identityNumber ?? "").trim() || undefined,
      address: String(b.address ?? "").trim() || undefined, birthDate: b.birthDate || undefined,
      placeOfBirth: String(b.birthPlace ?? "").trim() || undefined, employmentType, jabatan: JABATAN[jabatan].label,
    };
    const { error: userErr } = await db.from("yumi_users").insert({
      source_id: sourceId, username: slug, name, slug, role_source_id: role.source_id, is_active: true,
      receive_report_emails: false, home_pin_hash: await bcrypt.hash(pin, 10), home_pin_fingerprint: await sha256(pin), raw,
    });
    if (userErr) {
      console.error("[staff-register] create user", userErr);
      return fail("CREATE_FAILED", "Gagal membuat akun. Coba lagi.", 500);
    }

    // NIP (opsional, tidak menggagalkan pendaftaran)
    let nip = "";
    try {
      const { data } = await db.rpc("next_registration_number", { p_category: JABATAN[jabatan].prefix, p_prefix: JABATAN[jabatan].prefix });
      if (typeof data === "string" && data) {
        nip = data;
        await db.from("yumi_users").update({ employee_nip: nip }).eq("source_id", sourceId);
      }
    } catch (e) { console.warn("[staff-register] nip", e); }

    // Trigger tabel mewajibkan status awal "pending"; setelah dibuat langsung ditandai disetujui + kontrak ditandatangani.
    const { data: app, error: appErr } = await db.from("employee_onboarding_applications").insert({
      full_name: name, email, phone,
      identity_number: String(b.identityNumber ?? "").trim() || null, address: String(b.address ?? "").trim() || null,
      birth_date: b.birthDate || null, birth_place: String(b.birthPlace ?? "").trim() || null,
      status: "pending",
      employment: { roleId: role.source_id, roleName, jabatan: JABATAN[jabatan].label, jabatanKey: jabatan, slug, username: slug, selfRegistered: true, employmentType, startDate: now.slice(0, 10), registeredAt: now },
      contract: { title: `Perjanjian Kerja Waktu Tertentu (PKWT) [${JABATAN[jabatan].label.toUpperCase()}]`, agreedAt: now, templateUsed: "__default__", signature },
      emergency_contact: {}, attachments: {}, raw: { ip, autoApproved: true },
    }).select("id").single();
    if (appErr || !app) {
      console.error("[staff-register] application insert (akun tetap aktif)", appErr);
    } else {
      const { error: updErr } = await db.from("employee_onboarding_applications").update({
        status: "approved", approved_user_source_id: sourceId, employee_nip: nip || null,
        reviewed_by: "auto", reviewed_at: now, review_notes: "Disetujui otomatis (pendaftaran mandiri)",
        contract_status: "signed", contract_signed_by_employee_at: now, signed_at: now, data_consent: true, contract_consent: true,
        raw: { ip, autoApproved: true, pipelineStep: "contract_signed" },
      }).eq("id", app.id);
      if (updErr) console.error("[staff-register] application approve (akun tetap aktif)", updErr);
    }

    return json({ success: true, userId: sourceId, slug, name, role: roleName });
  } catch (e) {
    console.error("[staff-register]", e);
    return fail("INTERNAL_ERROR", "Terjadi kesalahan. Coba lagi.", 500);
  }
});
