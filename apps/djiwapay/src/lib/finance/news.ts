import { useEffect, useState } from "react";

export type NewsTopic = "emas" | "saham" | "kripto" | "ekonomi";
export type NewsItem = { title: string; url: string; source: string; at: string; topic: NewsTopic };
export const NEWS_TOPICS: { id: "semua" | NewsTopic; label: string }[] = [{ id: "semua", label: "Terbaru" }, { id: "emas", label: "Emas" }, { id: "ekonomi", label: "Ekonomi" }, { id: "saham", label: "Saham" }, { id: "kripto", label: "Kripto" }];

const cache = new Map<string, { at: number; items: NewsItem[] }>();
const TTL = 5 * 60_000;
export async function loadNews(topic: string): Promise<NewsItem[] | null> {
  const hit = cache.get(topic);
  if (hit && Date.now() - hit.at < TTL) return hit.items;
  try {
    const r = await fetch(`/api/finance/news?topic=${encodeURIComponent(topic)}`, { credentials: "include" });
    if (!r.ok) return hit?.items ?? null;
    const b = await r.json() as { items?: NewsItem[] };
    const items = Array.isArray(b.items) ? b.items : [];
    cache.set(topic, { at: Date.now(), items });
    return items;
  } catch { return hit?.items ?? null; }
}
/** Headlines for a topic; `null` while loading or when the feed is unreachable. */
export function useNews(topic: string, enabled = true): { items: NewsItem[] | null; failed: boolean } {
  const [state, set] = useState<{ items: NewsItem[] | null; failed: boolean; topic: string }>({ items: null, failed: false, topic });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadNews(topic).then((items) => { if (alive) set({ items, failed: items === null, topic }); });
    return () => { alive = false; };
  }, [topic, enabled]);
  return state.topic === topic ? state : { items: null, failed: false };
}
export function timeAgo(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - +new Date(iso)) / 60_000));
  return m < 1 ? "baru saja" : m < 60 ? `${m} menit lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`;
}
