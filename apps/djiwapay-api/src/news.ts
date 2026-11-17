import type { Hono } from "hono";

/** Daily finance headlines from public publisher RSS feeds. Only title, link, source and time are kept; the article opens on the publisher's site. */
export type NewsTopic = "emas" | "saham" | "kripto" | "ekonomi";
export type NewsItem = { title: string; url: string; source: string; at: string; topic: NewsTopic };
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const FEEDS = [
  { source: "CNBC Indonesia", url: "https://www.cnbcindonesia.com/market/rss" },
  { source: "Antara News", url: "https://www.antaranews.com/rss/ekonomi-bisnis.xml" },
];
const RULES: [NewsTopic, RegExp][] = [
  ["kripto", /kripto|crypto|bitcoin|\bbtc\b|ethereum|\beth\b|altcoin|stablecoin|solana/i],
  ["emas", /\bemas\b|antam|galeri\s?24|ubs\b|logam mulia|pegadaian/i],
  ["saham", /saham|ihsg|bursa|emiten|\bbei\b|\bipo\b|dividen|reksa dana|obligasi/i],
];
export const topicOf = (title: string): NewsTopic => RULES.find(([, re]) => re.test(title))?.[0] ?? "ekonomi";

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
const tag = (block: string, name: string) => { const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i")); return m ? decode(m[1]) : ""; };

export function parseFeed(xml: string, source: string): NewsItem[] {
  const out: NewsItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0], title = tag(b, "title"), url = tag(b, "link"), d = new Date(tag(b, "pubDate"));
    if (!title || !/^https:\/\//.test(url) || Number.isNaN(+d)) continue;
    out.push({ title, url, source, at: d.toISOString(), topic: topicOf(title) });
  }
  return out;
}

let cache: { at: number; items: NewsItem[] } | null = null;
const TTL = 10 * 60_000;
export async function loadNews(f: Fetch = fetch as Fetch, now = Date.now()): Promise<NewsItem[]> {
  if (cache && now - cache.at < TTL) return cache.items;
  const parts = await Promise.all(FEEDS.map(async (feed) => {
    try {
      const r = await f(feed.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; DjiwaPay/1.0)" }, signal: AbortSignal.timeout(10_000) });
      return r.ok ? parseFeed(await r.text(), feed.source) : [];
    } catch { return []; }
  }));
  const seen = new Set<string>(), items = parts.flat().filter((i) => (seen.has(i.title) ? false : (seen.add(i.title), true))).sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 120);
  if (items.length) cache = { at: now, items };
  return items.length ? items : cache?.items ?? [];
}
export const resetNewsCache = () => { cache = null; };

/* ---- opening an article inside the app ---- */
export type ArticleInfo = { url: string; host: string; embeddable: boolean; title: string; description: string; image: string | null; site: string; published: string | null; lead: string[] };
const ARTICLE_HOSTS = ["cnbcindonesia.com", "antaranews.com"];
export const allowedArticle = (raw: string): URL | null => { try { const u = new URL(raw); return u.protocol === "https:" && ARTICLE_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h)) ? u : null; } catch { return null; } };
const attr = (html: string, prop: string) => { const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i")) ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i")); return m ? decode(m[1]) : ""; };
const plain = (h: string) => decode(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
/** Whether the page may be framed, plus enough of its own metadata to show a short summary when it may not. Only the opening of the article is kept. */
export function articleInfo(url: string, html: string, headers: { get(n: string): string | null }): ArticleInfo {
  const xfo = (headers.get("x-frame-options") || "").toLowerCase(), csp = (headers.get("content-security-policy") || "").toLowerCase();
  const fa = csp.match(/frame-ancestors([^;]*)/)?.[1] ?? "";
  const embeddable = !/deny|sameorigin/.test(xfo) && (!fa || /\*|djiwapay\.web\.id/.test(fa));
  const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => plain(m[1])).filter((t) => t.length > 70 && !/baca juga|simak|copyright|hak cipta/i.test(t));
  let lead: string[] = [], n = 0; for (const t of paras) { if (n > 520) break; lead.push(t); n += t.length; }
  return { url, host: new URL(url).hostname.replace(/^www\./, ""), embeddable, title: attr(html, "og:title") || plain(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""), description: attr(html, "og:description") || attr(html, "description"), image: /^https:\/\//.test(attr(html, "og:image")) ? attr(html, "og:image") : null, site: attr(html, "og:site_name"), published: attr(html, "article:published_time") || null, lead: lead.slice(0, 3).map((t) => (t.length > 420 ? t.slice(0, 417) + "…" : t)) };
}
const infoCache = new Map<string, { at: number; info: ArticleInfo }>();
export async function loadArticle(raw: string, f: Fetch = fetch as Fetch, now = Date.now()): Promise<ArticleInfo | null> {
  const u = allowedArticle(raw); if (!u) return null;
  const hit = infoCache.get(u.href); if (hit && now - hit.at < TTL) return hit.info;
  try {
    const r = await f(u.href, { headers: { "User-Agent": "Mozilla/5.0 (compatible; DjiwaPay/1.0)", Accept: "text/html" }, signal: AbortSignal.timeout(9000), redirect: "follow" });
    if (!r.ok || !allowedArticle(r.url || u.href)) return null;
    const html = (await r.text()).slice(0, 1_500_000), info = articleInfo(r.url || u.href, html, r.headers);
    if (infoCache.size > 200) infoCache.clear(); infoCache.set(u.href, { at: now, info }); return info;
  } catch { return null; }
}

export function registerNewsRoutes(app: Hono, json: (c: any, body: unknown, status?: number) => Response, f?: Fetch) {
  app.get("/api/finance/news", async (c) => {
    const topic = c.req.query("topic"), all = await loadNews(f), items = topic && topic !== "semua" ? all.filter((i) => i.topic === topic) : all;
    return json(c, { success: true, items: items.slice(0, 30), updatedAt: new Date().toISOString() });
  });
  app.get("/api/finance/news/open", async (c) => {
    const info = await loadArticle(c.req.query("url") ?? "", f);
    return info ? json(c, { success: true, article: info }) : json(c, { success: false, error: "UNAVAILABLE" }, 404);
  });
}
