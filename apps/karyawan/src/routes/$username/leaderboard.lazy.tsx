import { useState, useMemo, useEffect, useCallback } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { createClient } from "@djiwaapps/web-shared/lib/client";
import { DsAvatar, DsEmpty, DsGroup, DsIconButton, DsPageTitle, DsPills, DsRow, ds3d } from "@djiwaapps/web-shared/components/ds";
import { Skeleton } from "@djiwaapps/web-shared";
import { useStaffProfile } from "../$username.lazy";

// ── Inline formatter ──────────────────────────────────────────────────

function fmtIDR(amount: number, short = false): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: short ? 0 : 0,
    maximumFractionDigits: short ? 0 : 0,
  }).format(amount);
}

// ── Types ─────────────────────────────────────────────────────────────

type BonusEntry = {
  name: string;
  roleName: string;
  totalBonus: number;
  shiftCount: number;
  bonusHistory: { shiftName: string; bonus: number; date: string }[];
};

type ShiftRow = {
  source_id: string;
  shift_name: string;
  cashier_name: string;
  team_members: string;
  start_time: number;
  end_time: number | null;
  raw: any;
};

type StaffRow = { _id: string; name: string; roleName?: string | null; isActive?: boolean };
type PayrollBonusRow = { user_id: string; user_name: string; role_name?: string | null; bonus_pay?: number | null; created_at: string; payroll_run_id?: string; payroll_period_id?: string };
type PayrollPeriodRow = { id: string; period_name: string; start_date: string | null; end_date: string | null; status?: string | null };

// ── Helpers ───────────────────────────────────────────────────────────

function isInMonth(ts: number, monthKey: string): boolean {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === monthKey;
}

function parseMemberBonuses(raw: any): BonusEntry[] {
  if (!raw) return [];
  let memberBonuses: any[] = [];
  if (typeof raw.memberBonuses === "string") {
    try { memberBonuses = JSON.parse(raw.memberBonuses); } catch { /* */ }
  } else if (Array.isArray(raw.memberBonuses)) {
    memberBonuses = raw.memberBonuses;
  }
  return memberBonuses.map((mb: any) => ({
    name: mb.name ?? "—",
    roleName: mb.roleName ?? "—",
    totalBonus: mb.bonus ?? 0,
    shiftCount: 1,
    bonusHistory: [{ shiftName: mb.shiftName ?? "Shift", bonus: mb.bonus ?? 0, date: "" }],
  }));
}

function aggregateBonuses(shifts: ShiftRow[], monthKey: string): BonusEntry[] {
  const memberMap = new Map<string, BonusEntry>();

  for (const shift of shifts) {
    if (!shift.start_time || !isInMonth(shift.start_time, monthKey)) continue;
    if (!shift.end_time) continue; // only completed shifts

    const bonuses = parseMemberBonuses(shift.raw);
    for (const b of bonuses) {
      if (b.totalBonus <= 0) continue;

      const existing = memberMap.get(b.name) ?? {
        name: b.name,
        roleName: b.roleName,
        totalBonus: 0,
        shiftCount: 0,
        bonusHistory: [],
      };

      existing.totalBonus += b.totalBonus;
      existing.shiftCount += 1;
      existing.bonusHistory.push({
        shiftName: shift.shift_name ?? "Shift",
        bonus: b.totalBonus,
        date: new Date(shift.start_time).toLocaleDateString("id-ID", {
          day: "numeric", month: "short",
        }),
      });

      // Ambil roleName dari bonus jika belum ada
      if (existing.roleName === "—" && b.roleName !== "—") {
        existing.roleName = b.roleName;
      }

      memberMap.set(b.name, existing);
    }
  }

  return [...memberMap.values()]
    .sort((a, b) => b.totalBonus - a.totalBonus);
}

// ── Page Component ────────────────────────────────────────────────────

