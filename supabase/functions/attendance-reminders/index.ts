import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Pengingat absen dari jadwal: 15 menit sebelum shift mulai (belum absen masuk) dan 15 menit sebelum shift berakhir
 * (masih bertugas). Dikirim ke grup [Report] dan DM Telegram (bila akun Telegram tertaut) lewat bot @yumihrdbot.
 * Dipanggil tiap menit oleh pg_cron. Tiap karyawan hanya sekali per hari per jenis (tabel attendance_reminder_log).
 * `dryRun` + `at` (ISO) untuk menguji tanpa kirim dan tanpa mencatat.
 */

const APP_URL = "https://karyawan.djiwatentram.web.id";
const WIB = 7 * 3600_000;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hhmm = (t: string) => t.slice(0, 5);

async function tg(token: string, method: string, body: Record<string, unknown>) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d?.ok) console.warn("[attendance-reminders] telegram", method, r.status, JSON.stringify(d).slice(0, 200));
    return !!d?.ok;
  } catch (e) { console.error("[attendance-reminders] telegram error", e); return false; }
}

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL") ?? "", key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "", groupId = Deno.env.get("TELEGRAM_REPORT_CHAT_ID") ?? "";
  if (!url || !key) return json({ error: "config" }, 500);
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const pos = db.schema("pos");

  const { data: settings } = await pos.from("attendance_reminder_settings").select("enabled,lead_minutes,cron_token").eq("id", 1).maybeSingle();
  if (!settings || req.headers.get("x-cron-token") !== settings.cron_token) return json({ error: "unauthorized" }, 401);
  if (!settings.enabled) return json({ skipped: "disabled" });
  const body = await req.json().catch(() => ({})) as { dryRun?: boolean; at?: string };
  const dry = body.dryRun === true;
  const lead = Number(settings.lead_minutes) || 15;

  const nowMs = body.at ? Date.parse(body.at) : Date.now();
  const w = new Date(nowMs + WIB);
  const today = w.toISOString().slice(0, 10);
  const nowMin = w.getUTCHours() * 60 + w.getUTCMinutes() + w.getUTCSeconds() / 60;
  const dayStart = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) - WIB;

  const { data: sched } = await pos.from("attendance_schedules").select("user_id,shift_name,start_time,end_time,status").eq("date", today).neq("status", "off");
  const rows = (sched ?? []).filter((s) => s.start_time && !/off|libur/i.test(s.shift_name ?? ""));
  if (!rows.length) return json({ due: 0 });

  const { data: allLogs } = await db.from("pos_attendance_logs").select("userId,type,timestamp").gte("timestamp", dayStart).lt("timestamp", dayStart + 86400_000).order("timestamp", { ascending: true });
  const logs = allLogs ?? [];
  // Semua yang punya log hari ini ikut diperiksa (bukan hanya yang terjadwal), supaya yang lupa absen keluar tetap diingatkan.
  const ids = [...new Set([...rows.map((r) => r.user_id), ...logs.map((l) => String(l.userId))])];
  const [{ data: users }, { data: links }, { data: done }] = await Promise.all([
    db.from("yumi_users").select("source_id,name,is_active").in("source_id", ids),
    db.from("employee_telegram_links").select("employee_user_id,telegram_user_id,is_active").in("employee_user_id", ids),
    pos.from("attendance_reminder_log").select("user_id,kind").eq("date", today).in("user_id", ids),
  ]);
  const lastType = new Map<string, string>();
  for (const l of logs) lastType.set(String(l.userId), String(l.type));
  const nameOf = new Map((users ?? []).map((u) => [u.source_id, String(u.name)]));
  const tgOf = new Map((links ?? []).filter((l) => l.is_active !== false).map((l) => [l.employee_user_id, Number(l.telegram_user_id)]));
  const sent = new Set((done ?? []).map((d) => `${d.user_id}:${d.kind}`));

  type Due = { userId: string; name: string; kind: "in" | "out" | "close"; shift: string; time: string; minsLeft: number; tg?: number };
  const due: Due[] = [];
  for (const r of rows) {
    const start = toMin(r.start_time), end = r.end_time ? toMin(r.end_time) : null;
    const last = lastType.get(r.user_id);
    const toStart = start - nowMin;
    if (toStart > 0 && toStart <= lead && last !== "check_in" && !sent.has(`${r.user_id}:in`)) {
      due.push({ userId: r.user_id, name: nameOf.get(r.user_id) ?? "Karyawan", kind: "in", shift: r.shift_name, time: hhmm(r.start_time), minsLeft: Math.ceil(toStart), tg: tgOf.get(r.user_id) });
    }
    if (end !== null && end > start) {
      const toEnd = end - nowMin;
      if (toEnd > 0 && toEnd <= lead && last === "check_in" && !sent.has(`${r.user_id}:out`)) {
        due.push({ userId: r.user_id, name: nameOf.get(r.user_id) ?? "Karyawan", kind: "out", shift: r.shift_name, time: hhmm(r.end_time), minsLeft: Math.ceil(toEnd), tg: tgOf.get(r.user_id) });
      }
    }
  }
  // Penutupan: menjelang shift terakhir hari ini selesai, ingatkan SEMUA yang masih tercatat masuk
  // (termasuk tanpa jadwal atau shift-nya sudah lewat). Satu kali per orang per hari.
  const ends = rows.map((r) => (r.end_time ? toMin(r.end_time) : null)).filter((e): e is number => e !== null);
  const closeEnd = ends.length ? Math.max(...ends) : null;
  if (closeEnd !== null && closeEnd - nowMin > 0 && closeEnd - nowMin <= lead) {
    const active = new Map((users ?? []).map((u) => [u.source_id, u.is_active !== false]));
    const inDue = new Set(due.filter((d) => d.kind === "out").map((d) => d.userId));
    const closeTime = `${String(Math.floor(closeEnd / 60)).padStart(2, "0")}:${String(Math.floor(closeEnd % 60)).padStart(2, "0")}`;
    // Yang shift-nya memang berakhir saat penutupan sudah mendapat pengingat "out"; jangan diingatkan dua kali.
    const endOf = new Map<string, number>();
    for (const r of rows) if (r.end_time) endOf.set(r.user_id, Math.max(endOf.get(r.user_id) ?? 0, toMin(r.end_time)));
    for (const [userId, last] of lastType) {
      if (last !== "check_in" || inDue.has(userId) || sent.has(`${userId}:close`) || active.get(userId) === false) continue;
      if (sent.has(`${userId}:out`) && endOf.get(userId) === closeEnd) continue;
      due.push({ userId, name: nameOf.get(userId) ?? "Karyawan", kind: "close", shift: "Penutupan", time: closeTime, minsLeft: Math.ceil(closeEnd - nowMin), tg: tgOf.get(userId) });
    }
  }
  if (!due.length) return json({ due: 0 });

  const dmText = (d: Due) => d.kind === "close"
    ? `⏰ Halo ${d.name.split(" ")[0]}, kamu masih tercatat masuk. Toko tutup ${d.minsLeft} menit lagi (${d.time} WIB).\n\nJangan lupa absen keluar lewat aplikasi Karyawan:\n1️⃣ Buka ${APP_URL}\n2️⃣ Ketuk tombol merah di tengah bawah\n3️⃣ Isi closing, lalu verifikasi wajah atau PIN`
    : d.kind === "in"
    ? `⏰ Halo ${d.name.split(" ")[0]}, shift ${d.shift} mulai ${d.minsLeft} menit lagi (${d.time} WIB).\n\nAbsen masuk lewat aplikasi Karyawan:\n1️⃣ Buka ${APP_URL}\n2️⃣ Ketuk tombol hijau di tengah bawah\n3️⃣ Pastikan di area toko, verifikasi wajah atau PIN\n\nAbsen lewat bot ini sudah tidak bisa.`
    : `⏰ Halo ${d.name.split(" ")[0]}, shift ${d.shift} berakhir ${d.minsLeft} menit lagi (${d.time} WIB).\n\nSiapkan closing shift lalu absen keluar lewat aplikasi Karyawan:\n1️⃣ Buka ${APP_URL}\n2️⃣ Ketuk tombol merah di tengah bawah\n3️⃣ Isi closing, lalu verifikasi wajah atau PIN`;
  const button = { inline_keyboard: [[{ text: "📱 Buka Aplikasi Karyawan", url: APP_URL }]] };

  // Grup: satu pesan per jenis, dikelompokkan per jam.
  const groupLines = (kind: "in" | "out") => {
    const items = due.filter((d) => (kind === "out" ? d.kind === "out" || d.kind === "close" : d.kind === kind));
    if (!items.length) return null;
    const byTime = new Map<string, Due[]>();
    for (const d of items) { const key = d.kind === "close" ? `Masih tercatat masuk · tutup ${d.time}` : `${d.shift} ${d.time}`; byTime.set(key, [...(byTime.get(key) ?? []), d]); }
    const head = kind === "in" ? `⏰ Pengingat Absen Masuk — ${today.slice(8)}/${today.slice(5, 7)}` : `⏰ Pengingat Absen Keluar — ${today.slice(8)}/${today.slice(5, 7)}`;
    const body = [...byTime.entries()].map(([k, list]) => `${kind === "in" ? "🚶‍➡️" : "📤"} ${k} (${list[0].minsLeft} menit lagi)\n${list.map((d) => `   • ${d.name}`).join("\n")}`).join("\n");
    return `${head}\n${body}\n\n${kind === "in" ? "Belum absen masuk? Lakukan sekarang" : "Siapkan closing shift dan absen keluar"} lewat ${APP_URL}`;
  };

  if (dry) return json({ dryRun: true, at: new Date(nowMs).toISOString(), due: due.map((d) => ({ name: d.name, kind: d.kind, shift: d.shift, time: d.time, minsLeft: d.minsLeft, dm: !!d.tg })), group: { in: groupLines("in"), out: groupLines("out") }, sampleDm: due[0] ? dmText(due[0]) : null });

  // Catat dulu (anti-ganda lintas menit), lalu kirim.
  const claim = await pos.from("attendance_reminder_log").upsert(due.map((d) => ({ user_id: d.userId, date: today, kind: d.kind, shift_name: d.shift })), { onConflict: "user_id,date,kind", ignoreDuplicates: true }).select("user_id,kind");
  const fresh = new Set((claim.data ?? []).map((c) => `${c.user_id}:${c.kind}`));
  const mine = due.filter((d) => fresh.has(`${d.userId}:${d.kind}`));
  if (!mine.length || !botToken) return json({ due: due.length, sent: 0 });
  due.length = 0; due.push(...mine);

  let groupSent = false, dmCount = 0;
  for (const kind of ["in", "out"] as const) {
    const text = groupLines(kind);
    if (text && groupId) { const ok = await tg(botToken, "sendMessage", { chat_id: groupId, text, disable_web_page_preview: true }); groupSent ||= ok; }
  }
  for (const d of mine) {
    let dm = false;
    if (d.tg) { dm = await tg(botToken, "sendMessage", { chat_id: d.tg, text: dmText(d), reply_markup: button, disable_web_page_preview: true }); if (dm) dmCount++; }
    await pos.from("attendance_reminder_log").update({ sent_group: groupSent, sent_dm: dm }).eq("user_id", d.userId).eq("date", today).eq("kind", d.kind);
  }
  return json({ due: mine.length, groupSent, dmSent: dmCount, withoutTelegram: mine.filter((d) => !d.tg).length });
});
