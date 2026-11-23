import type { Account, AccountType, Bill, Entry, FinanceState } from "./types";

/**
 * "Temuan": things worth saving that the person's own records reveal. Everything is computed from the records,
 * so it also works on history that already exists, and nothing is stored but the person's answer (a decision key).
 *  - account:   a wallet or bank account that e-mail created on its own (new bank, new account number, new e-wallet)
 *  - recurring: the same payee, about a month apart, about the same amount: a bill or subscription not saved yet
 *  - price:     a saved bill whose latest payment differs from the saved amount
 *  - stopped:   a monthly payment that used to come and stopped
 * A suggestion never changes a record by itself, and each one is checked against what already exists so it can never create a duplicate.
 */
export type DiscoveryKind = "account" | "recurring" | "price" | "stopped";
export type DiscoveryGroup = "dompet" | "tagihan" | "langganan";
export type BillDraft = { id: string; name: string; amount: number; day: number; icon: string; tone: string };
export type Discovery = {
  key: string; kind: DiscoveryKind; group: DiscoveryGroup; title: string; lead: string; detail: string;
  amount?: number; /** 0..1, how sure the detector is. */ confidence: number; at: string;
  accountId?: string; /** A bank or e-wallet seen in e-mail that is not in any wallet, asset, bill or loan yet: saving creates this wallet. */ draft?: Account; bill?: BillDraft; billId?: string; newAmount?: number; oldAmount?: number;
  /** Past payments that prove the pattern, newest first. */ proof: { at: string; amount: number }[];
};
/** From the server: a bank or e-wallet that e-mail shows and that is tracked nowhere yet. */
export type Untracked = { key: string; issuerId: string; name: string; kind: string; hint: string; count: number; firstAt: string; lastAt: string; sameIssuer: { id: string; name: string }[] };
export type Decision = { key: string; status: "saved" | "dismissed" | "snoozed"; until: string | null };

const DAY = 86_400_000;
const SUBSCRIPTION = /\b(netflix|spotify|youtube|yt premium|disney|hbo|vidio|viu|wetv|iqiyi|prime video|apple|icloud|google one|google play|chatgpt|openai|claude|canva|notion|adobe|microsoft 365|office 365|dropbox|zoom|linkedin|duolingo|joox|tidal|steam|playstation|psn|xbox|nintendo|gopay later|gym|fitness)\b/i;

/** The same payee written two ways ("Netflix.com 8821", "NETFLIX") must read as one. */
export const payeeKey = (note: string) => note.toLowerCase()
  .replace(/^(pembayaran|bayar|tagihan|top-?up|pay(ment)?|trx|transaksi)\s+/i, "")
  .replace(/\b(rp|idr)\b/g, "").replace(/[\d]{3,}/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" ");
const same = (a: string, b: string) => a.length >= 3 && b.length >= 3 && (a === b || a.includes(b) || b.includes(a));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const title = (k: string) => k.replace(/\b\w/g, (c) => c.toUpperCase());
const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
const slug = (s: string) => s.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const jakartaDay = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).getUTCDate();

const isMailAccount = (a: Account) => a.id.startsWith("email-") && !a.archived;
const issuerOf = (id: string) => id.replace(/^email-/, "").replace(/-\d{2,}$/, "");

function untrackedFinds(state: FinanceState, extra: Untracked[]): Discovery[] {
  return extra.filter((u) => !state.accounts.some((a) => a.id === `email-${u.issuerId}${u.hint ? "-" + u.hint : ""}`)).map((u) => {
    const id = `email-${u.issuerId}${u.hint ? "-" + u.hint : ""}`, label = `${u.name}${u.hint ? " ••" + u.hint : ""}`, type: AccountType = u.kind === "ewallet" ? "ewallet" : "bank";
    const lead = u.sameIssuer.length ? `Rekening baru di ${u.name}` : `${type === "ewallet" ? "E-wallet" : "Bank"} baru: ${u.name}`;
    return { key: u.key, kind: "account" as const, group: "dompet" as const, title: label, lead, detail: `Muncul di ${u.count} email, terakhir ${shortDate(u.lastAt)}, tetapi belum ada di dompet, aset, tagihan, atau kewajibanmu. Simpan agar tercatat dan tidak terlewat.`,
      confidence: 0.92, at: u.lastAt, accountId: id, draft: { id, name: label, type, opening: 0 }, proof: [] };
  });
}

const NEW_DAYS = 3;   // a wallet older than this is no longer "new": it is part of the person's life already

