import type { Pool } from "pg";
import { loadSnapshot, wibDay, type Snapshot } from "./manager-data.js";

/**
 * AI daily plan. Facts come only from the database (deterministic signals, each with a source_ref);
 * the model may only reword/prioritise tasks built from those signals. It can never approve, pay,
 * send a PO or change finance. Without an AI key the deterministic text is used as is.
 */
type Draft = {
  role: "manager" | "supervisor";
  ref: string;
  title: string;
  detail: string;
  kind: "general" | "purchasing" | "ops" | "people" | "finance";
  priority: "low" | "normal" | "high";
  due?: string; // HH:MM WIB
};

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

export function buildSignals(snap: Snapshot, hourWib: number): Draft[] {
  const d: Draft[] = [];
  const nowHour = hourWib;
  // Routine (from Playbook): always present, one per day.
  d.push({ role: "manager", ref: "routine:buka-toko", title: "Cek toko siap buka", detail: "Tim hadir, shift dibuka dengan kas awal benar, stok & menu aman (Playbook → Buka Toko).", kind: "ops", priority: "normal", due: "09:30" });
  d.push({ role: "manager", ref: "routine:laporan-harian", title: "Tulis laporan harian untuk Owner", detail: "Gunakan templat Laporan Harian di tab Laporan. Kirim sebelum 22:30.", kind: "finance", priority: "normal", due: "22:30" });
  d.push({ role: "supervisor", ref: "routine:cek-stok", title: "Cek stok & rencana belanja hari ini", detail: "Lihat bahan menipis, siapkan PO bila perlu.", kind: "purchasing", priority: "normal", due: "11:00" });

  for (const it of snap.stockCritical.slice(0, 8)) {
    const empty = it.quantity <= 0;
    d.push({
      role: "supervisor", ref: `stock:${it.name.toLowerCase()}`,
      title: empty ? `Stok habis: ${it.name}` : `Stok menipis: ${it.name}`,
      detail: `Sisa ${it.quantity} ${it.unit} (batas ${it.threshold} ${it.unit}). Buat PO atau belanja.`,
      kind: "purchasing", priority: empty ? "high" : "normal",
    });
  }
  if (snap.stockCritical.length > 0) {
    d.push({ role: "manager", ref: "stock:ringkasan", title: `${snap.stockCritical.length} bahan di bawah batas minimum`, detail: "Pastikan Supervisor sudah membuat PO. Bahan habis memengaruhi menu.", kind: "ops", priority: snap.stockCritical.some((x) => x.quantity <= 0) ? "high" : "normal" });
  }
  if (snap.pendingOverFifteen > 0) {
    d.push({ role: "manager", ref: "queue:over15", title: `${snap.pendingOverFifteen} pesanan menunggu lebih dari 15 menit`, detail: "Cek dapur/bar dan percepat. Hubungi pelanggan bila perlu.", kind: "ops", priority: "high" });
  }
  if (nowHour >= 10) {
    const absent = snap.attendance.staff.filter((s) => s.status === "absent");
    if (absent.length > 0) {
      d.push({ role: "manager", ref: "clockin:absent", title: `${absent.length} karyawan belum clock-in`, detail: absent.slice(0, 8).map((s) => s.name).join(", ") + ". Hubungi langsung; catat alasan.", kind: "people", priority: "high" });
    }
  }
  if (snap.pendingLeaves > 0) {
    d.push({ role: "manager", ref: "leave:pending", title: `${snap.pendingLeaves} pengajuan izin/cuti menunggu`, detail: "Tinjau di Tim & Gaji / Admin lalu beri keputusan.", kind: "people", priority: "normal" });
  }
  if (snap.pendingExpenseApprovals > 0) {
    d.push({ role: "manager", ref: "expense:approval", title: `${snap.pendingExpenseApprovals} pengeluaran menunggu persetujuan`, detail: "Periksa dan teruskan keputusan ke Owner bila di atas batas.", kind: "finance", priority: "high" });
  }
  const y = snap.sales.yesterday.revenue;
  if (nowHour >= 14 && y > 0 && snap.sales.today.revenue < y * 0.5) {
    d.push({ role: "manager", ref: "sales:low", title: "Penjualan hari ini di bawah separuh kemarin", detail: `Hari ini ${rp(snap.sales.today.revenue)} vs kemarin ${rp(y)}. Cek promo, antrean dan ketersediaan menu.`, kind: "ops", priority: "normal" });
  }
  return d;
}

