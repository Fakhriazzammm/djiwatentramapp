/** Gmail direct: fetches only mail from the listed bank / e-wallet senders and runs it through the same pipeline as forwarded mail.
 *  The message is taken raw from Gmail, so its DKIM signature can be verified exactly like mail that arrives by SMTP. */
import { accessToken, googleReason, type Fetch, type GoogleCfg } from "./google.js";
import { ensureSource, processForUser, type Outcome, type PipelineDeps, type RawMail } from "./mail/pipeline.js";
import { ISSUERS } from "./mail/extract.js";
import { broadQuery } from "./mail/generic.js";
import type { MailCtx } from "./mail/smtp.js";
import type { Q, Tx } from "./sync.js";

const POLL_EVERY_MS = 5 * 60_000;
const BACKFILL_DAYS = 7;
const MAX_PER_POLL = 60;

export const senderQuery = () => `from:(${ISSUERS.flatMap((i) => i.domains).join(" OR ")})`;
export const gmailQuery = (since: Date, broad = false) => `${broad ? `(${senderQuery()}) OR (${broadQuery()})` : senderQuery()} after:${Math.floor(since.getTime() / 1000)}`;

export type PollDeps = { db: Tx; cfg: GoogleCfg; pipeline: PipelineDeps; toMail: (raw: Buffer, ctx: MailCtx) => Promise<RawMail>; f?: Fetch; now?: () => Date; test?: boolean };
export type PollResult = { ok: boolean; processed: number; outcomes: Record<string, number>; error?: string };

export async function enableGmail(db: Q, userId: string) {
  await ensureSource(db, userId);
  await db.query("insert into finance.gmail_sync(user_id,enabled,next_poll_at) values($1,true,now()) on conflict(user_id) do update set enabled=true, next_poll_at=now(), last_error=null", [userId]);
}
export async function disableGmail(db: Q, userId: string) {
  await db.query("delete from finance.gmail_sync where user_id=$1", [userId]);
  await db.query("delete from finance.gmail_seen where user_id=$1", [userId]);
}
export const pollSoon = (db: Q, userId: string) => db.query("update finance.gmail_sync set next_poll_at=now() where user_id=$1 and enabled", [userId]);

export async function pollGmail(d: PollDeps, userId: string): Promise<PollResult> {
  const f = d.f ?? fetch, now = (d.now ?? (() => new Date()))();
  const outcomes: Record<string, number> = {};
  const done = async (error: string | null, processed: number, advance: boolean): Promise<PollResult> => {
    await d.db.query("update finance.gmail_sync set last_error=$2, fetched_count=fetched_count+$3, next_poll_at=now()+($4 * interval '1 millisecond'), last_polled_at=case when $5 then now() else last_polled_at end where user_id=$1", [userId, error, processed, error ? POLL_EVERY_MS * 2 : POLL_EVERY_MS, advance]);
    return { ok: !error, processed, outcomes, ...(error ? { error } : {}) };
  };
  const state = (await d.db.query("select last_polled_at from finance.gmail_sync where user_id=$1 and enabled", [userId])).rows[0];
  if (!state) return { ok: false, processed: 0, outcomes, error: "DISABLED" };
  const token = await accessToken(d.db, d.cfg, userId, f);
  if (!token) return done("NOT_CONNECTED", 0, false);
  const conn = (await d.db.query("select email,granted_scopes from finance.google_connections where user_id=$1", [userId])).rows[0];
  if (!conn || !(conn.granted_scopes as string[]).includes("https://www.googleapis.com/auth/gmail.readonly")) return done("SCOPE_MISSING", 0, false);
  const since = state.last_polled_at ? new Date(new Date(state.last_polled_at).getTime() - 15 * 60_000) : new Date(now.getTime() - BACKFILL_DAYS * 86400_000);
  const auth = { authorization: `Bearer ${token}` };
  const broad = (await d.db.query("select broad from finance.inbound_sources where user_id=$1", [userId])).rows[0]?.broad === true;

  const ids: string[] = [];
  let page: string | undefined;
  for (let i = 0; i < 3 && ids.length < MAX_PER_POLL; i++) {
    const res = await f(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q: gmailQuery(since, broad), maxResults: "30", ...(page ? { pageToken: page } : {}) })}`, { headers: auth });
    if (res.status === 403 || res.status === 401) return done(res.status === 403 ? `GMAIL_FORBIDDEN:${await googleReason(res)}` : "NOT_CONNECTED", 0, false);
    if (!res.ok) return done(`GMAIL_${res.status}`, 0, false);
    const j = (await res.json()) as { messages?: { id: string }[]; nextPageToken?: string };
    ids.push(...(j.messages ?? []).map((m) => m.id));
    page = j.nextPageToken;
    if (!page) break;
  }

  const trusted = Number((await ensureSource(d.db, userId)).trusted_count ?? 0);
  let processed = 0;
  for (const id of ids.slice(0, MAX_PER_POLL)) {
    if ((await d.db.query("select 1 from finance.gmail_seen where user_id=$1 and gmail_id=$2", [userId, id])).rows.length) continue;
    const res = await f(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=raw`, { headers: auth });
    if (res.status === 404) { await d.db.query("insert into finance.gmail_seen(user_id,gmail_id) values($1,$2) on conflict do nothing", [userId, id]); continue; }
    if (!res.ok) return done(`GMAIL_${res.status}`, processed, false);
    const { raw } = (await res.json()) as { raw?: string };
    if (!raw) continue;
    try {
      const mail = await d.toMail(Buffer.from(raw, "base64url"), { ip: "", helo: "", sender: "", host: "gmail", recipients: [String(conn.email ?? "")] });
      const out: Outcome = await processForUser(d.pipeline, userId, trusted, mail);
      outcomes[out.status] = (outcomes[out.status] ?? 0) + 1;
      processed++;
    } catch (e) { return done(`PARSE_${(e instanceof Error ? e.message : "error").slice(0, 60)}`, processed, false); }
    await d.db.query("insert into finance.gmail_seen(user_id,gmail_id) values($1,$2) on conflict do nothing", [userId, id]);
  }
  await d.db.query("delete from finance.gmail_seen where seen_at < now() - interval '30 days'");
  return done(null, processed, true);
}

/** One scheduler tick: polls the few users whose turn has come. */
export async function runDue(d: PollDeps, limit = 5) {
  const due = await d.db.query(`select g.user_id from finance.gmail_sync g join finance.google_connections c on c.user_id=g.user_id
    where g.enabled and g.next_poll_at <= now() and c.refresh_enc is not null ${d.test ? "" : "and g.user_id not like 'itest-%'"} order by g.next_poll_at limit $1`, [limit]);
  const out: Record<string, PollResult> = {};
  for (const r of due.rows) { try { out[r.user_id] = await pollGmail(d, r.user_id as string); } catch (e) { console.error("gmail poll", e instanceof Error ? e.message : e); } }
  return out;
}