function accountFinds(state: FinanceState, entries: Entry[], now: Date): Discovery[] {
  const out: Discovery[] = [];
  for (const a of state.accounts.filter(isMailAccount)) {
    const mine = entries.filter((e) => e.accountId === a.id || e.toAccountId === a.id).sort((x, y) => +new Date(y.at) - +new Date(x.at));
    const base = issuerOf(a.id), hint = a.id.match(/-(\d{2,})$/)?.[1] ?? "";
    const siblings = state.accounts.filter((o) => o.id !== a.id && !o.archived && issuerOf(o.id) === base && o.id.startsWith("email-"));
    const first = mine[mine.length - 1];
    // Only a wallet that has just appeared is a discovery. One that has been in use for days, was given an opening balance, or has records the person made by hand is already theirs.
    if (first && +now - +new Date(first.at) > NEW_DAYS * DAY) continue;
    if (a.opening !== 0 || mine.some((e) => e.source !== "email")) continue;
    const bank = a.name.replace(/\s*••.*$/, "");
    const lead = hint ? (siblings.length ? `Rekening baru di ${bank}` : `${a.type === "ewallet" ? "E-wallet" : "Bank"} baru: ${bank}`) : (a.type === "ewallet" ? `E-wallet baru: ${bank}` : `Dompet baru: ${bank}`);
    out.push({
      key: `acct:${a.id}`, kind: "account", group: "dompet", title: a.name, lead,
      detail: mine.length ? `Dibuat dari email pembayaran. ${mine.length} catatan sudah masuk${first ? `, pertama ${shortDate(first.at)}` : ""}.` : "Dibuat dari email pembayaran.",
      confidence: 0.9, at: mine[0]?.at ?? new Date().toISOString(), accountId: a.id, proof: mine.slice(0, 3).map((e) => ({ at: e.at, amount: e.amount })),
    });
  }
  return out;
}

type Series = { key: string; name: string; list: Entry[]; gap: number; amount: number };

/** Payees that were paid at least three times, about a month apart, for about the same amount. */
function monthlySeries(entries: Entry[], now: Date): Series[] {
  const by = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.kind !== "out" || e.categoryId === "transfer" || e.tags.includes("loan-receipt") || !e.note) continue;
    if (+now - +new Date(e.at) > 400 * DAY) continue;
    const k = payeeKey(e.note); if (k.length < 3) continue;
    by.set(k, [...(by.get(k) ?? []), e]);
  }
  const out: Series[] = [];
  for (const [key, raw] of by) {
    const list = raw.sort((a, b) => +new Date(b.at) - +new Date(a.at));
    // two payments the same day are one payment seen twice
    const days: Entry[] = []; for (const e of list) if (!days.length || Math.abs(+new Date(days[days.length - 1].at) - +new Date(e.at)) > 5 * DAY) days.push(e);
    if (days.length < 3) continue;
    const gaps = days.slice(0, -1).map((e, i) => (+new Date(e.at) - +new Date(days[i + 1].at)) / DAY);
    const gap = median(gaps), amount = median(days.map((e) => e.amount));
    const steady = gaps.filter((g) => g >= 24 && g <= 38).length / gaps.length >= 0.75;
    const alike = days.filter((e) => Math.abs(e.amount - amount) / amount <= 0.2).length / days.length >= 0.75;
    if (gap >= 26 && gap <= 35 && steady && alike) out.push({ key, name: title(key), list: days, gap, amount });
  }
  return out;
}

const hasBill = (bills: Bill[], loanBillIds: Set<string>, s: Series, amount: number, day: number) => bills.some((b) => loanBillIds.has(b.id) || same(payeeKey(b.name), s.key) || (Math.abs(b.amount - amount) / amount < 0.01 && Math.abs(b.day - day) <= 3));

function billFinds(state: FinanceState, entries: Entry[], now: Date): Discovery[] {
  const out: Discovery[] = [], series = monthlySeries(entries, now);
  const loanBills = new Set((state.loans ?? []).map((l) => l.billId ?? `ln-${l.id}`));
  for (const s of series) {
    const last = s.list[0], day = jakartaDay(last.at), latest = last.amount, age = (+now - +new Date(last.at)) / DAY;
    const subscription = SUBSCRIPTION.test(s.key);
    const proof = s.list.slice(0, 4).map((e) => ({ at: e.at, amount: e.amount }));
    if (hasBill(state.bills, loanBills, s, latest, day)) continue;
    if (age <= s.gap * 1.45 + 5) {
      out.push({
        key: `rec:${slug(s.key)}`, kind: "recurring", group: subscription ? "langganan" : "tagihan", title: s.name,
        lead: subscription ? "Langganan terdeteksi" : "Tagihan rutin terdeteksi",
        detail: `${s.list.length} kali dibayar sekitar tanggal ${day}, sekitar ${rp(s.amount)} per bulan.`,
        amount: latest, confidence: Math.min(0.97, 0.6 + s.list.length * 0.08), at: last.at, proof,
        bill: { id: `disc-${slug(s.key)}`, name: s.name, amount: Math.round(latest), day, icon: subscription ? "repeat" : "receipt", tone: subscription ? "violet" : "amber" },
      });
    } else if (age < 200) {
      out.push({
        key: `stop:${slug(s.key)}:${last.at.slice(0, 7)}`, kind: "stopped", group: subscription ? "langganan" : "tagihan", title: s.name, lead: "Biasanya tiap bulan, kini berhenti",
        detail: `Terakhir dibayar ${shortDate(last.at)} (${Math.round(age)} hari lalu). Sudah berhenti, atau email pembayarannya tidak masuk?`,
        amount: latest, confidence: 0.6, at: last.at, proof,
      });
    }
  }
  return out;
}

