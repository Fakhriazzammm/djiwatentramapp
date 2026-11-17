import { describe, expect, test } from "bun:test";
import { allowedArticle, articleInfo, loadNews, parseFeed, resetNewsCache, topicOf } from "./news.js";

const xml = `<rss><channel><item><title><![CDATA[Harga Emas Antam Naik]]></title><link>https://x.id/a</link><pubDate>Mon, 16 Nov 2026 10:00:00 +0700</pubDate></item>
<item><title>IHSG Ditutup Menguat &amp; Rupiah Stabil</title><link>https://x.id/b</link><pubDate>Mon, 16 Nov 2026 11:00:00 +0700</pubDate></item>
<item><title>Tanpa link</title><link>javascript:x</link><pubDate>Mon, 16 Nov 2026 11:00:00 +0700</pubDate></item></channel></rss>`;
describe("news", () => {
  test("classifies topics", () => {
    expect(topicOf("Bitcoin tembus rekor")).toBe("kripto");
    expect(topicOf("Harga emas Antam")).toBe("emas");
    expect(topicOf("IHSG menguat")).toBe("saham");
    expect(topicOf("Inflasi Oktober")).toBe("ekonomi");
  });
  test("parses items and drops unsafe links", () => {
    const items = parseFeed(xml, "Uji");
    expect(items.map((i) => i.title)).toEqual(["Harga Emas Antam Naik", "IHSG Ditutup Menguat & Rupiah Stabil"]);
    expect(items[0].topic).toBe("emas");
  });
  test("survives a failing feed and caches", async () => {
    resetNewsCache(); let n = 0;
    const f = async (u: string) => { n++; return u.includes("cnbc") ? new Response(xml) : new Response("", { status: 500 }); };
    expect((await loadNews(f as never, 1)).length).toBe(2);
    await loadNews(f as never, 2);
    expect(n).toBe(2);
  });
  test("only the two news sites can be opened", () => {
    expect(allowedArticle("https://www.cnbcindonesia.com/market/x")).not.toBeNull(); expect(allowedArticle("https://www.antaranews.com/berita/1")).not.toBeNull();
    expect(allowedArticle("https://evil.example/?u=cnbcindonesia.com")).toBeNull(); expect(allowedArticle("http://www.cnbcindonesia.com/x")).toBeNull(); expect(allowedArticle("javascript:alert(1)")).toBeNull();
  });
  test("reads the summary and knows when framing is blocked", () => {
    const html = `<html><head><meta property="og:title" content="Judul &amp; Berita"><meta property="og:description" content="Ringkasan"><meta property="og:image" content="https://img.example/a.jpg"></head><body><p>${"Kalimat panjang pertama. ".repeat(5)}</p><p>pendek</p><p>${"Paragraf kedua yang cukup panjang. ".repeat(4)}</p></body></html>`;
    const blocked = articleInfo("https://www.cnbcindonesia.com/x", html, { get: (n) => (n === "x-frame-options" ? "SAMEORIGIN" : null) });
    expect(blocked.embeddable).toBe(false); expect(blocked.title).toBe("Judul & Berita"); expect(blocked.lead.length).toBeGreaterThan(0); expect(blocked.image).toBe("https://img.example/a.jpg");
    expect(articleInfo("https://www.antaranews.com/x", html, { get: () => null }).embeddable).toBe(true);
  });
});
