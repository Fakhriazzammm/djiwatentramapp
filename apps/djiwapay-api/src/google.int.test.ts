// Real Postgres, simulated Google. Isolated user id, cleaned up afterwards. Skipped without DATABASE_URL.
import { afterAll, describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { createApp, poolTx } from "./index";
import { disconnect, finishConnect, googleConfig, startConnect, status, syncCalendar, SCOPES } from "./google";

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
  for (const t of ["google_connections", "google_calendar_events", "google_drive_files", "google_sheet_exports", "google_drive_state", "gmail_sync", "gmail_seen", "inbound_sources", "bills", "entries", "accounts"]) await pool.query(`delete from finance.${t} where user_id=$1`, [user]);
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
    expect(done.features).toEqual({ calendar: true, drive: true, gmail: false });
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

  test("disconnecting revokes at Google and wipes every mapping", async () => {
    await disconnect(db, cfg, user, gfetch);
    expect(calls.some((x) => x.url.includes("/revoke"))).toBe(true);
    expect((await status(db, cfg, user)).connected).toBe(false);
    for (const t of ["google_connections", "google_calendar_events", "google_sheet_exports"]) expect((await pool.query(`select 1 from finance.${t} where user_id=$1`, [user])).rowCount).toBe(0);
  });

  test("combined OAuth scopes activate only granted features and let Gmail be added later", async () => {
    const returned = new Map([
      ["partial", [SCOPES.email, SCOPES.calendar, SCOPES.drive]],
      ["all", Object.values(SCOPES)],
      ["files", Object.values(SCOPES)],
      ["none", [SCOPES.email]],
      ["different-account", Object.values(SCOPES)],
    ]);
    const fetchGoogle = (async (input: string, init: RequestInit) => {
      if (input.includes("oauth2.googleapis.com/token")) {
        const code = (init.body as URLSearchParams).get("code")!;
        return new Response(JSON.stringify({ access_token: code, refresh_token: `refresh-${code}`, expires_in: 3600, scope: returned.get(code)?.join(" ") }));
      }
      if (input.includes("openidconnect")) {
        const account = new Headers(init.headers).get("authorization")?.endsWith("different-account") ? "another@example.com" : "tester@example.com";
        return new Response(JSON.stringify({ email: account }));
      }
      return gfetch(input, init);
    }) as unknown as typeof fetch;
    const app = createApp({ db: poolTx(pool), resolve: async () => user, dir: "/tmp", google: cfg, gfetch: fetchGoogle });
    const connect = async (features: string[]) => {
      const response = await app.request("/api/finance/google/connect", {
        method: "POST", body: JSON.stringify({ features }),
      });
      expect(response.status).toBe(200);
      return new URL((await response.json() as { url: string }).url);
    };
    const callback = async (auth: URL, code: string) => {
      const response = await app.request(`/api/finance/google/callback?${new URLSearchParams({ code, state: auth.searchParams.get("state")! })}`);
      expect(response.status).toBe(302);
      return response.headers.get("location");
    };

    const combined = await connect(["drive", "gmail", "calendar"]);
    expect(new Set(combined.searchParams.get("scope")!.split(" "))).toEqual(new Set(Object.values(SCOPES)));
    expect(await callback(combined, "partial")).toBe("/integrasi?google=partial");
    expect(await status(db, cfg, user)).toMatchObject({ features: { drive: true, calendar: true, gmail: false }, gmail: null, sheet: { pending: true } });
    expect((await db.query("select 1 from finance.google_drive_state where user_id=$1", [user])).rows).toHaveLength(1);

    expect(await callback(await connect(["gmail"]), "all")).toBe("/integrasi?google=ok");
    expect(await status(db, cfg, user)).toMatchObject({ features: { drive: true, calendar: true, gmail: true }, gmail: { enabled: true } });

    expect((await app.request("/api/finance/google/gmail/off", { method: "POST" })).status).toBe(200);
    expect(await callback(await connect(["drive"]), "files")).toBe("/integrasi?google=ok");
    expect((await status(db, cfg, user)).gmail).toBeNull();

    expect(await callback(await connect(["gmail"]), "none")).toBe("/integrasi?google=denied");
    expect(await callback(await connect(["gmail"]), "different-account")).toBe("/integrasi?google=account");
    expect(await status(db, cfg, user)).toMatchObject({ email: "tester@example.com", features: { drive: true, calendar: true, gmail: true }, gmail: null });
  });
});
