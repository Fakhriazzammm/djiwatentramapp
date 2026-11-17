import { describe, expect, test } from "bun:test";
import { loadNews, parseFeed, resetNewsCache, topicOf } from "./news.js";

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
});
