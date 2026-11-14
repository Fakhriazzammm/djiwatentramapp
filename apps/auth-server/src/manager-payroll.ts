import type { Hono } from "hono";
import type { Pool } from "pg";
import type { auth as defaultAuth } from "./auth.js";
import { createGuards, json, text } from "./manager-guards.js";
import { WIB } from "./manager-data.js";

/**
 * Live payroll for ALL active staff (not only those who already have a payroll_run_item).
 * Rules come from pos.payroll_role_rules (+ per-user overrides); attendance from pos_attendance_logs;
 * bonus tiers from rule.bonus_target_config against pos.financial_targets and real daily sales.
 * Slips are written to the same pos.payroll_* / pos.payslips tables Admin and Karyawan already read.
 */
type Auth = typeof defaultAuth;
const KINDS = new Set(["bonus", "lembur", "denda", "potongan"]);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function monthRange(period: string) {
  const [y, mo] = period.split("-").map(Number);
  const start = Date.UTC(y, mo - 1, 1) - WIB;
  const end = Date.UTC(y, mo, 1) - WIB;
  return { start, end, days: new Date(Date.UTC(y, mo, 0)).getUTCDate(), y, mo };
}
const dayKey = (ms: number) => new Date(ms + WIB).toISOString().slice(0, 10);
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function computePayroll(pool: Pool, period: string) {
  const q = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => (await pool.query(sql, params)).rows as T[];
  {
    const { start, end, days } = monthRange(period);
    const now = Date.now();
    const [staff, overrides, logs, sales, target, adj, slips, policyRow] = await Promise.all([
      q<Record<string, unknown>>(`SELECT * FROM pos.pos_payroll_staff_active_view ORDER BY role_name, user_name`),
      q<Record<string, unknown>>(`SELECT DISTINCT ON (user_id) * FROM pos.payroll_user_overrides WHERE effective_from <= $1::date AND (effective_to IS NULL OR effective_to >= $1::date) ORDER BY user_id, effective_from DESC`, [`${period}-01`]),
      q<{ userId: string; type: string; ts: string }>(`SELECT "userId", type, "timestamp"::text AS ts FROM public.pos_attendance_logs WHERE "timestamp" >= $1 AND "timestamp" < $2 ORDER BY "userId", "timestamp"`, [start - 86_400_000, end]),
      q<{ d: string; revenue: string }>(`SELECT to_char(to_timestamp(created_at / 1000.0) AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD') AS d, COALESCE(sum(total_amount),0)::text AS revenue FROM pos.orders WHERE status IN ('paid','completed') AND created_at >= $1 AND created_at < $2 GROUP BY 1`, [start, end]),
      q<{ target_revenue: string }>(`SELECT target_revenue::text FROM pos.financial_targets WHERE month = $1 ORDER BY updated_at DESC NULLS LAST LIMIT 1`, [period]),
      q<{ id: string; user_id: string; kind: string; amount: string; note: string | null; created_by_name: string | null; created_at: string }>(`SELECT id, user_id, kind, amount::text, note, created_by_name, created_at FROM public.mgr_payroll_adjustments WHERE period = $1 ORDER BY created_at`, [period]),
      q<{ user_id: string; status: string; id: string; sent_at: string | null }>(
        `SELECT s.user_id, s.status, s.id, s.sent_at FROM pos.payslips s JOIN pos.payroll_run_items i ON i.id = s.payroll_run_item_id JOIN pos.payroll_runs r ON r.id = i.payroll_run_id JOIN pos.payroll_periods p ON p.id = r.payroll_period_id
          WHERE p.start_date = $1::date`, [`${period}-01`]),
      q<{ value: Record<string, unknown> }>(`SELECT value FROM public.mgr_settings WHERE key = 'payroll_policy'`),
    ]);
    const policy = { stdHours: 8, adjustmentLimit: 500000, ...(policyRow[0]?.value ?? {}) } as { stdHours: number; adjustmentLimit: number };
    const monthTarget = num(target[0]?.target_revenue);
    const dailyTarget = monthTarget > 0 ? monthTarget / days : 0;
    const dayRevenue = new Map(sales.map((s) => [s.d, num(s.revenue)]));
    const monthRevenue = [...dayRevenue.values()].reduce((a, b) => a + b, 0);
    const byUser = new Map<string, { type: string; ts: number }[]>();
    for (const l of logs) (byUser.get(l.userId) ?? byUser.set(l.userId, []).get(l.userId)!).push({ type: l.type, ts: Number(l.ts) });

    const tier = (cfg: unknown, pct: number) => {
      const tiers = ((cfg as { tiers?: { thresholdPct: number; bonusAmount: number }[] } | null)?.tiers ?? []).slice().sort((a, b) => a.thresholdPct - b.thresholdPct);
      let amount = 0;
      for (const t of tiers) if (pct >= t.thresholdPct) amount = num(t.bonusAmount);
      return amount;
    };

    const rows = staff.map((s) => {
      const id = String(s.user_id);
      const ov = overrides.find((o) => o.user_id === id) ?? {};
      const rate = (k: string) => (ov[k] !== null && ov[k] !== undefined ? num(ov[k]) : num(s[k]));
      const events = (byUser.get(id) ?? []).filter((e) => e.ts >= start - 86_400_000);
      let shifts = 0, hours = 0, otHours = 0;
      const workDays = new Set<string>();
      const hoursPerDay = new Map<string, number>();
      for (let i = 0; i < events.length; i++) {
        if (events[i].type !== "check_in" || events[i].ts < start || events[i].ts >= end) continue;
        shifts++;
        const k = dayKey(events[i].ts);
        workDays.add(k);
        const out = events.slice(i + 1).find((e) => e.type === "check_out");
        const stop = out && out.ts - events[i].ts < 20 * 3_600_000 ? out.ts : Math.min(now, events[i].ts + 12 * 3_600_000);
        const h = Math.max(0, (stop - events[i].ts) / 3_600_000);
        hours += h;
        hoursPerDay.set(k, (hoursPerDay.get(k) ?? 0) + h);
      }
      for (const h of hoursPerDay.values()) otHours += Math.max(0, h - policy.stdHours);
      const cfg = s.bonus_target_config as { basis?: string } | null;
      let bonusAuto = 0;
      if (cfg && Object.keys(cfg).length > 0 && dailyTarget > 0) {
        if (cfg.basis === "monthly") bonusAuto = tier(cfg, (monthRevenue / monthTarget) * 100);
        else for (const k of workDays) bonusAuto += tier(cfg, ((dayRevenue.get(k) ?? 0) / dailyTarget) * 100);
      }
      const base = { fixed: rate("monthly_fixed_salary"), shift: shifts * rate("base_shift_rate"), hourly: hours * rate("base_hourly_rate"), allowance: workDays.size * rate("daily_allowance"), overtime: otHours * rate("overtime_rate_per_hour") };
      const mine = adj.filter((a) => a.user_id === id);
      const sumKind = (k: string) => mine.filter((a) => a.kind === k).reduce((a, b) => a + num(b.amount), 0);
      const bonus = bonusAuto + num(ov.bonus_override) + sumKind("bonus");
      const overtime = base.overtime + sumKind("lembur");
      const deductions = sumKind("denda") + sumKind("potongan");
      const gross = base.fixed + base.shift + base.hourly + base.allowance + overtime + bonus;
      const slip = slips.find((x) => x.user_id === id);
      return {
        userId: id, name: s.user_name, role: s.role_name, shifts, days: workDays.size, hours: +hours.toFixed(2), overtimeHours: +otHours.toFixed(2),
        fixed: base.fixed, shiftPay: base.shift, hourlyPay: base.hourly, allowance: base.allowance, overtime, bonus, bonusAuto, deductions, gross, net: gross - deductions,
        adjustments: mine.map((a) => ({ id: a.id, kind: a.kind, amount: num(a.amount), note: a.note, by: a.created_by_name, at: a.created_at })),
        slip: slip ? { id: slip.id, status: slip.status, sentAt: slip.sent_at } : null,
        rules: { shiftRate: rate("base_shift_rate"), allowance: rate("daily_allowance"), fixed: rate("monthly_fixed_salary"), overtimeRate: rate("overtime_rate_per_hour"), basis: cfg?.basis ?? null },
        live: events.some((e) => e.type === "check_in" && e.ts >= start) && !events.slice().reverse().find((e) => e.type === "check_out" && e.ts > (events.slice().reverse().find((e2) => e2.type === "check_in")?.ts ?? 0)),
      };
    });
    return { rows, policy, monthTarget, monthRevenue, dailyTarget };
  }
}

