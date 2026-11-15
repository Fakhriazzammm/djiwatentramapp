/** A tripwire for the review queue.
 *
 *  Every rule in extract.ts was learned from a real e-mail that had been read as money. Those exact
 *  shapes must never come back, and a shape nobody has seen yet should be noticed early rather than
 *  recorded. This module never changes a row: it names the ones that look like the mistakes, for
 *  every user, so a person can look. `sweep()` logs it every few hours and
 *  `apps/djiwapay-api/scripts/audit-mail-queue.ts` prints it in full.
 */
import type { Q } from "../sync.js";
import { RULES_VERSION } from "./extract.js";

export type AuditRow = {
  id: string;
  userId: string;
  status: string;
  reason: string | null;
  subject: string;
  amount: number;
  direction: string;
  sure: boolean;
  at: string | null;
  rulesVersion: number;
};

/** Wording that never belongs to a movement of money. */
const NOISE = /\b(promo|promosi|diskon|cashback|voucher|kupon|penawaran|spesial|flash ?sale|survei|survey|responden|kuesioner|undian|hadiah|hemat|laporan|statement|rekap|ringkasan|mutasi|riwayat|settlement|tidak berhasil|gagal|dibatalkan|cancelled|ditolak|waspada|hati-hati|modus|penipuan|jatuh tempo|jumlah tagihan|akan didebet|akan dipotong)\b/i;

const TINY = 1_000;                  // under Rp1.000 the number came out of a coupon, not a payment
const OLDEST_MS = 2 * 365 * 86400_000;  // no bank sends a two-year-old receipt for the first time
const AHEAD_MS = 2 * 86400_000;

/** What is wrong with this row, if anything. Pure, so the shapes can be unit-tested. */
export function auditRow(r: Omit<AuditRow, "id" | "userId" | "reason" | "status">): string[] {
  const flags: string[] = [];
  if (NOISE.test(r.subject)) flags.push("noise-subject");
  if (!(r.amount >= TINY)) flags.push("tiny-amount");
  const at = r.at ? Date.parse(r.at) : NaN;
  if (Number.isFinite(at)) {
    if (at > Date.now() + AHEAD_MS || at < Date.now() - OLDEST_MS) flags.push("far-date");
  } else if (r.amount > 0) flags.push("no-date");
  if (r.sure && r.direction === "unknown") flags.push("unknown-direction-sure");
  if (r.rulesVersion < RULES_VERSION) flags.push("old-rules");
  return flags;
}

const row = (m: Record<string, any>): AuditRow => {
  const p = (m.parsed ?? {}) as Record<string, any>;
  return {
    id: m.id as string, userId: m.user_id as string, status: m.status as string, reason: (m.reason as string) ?? null,
    subject: String(p.subject ?? ""), amount: Number(p.amount ?? 0), direction: String(p.direction ?? "unknown"),
    sure: Boolean(p.sure), at: p.at ? String(p.at) : null, rulesVersion: Number(p.rulesVersion ?? 0),
  };
};

/** Rows a person still has to look at: staged for an import, or waiting in the review queue. */
export async function auditQueue(db: Q, userId?: string): Promise<(AuditRow & { flags: string[] })[]> {
  const r = await db.query(
    `select id,user_id,status,reason,parsed from finance.inbound_messages
      where status in ('staged','review','failed') and user_id not like 'itest-%' ${userId ? "and user_id=$1" : ""}
      order by created_at desc`,
    userId ? [userId] : [],
  );
  return r.rows.map((m) => { const a = row(m as Record<string, any>); return { ...a, flags: auditRow(a) }; }).filter((a) => a.flags.length > 0);
}

/** Counts per flag, for a log line that stays short. */
export function auditSummary(rows: { flags: string[]; userId: string }[]) {
  const flags: Record<string, number> = {}, users: Record<string, number> = {};
  for (const r of rows) {
    for (const f of r.flags) flags[f] = (flags[f] ?? 0) + 1;
    users[r.userId] = (users[r.userId] ?? 0) + 1;
  }
  return { rows: rows.length, flags, users };
}