export const Route = createLazyFileRoute("/$username/leaderboard")({
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const navigate = useNavigate();
  const { staff, username } = useStaffProfile();
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [staffRows, setStaffRows] = useState<StaffRow[]>([]);
  const [payrollBonusRows, setPayrollBonusRows] = useState<PayrollBonusRow[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriodRow[]>([]);
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const startTs = monthStart.getTime();

        const nextMonthStart = new Date(monthStart);
        nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);
        const [shiftResult, staffResult, payrollResult, runResult, periodResult] = await Promise.all([
          supabase
            .schema("pos")
            .from("shifts")
            .select("source_id,shift_name,cashier_name,team_members,start_time,end_time,raw")
            .not("start_time", "is", null)
            .not("end_time", "is", null)
            .order("start_time", { ascending: false })
            .limit(1000),
          supabase
            .from("pos_users_public")
            .select("_id,name,roleName,isActive")
            .eq("isActive", true)
            .order("name", { ascending: true }),
          supabase
            .from("pos_payroll_run_items")
            .select("user_id,user_name,role_name,bonus_pay,created_at,payroll_run_id")
            .order("created_at", { ascending: false })
            .limit(2000),
          supabase
            .from("pos_payroll_runs")
            .select("id,payroll_period_id,created_at")
            .order("created_at", { ascending: false }),
          supabase
            .from("pos_payroll_periods")
            .select("id,period_name,start_date,end_date,status")
            .order("start_date", { ascending: true }),
        ]);
        if (shiftResult.error) throw shiftResult.error;
        if (staffResult.error) throw staffResult.error;
        if (payrollResult.error) throw payrollResult.error;
        if (runResult.error) throw runResult.error;
        if (periodResult.error) throw periodResult.error;
        if (!cancelled) {
          const runToPeriod = new Map((runResult.data ?? []).map((run: any) => [run.id, run.payroll_period_id]));
          setShifts((shiftResult.data ?? []) as ShiftRow[]);
          setStaffRows((staffResult.data ?? []) as StaffRow[]);
          setPayrollPeriods((periodResult.data ?? []) as PayrollPeriodRow[]);
          setPayrollBonusRows((payrollResult.data ?? []).map((row: any) => ({ ...row, payroll_period_id: runToPeriod.get(row.payroll_run_id) })) as PayrollBonusRow[]);
        }
      } catch (e) {
        console.error("[leaderboard] fetch error", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const leaderboard = useMemo(() => {
    const shiftBonuses = aggregateBonuses(shifts, selectedMonth);
    const byName = new Map(shiftBonuses.map((entry) => [entry.name.trim().toLowerCase(), entry]));
    const selectedPeriodIds = new Set(payrollPeriods.filter((period) => period.start_date?.startsWith(selectedMonth)).map((period) => period.id));
    const latestPayroll = new Map<string, PayrollBonusRow>();
    for (const row of payrollBonusRows) {
      if (!row.payroll_period_id || !selectedPeriodIds.has(row.payroll_period_id)) continue;
      const key = String(row.user_id || row.user_name || "").trim().toLowerCase();
      if (key && !latestPayroll.has(key)) latestPayroll.set(key, row);
    }
    const allEntries = staffRows.map((staffRow) => {
      const key = String(staffRow._id || "").trim().toLowerCase();
      const nameKey = staffRow.name.trim().toLowerCase();
      const shiftEntry = byName.get(nameKey);
      const payrollEntry = latestPayroll.get(key) ?? latestPayroll.get(nameKey);
      const payrollBonus = Number(payrollEntry?.bonus_pay ?? 0);
      return {
        name: staffRow.name,
        roleName: staffRow.roleName || payrollEntry?.role_name || shiftEntry?.roleName || "—",
        totalBonus: payrollBonus > 0 ? payrollBonus : (shiftEntry?.totalBonus ?? 0),
        shiftCount: Number((payrollEntry as any)?.total_shifts ?? shiftEntry?.shiftCount ?? 0),
        bonusHistory: shiftEntry?.bonusHistory ?? [],
      } satisfies BonusEntry;
    });
    return allEntries.sort((a, b) => b.totalBonus - a.totalBonus || a.name.localeCompare(b.name));
  }, [payrollBonusRows, payrollPeriods, selectedMonth, shifts, staffRows]);
  const maxBonus = leaderboard.length > 0 ? leaderboard[0].totalBonus : 0;
  const currentUserName = staff?.name ?? "";

  const top3 = leaderboard.slice(0, 3);

  const currentUserRank = leaderboard.findIndex((e) => e.name === currentUserName);
  const currentUserEntry = currentUserRank >= 0 ? leaderboard[currentUserRank] : null;

  const fmt = (n: number) => `${Math.round(n / 1000).toLocaleString("id-ID")}rb`;
  const months = Array.from({ length: 4 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - i); return d.toISOString().slice(0, 7); });
  const order = [1, 0, 2]; // podium: peringkat 2 kiri, 1 tengah, 3 kanan
  const heights = [58, 46, 36];
  return (
    <div>
      <DsPageTitle left={<DsIconButton aria-label="Kembali" onClick={() => navigate({ to: "/$username/beranda" as any, params: { username } })}>‹</DsIconButton>}>Peringkat</DsPageTitle>
      <DsPills items={months.map((m): [string, string] => [m, new Date(`${m}-01T00:00:00`).toLocaleDateString("id-ID", { month: "short", year: "numeric" })])} value={selectedMonth} onChange={setSelectedMonth} />
      {loading ? (
        <div className="space-y-2" role="status" aria-label="Memuat peringkat"><Skeleton className="h-40 rounded-3xl" /><Skeleton className="h-14 rounded-3xl" /></div>
      ) : leaderboard.length === 0 || maxBonus <= 0 ? (
        <DsEmpty icon={ds3d("employee-leaderboard")}>Belum ada bonus tercapai bulan ini.</DsEmpty>
      ) : (
        <>
          <DsGroup>
            <div className="kx-podium">
              {order.map((r) => top3[r] && (
                <div key={r} className="kx-pod" data-me={top3[r].name === currentUserName ? "" : undefined}>
                  <DsAvatar name={top3[r].name} size={44} />
                  <b>{top3[r].name.split(" ")[0]}</b>
                  <span>{fmt(top3[r].totalBonus)}</span>
                  <div style={{ height: heights[r] }}>{r + 1}</div>
                </div>
              ))}
            </div>
          </DsGroup>
          {leaderboard.length > 3 && (
            <DsGroup>
              {leaderboard.slice(3, 10).map((e, i) => (
                <DsRow key={e.name} icon={<span className="kx-rank">{i + 4}</span>} title={e.name} sub={e.roleName !== "—" ? e.roleName : undefined} trail={e.totalBonus > 0 ? fmt(e.totalBonus) : "—"} />
              ))}
            </DsGroup>
          )}
          {currentUserEntry && currentUserRank >= 3 && (
            <div className="ds-group" style={{ background: "var(--ds-blue-soft)" }}>
              <DsRow icon={<span className="kx-rank" style={{ color: "var(--ds-blue)" }}>{currentUserRank + 1}</span>} title={`Kamu · ${currentUserEntry.name.split(" ")[0]}`} sub={`${currentUserEntry.shiftCount} shift`} trail={fmt(currentUserEntry.totalBonus)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
