// Real Postgres; its own rate code so the real BI-Rate rows are never touched. Skipped without DATABASE_URL.
import { afterAll, describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { poolTx } from "../db";
import { biRateView, runRatesDue, syncBiRate } from "./service";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const code = `itest_bi_${crypto.randomUUID().slice(0, 6)}`;
const pool = url ? new Pool({ connectionString: url, max: 2, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } }) : (null as unknown as Pool);
const db = pool ? poolTx(pool) : (null as never);
const series = (extra: [number, number][] = []) => [...extra, ...[[1792540800000, 5.75], [1790121600000, 5.75], [1787097600000, 5.75], [1784678400000, 5.75], [1781740800000, 5.75], [1780963200000, 5.5], [1779235200000, 5.25], [1776816000000, 4.75], [1773705600000, 4.75], [1771459200000, 4.75], [1768953600000, 4.75], [1765929600000, 4.75]]].map(([t, r]) => [t, r, `${r} %`]);
const page = (rows: unknown[]) => `<input id="HiddenFieldChartData" type="hidden" value="${JSON.stringify(rows).replace(/"/g, "&quot;")}"/>`;
const fake = (rows: unknown[]) => (async () => new Response(page(rows), { status: 200 })) as unknown as typeof fetch;

afterAll(async () => {
  if (!pool) return;
  await pool.query("delete from finance.market_prices where code=$1", [code]); await pool.query("delete from finance.rate_state where code=$1", [code]); await pool.end();
});

run("BI-Rate sync (real database, fake Bank Indonesia page)", () => {
  test("first look stores the history and is not announced as a change", async () => {
    const out = await syncBiRate({ db, f: fake(series()), code });
    expect(out).toMatchObject({ ok: true, changed: false, latest: { day: "2026-10-21", rate: 5.75 } });
    const v = await biRateView(db, new Date("2026-11-19T10:00:00Z"), code);
    expect(v.current).toMatchObject({ rate: 5.75, day: "2026-10-21" }); expect(v.history.length).toBe(12); expect(v.stale).toBe(false); expect(v.error).toBeNull();
    expect(v.current!.lastChange).toMatchObject({ from: 5.5, to: 5.75, bps: 25 });
  });

  test("looking again with nothing new changes nothing", async () => {
    expect((await syncBiRate({ db, f: fake(series()), code })).changed).toBe(false);
    expect((await pool.query("select count(*)::int n from finance.market_prices where code=$1", [code])).rows[0].n).toBe(12);
  });

  test("a new decision is a change, announced exactly once", async () => {
    await pool.query("update finance.rate_state set next_check_at=now() where code=$1", [code]);
    const seen: string[] = [];
    const rows = series([[1794960000000, 6]]);
    const first = await runRatesDue({ db, f: fake(rows), code, onChange: async (l, p) => { seen.push(`${l.rate}<-${p?.rate}`); } });
    expect(first).toMatchObject({ ok: true, changed: true, latest: { day: "2026-11-18", rate: 6 } }); expect(seen).toEqual(["6<-5.75"]);
    await pool.query("update finance.rate_state set next_check_at=now() where code=$1", [code]);
    await runRatesDue({ db, f: fake(rows), code, onChange: async () => { seen.push("again"); } });
    expect(seen).toEqual(["6<-5.75"]);
    expect((await biRateView(db, new Date("2026-11-19T10:00:00Z"), code)).current!.lastChange).toMatchObject({ day: "2026-11-18", from: 5.75, to: 6, bps: 25 });
  });

  test("a page that cannot be read is recorded, retried later, and the old rate stays", async () => {
    await pool.query("update finance.rate_state set next_check_at=now() where code=$1", [code]);
    const broken = (async () => new Response("<html>maintenance</html>", { status: 200 })) as unknown as typeof fetch;
    expect(await runRatesDue({ db, f: broken, code })).toMatchObject({ ok: false, error: "BI_RATE_UNREADABLE" });
    const v = await biRateView(db, new Date("2026-11-19T10:00:00Z"), code);
    expect(v.error).toBe("BI_RATE_UNREADABLE"); expect(v.current!.rate).toBe(6);
    const later = (await pool.query("select next_check_at > now() + interval '10 minutes' as later from finance.rate_state where code=$1", [code])).rows[0].later;
    expect(later).toBe(true);
    expect(await runRatesDue({ db, f: broken, code })).toBeNull();                            // not due yet: nothing is fetched
  });

  test("a rate that is older than two months is flagged stale", async () => {
    expect((await biRateView(db, new Date("2027-03-01T00:00:00Z"), code)).stale).toBe(true);
  });
});

run("BI-Rate notification (real database, fake push sender)", () => {
  test("only people with a floating loan are told, once per device, with their own numbers", async () => {
    const { notifyBiChange } = await import("./notify");
    const u1 = `itest-bn-${crypto.randomUUID().slice(0, 6)}`, u2 = `itest-bn-${crypto.randomUUID().slice(0, 6)}`;
    try {
      await pool.query("insert into finance.loans(user_id,id,name,kind,model,principal,months,due_day,fixed_rate,fixed_months,float_rate,balance,paid) values($1,'a','KPR','kpr','anuitas',500000000,180,20,7,60,11,500000000,0),($2,'b','Motor','kendaraan','flat',20000000,36,5,10,36,10,15000000,10)", [u1, u2]);
      await pool.query("insert into finance.push_subscriptions(user_id,endpoint,p256dh,auth) values($1,'https://push.test/1','k','a'),($1,'https://push.test/2','k','a'),($2,'https://push.test/3','k','a')", [u1, u2]);
      const sent: { endpoint: string; body: string }[] = [];
      const n = await notifyBiChange(db, { day: "2026-11-18", rate: 6 }, { day: "2026-10-21", rate: 5.75 }, (async (sub: { endpoint: string }, body: string) => { sent.push({ endpoint: sub.endpoint, body }); return {}; }) as never, true);
      expect(n).toBe(2);                                                    // two devices of the KPR owner; the flat motor loan and its owner are left alone
      expect(sent.map((s) => s.endpoint).sort()).toEqual(["https://push.test/1", "https://push.test/2"]);
      const p = JSON.parse(sent[0].body); expect(p.title).toBe("BI-Rate naik 25 bps ke 6,00%"); expect(p.message).toMatch(/Rp[\d.]+ per bulan/);
      expect(await notifyBiChange(db, { day: "2026-12-16", rate: 6 }, { day: "2026-11-18", rate: 6 }, (async () => ({})) as never, true)).toBe(0);
    } finally {
      for (const t of ["loans", "push_subscriptions"]) await pool.query(`delete from finance.${t} where user_id = any($1)`, [[u1, u2]]);
    }
  });
});
