/** What was already decided for a shop, kept in this browser per person, so the app does not even ask the server twice. */
type Store = Pick<Storage, "getItem" | "setItem">;
export type Hit = { c: string; p: number; t: number };
export type Memory = Record<string, Hit>;

export const SURE = 0.8;
export const SURE_DAYS = 90, UNSURE_DAYS = 7, MAX_ENTRIES = 400;
const DAY = 86_400_000;
const key = (profileId: string) => `djiwa-fin-aicat:${profileId}`;
const browser = (): Store | null => { try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; } };

/** The same shop spelled with different case, punctuation or spacing is one shop (matches the server). */
export const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
export const memoryId = (text: string, kind: "in" | "out") => `${kind}:${normalize(text)}`;

export function loadMemory(profileId: string, storage: Store | null = browser()): Memory {
  try { const raw = JSON.parse(storage?.getItem(key(profileId)) ?? "{}"); return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Memory) : {}; } catch { return {}; }
}
export function saveMemory(profileId: string, memory: Memory, storage: Store | null = browser()) {
  const keep = Object.entries(memory).sort((a, b) => b[1].t - a[1].t).slice(0, MAX_ENTRIES);   // the newest 400 shops are plenty
  try { storage?.setItem(key(profileId), JSON.stringify(Object.fromEntries(keep))); } catch { /* storage full or blocked: the server cache still answers */ }
}
/** A confident answer lasts months, an unsure one only a week. Older entries count as unknown. */
export function recall(memory: Memory, id: string, now = Date.now()): Hit | null {
  const h = memory[id];
  if (!h || typeof h.c !== "string" || typeof h.p !== "number") return null;
  return now - h.t <= (h.p >= SURE ? SURE_DAYS : UNSURE_DAYS) * DAY ? h : null;
}
export const isKnownUnsure = (memory: Memory, id: string, now = Date.now()) => { const h = recall(memory, id, now); return h !== null && h.p < SURE; };
export function remember(memory: Memory, id: string, categoryId: string, confidence: number, now = Date.now()): Memory {
  if (normalize(id.slice(id.indexOf(":") + 1)).length < 3) return memory;
  return { ...memory, [id]: { c: categoryId, p: confidence, t: now } };
}