export function registerManagerPayroll(app: Hono, auth: Auth, pool: Pool) {
  const { member } = createGuards(auth, pool);
  const q = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => (await pool.query(sql, params)).rows as T[];
  const compute = (period: string) => computePayroll(pool, period);

  app.get("/api/manager/payroll", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    if (m.role !== "manager") return json({ success: false, error: "FORBIDDEN" }, 403);
    const period = text(c.req.query("period"), 7) || dayKey(Date.now()).slice(0, 7);
    if (!PERIOD_RE.test(period)) return json({ success: false, error: "PERIOD_INVALID" }, 400);
    return json({ success: true, period, ...(await compute(period)) });
  });

  app.post("/api/manager/payroll/adjustments", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    if (m.role !== "manager") return json({ success: false, error: "FORBIDDEN" }, 403);
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const userId = text(b.userId, 80), period = text(b.period, 7), kind = text(b.kind, 12), amount = Math.round(num(b.amount));
    if (!userId || !PERIOD_RE.test(period) || !KINDS.has(kind) || amount <= 0) return json({ success: false, error: "INPUT_INVALID" }, 400);
    const pol = (await q<{ value: { adjustmentLimit?: number } }>(`SELECT value FROM public.mgr_settings WHERE key = 'payroll_policy'`))[0]?.value ?? {};
    if (amount > num(pol.adjustmentLimit ?? 500000)) return json({ success: false, error: "ABOVE_LIMIT", limit: num(pol.adjustmentLimit ?? 500000) }, 422);
    const slip = await q(`SELECT 1 FROM pos.payslips s JOIN pos.payroll_run_items i ON i.id = s.payroll_run_item_id JOIN pos.payroll_runs r ON r.id = i.payroll_run_id JOIN pos.payroll_periods p ON p.id = r.payroll_period_id WHERE p.start_date = $1::date AND s.user_id = $2 AND s.status <> 'generated'`, [`${period}-01`, userId]);
    if (slip.length) return json({ success: false, error: "SLIP_SENT" }, 409);
    const r = await pool.query(`INSERT INTO public.mgr_payroll_adjustments (user_id, period, kind, amount, note, created_by, created_by_name) VALUES ($1,$2,$3,$4,NULLIF($5,''),$6,$7) RETURNING id`, [userId, period, kind, amount, text(b.note, 300), m.userId, m.name]);
    return json({ success: true, id: r.rows[0].id }, 201);
  });

  app.delete("/api/manager/payroll/adjustments/:id", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    if (m.role !== "manager") return json({ success: false, error: "FORBIDDEN" }, 403);
    const r = await pool.query(`DELETE FROM public.mgr_payroll_adjustments WHERE id = $1::uuid RETURNING id`, [c.req.param("id")]);
    return json({ success: !!r.rows[0] }, r.rows[0] ? 200 : 404);
  });

  // Create (status generated) or send the slip. Writes the same rows Admin/Karyawan read.
  app.post("/api/manager/payroll/slips", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    if (m.role !== "manager") return json({ success: false, error: "FORBIDDEN" }, 403);
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const userId = text(b.userId, 80), period = text(b.period, 7), action = text(b.action, 8);
    if (!userId || !PERIOD_RE.test(period) || !["create", "send"].includes(action)) return json({ success: false, error: "INPUT_INVALID" }, 400);
    const { rows } = await compute(period);
    const row = rows.find((r) => r.userId === userId);
    if (!row) return json({ success: false, error: "NOT_FOUND" }, 404);
    if (row.slip && row.slip.status !== "generated") return json({ success: false, error: "SLIP_LOCKED" }, 409);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const name = `(SELECT trim(to_char($1::date,'FMMonth')) || ' ' || to_char($1::date,'YYYY'))`;
      const { end } = monthRange(period);
      const pid = (await client.query(
        `INSERT INTO pos.payroll_periods (period_name, start_date, end_date, status) VALUES (${name}, $1::date, ($1::date + interval '1 month' - interval '1 day')::date, 'open')
         ON CONFLICT (period_name) DO UPDATE SET updated_at = now() RETURNING id`, [`${period}-01`])).rows[0].id as string;
      void end;
      let run = (await client.query(`SELECT id FROM pos.payroll_runs WHERE payroll_period_id = $1 ORDER BY run_date DESC LIMIT 1`, [pid])).rows[0];
      if (!run) run = (await client.query(`INSERT INTO pos.payroll_runs (payroll_period_id, status, created_by) VALUES ($1,'processing',$2) RETURNING id`, [pid, m.userId])).rows[0];
      const item = (await client.query(
        `INSERT INTO pos.payroll_run_items (payroll_run_id, user_id, user_name, role_name, total_shifts, total_hours, overtime_hours, attendance_days, shift_pay, hourly_pay, fixed_salary, daily_allowance_total, overtime_pay, bonus_pay, gross_pay, deductions, net_pay, compensation_breakdown)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb)
         ON CONFLICT (payroll_run_id, user_id) DO UPDATE SET user_name = EXCLUDED.user_name, role_name = EXCLUDED.role_name, total_shifts = EXCLUDED.total_shifts, total_hours = EXCLUDED.total_hours, overtime_hours = EXCLUDED.overtime_hours,
           attendance_days = EXCLUDED.attendance_days, shift_pay = EXCLUDED.shift_pay, hourly_pay = EXCLUDED.hourly_pay, fixed_salary = EXCLUDED.fixed_salary, daily_allowance_total = EXCLUDED.daily_allowance_total,
           overtime_pay = EXCLUDED.overtime_pay, bonus_pay = EXCLUDED.bonus_pay, gross_pay = EXCLUDED.gross_pay, deductions = EXCLUDED.deductions, net_pay = EXCLUDED.net_pay, compensation_breakdown = EXCLUDED.compensation_breakdown
         RETURNING id`,
        [run.id, userId, row.name, row.role, row.shifts, row.hours, row.overtimeHours, row.days, row.shiftPay, row.hourlyPay, row.fixed, row.allowance, row.overtime, row.bonus, row.gross, row.deductions, row.net,
         JSON.stringify({ source: "manager-app", bonusAuto: row.bonusAuto, adjustments: row.adjustments, rules: row.rules })])).rows[0];
      const status = action === "send" ? "sent" : "generated";
      await client.query(
        `INSERT INTO pos.payslips (payroll_run_item_id, user_id, user_name, period_name, period_start, period_end, gross_pay, deductions, net_pay, breakdown, status, sent_at)
         VALUES ($1,$2,$3,${name},$4::date,($4::date + interval '1 month' - interval '1 day')::date,$5,$6,$7,$8::jsonb,$9, CASE WHEN $9 = 'sent' THEN now() END)
         ON CONFLICT (payroll_run_item_id) DO UPDATE SET gross_pay = EXCLUDED.gross_pay, deductions = EXCLUDED.deductions, net_pay = EXCLUDED.net_pay, breakdown = EXCLUDED.breakdown, status = EXCLUDED.status, sent_at = COALESCE(EXCLUDED.sent_at, pos.payslips.sent_at)`,
        [item.id, userId, row.name, `${period}-01`, row.gross, row.deductions, row.net, JSON.stringify({ source: "manager-app", adjustments: row.adjustments }), status]);
      await client.query(`INSERT INTO pos.payroll_audit_logs (action, entity_type, entity_id, actor_id, actor_name, description) VALUES ($1,'payslip',$2,$3,$4,$5)`, [action === "send" ? "slip_sent" : "slip_generated", item.id, m.userId, m.name, `Slip ${row.name} ${period} via aplikasi Manager`]);
      await client.query("COMMIT");
      return json({ success: true, status });
    } catch (e) {
      await client.query("ROLLBACK");
      return json({ success: false, error: "SLIP_FAILED", message: e instanceof Error ? e.message : "" }, 500);
    } finally { client.release(); }
  });
}
