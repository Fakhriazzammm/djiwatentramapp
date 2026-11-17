import { useSyncExternalStore } from "react";

/** Articles from other sites open inside Djiwa Pay, so the way back to the app is always one tap. */
export type OpenArticle = { url: string; title?: string; source?: string };
let current: OpenArticle | null = null;
const listeners = new Set<() => void>();
export const openArticle = (a: OpenArticle) => { if (!/^https:\/\//.test(a.url)) return; current = a; listeners.forEach((l) => l()); };
export const closeArticle = () => { current = null; listeners.forEach((l) => l()); };
export const useOpenArticle = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => current);

export type ArticleInfo = { url: string; host: string; embeddable: boolean; title: string; description: string; image: string | null; site: string; published: string | null; lead: string[] };
export async function loadArticleInfo(url: string): Promise<ArticleInfo | null> {
  try { const r = await fetch(`/api/finance/news/open?url=${encodeURIComponent(url)}`, { credentials: "include" }); if (!r.ok) return null; const b = await r.json() as { article?: ArticleInfo }; return b.article ?? null; } catch { return null; }
}
