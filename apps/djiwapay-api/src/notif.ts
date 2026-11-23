import { createHash } from "node:crypto";
import type { Hono } from "hono";
import { ISSUERS, type Issuer } from "./mail/issuers.js";
import { ensureSource, processForUser, type PipelineDeps, type RawMail } from "./mail/pipeline.js";

/** Android notifications from bank, e-wallet and biller apps. The phone only ever sends notifications of the apps listed here;
 *  each one goes through the very same gates as an e-mail (secret codes, promos, failed payments, duplicates) and is recorded or queued for review. */
export type NotifItem = { pkg: string; title: string; text: string; at: number };
const MAX_ITEMS = 40, MAX_TEXT = 1200;

export const appsConfig = () => ISSUERS.filter((i) => i.packages.length).map((i) => ({ issuerId: i.id, name: i.name, kind: i.kind, packages: i.packages }));
export const issuerForPackage = (pkg: string): Issuer | null => ISSUERS.find((i) => i.packages.includes(pkg)) ?? null;

export function cleanItems(raw: unknown): NotifItem[] {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_ITEMS) : [];
  const now = Date.now();
  return list.flatMap((r: any) => {
    const pkg = typeof r?.pkg === "string" ? r.pkg.slice(0, 120) : "", title = String(r?.title ?? "").slice(0, 300), text = String(r?.text ?? "").slice(0, MAX_TEXT);
    const at = Number(r?.at); if (!pkg || (!title && !text)) return [];
    return [{ pkg, title, text, at: Number.isFinite(at) && at > 1_500_000_000_000 && at < now + 10 * 60_000 ? at : now }];
  });
}

/** A notification looks like an e-mail to the pipeline: from the issuer, subject = title, body = text. The same notification twice in one minute is one. */
export function toMail(item: NotifItem, issuer: Issuer): RawMail {
  const domain = issuer.domains[0] ?? "notif.local";
  const id = createHash("sha1").update(`${item.pkg}|${item.title}|${item.text}|${Math.floor(item.at / 60_000)}`).digest("hex").slice(0, 24);
  return { messageId: `notif:${id}`, from: `notifikasi@${domain}`, to: [], subject: item.title, text: `${item.title}\n${item.text}`, date: new Date(item.at), auth: { dmarcPass: true, dkimDomains: [domain] } };
}

export async function ingest(d: PipelineDeps, userId: string, raw: unknown) {
  const items = cleanItems(raw), out: Record<string, number> = { received: items.length, recorded: 0, review: 0, ignored: 0, duplicate: 0, unknownApp: 0 };
  const trusted = Number((await ensureSource(d.db, userId)).trusted_count ?? 0);
  for (const item of items) {
    const issuer = issuerForPackage(item.pkg);
    if (!issuer) { out.unknownApp++; continue; }
    const r = await processForUser(d, userId, trusted, toMail(item, issuer), { notif: true });
    if (r.status === "auto") out.recorded++; else if (r.status === "review" || r.status === "failed") out.review++; else if (r.status === "duplicate") out.duplicate++; else out.ignored++;
  }
  await d.db.query("insert into finance.notif_state(user_id,last_at,received) values($1,now(),$2) on conflict(user_id) do update set last_at=now(), received=finance.notif_state.received+$2", [userId, items.length]);
  return out;
}

const hits = new Map<string, { n: number; t: number }>();
export function registerNotifRoutes(app: Hono, d: { pipeline: PipelineDeps | null; db: PipelineDeps["db"] }, uid: (c: any) => string, json: (c: any, body: unknown, status?: number) => Response) {
  app.get("/api/finance/notif/config", async (c) => {
    const s = (await d.db.query("select last_at, received from finance.notif_state where user_id=$1", [uid(c)])).rows[0];
    return json(c, { success: true, apps: appsConfig(), state: s ? { lastAt: new Date(s.last_at).toISOString(), received: Number(s.received) } : null });
  });
  app.post("/api/finance/notif", async (c) => {
    if (!d.pipeline) return json(c, { success: false, error: "NOT_CONFIGURED" }, 503);
    const id = uid(c), now = Date.now(), h = hits.get(id);
    if (!h || now - h.t > 60_000) hits.set(id, { n: 1, t: now }); else if (++h.n > 30) return json(c, { success: false, error: "RATE_LIMITED" }, 429);
    const b = await c.req.json().catch(() => null) as { items?: unknown } | null;
    try { return json(c, { success: true, ...(await ingest(d.pipeline, id, b?.items)) }); }
    catch (e) { console.error("notif", e instanceof Error ? e.message : e); return json(c, { success: false, error: "TRY_AGAIN" }, 503); }
  });
}
