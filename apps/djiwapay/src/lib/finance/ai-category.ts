import { call } from "./integrations";
import type { Category, Entry } from "./types";
import type { Finance } from "./use-finance";

/** Entries whose category the model picked carry this tag, so the app can say so and the person can change it. */
export const AI_TAG = "kategori-ai";
export type AiPick = { key: string; categoryId: string | null; confidence: number; source: "rule" | "ai" | "none" };
export type CategorizeRes = { success: true; results: AiPick[]; limited: boolean; ai: boolean; remaining: number; minConfidence: number };
export type ItemIn = { key: string; text: string; amount?: number; kind: "in" | "out" };

export const categorizeRemote = (items: ItemIn[]) => call<CategorizeRes>("/categorize", { method: "POST", body: JSON.stringify({ items }) });
/** Remember a correction for that shop. Never blocks or fails the screen. */
export const learnRemote = (text: string, categoryId: string) => { if (text.trim().length >= 3) void call("/categorize/learn", { method: "POST", body: JSON.stringify({ text, categoryId }) }).catch(() => undefined); };

export const toItem = (e: Entry): ItemIn => ({ key: e.id, text: e.note, amount: e.amount, kind: e.kind === "in" ? "in" : "out" });
/** Records that still have no real category: nothing sorted them yet. */
export const isUnsorted = (e: Entry) => e.kind !== "tf" && e.source !== "pay" && e.categoryId === "lainnya" && e.note.trim().length >= 3;

/** Which records change, to what, given the server's picks. Only confident picks (or a rule the person taught) are used. */
export function planRefine(entries: Entry[], res: Pick<CategorizeRes, "results" | "minConfidence">, categories: Category[]): { before: Entry; after: Entry; source: "rule" | "ai" }[] {
  const byId = new Map(entries.map((e) => [e.id, e])), known = new Map(categories.map((c) => [c.id, c]));
  const out: { before: Entry; after: Entry; source: "rule" | "ai" }[] = [];
  for (const r of res.results) {
    const e = byId.get(r.key), cat = r.categoryId ? known.get(r.categoryId) : undefined;
    if (!e || !cat || r.source === "none" || (r.source === "ai" && r.confidence < res.minConfidence)) continue;
    if (cat.income !== (e.kind === "in") || e.categoryId === cat.id) continue;
    out.push({ before: e, after: { ...e, categoryId: cat.id, tags: [...e.tags.filter((t) => t !== AI_TAG), ...(r.source === "ai" ? [AI_TAG] : [])] }, source: r.source });
  }
  return out;
}

type Notify = (text: string, undo?: () => void) => void;
/** Ask the server, apply what is confident, say what happened with one tap to undo. Returns how many changed. */
export async function refineEntries(fin: Finance, notify: Notify, entries: Entry[], opts: { announce?: boolean; /** Records just made whose category was only a guess: refine them even if the guess was a parent category. */ force?: boolean } = {}): Promise<number> {
  const todo = entries.filter((e) => (opts.force ? e.kind !== "tf" && e.source !== "pay" && e.note.trim().length >= 3 : isUnsorted(e))).slice(0, 20);
  if (!todo.length) { if (opts.announce) notify("Semua catatan sudah punya kategori"); return 0; }
  let res: CategorizeRes;
  try { res = await categorizeRemote(todo.map(toItem)); } catch { if (opts.announce) notify("Belum bisa merapikan kategori. Coba lagi nanti."); return 0; }
  const plan = planRefine(todo, res, fin.raw.categories);
  for (const p of plan) fin.dispatch({ type: "entry/update", entry: p.after });
  if (!plan.length) { if (opts.announce) notify(res.limited ? "Batas pengategorian otomatis hari ini sudah tercapai. Coba lagi besok." : "Belum ada yang yakin dikategorikan. Pilih manual ya."); return 0; }
  const name = (id: string) => fin.raw.categories.find((c) => c.id === id)?.name ?? id;
  const message = plan.length === 1 ? `Kategori: ${name(plan[0].after.categoryId)}${plan[0].source === "ai" ? " (AI)" : ""}` : `${plan.length} catatan dikategorikan otomatis`;
  notify(message, () => { for (const p of plan) fin.dispatch({ type: "entry/update", entry: p.before }); });
  return plan.length;
}
