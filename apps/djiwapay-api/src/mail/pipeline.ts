import { randomBytes } from "node:crypto";
import type { Q, Tx } from "../sync.js";
import { domainOf, extractPayment, forwardingCode, guessCategory, isConfident, isSecretMail, issuerFor, merchantKey, type Extracted, type Issuer } from "./extract.js";

export type RawMail = {
  messageId: string; from: string; to: string[]; subject: string; text: string; date: Date | null;
  /** From mailauth: DMARC verdict and the domains whose DKIM signature verified. */
  auth: { dmarcPass: boolean; dkimDomains: string[] };
};
export type Llm = (subject: string, text: string, from: string) => Promise<Extracted | null>;
export type PipelineDeps = { db: Tx; llm?: Llm; domain: string; now?: () => Date; trustMin?: number; autoCeiling?: number };
export type Outcome = { status: "auto" | "review" | "ignored" | "duplicate" | "failed" | "forwarding-code"; reason: string; userId?: string };

const TRUST_MIN = 10;               // approvals before a user's mail is recorded without asking
const AUTO_CEILING = 5_000_000;     // anything larger always waits for a person
const CLOSE_MS = 10 * 60_000, TRANSFER_MS = 15 * 60_000;

const newToken = () => { const a = "abcdefghjkmnpqrstuvwxyz23456789"; return Array.from(randomBytes(10), (b) => a[b % a.length]).join(""); };

/* ---------------- source (the user's forwarding address) ---------------- */

export async function getSource(db: Q, userId: string) {
  const r = await db.query("select token,enabled,forwarding,forward_code,forward_code_at,trusted_count,mail_count,first_mail_at,last_mail_at from finance.inbound_sources where user_id=$1", [userId]);
  return r.rows[0] ?? null;
}
export async function ensureSource(db: Q, userId: string, rotate = false) {
  const existing = await getSource(db, userId);
  if (existing && !rotate) return existing;
  if (existing) await db.query("update finance.inbound_sources set token=$2,enabled=true,forward_code=null,forward_code_at=null where user_id=$1", [userId, newToken()]);
  else await db.query("insert into finance.inbound_sources(user_id,token) values($1,$2) on conflict do nothing", [userId, newToken()]);
  return (await getSource(db, userId))!;
}
export async function removeSource(db: Q, userId: string, wipe: boolean) {
  await db.query("delete from finance.inbound_sources where user_id=$1", [userId]);
  if (wipe) await db.query("delete from finance.inbound_messages where user_id=$1 and status in ('review','failed','ignored','rejected','duplicate')", [userId]);
}

/* ---------------- helpers ---------------- */

const bump = (q: Q, userId: string) => q.query("insert into finance.profiles(user_id) values($1) on conflict do nothing", [userId]).then(() => q.query("update finance.profiles set version=version+1, updated_at=now() where user_id=$1", [userId])).then(() => q.query("update finance.google_sheet_exports set dirty=true, next_sync_at=least(next_sync_at, now()+interval '8 seconds') where user_id=$1", [userId]));

async function ensureAccount(q: Q, userId: string, issuer: Issuer, hint: string) {
  const id = `email-${issuer.id}${hint ? "-" + hint : ""}`;
  await q.query("insert into finance.accounts(user_id,id,name,type,opening) values($1,$2,$3,$4,0) on conflict do nothing", [userId, id, `${issuer.name}${hint ? " ••" + hint : ""}`, issuer.kind === "bank" ? "bank" : issuer.kind === "ewallet" ? "ewallet" : "other"]);
  return id;
}

async function learnedCategory(q: Q, userId: string, merchant: string): Promise<string | null> {
  const key = merchantKey(merchant);
  if (!key) return null;
  const r = await q.query("select category_id from finance.merchant_rules where user_id=$1 and pattern=$2", [userId, key]);
  return r.rows[0]?.category_id ?? null;
}

type Candidate = { kind: "out" | "in"; amount: number; categoryId: string; accountId: string; at: string; note: string };

async function insertEntry(q: Q, userId: string, c: Candidate, inboundId: string): Promise<string> {
  const id = `em-${crypto.randomUUID()}`;
  await q.query("insert into finance.entries(user_id,id,kind,amount,category_id,account_id,at,note,tags,source,inbound_id) values($1,$2,$3,$4,$5,$6,$7,$8,'{}','email',$9)", [userId, id, c.kind, c.amount, c.categoryId, c.accountId, c.at, c.note.slice(0, 200), inboundId]);
  await bump(q, userId);
  return id;
}

