import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authServerResolver } from "./auth";
import { createApp } from "./index";
import { needsSecondOpinion, parseReceipt, readReceipt } from "./receipt";
import { applySync } from "./sync";

const GOOD = '```json\n{"merchant":"Alfamart","purchasedAt":"2026-11-14T16:10","total":"182.000","tax":0,"items":[{"name":"Beras 5kg","qty":1,"price":"68.000","categoryId":"belanja","confidence":0.99},{"name":"Minyak","qty":1,"price":38000,"categoryId":"zzz"},{"name":"Susu UHT","qty":3,"price":54000,"categoryId":"makan"},{"name":"Sabun","qty":1,"price":22000,"categoryId":"rumah"}],"confidence":0.96}\n```';
const NOW = new Date("2026-11-15T00:00:00Z");

describe("parseReceipt", () => {
  test("reads fenced JSON, Indonesian numbers, unknown category falls back", () => {
    const r = parseReceipt(GOOD, "m", NOW);
    expect(r.total).toBe(182000); expect(r.items).toHaveLength(4); expect(r.items[0].price).toBe(68000); expect(r.items[1].categoryId).toBe("belanja"); expect(r.mismatch).toBe(0); expect(needsSecondOpinion(r)).toBe(false);
  });
  test("flags total mismatch and rejects future/old dates", () => {
    const r = parseReceipt('{"merchant":"x","purchasedAt":"2031-01-01","total":190000,"items":[{"name":"a","price":100000}],"confidence":0.99}', "m", NOW);
    expect(r.purchasedAt).toBeNull(); expect(needsSecondOpinion(r)).toBe(true);
  });
  test("not a receipt -> empty; garbage throws", () => {
    expect(parseReceipt('{"merchant":"","total":0,"items":[]}', "m").items).toHaveLength(0);
    expect(() => parseReceipt("maaf", "m")).toThrow();
  });
  test("escalates to the fallback model when the first read is weak", async () => {
    const models: string[] = [];
    const f = (async (_u: string, init: RequestInit) => { const m = JSON.parse(String(init.body)).model; models.push(m); return new Response(JSON.stringify({ choices: [{ message: { content: m === "qwen-vl-ocr" ? '{"merchant":"x","total":100,"items":[],"confidence":0.3}' : GOOD } }] })); }) as unknown as typeof fetch;
    const r = await readReceipt("data:image/jpeg;base64,AAAA", { key: "k", fetchImpl: f });
    expect(models).toEqual(["qwen-vl-ocr", "qwen3-vl-plus"]); expect(r.items).toHaveLength(4);
  });
});

describe("auth resolver", () => {
  test("needs the pay cookie and a customer id from auth-server", async () => {
    let calls = 0;
    const r = authServerResolver("http://x", (async () => { calls++; return new Response(JSON.stringify({ customer: { source_id: "u1" } })); }) as unknown as typeof fetch);
    expect(await r("a=b")).toBeNull(); expect(calls).toBe(0);
    expect(await r("djiwa_pay_session=abc")).toBe("u1"); expect(await r("djiwa_pay_session=abc")).toBe("u1"); expect(calls).toBe(1);
    const bad = authServerResolver("http://x", (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch);
    expect(await bad("djiwa_pay_session=zzz")).toBeNull();
  });
});

const fakeDb = (scans = 1) => { const log: { t: string; p?: unknown[] }[] = []; const q = async (t: string, p?: unknown[]) => { log.push({ t, p }); return { rows: t.includes("scan_usage") && t.includes("returning") ? [{ scans }] : t.includes("returning version") ? [{ version: 7 }] : [] }; }; return { log, db: { query: q, tx: async (fn: (x: { query: typeof q }) => Promise<unknown>) => fn({ query: q }) } as any }; };

describe("routes", () => {
  const dir = mkdtempSync(join(tmpdir(), "rc-"));
  const img = "data:image/jpeg;base64,/9j/4AAQ";
  test("401 without a session", async () => {
    const { db } = fakeDb(); const app = createApp({ db, resolve: async () => null, dir });
    expect((await app.request("/api/finance/state")).status).toBe(401);
    expect((await app.request("/api/finance/health")).status).toBe(200);
  });
  test("scan validates input, enforces the daily limit, never trusts the client user", async () => {
    const ok = { db: fakeDb(1).db, resolve: async () => "u1", dir, read: async () => parseReceipt(GOOD, "m", NOW) };
    const post = (app: ReturnType<typeof createApp>, body: unknown) => app.request("/api/finance/receipts/scan", { method: "POST", body: JSON.stringify(body) });
    const app = createApp(ok);
    expect((await post(app, { image: "nope" })).status).toBe(400);
    const good = await post(app, { image: img }); expect(good.status).toBe(200);
    expect((await good.json() as any).receipt.total).toBe(182000);
    expect((await post(createApp({ ...ok, db: fakeDb(31).db }), { image: img })).status).toBe(429);
    expect((await post(createApp({ ...ok, read: async () => parseReceipt('{"items":[],"total":0}', "m") }), { image: img })).status).toBe(422);
    expect((await post(createApp({ ...ok, read: undefined }), { image: img })).status).toBe(503);
  });
});

describe("applySync", () => {
  test("scopes every statement to the user and drops invalid rows", async () => {
    const { db, log } = fakeDb();
    const out = await applySync(db, "u9", { upserts: { entries: [{ id: "e1", kind: "out", amount: 5000, categoryId: "makan", accountId: "tunai", at: "2026-11-14T10:00:00Z", source: "receipt", receiptId: "r1" }, { id: "bad", kind: "out", amount: -1, at: "x" }], budgets: [{ categoryId: "makan", limit: 0 }] }, deletes: { entries: ["old"] }, profile: { onboarded: true } });
    expect(out.version).toBe(7);
    const ins = log.filter((l) => l.t.startsWith("insert into finance.entries"));
    expect(ins).toHaveLength(1); expect(ins[0].p![0]).toBe("u9"); expect(JSON.parse(String(ins[0].p![1]))).toHaveLength(1);
    expect(log.some((l) => l.t.includes("finance.budgets"))).toBe(false);
    expect(log.find((l) => l.t.startsWith("delete from finance.entries"))!.p).toEqual(["u9", ["old"]]);
  });
});
