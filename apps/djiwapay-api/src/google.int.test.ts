// Real Postgres, simulated Google. Isolated user id, cleaned up afterwards. Skipped without DATABASE_URL.
import { afterAll, describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { disconnect, exportSheet, finishConnect, googleConfig, startConnect, status, syncCalendar, SCOPES } from "./google";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const user = `itest-g-${crypto.randomUUID().slice(0, 8)}`;
const pool = url ? new Pool({ connectionString: url, max: 2, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } }) : (null as unknown as Pool);
const cfg = googleConfig({ GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec", GOOGLE_TOKEN_KEY: Buffer.alloc(32, 3).toString("base64") })!;
const calls: { url: string; method: string; body?: string }[] = [];
const gfetch = (async (u: string, init: RequestInit = {}) => {
  const body = typeof init.body === "string" ? init.body : init.body instanceof URLSearchParams ? init.body.toString() : undefined;
  calls.push({ url: String(u), method: init.method ?? "GET", body });
  const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
  if (String(u).includes("oauth2.googleapis.com/token")) return ok({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600, scope: `${SCOPES.email} ${SCOPES.calendar} ${SCOPES.drive}` });
  if (String(u).includes("openidconnect")) return ok({ email: "tester@example.com" });
  if (String(u).includes("/calendar/v3/") && init.method === "POST") return ok({ id: "ev-1" });
  if (String(u).includes("/calendar/v3/")) return ok({});
  if (String(u).endsWith("/v4/spreadsheets")) return ok({ spreadsheetId: "sh-1", spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sh-1" });
  if (String(u).includes("sheets.googleapis.com")) return ok({});
  return new Response("{}", { status: 200 });
}) as unknown as typeof fetch;
const db = { query: (t: string, p?: unknown[]) => pool.query(t, p as any[]) };

afterAll(async () => {
  if (!pool) return;
  for (const t of ["google_connections", "google_calendar_events", "google_drive_files", "google_sheet_exports", "bills", "entries", "accounts"]) await pool.query(`delete from finance.${t} where user_id=$1`, [user]);
  await pool.end();
});

run("google (real database, simulated Google)", () => {
  test("not connected until the consent round trip finishes", async () => {
    expect((await status(db, cfg, user)).connected).toBe(false);
    const u = new URL(await startConnect(db, cfg, user, ["calendar", "drive"]));
    expect(u.searchParams.get("scope")).toContain(SCOPES.calendar);
    expect(u.searchParams.get("access_type")).toBe("offline");
    const state = u.searchParams.get("state")!;
    await expect(finishConnect(db, cfg, "code", "wrong-state", gfetch)).rejects.toThrow("STATE_EXPIRED");
    const done = await finishConnect(db, cfg, "code", state, gfetch);
    expect(done.features).toEqual({ calendar: true, drive: true });
    await expect(finishConnect(db, cfg, "code", state, gfetch)).rejects.toThrow("STATE_EXPIRED");   // a state works once
    const st = await status(db, cfg, user);
    expect(st).toMatchObject({ connected: true, email: "tester@example.com", features: { calendar: true, drive: true } });
    const raw = (await pool.query("select access_enc,refresh_enc from finance.google_connections where user_id=$1", [user])).rows[0];
    expect(raw.refresh_enc).not.toContain("rt-1");   // stored encrypted
  });

  test("bills become recurring events once, then update in place and clean up", async () => {
    await pool.query("insert into finance.bills(user_id,id,name,amount,day) values($1,'b1','Listrik',350000,20),($1,'b2','Internet',400000,5)", [user]);
    const a = await syncCalendar(db, cfg, user, gfetch, new Date("2026-11-15T03:00:00Z"));
    expect(a).toMatchObject({ ok: true, created: 2, updated: 0 });
    const b = await syncCalendar(db, cfg, user, gfetch, new Date("2026-11-15T03:00:00Z"));
    expect(b).toMatchObject({ ok: true, created: 0, updated: 2 });
    await pool.query("delete from finance.bills where user_id=$1 and id='b2'", [user]);
    const c = await syncCalendar(db, cfg, user, gfetch);
    expect(c).toMatchObject({ ok: true, removed: 1 });
    expect(calls.some((x) => x.method === "DELETE")).toBe(true);
    expect((await status(db, cfg, user)).calendar.events).toBe(1);
  });

  test("the sheet is created once and rewritten on later exports", async () => {
    await pool.query("insert into finance.entries(user_id,id,kind,amount,category_id,account_id,at,note,source) values($1,'e1','out',25000,'makan','tunai','2026-11-15T06:45:00Z','Kopi','manual')", [user]);
    const a = await exportSheet(db, cfg, user, gfetch);
    expect(a).toMatchObject({ ok: true, url: "https://docs.google.com/spreadsheets/d/sh-1", rows: 1 });
    const creates = () => calls.filter((x) => x.url.endsWith("/v4/spreadsheets")).length;
    expect(creates()).toBe(1);
    await exportSheet(db, cfg, user, gfetch);
    expect(creates()).toBe(1);
    expect(calls.some((x) => x.url.includes("values:batchClear"))).toBe(true);
    expect((await status(db, cfg, user)).sheet?.status).toBe("synced");
  });

  test("disconnecting revokes at Google and wipes every mapping", async () => {
    await disconnect(db, cfg, user, gfetch);
    expect(calls.some((x) => x.url.includes("/revoke"))).toBe(true);
    expect((await status(db, cfg, user)).connected).toBe(false);
    for (const t of ["google_connections", "google_calendar_events", "google_sheet_exports"]) expect((await pool.query(`select 1 from finance.${t} where user_id=$1`, [user])).rowCount).toBe(0);
  });
});