function priceFinds(state: FinanceState, entries: Entry[], now: Date): Discovery[] {
  const out: Discovery[] = [];
  for (const b of state.bills) {
    const key = payeeKey(b.name); if (key.length < 3) continue;
    const paid = entries.filter((e) => e.kind === "out" && e.categoryId !== "transfer" && !e.tags.includes("loan-receipt") && same(payeeKey(e.note), key) && +now - +new Date(e.at) < 75 * DAY)
      .sort((x, y) => +new Date(y.at) - +new Date(x.at));
    const last = paid[0]; if (!last) continue;
    const diff = (last.amount - b.amount) / b.amount;
    if (Math.abs(diff) < 0.05) continue;
    const up = diff > 0;
    out.push({
      key: `price:${b.id}:${Math.round(last.amount)}`, kind: "price", group: SUBSCRIPTION.test(key) ? "langganan" : "tagihan", title: b.name,
      lead: up ? `Tagihan naik ${Math.round(diff * 100)}%` : `Tagihan turun ${Math.round(-diff * 100)}%`,
      detail: `Terakhir dibayar ${rp(last.amount)} pada ${shortDate(last.at)}, di daftar tagihan masih ${rp(b.amount)}.`,
      amount: last.amount, newAmount: Math.round(last.amount), oldAmount: b.amount, billId: b.id, confidence: paid.length > 1 && Math.abs(paid[1].amount - last.amount) / last.amount < 0.03 ? 0.95 : 0.75, at: last.at,
      proof: paid.slice(0, 3).map((e) => ({ at: e.at, amount: e.amount })),
    });
  }
  return out;
}

const ORDER: Record<DiscoveryKind, number> = { account: 0, price: 1, recurring: 2, stopped: 3 };

/** Everything found that the person has not answered yet, most useful first. */
export function findDiscoveries(state: FinanceState, entries: Entry[], decisions: Decision[], now = new Date(), untracked: Untracked[] = []): Discovery[] {
  const answered = new Set(decisions.filter((d) => d.status !== "snoozed" || (d.until && +new Date(d.until) > +now)).map((d) => d.key));
  return [...untrackedFinds(state, untracked), ...accountFinds(state, entries, now), ...priceFinds(state, entries, now), ...billFinds(state, entries, now)]
    .filter((d) => !answered.has(d.key))
    .filter((d) => d.confidence >= 0.6)
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || b.confidence - a.confidence || +new Date(b.at) - +new Date(a.at));
}

/** Other wallets this one could be merged into: same kind first, never itself or another unsorted mail wallet of a different bank. */
export function mergeTargets(state: FinanceState, accountId: string): Account[] {
  const me = state.accounts.find((a) => a.id === accountId); if (!me) return [];
  const base = issuerOf(me.id);
  return state.accounts.filter((a) => a.id !== me.id && !a.archived && a.id !== "tunai" && (!a.id.startsWith("email-") || issuerOf(a.id) === base))
    .sort((a, b) => Number(b.type === me.type) - Number(a.type === me.type) || a.name.localeCompare(b.name));
}

/** Moves everything recorded on one wallet to another: the records stay exactly as they were, only the wallet changes. */
export function movedEntries(entries: Entry[], from: string, to: string): Entry[] {
  const out: Entry[] = [];
  for (const e of entries) {
    if (e.accountId !== from && e.toAccountId !== from) continue;
    const next: Entry = { ...e, accountId: e.accountId === from ? to : e.accountId };
    if (e.toAccountId) next.toAccountId = e.toAccountId === from ? to : e.toAccountId;
    if (next.kind === "tf" && next.accountId === next.toAccountId) continue;   // a transfer that now starts and ends in one wallet would be nonsense
    out.push(next);
  }
  return out;
}

/** Checked again at the moment of saving, so a double tap, a second device or a bill added meanwhile can never leave two of the same bill. */
export function billExists(bills: Bill[], draft: { id: string; name: string; amount: number; day: number }): boolean {
  const k = payeeKey(draft.name);
  return bills.some((b) => b.id === draft.id || same(payeeKey(b.name), k) || (Math.abs(b.amount - draft.amount) / draft.amount < 0.01 && Math.abs(b.day - draft.day) <= 3));
}
