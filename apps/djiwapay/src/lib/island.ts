import { useSyncExternalStore } from "react";
import type { IconName } from "../features/shell/dpx-ui";
import { rupiah } from "./djiwa-pay-format";
import type { FinNote } from "./finance/notify";
import type { Entry } from "./finance/types";
import type { WalletNotification } from "./wallet-adapter";

/** What the Dynamic-Island-style banner shows when the app opens: money that moved, mail that was read, things that need a look. */
export type IslandTone = "in" | "out" | "move" | "mail" | "warn" | "info";
export type IslandItem = { id: string; tone: IslandTone; icon: IconName; label: string; title: string; message: string; amount?: number; sign?: "+" | "−" | "⇄"; route?: string; at: string };

const SOURCES = new Set<Entry["source"]>(["pay", "email", "receipt", "sheet"]);
const SOURCE_LABEL: Partial<Record<Entry["source"], string>> = { pay: "Djiwa Pay", email: "Dari email", receipt: "Scan struk", sheet: "Sheets" };
const NOTE_LOOK: Record<FinNote["notification_type"], { tone: IslandTone; icon: IconName; label: string }> = {
  "fin-email": { tone: "mail", icon: "receipt", label: "Email" }, "fin-bill": { tone: "warn", icon: "cal", label: "Tagihan" }, "fin-budget": { tone: "warn", icon: "warn", label: "Anggaran" }, "fin-debt": { tone: "info", icon: "users", label: "Hutang" }, "fin-goal": { tone: "in", icon: "target", label: "Tujuan" },
};

export function buildIsland(input: { entries: Entry[]; notes: FinNote[]; wallet: WalletNotification[]; seen: Set<string>; accountName: (id: string) => string; now?: Date; max?: number }): IslandItem[] {
  const now = input.now ?? new Date(), out: IslandItem[] = [];
  for (const n of input.notes) {
    if (n.id.startsWith("fin-em:") || input.seen.has(n.id)) continue;   // mail entries are shown from the entries themselves, with their amounts
    const look = NOTE_LOOK[n.notification_type];
    out.push({ id: n.id, tone: look.tone, icon: look.icon, label: look.label, title: n.title, message: n.message, route: n.route, at: n.created_at });
  }
  for (const w of input.wallet) {
    const id = `isl-w:${w.id}`; if (!w.unread || input.seen.has(id)) continue;
    const sent = /sent/.test(w.notification_type);
    out.push({ id, tone: sent ? "out" : "in", icon: sent ? "down" : "up", label: "Djiwa Pay", title: w.title, message: w.message, route: "/riwayat", at: w.created_at });
  }
  for (const e of input.entries) {
    const id = `isl-e:${e.id}`;
    if (!SOURCES.has(e.source) || input.seen.has(id) || +now - +new Date(e.at) > 36 * 36e5) continue;
    const tone: IslandTone = e.kind === "in" ? "in" : e.kind === "out" ? "out" : "move";
    out.push({ id, tone: e.source === "email" && tone !== "move" ? tone : tone, icon: e.kind === "in" ? "up" : e.kind === "out" ? "down" : "swap", label: SOURCE_LABEL[e.source] ?? "Catatan", title: e.kind === "in" ? "Pemasukan" : e.kind === "out" ? "Pengeluaran" : "Pindah dana",
      message: `${e.note || "Tanpa keterangan"} · ${input.accountName(e.accountId)}`, amount: e.amount, sign: e.kind === "in" ? "+" : e.kind === "out" ? "−" : "⇄", route: "/riwayat", at: e.at });
  }
  return out.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, input.max ?? 6);
}
export const islandAmount = (i: IslandItem) => (i.amount === undefined ? "" : `${i.sign === "⇄" ? "" : i.sign}${rupiah(i.amount)}`);

const SEEN_KEY = (id: string) => `djiwa-island-seen:${id}`;
export function loadSeen(profileId: string): Set<string> { try { return new Set(JSON.parse(window.localStorage.getItem(SEEN_KEY(profileId)) || "[]") as string[]); } catch { return new Set(); } }
export function saveSeen(profileId: string, ids: Set<string>) { try { window.localStorage.setItem(SEEN_KEY(profileId), JSON.stringify([...ids].slice(-500))); } catch { /* storage blocked */ } }

/* ---- tiny store so the screen can hand the queue to the banner that lives outside it ---- */
type State = { queue: IslandItem[]; version: number };
let state: State = { queue: [], version: 0 };
const listeners = new Set<() => void>();
let navigate: ((route: string) => void) | null = null, onShown: ((item: IslandItem) => void) | null = null;
let idle = true;
export const setIslandIdle = (v: boolean) => { idle = v; };
export const startIsland = (queue: IslandItem[]) => { if (!queue.length) return; idle = false; state = { queue, version: state.version + 1 }; listeners.forEach((l) => l()); };
/** A push arrived or was tapped: show it now if the banner is quiet, otherwise line it up behind the current one. */
export function enqueueIsland(item: IslandItem) {
  if (state.queue.some((q) => q.id === item.id) && !idle) return;
  if (idle) { startIsland([item]); return; }
  state = { queue: [...state.queue, item], version: state.version }; listeners.forEach((l) => l());
}
const PUSH_ICON: Record<IslandTone, IconName> = { in: "up", out: "down", move: "swap", mail: "receipt", warn: "warn", info: "bell" };
/** The notification payload the server sends is already island-shaped; this just makes sure it is safe to show. */
export function islandFromPush(d: Partial<IslandItem> & { title?: string }): IslandItem | null {
  if (!d || typeof d.title !== "string") return null;
  const tone: IslandTone = (["in", "out", "move", "mail", "warn", "info"] as const).includes(d.tone as IslandTone) ? (d.tone as IslandTone) : "info";
  return { id: String(d.id ?? `push-${Date.now()}`).slice(0, 80), tone, icon: PUSH_ICON[tone], label: String(d.label ?? "Djiwa Pay").slice(0, 30), title: d.title.slice(0, 80), message: String(d.message ?? "").slice(0, 160), ...(typeof d.amount === "number" ? { amount: d.amount, sign: d.sign === "+" || d.sign === "−" || d.sign === "⇄" ? d.sign : undefined } : {}), ...(typeof d.route === "string" && d.route.startsWith("/") ? { route: d.route } : {}), at: String(d.at ?? new Date().toISOString()) };
}
export const registerIslandHandlers = (nav: (route: string) => void, shown: (item: IslandItem) => void) => { navigate = nav; onShown = shown; };
export const islandNavigate = (route: string) => navigate?.(route);
export const islandShown = (item: IslandItem) => onShown?.(item);
export const useIslandState = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state, () => state);
