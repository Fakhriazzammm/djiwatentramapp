import type { Pool } from "pg";

/** Real-time operational snapshot, read from the same functions/tables admin & pos use. */
export const WIB = 7 * 3600_000;
export function wibDay(offsetDays = 0, now = Date.now()) {
  const start = Math.floor((now + WIB) / 86_400_000) * 86_400_000 - WIB + offsetDays * 86_400_000;
  return { start, end: start + 86_400_000, date: new Date(start + WIB).toISOString().slice(0, 10) };
}

export type Snapshot = Awaited<ReturnType<typeof loadSnapshot>>;

export async function loadSnapshot(pool: Pool, now = Date.now()) {
  const today = wibDay(0, now);
  const yday = wibDay(-1, now);
  const week = wibDay(-6, now);
  const q = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    try { return (await pool.query(sql, params)).rows as T[]; } catch { return []; }
  };
  const [sales, cash, cashWeek, attendance, stock, queue, leaves, expensePending, channels, methods] = await Promise.all([
    q<{ r: unknown }>(`SELECT public.admin_sales_summary($1::jsonb) AS r`, [JSON.stringify([
      { key: "today", start_ms: today.start, end_ms: today.end },
      { key: "yesterday", start_ms: yday.start, end_ms: yday.end },
      { key: "week", start_ms: week.start, end_ms: today.end },
    ])]),
    q<{ r: unknown }>(`SELECT public.admin_cashflow_summary($1,$2) AS r`, [today.start, today.end]),
    q<{ r: unknown }>(`SELECT public.admin_cashflow_summary($1,$2) AS r`, [week.start, today.end]),
    q<{ r: unknown }>(`SELECT public.admin_attendance_today($1,$2) AS r`, [today.start, today.end]),
    q<{ name: string; unit: string; quantity: string; threshold: string }>(
      `SELECT ingredient_name AS name, unit, quantity::text, low_stock_threshold::text AS threshold
         FROM pos.inventory WHERE low_stock_threshold > 0 AND quantity <= low_stock_threshold
        ORDER BY (quantity / NULLIF(low_stock_threshold,0)) LIMIT 12`),
    q<{ n: string }>(`SELECT count(*)::text AS n FROM pos.orders WHERE status = 'pending' AND created_at < $1`, [now - 15 * 60_000]),
    q<{ n: string }>(`SELECT count(*)::text AS n FROM public.attendance_leave_requests WHERE status = 'pending'`),
    q<{ n: string }>(`SELECT count(*)::text AS n FROM public.mgr_expense_drafts WHERE status = 'pending_approval'`),
    q<{ channel: string; orders: string; revenue: string }>(
      `SELECT public.admin_order_channel(o.order_channel, o.source, o.source_app, o.business_unit) AS channel,
              count(*)::text AS orders, COALESCE(sum(o.total_amount),0)::text AS revenue
         FROM pos.orders o WHERE o.status IN ('paid','completed') AND o.created_at >= $1 AND o.created_at < $2 GROUP BY 1 ORDER BY sum(o.total_amount) DESC`,
      [today.start, today.end]),
    q<{ method: string; orders: string; revenue: string }>(
      `SELECT COALESCE(NULLIF(o.payment_method,''),'unknown') AS method, count(*)::text AS orders, COALESCE(sum(o.total_amount),0)::text AS revenue
         FROM pos.orders o WHERE o.status IN ('paid','completed') AND o.created_at >= $1 AND o.created_at < $2 GROUP BY 1 ORDER BY sum(o.total_amount) DESC`,
      [today.start, today.end]),
  ]);
  const s = (sales[0]?.r ?? []) as { key: string; orders: number; revenue: number }[];
  const by = (k: string) => s.find((x) => x.key === k) ?? { orders: 0, revenue: 0 };
  const att = (attendance[0]?.r ?? { staff: [], total: 0, present: 0 }) as {
    total: number; present: number; activeCashierShift: { shiftName?: string; cashierName?: string } | null;
    staff: { userId: string; name: string; role: string; status: string }[];
  };
  return {
    asOf: new Date(now).toISOString(),
    date: today.date,
    sales: { today: by("today"), yesterday: by("yesterday"), week: by("week") },
    cash: (cash[0]?.r ?? { income: 0, expense: 0, net: 0 }) as { income: number; expense: number; net: number },
    cashWeek: (cashWeek[0]?.r ?? { income: 0, expense: 0, net: 0 }) as { income: number; expense: number; net: number },
    attendance: att,
    stockCritical: stock.map((x) => ({ name: x.name, unit: x.unit, quantity: Number(x.quantity), threshold: Number(x.threshold) })),
    pendingOverFifteen: Number(queue[0]?.n ?? 0),
    pendingLeaves: Number(leaves[0]?.n ?? 0),
    pendingExpenseApprovals: Number(expensePending[0]?.n ?? 0),
    channels: channels.map((x) => ({ channel: x.channel, orders: Number(x.orders), revenue: Number(x.revenue) })),
    methods: methods.map((x) => ({ method: x.method, orders: Number(x.orders), revenue: Number(x.revenue) })),
  };
}