async function reword(drafts: Draft[], cfg: { model: string; fallbackModel?: string }): Promise<Draft[]> {
  const key = process.env.HELIPOD_AI_KEY?.trim();
  if (!key) return drafts;
  const base = (process.env.HELIPOD_AI_BASE_URL?.trim() || "https://ai.helipod.io/v1").replace(/\/$/, "");
  const allowed = new Map(drafts.map((x) => [`${x.role}|${x.ref}`, x]));
  const prompt = `Kamu asisten operasional kafe Djiwa Tentram. Tulis ulang judul dan detail tugas berikut agar singkat, jelas, bahasa Indonesia santai-profesional. JANGAN menambah/menghapus item, JANGAN mengubah angka, nama, atau ref. Balas JSON array [{role,ref,title,detail,priority}] saja.\n` + JSON.stringify(drafts.map(({ role, ref, title, detail, priority }) => ({ role, ref, title, detail, priority })));
  for (const model of [cfg.model, cfg.fallbackModel].filter(Boolean) as string[]) {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const content = ((await res.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
      const arr = JSON.parse(content.slice(content.indexOf("["), content.lastIndexOf("]") + 1)) as Partial<Draft>[];
      const out = new Map<string, Draft>();
      for (const a of arr) {
        const orig = allowed.get(`${a.role}|${a.ref}`); // server-side validation: only known refs
        if (!orig || typeof a.title !== "string" || typeof a.detail !== "string") continue;
        const keepNumbers = (orig.title + orig.detail).match(/\d+/g)?.every((n) => (a.title! + a.detail!).includes(n)) ?? true;
        if (!keepNumbers) continue;
        out.set(`${orig.role}|${orig.ref}`, { ...orig, title: a.title.slice(0, 200), detail: a.detail.slice(0, 600), priority: orig.priority });
      }
      return drafts.map((x) => out.get(`${x.role}|${x.ref}`) ?? x);
    } catch { /* try fallback */ }
  }
  return drafts;
}

export async function runDailyPlan(pool: Pool, now = Date.now()) {
  const cfgRow = await pool.query(`SELECT value FROM public.mgr_settings WHERE key = 'ai_config'`).catch(() => ({ rows: [] as { value: Record<string, unknown> }[] }));
  const cfg = (cfgRow.rows[0]?.value ?? {}) as { enabled?: boolean; model?: string; fallbackModel?: string };
  if (cfg.enabled === false) return { created: 0, disabled: true };
  const snap = await loadSnapshot(pool, now);
  const day = wibDay(0, now);
  const hour = new Date(now + 7 * 3600_000).getUTCHours();
  const drafts = await reword(buildSignals(snap, hour), { model: cfg.model || "qwen3.7-flash", fallbackModel: cfg.fallbackModel });
  let created = 0;
  for (const t of drafts) {
    const due = t.due ? new Date(`${day.date}T${t.due}:00+07:00`).toISOString() : null;
    const r = await pool.query(
      `INSERT INTO public.mgr_tasks (title, detail, source, source_ref, created_by, assignee_role, priority, kind, due_at, plan_date)
       VALUES ($1,$2,'ai',$3,'ai',$4,$5,$6,$7,$8)
       ON CONFLICT (assignee_role, plan_date, source_ref) WHERE source = 'ai' AND source_ref IS NOT NULL DO NOTHING`,
      [t.title, t.detail, t.ref, t.role, t.priority, t.kind, due, day.date],
    );
    created += r.rowCount ?? 0;
  }
  const closed = await reconcile(pool, snap, day.date);
  return { created, closed };
}

/** Auto-complete AI tasks whose condition no longer holds in the database. */
export async function reconcile(pool: Pool, snap: Snapshot, planDate: string) {
  const critical = new Set(snap.stockCritical.map((x) => `stock:${x.name.toLowerCase()}`));
  const absent = snap.attendance.staff.some((s) => s.status === "absent");
  const open = await pool.query<{ id: string; source_ref: string }>(
    `SELECT id, source_ref FROM public.mgr_tasks WHERE source = 'ai' AND status = 'open' AND plan_date = $1`, [planDate]);
  const done: string[] = [];
  for (const t of open.rows) {
    const r = t.source_ref;
    const resolved =
      (r.startsWith("stock:") && r !== "stock:ringkasan" && !critical.has(r)) ||
      (r === "stock:ringkasan" && critical.size === 0) ||
      (r === "queue:over15" && snap.pendingOverFifteen === 0) ||
      (r === "clockin:absent" && !absent) ||
      (r === "leave:pending" && snap.pendingLeaves === 0) ||
      (r === "expense:approval" && snap.pendingExpenseApprovals === 0);
    if (resolved) done.push(t.id);
  }
  if (done.length) await pool.query(`UPDATE public.mgr_tasks SET status = 'done', done_at = now(), done_by = 'auto', updated_at = now() WHERE id = ANY($1::uuid[])`, [done]);
  return done.length;
}

/** Hourly tick is enough for the daily plan; event signals run every 5 minutes (idempotent via unique index). */
export function startManagerAi(pool: Pool) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const hour = new Date(Date.now() + 7 * 3600_000).getUTCHours();
      if (hour >= 6) await runDailyPlan(pool);
    } catch (e) {
      console.error("manager-ai tick failed", e);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 20_000);
  return setInterval(tick, 5 * 60_000);
}