/* ---------------- the pipeline ---------------- */

/** Mail that arrived at a user's own forwarding address. */
export async function processMail(d: PipelineDeps, mail: RawMail): Promise<Outcome> {
  const local = mail.to.map((a) => a.toLowerCase()).find((a) => a.endsWith("@" + d.domain.toLowerCase()))?.split("@")[0] ?? "";
  if (!local) return { status: "ignored", reason: "no-recipient" };
  const src = (await d.db.query("select user_id,trusted_count from finance.inbound_sources where token=$1 and enabled", [local])).rows[0] as { user_id: string; trusted_count: number } | undefined;
  if (!src) return { status: "ignored", reason: "unknown-address" };
  await d.db.query("update finance.inbound_sources set forwarding=true where user_id=$1 and not forwarding", [src.user_id]);
  return processForUser(d, src.user_id, src.trusted_count, mail);
}

/** The same pipeline for mail that already belongs to a known user (forwarded, or fetched from their Gmail). */
export async function processForUser(d: PipelineDeps, userId: string, trustedCount: number, mail: RawMail): Promise<Outcome> {
  const now = (d.now ?? (() => new Date()))();
  await d.db.query("update finance.inbound_sources set mail_count=mail_count+1, last_mail_at=now(), first_mail_at=coalesce(first_mail_at,now()) where user_id=$1", [userId]);

  // Gmail's forwarding confirmation: keep the code for the setup screen, nothing else.
  const fromDomain = domainOf(mail.from);
  const code = forwardingCode(mail.from, mail.subject, mail.text);
  if (code && (mail.auth.dmarcPass || mail.auth.dkimDomains.some((x) => x === "google.com" || x.endsWith(".google.com")))) {
    await d.db.query("update finance.inbound_sources set forward_code=$2, forward_code_at=now() where user_id=$1", [userId, code]);
    return { status: "forwarding-code", reason: "gmail-confirmation", userId };
  }

  // Gate 1: only listed issuers. Gate 2: the mail must really come from them (DKIM aligned or DMARC pass).
  const issuer = issuerFor(fromDomain);
  if (!issuer) return { status: "ignored", reason: "sender-not-allowed", userId };
  const aligned = mail.auth.dmarcPass || mail.auth.dkimDomains.some((x) => issuer.domains.some((dom) => x === dom || x.endsWith("." + dom)));
  if (!aligned) return { status: "ignored", reason: "auth-failed", userId };
  // Gate 3: codes, PINs and resets are never read or stored.
  if (isSecretMail(mail.subject, mail.text)) return { status: "ignored", reason: "secret", userId };

  const messageId = (mail.messageId || `${fromDomain}:${mail.subject}:${mail.date?.toISOString() ?? ""}`).slice(0, 300);
  const claimed = await d.db.query("insert into finance.inbound_messages(user_id,message_id,sender_domain,channel,status) values($1,$2,$3,$4,'review') on conflict(user_id,message_id) do nothing returning id", [userId, messageId, fromDomain, issuer.id]);
  if (!claimed.rows[0]) return { status: "duplicate", reason: "same-message", userId };
  const inboundId = claimed.rows[0].id as string;

  const finish = async (status: Outcome["status"], reason: string, extra: { parsed?: unknown; confidence?: number; entryId?: string | null; at?: string | null } = {}): Promise<Outcome> => {
    await d.db.query("update finance.inbound_messages set status=$2,reason=$3,parsed=coalesce($4::jsonb,parsed),confidence=coalesce($5,confidence),entry_id=$6,occurred_at=$7 where id=$1", [inboundId, status === "forwarding-code" ? "ignored" : status, reason, extra.parsed ? JSON.stringify(extra.parsed) : null, extra.confidence ?? null, extra.entryId ?? null, extra.at ?? null]);
    return { status, reason, userId };
  };

  // Read it: rules first, model only when the rules are unsure.
  let x = extractPayment(mail.subject, mail.text);
  if (!isConfident(x) && d.llm) {
    try { const m = await d.llm(mail.subject, mail.text, mail.from); if (m && m.amount > 0 && m.confidence >= x.confidence) x = { ...x, ...m, accountHint: m.accountHint || x.accountHint, ref: m.ref || x.ref }; } catch { /* model is optional */ }
  }
  const atMs = x.at ?? mail.date?.getTime() ?? now.getTime();
  const at = new Date(Number.isFinite(atMs) ? atMs : now.getTime()).toISOString();
  const parsed = { amount: x.amount, direction: x.direction, merchant: x.merchant, accountHint: x.accountHint, ref: x.ref, at, subject: mail.subject.slice(0, 80), issuer: issuer.name };
  if (!(x.amount > 0)) return finish("failed", "unreadable", { parsed, confidence: x.confidence });

  // A bank reference seen before is the same payment.
  if (x.ref) {
    const dup = await d.db.query("select id,entry_id from finance.inbound_messages where user_id=$1 and id<>$2 and parsed->>'ref'=$3 and created_at > now() - interval '3 days' limit 1", [userId, inboundId, x.ref]);
    if (dup.rows[0]) return finish("duplicate", "same-reference", { parsed, confidence: x.confidence, entryId: dup.rows[0].entry_id, at });
  }

  const accountId = await ensureAccount(d.db, userId, issuer, x.accountHint);
  const kind: "out" | "in" = x.direction === "in" ? "in" : "out";

  // Same money already recorded (Djiwa Pay, scan, manual or another e-mail)?
  const same = await d.db.query("select id from finance.entries where user_id=$1 and amount=$2 and kind=$3 and account_id=$4 and at between $5::timestamptz - ($6 * interval '1 millisecond') and $5::timestamptz + ($6 * interval '1 millisecond') limit 1", [userId, x.amount, kind, accountId, at, CLOSE_MS]);
  if (same.rows[0]) return finish("duplicate", "already-recorded", { parsed, confidence: x.confidence, entryId: same.rows[0].id, at });

  // The other half of a move between the user's own accounts becomes one transfer.
  if (x.direction !== "unknown") {
    const other = await d.db.query("select id,account_id from finance.entries where user_id=$1 and source='email' and kind=$2 and amount=$3 and account_id<>$4 and at between $5::timestamptz - ($6 * interval '1 millisecond') and $5::timestamptz + ($6 * interval '1 millisecond') limit 1", [userId, kind === "in" ? "out" : "in", x.amount, accountId, at, TRANSFER_MS]);
    if (other.rows[0]) {
      const from = kind === "in" ? other.rows[0].account_id : accountId, to = kind === "in" ? accountId : other.rows[0].account_id;
      await d.db.query("update finance.entries set kind='tf', account_id=$3, to_account_id=$4, category_id='transfer', note='Transfer antar akun' where user_id=$1 and id=$2", [userId, other.rows[0].id, from, to]);
      await bump(d.db, userId);
      return finish("auto", "transfer", { parsed, confidence: x.confidence, entryId: other.rows[0].id, at });
    }
  }

  const learned = await learnedCategory(d.db, userId, x.merchant);
  const categoryId = learned ?? guessCategory(x.merchant, mail.subject, x.direction);
  const candidate: Candidate = { kind, amount: x.amount, categoryId, accountId, at, note: x.merchant || mail.subject.slice(0, 60) || issuer.name };

  const knownMerchant = Boolean(learned) || (categoryId !== "lainnya" && Boolean(x.merchant)) || (kind === "in" && Boolean(x.merchant));
  const trusted = trustedCount >= (d.trustMin ?? TRUST_MIN);
  const auto = trusted && isConfident(x) && knownMerchant && issuer.kind !== "service" && x.amount <= (d.autoCeiling ?? AUTO_CEILING);
  if (auto) {
    const entryId = await d.db.tx((q) => insertEntry(q, userId, candidate, inboundId));
    return finish("auto", "recorded", { parsed, confidence: x.confidence, entryId, at });
  }
  return finish("review", trusted ? "needs-check" : "learning", { parsed: { ...parsed, categoryId, accountId, kind }, confidence: x.confidence, at });
}

