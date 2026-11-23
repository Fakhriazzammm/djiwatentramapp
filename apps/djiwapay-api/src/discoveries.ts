import type { Hono } from "hono";
import { ISSUERS } from "./mail/extract.js";
import { scanMailbox } from "./mailbox-scan.js";
import type { Fetch, GoogleCfg } from "./google.js";

/** "Temuan": suggestions found in the person's records (new wallet from e-mail, recurring bill, price change...).
 *  They are computed in the app from the records; the server keeps only the answer so a suggestion is never asked twice, on any device. */
type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const STATUS = new Set(["saved", "dismissed", "snoozed"]);
const KEY = /^[A-Za-z0-9:_.\-|]{3,120}$/;

export async function listDecisions(db: Db, userId: string) {
  const rows = (await db.query("select key,status,until from finance.discovery_decisions where user_id=$1 and (status<>'snoozed' or until > now())", [userId])).rows;
  return rows.map((r) => ({ key: String(r.key), status: String(r.status), until: r.until ? new Date(r.until).toISOString() : null }));
}

const norm = (t: unknown) => String(t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const wordIn = (hay: string, needle: string) => needle.length >= 2 && ` ${hay} `.includes(` ${needle} `);

/** A bank or e-wallet counts as tracked when it appears anywhere in the person's money: a wallet, an asset, a bill or a loan. */
export function isTracked(places: { accounts: { id: string; name: string }[]; others: string[] }, issuer: { id: string; name: string }, hint: string): { tracked: boolean; sameIssuer: { id: string; name: string }[] } {
  const name = norm(issuer.name), id = `email-${issuer.id}${hint ? "-" + hint : ""}`;
  const same = places.accounts.filter((a) => a.id === id || a.id.startsWith(`email-${issuer.id}`) || wordIn(norm(a.name), name));
  if (places.accounts.some((a) => a.id === id)) return { tracked: true, sameIssuer: same };
  if (hint && same.some((a) => norm(a.name).includes(hint))) return { tracked: true, sameIssuer: same };
  if (!hint && same.length) return { tracked: true, sameIssuer: same };
  if (!same.length && places.others.some((o) => wordIn(norm(o), name))) return { tracked: true, sameIssuer: same };
  return { tracked: false, sameIssuer: same };   // known bank but a number not seen before is a new account, not a new bank
}

/** Banks and e-wallets that e-mail shows (waiting, failed or in an import preview) and that are not in any wallet, asset, bill or loan yet. */
export async function untracked(db: Db, userId: string) {
  const inbound = (await db.query(`select channel, coalesce(parsed->>'accountHint','') hint, count(*)::int n, min(coalesce(occurred_at, created_at)) first_at, max(coalesce(occurred_at, created_at)) last_at
    from finance.inbound_messages where user_id=$1 and status in ('review','failed','staged') and coalesce(parsed->>'generic','false') <> 'true' and parsed->>'bill' is null
      and created_at > now() - interval '120 days' group by 1,2`, [userId])).rows;
  const seen = (await db.query("select issuer_id channel, '' hint, approx n, last_at first_at, last_at from finance.mailbox_seen where user_id=$1 and last_at > now() - interval '430 days'", [userId]).catch(() => ({ rows: [] }))).rows;
  const have = new Set(inbound.map((r) => `${r.channel}|${r.hint}`));
  const ev = [...inbound, ...seen.filter((r) => !have.has(`${r.channel}|`))];
  if (!ev.length) return [];
  const [acc, ass, bil, loa] = await Promise.all([
    db.query("select id,name from finance.accounts where user_id=$1 and not archived", [userId]), db.query("select name from finance.assets where user_id=$1", [userId]),
    db.query("select name from finance.bills where user_id=$1", [userId]), db.query("select name,lender from finance.loans where user_id=$1", [userId]),
  ]);
  const places = { accounts: acc.rows as { id: string; name: string }[], others: [...ass.rows.map((r) => r.name), ...bil.rows.map((r) => r.name), ...loa.rows.flatMap((r) => [r.name, r.lender])] };
  const out: { key: string; issuerId: string; name: string; kind: string; hint: string; count: number; firstAt: string; lastAt: string; sameIssuer: { id: string; name: string }[] }[] = [];
  for (const r of ev) {
    const issuer = ISSUERS.find((i) => i.id === r.channel); if (!issuer || issuer.kind === "service") continue;
    const t = isTracked(places, issuer, String(r.hint || ""));
    if (t.tracked) continue;
    out.push({ key: `new:${issuer.id}${r.hint ? "-" + r.hint : ""}`, issuerId: issuer.id, name: issuer.name, kind: issuer.kind, hint: String(r.hint || ""), count: Number(r.n), firstAt: new Date(r.first_at).toISOString(), lastAt: new Date(r.last_at).toISOString(), sameIssuer: t.sameIssuer });
  }
  return out;
}

const scanned = new Map<string, number>();
export function registerDiscoveryRoutes(app: Hono, d: { db: Db; google?: GoogleCfg | null; gfetch?: Fetch }, uid: (c: any) => string, json: (c: any, body: unknown, status?: number) => Response) {
  app.get("/api/finance/discoveries", async (c) => json(c, { success: true, decisions: await listDecisions(d.db, uid(c)), untracked: await untracked(d.db, uid(c)).catch(() => []) }));
  app.post("/api/finance/discoveries/decide", async (c) => {
    const b = await c.req.json().catch(() => null) as { keys?: unknown; status?: unknown; days?: unknown } | null;
    const keys = (Array.isArray(b?.keys) ? b!.keys : []).filter((k): k is string => typeof k === "string" && KEY.test(k)).slice(0, 40);
    const status = String(b?.status ?? "");
    if (!keys.length || !STATUS.has(status)) return json(c, { success: false, error: "BAD_REQUEST" }, 400);
    const days = status === "snoozed" ? Math.max(1, Math.min(90, Math.round(Number(b?.days) || 7))) : 0;
    await d.db.query(`insert into finance.discovery_decisions(user_id,key,status,until,decided_at) select $1, k, $3, case when $3='snoozed' then now() + ($4 || ' days')::interval end, now() from unnest($2::text[]) k
      on conflict(user_id,key) do update set status=excluded.status, until=excluded.until, decided_at=now()`, [uid(c), keys, status, String(days)]);
    return json(c, { success: true });
  });
  app.post("/api/finance/discoveries/scan", async (c) => {
    if (!d.google) return json(c, { success: false, error: "NOT_CONFIGURED" }, 503);
    const id = uid(c), now = Date.now();
    if (now - (scanned.get(id) ?? 0) < 120_000) return json(c, { success: true, skipped: true });
    scanned.set(id, now);
    const r = await scanMailbox(d.db, d.google, id, d.gfetch);
    return r.ok ? json(c, { success: true, found: r.found, checked: r.checked }) : json(c, { success: false, error: r.error }, r.error === "NOT_CONNECTED" || r.error === "SCOPE_MISSING" ? 409 : 502);
  });
  app.post("/api/finance/discoveries/undo", async (c) => {
    const b = await c.req.json().catch(() => null) as { keys?: unknown } | null;
    const keys = (Array.isArray(b?.keys) ? b!.keys : []).filter((k): k is string => typeof k === "string" && KEY.test(k)).slice(0, 40);
    if (keys.length) await d.db.query("delete from finance.discovery_decisions where user_id=$1 and key = any($2::text[])", [uid(c), keys]);
    return json(c, { success: true });
  });
  /** Merging a mail-made wallet into another: from now on mail for the old one is recorded in the chosen wallet. The app moves the records itself. */
  app.post("/api/finance/discoveries/merge", async (c) => {
    const b = await c.req.json().catch(() => null) as { from?: unknown; to?: unknown } | null;
    const from = typeof b?.from === "string" ? b.from.slice(0, 80) : "", to = typeof b?.to === "string" ? b.to.slice(0, 80) : "";
    if (!from || !to || from === to) return json(c, { success: false, error: "BAD_REQUEST" }, 400);
    if (!(await d.db.query("select 1 from finance.accounts where user_id=$1 and id=$2", [uid(c), to])).rows.length) return json(c, { success: false, error: "UNKNOWN_ACCOUNT" }, 404);   // the old wallet may not exist yet: it is a discovery that was never saved
    // Follow a chain (A -> B, then B -> C) so nothing points at a wallet that is itself merged away.
    await d.db.query("update finance.account_alias set to_id=$3 where user_id=$1 and to_id=$2", [uid(c), from, to]);
    await d.db.query("insert into finance.account_alias(user_id,from_id,to_id) values($1,$2,$3) on conflict(user_id,from_id) do update set to_id=excluded.to_id", [uid(c), from, to]);
    return json(c, { success: true });
  });
  app.post("/api/finance/discoveries/unmerge", async (c) => {
    const b = await c.req.json().catch(() => null) as { from?: unknown } | null;
    if (typeof b?.from === "string") await d.db.query("delete from finance.account_alias where user_id=$1 and from_id=$2", [uid(c), b.from.slice(0, 80)]);
    return json(c, { success: true });
  });
}
