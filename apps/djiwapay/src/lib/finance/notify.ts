import { billsFor, monthKey } from "./kelola";
import { budgetStatuses, daysUntil, debtRemaining, goalPlan, inMonth } from "./calc";
import { rupiah } from "../djiwa-pay-format";
import type { Entry, FinanceState } from "./types";

/** Notifications derived from the person's own records: e-mail activity, bills, budgets, debts and goals. */
export type FinNote = { id: string; title: string; message: string; notification_type: "fin-email" | "fin-bill" | "fin-budget" | "fin-debt" | "fin-goal"; created_at: string; route: string };
const WAIT = 3 * 864e5;

export function financeNotes(state: FinanceState, entries: Entry[], inbound: { review: number; autoRecent: number } | null, now = new Date()): FinNote[] {
  const out: FinNote[] = [], iso = now.toISOString(), mk = monthKey(now);
  if (inbound && inbound.review > 0) out.push({ id: `fin-review:${inbound.review}`, title: `${inbound.review} email perlu ditinjau`, message: "Ada email pembayaran yang belum bisa dicatat otomatis. Ketuk untuk memeriksa dan menyetujui.", notification_type: "fin-email", created_at: iso, route: "/tinjau" });
  if (inbound && inbound.autoRecent > 0) out.push({ id: `fin-auto:${inbound.autoRecent}`, title: `${inbound.autoRecent} catatan baru dari email`, message: "Tercatat otomatis. Ketuk untuk melihat atau mengurungkan.", notification_type: "fin-email", created_at: iso, route: "/riwayat" });
  for (const e of entries.filter((x) => x.source === "email" && +now - +new Date(x.at) < WAIT && x.kind !== undefined).slice(0, 8)) {
    const sign = e.kind === "in" ? "+" : e.kind === "out" ? "−" : "⇄";
    out.push({ id: `fin-em:${e.id}`, title: e.kind === "tf" ? `Top-up ${e.note.replace(/^Top-up\s*/i, "") || "dompet"} tercatat` : e.note || "Catatan dari email", message: `${e.kind === "tf" ? "Pindah dana" : "Tercatat dari email"} · ${sign}${rupiah(e.amount)}`, notification_type: "fin-email", created_at: new Date(e.at).toISOString(), route: "/riwayat" });
  }
  for (const v of billsFor(state.bills, now).filter((x) => x.status === "late" || x.status === "today" || x.status === "soon").slice(0, 5)) {
    out.push({ id: `fin-bill:${v.bill.id}:${mk}:${v.status}`, title: v.status === "late" ? `${v.bill.name} terlambat` : v.status === "today" ? `${v.bill.name} jatuh tempo hari ini` : `${v.bill.name} jatuh tempo ${v.daysLeft} hari lagi`, message: `Tagihan ${rupiah(v.bill.amount)}. Ketuk untuk membuka kalender tagihan.`, notification_type: "fin-bill", created_at: iso, route: "/kalender" });
  }
  const month = entries.filter((e) => inMonth(e, now.getFullYear(), now.getMonth()));
  for (const s of budgetStatuses(state.budgets, month).filter((x) => x.level !== "ok").slice(0, 4)) {
    const name = state.categories.find((c) => c.id === s.budget.categoryId)?.name ?? "Anggaran";
    out.push({ id: `fin-bud:${s.budget.categoryId}:${mk}:${s.level}`, title: s.level === "over" ? `Anggaran ${name} terlampaui` : `Anggaran ${name} hampir habis`, message: s.level === "over" ? `Lewat ${rupiah(-s.remaining)} dari batas ${rupiah(s.budget.limit)}.` : `Terpakai ${Math.round(s.percent)}%, sisa ${rupiah(s.remaining)}.`, notification_type: "fin-budget", created_at: iso, route: "/rencana" });
  }
  for (const d of state.debts.filter((x) => !x.settled)) {
    const n = daysUntil(d.due, now); if (n === null || n > 3) continue;
    out.push({ id: `fin-debt:${d.id}:${d.due}`, title: n < 0 ? `${d.direction === "i_owe" ? "Hutang ke" : "Piutang dari"} ${d.person} terlambat` : `${d.direction === "i_owe" ? "Hutang ke" : "Piutang dari"} ${d.person} jatuh tempo ${n === 0 ? "hari ini" : `${n} hari lagi`}`, message: `Sisa ${rupiah(debtRemaining(d))}.`, notification_type: "fin-debt", created_at: iso, route: "/rencana?bagian=hutang" });
  }
  for (const g of state.goals) { if (goalPlan(g, now).done && g.deposits.length) out.push({ id: `fin-goal:${g.id}`, title: `Tujuan ${g.name} tercapai`, message: "Selamat, targetmu terpenuhi.", notification_type: "fin-goal", created_at: new Date(g.deposits[g.deposits.length - 1].at).toISOString(), route: "/rencana?bagian=tujuan" }); }
  return out;
}

const key = (id: string) => `djiwa-fin-notif-read:${id}`;
export function loadRead(profileId: string): Set<string> { try { return new Set(JSON.parse(window.localStorage.getItem(key(profileId)) || "[]") as string[]); } catch { return new Set(); } }
export function saveRead(profileId: string, ids: Set<string>) { try { window.localStorage.setItem(key(profileId), JSON.stringify([...ids].slice(-400))); } catch { /* storage blocked: unread state is per visit */ } }