/* ---------------- review queue ---------------- */

export async function reviewList(db: Q, userId: string) {
  const r = await db.query("select id,channel,sender_domain,parsed,confidence,status,reason,occurred_at,created_at from finance.inbound_messages where user_id=$1 and status in ('review','failed') order by created_at desc limit 50", [userId]);
  return r.rows.map((m) => ({ id: m.id as string, channel: m.channel as string, status: m.status as string, reason: m.reason as string, confidence: Number(m.confidence), parsed: m.parsed as Record<string, any>, createdAt: new Date(m.created_at).toISOString() }));
}
export async function reviewCount(db: Q, userId: string) {
  const r = await db.query("select count(*)::int as n from finance.inbound_messages where user_id=$1 and status in ('review','failed')", [userId]);
  return Number(r.rows[0]?.n ?? 0);
}

export type Edits = { amount?: unknown; kind?: unknown; categoryId?: unknown; accountId?: unknown; note?: unknown; at?: unknown };
export async function approve(d: Tx, userId: string, inboundId: string, e: Edits): Promise<{ entryId: string } | null> {
  return d.tx(async (q) => {
    const m = (await q.query("select id,parsed,status,channel from finance.inbound_messages where user_id=$1 and id=$2 and status in ('review','failed') for update", [userId, inboundId])).rows[0];
    if (!m) return null;
    const p = (m.parsed ?? {}) as Record<string, any>;
    const amount = Number(e.amount ?? p.amount), kind = (e.kind ?? p.kind ?? (p.direction === "in" ? "in" : "out")) === "in" ? "in" : "out";
    if (!(amount > 0)) return null;
    const atMs = Date.parse(String(e.at ?? p.at));
    const candidate: Candidate = {
      kind, amount, categoryId: String(e.categoryId ?? p.categoryId ?? "lainnya").slice(0, 80),
      accountId: String(e.accountId ?? p.accountId ?? "tunai").slice(0, 80), at: new Date(Number.isNaN(atMs) ? Date.now() : atMs).toISOString(), note: String(e.note ?? p.merchant ?? p.subject ?? "").slice(0, 200),
    };
    const entryId = await insertEntry(q, userId, candidate, inboundId);
    await q.query("update finance.inbound_messages set status='approved', entry_id=$2, reason='approved' where id=$1", [inboundId, entryId]);
    await q.query("update finance.inbound_sources set trusted_count=trusted_count+1 where user_id=$1", [userId]);
    const key = merchantKey(String(p.merchant ?? ""));
    if (key) await q.query("insert into finance.merchant_rules(user_id,pattern,category_id) values($1,$2,$3) on conflict(user_id,pattern) do update set category_id=excluded.category_id, uses=finance.merchant_rules.uses+1, updated_at=now()", [userId, key, candidate.categoryId]);
    return { entryId };
  });
}

