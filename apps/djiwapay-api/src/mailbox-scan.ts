import { accessToken, googleReason, type Fetch, type GoogleCfg } from "./google.js";
import { ISSUERS } from "./mail/issuers.js";
import type { Q } from "./sync.js";

/** Looks through the person's Gmail for transaction mail from every known bank, e-wallet and biller (last 14 months), so the ones that are
 *  in the mailbox but not tracked anywhere show up as discoveries. It reads who sent it and when, nothing else, and keeps nothing of the mail itself. */
const WORDS = "transaksi OR pembayaran OR transfer OR berhasil OR notifikasi OR tagihan OR mutasi OR debit OR kredit OR top-up OR topup OR saldo OR invoice OR struk OR receipt OR pesanan OR cicilan OR angsuran";
export const scanQuery = (domains: string[]) => `from:(${domains.join(" OR ")}) subject:(${WORDS}) newer_than:420d`;

export async function scanMailbox(db: Q, cfg: GoogleCfg, userId: string, f: Fetch = fetch): Promise<{ ok: boolean; error?: string; found: number; checked: number }> {
  const token = await accessToken(db, cfg, userId, f);
  if (!token) return { ok: false, error: "NOT_CONNECTED", found: 0, checked: 0 };
  const scopes = ((await db.query("select granted_scopes from finance.google_connections where user_id=$1", [userId])).rows[0]?.granted_scopes ?? []) as string[];
  if (!scopes.includes("https://www.googleapis.com/auth/gmail.readonly")) return { ok: false, error: "SCOPE_MISSING", found: 0, checked: 0 };
  const auth = { authorization: `Bearer ${token}` };
  let found = 0, failed = 0;
  /** Gmail answers "too many requests" to a burst: wait a moment and ask again, a few times. */
  const get = async (url: string) => { for (let n = 0; n < 4; n++) { const r = await f(url, { headers: auth }); if (r.status !== 429 && r.status !== 403) return r; if (r.status === 403 && !/rateLimit|quota/i.test(await googleReason(r))) return r; await new Promise((x) => setTimeout(x, 800 * (n + 1))); } return f(url, { headers: auth }); };
  const one = async (i: (typeof ISSUERS)[number]) => {
    const res = await get(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q: scanQuery(i.domains), maxResults: "5" })}`);
    if (!res.ok) { failed++; return; }
    const j = (await res.json()) as { messages?: { id: string }[]; resultSizeEstimate?: number };
    const first = j.messages?.[0]?.id; if (!first) return;
    const m = await get(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(first)}?format=minimal`);
    const at = m.ok ? Number(((await m.json()) as { internalDate?: string }).internalDate) : NaN;
    await db.query("insert into finance.mailbox_seen(user_id,issuer_id,last_at,seen_at,approx) values($1,$2,$3,now(),$4) on conflict(user_id,issuer_id) do update set last_at=excluded.last_at, seen_at=now(), approx=excluded.approx",
      [userId, i.id, Number.isFinite(at) ? new Date(at).toISOString() : new Date().toISOString(), Math.max(1, j.messages?.length ?? 1)]);
    found++;
  };
  const list = ISSUERS.filter((i) => i.domains.length);
  for (let k = 0; k < list.length; k += 3) { await Promise.all(list.slice(k, k + 3).map((i) => one(i).catch(() => { failed++; }))); await new Promise((r) => setTimeout(r, 120)); }
  return failed >= list.length ? { ok: false, error: "GMAIL_FAILED", found, checked: list.length } : { ok: true, found, checked: list.length };
}