/** Rejects a queued item, or undoes an automatic record (the entry is removed too). */
export async function reject(d: Tx, userId: string, inboundId: string): Promise<boolean> {
  return d.tx(async (q) => {
    const m = (await q.query("select entry_id,status from finance.inbound_messages where user_id=$1 and id=$2 and status in ('review','failed','auto') for update", [userId, inboundId])).rows[0];
    if (!m) return false;
    if (m.status === "auto" && m.entry_id) { await q.query("delete from finance.entries where user_id=$1 and id=$2 and source='email'", [userId, m.entry_id]); await bump(q, userId); }
    await q.query("update finance.inbound_messages set status='rejected', reason='rejected' where id=$1", [inboundId]);
    if (m.status === "auto") await q.query("update finance.inbound_sources set trusted_count=greatest(trusted_count-2,0) where user_id=$1", [userId]);
    return true;
  });
}

export async function originOf(db: Q, userId: string, inboundId: string) {
  const r = await db.query("select id,channel,sender_domain,parsed,status,created_at from finance.inbound_messages where user_id=$1 and id=$2", [userId, inboundId]);
  const m = r.rows[0];
  return m ? { id: m.id as string, channel: m.channel as string, senderDomain: m.sender_domain as string, status: m.status as string, issuer: String(m.parsed?.issuer ?? ""), subject: String(m.parsed?.subject ?? ""), receivedAt: new Date(m.created_at).toISOString() } : null;
}

/** Housekeeping: nothing but recent, actionable rows are kept. */
export async function sweep(db: Q) {
  await db.query("delete from finance.inbound_messages where status in ('ignored','duplicate','rejected','failed') and created_at < now() - interval '30 days'");
  await db.query("delete from finance.inbound_messages where status in ('review') and created_at < now() - interval '90 days'");
}
