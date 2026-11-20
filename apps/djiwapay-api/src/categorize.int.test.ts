// Real Postgres, throwaway user. Skipped without DATABASE_URL.
import { afterAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";
import { categorizeItems, learnRule, makeCategorizer, registerCategorizeRoutes, reserveCall } from "./categorize";
import { poolTx } from "./db";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const user = `itest-cat-${crypto.randomUUID().slice(0, 6)}`;
const pool = url ? new Pool({ connectionString: url, max: 2, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } }) : (null as unknown as Pool);
const db = pool ? poolTx(pool) : (null as never);
afterAll(async () => { if (!pool) return; for (const t of ["categories", "merchant_rules", "ai_usage", "ai_category_cache", "entries"]) await pool.query(`delete from finance.${t} where user_id=$1`, [user]); await pool.end(); });
let calls = 0;
const fake = (reply: (body: any) => string) => (async (_u: string, init: RequestInit) => { calls++; return new Response(JSON.stringify({ choices: [{ message: { content: reply(JSON.parse(String(init.body))) } }] }), { status: 200 }); }) as never;

run("automatic categories (real database, fake model)", () => {
  test("a rule the person taught wins and costs no model call; the rest goes to the model once", async () => {
    await pool.query("insert into finance.categories(user_id,id,name,icon,tone,income,custom,parent_id) values($1,'makan','Makan & minum','cup','orange',false,false,null),($1,'makan-kopi','Kopi & minuman','cup','orange',false,false,'makan'),($1,'transport','Transportasi','car','blue',false,false,null),($1,'transport-bbm','BBM','car','blue',false,false,'transport'),($1,'gaji','Gaji','down','emerald',true,false,null)", [user]);
    await pool.query("insert into finance.merchant_rules(user_id,pattern,category_id) values($1,'warung pak eko','makan')", [user]);
    calls = 0;
    const f = fake((b) => { const sys = b.messages[0].content as string; const bbm = /c(\d+) = BBM/.exec(sys)![1]; return `{"results":[{"key":"2","categoryId":"c${bbm}","confidence":0.93}]}`; });
    const out = await categorizeItems({ db, key: "k", fetchImpl: f }, user, [{ key: "1", text: "Warung Pak Eko", kind: "out" }, { key: "2", text: "PERTAMINA SPBU Pertalite", kind: "out", amount: 100000 }]);
    expect(out.results.map((r) => [r.key, r.categoryId, r.source])).toEqual([["1", "makan", "rule"], ["2", "transport-bbm", "ai"]]);
    expect(calls).toBe(1); expect(out.ai).toBe(true); expect(out.remaining).toBe(29);
  });
  test("only rules answer when every item is known, and no call is used", async () => {
    calls = 0; const out = await categorizeItems({ db, key: "k", fetchImpl: fake(() => "{}") }, user, [{ key: "1", text: "Warung Pak Eko", kind: "out" }]);
    expect(calls).toBe(0); expect(out.ai).toBe(false); expect(out.results[0].source).toBe("rule");
  });
  test("a rule for an expense is not used for income", async () => {
    const out = await categorizeItems({ db, key: undefined }, user, [{ key: "1", text: "Warung Pak Eko", kind: "in" }]);
    expect(out.results[0]).toMatchObject({ categoryId: null, source: "none" });
  });
  test("the daily allowance stops the model, not the rules", async () => {
    await pool.query("delete from finance.ai_usage where user_id=$1", [user]); calls = 0;
    const f = fake(() => '{"results":[]}');
    for (let i = 0; i < 2; i++) await categorizeItems({ db, key: "k", fetchImpl: f, limit: 2 }, user, [{ key: "x", text: "Toko tidak dikenal " + i, kind: "out" }]);
    const third = await categorizeItems({ db, key: "k", fetchImpl: f, limit: 2 }, user, [{ key: "x", text: "Toko lain lagi", kind: "out" }]);
    expect(calls).toBe(4); /* an empty answer retries once on the fallback model, but costs one allowance */ expect(third.limited).toBe(true); expect(third.ai).toBe(false); expect(third.remaining).toBe(0);
    expect(await reserveCall(db, user, 2)).toBe(false);
  });
  test("learning a correction makes the next one a rule; unknown or transfer categories are refused", async () => {
    expect(await learnRule(db, user, "Kopi Tuku Cipete", "makan-kopi")).toBe(true);
    expect(await learnRule(db, user, "Kopi Tuku Cipete", "tidak-ada")).toBe(false); expect(await learnRule(db, user, "apa saja", "transfer")).toBe(false);
    const out = await categorizeItems({ db, key: undefined }, user, [{ key: "1", text: "Kopi Tuku Cipete", kind: "out" }]);
    expect(out.results[0]).toMatchObject({ categoryId: "makan-kopi", source: "rule", confidence: 1 });
  });
  test("the pipeline helper returns confident picks only and never throws", async () => {
    await pool.query("delete from finance.ai_usage where user_id=$1", [user]);
    const f = fake(() => '{"results":[{"key":"a","categoryId":"c2","confidence":0.9},{"key":"b","categoryId":"c2","confidence":0.4}]}');
    const got = await makeCategorizer({ db, key: "k", fetchImpl: f })(user, [{ key: "a", text: "Starbucks Mall", kind: "out" }, { key: "b", text: "Toko X", kind: "out" }]);
    expect([...got.keys()]).toEqual(["a"]);
    const boom = (async () => { throw new Error("network"); }) as never;
    expect((await makeCategorizer({ db, key: "k", fetchImpl: boom })(user, [{ key: "z", text: "Sesuatu yang baru", kind: "out" }])).size).toBe(0);
  });
  test("a shop the model already answered costs nothing the second time", async () => {
    await pool.query("delete from finance.ai_usage where user_id=$1", [user]); await pool.query("delete from finance.ai_category_cache where user_id=$1", [user]);
    const answer = (conf: number) => fake((b) => { const code = /c(\d+) = Kopi & minuman/.exec(b.messages[0].content)![1]; return `{"results":[{"key":"1","categoryId":"c${code}","confidence":${conf}}]}`; });
    calls = 0;
    const first = await categorizeItems({ db, key: "k", fetchImpl: answer(0.95) }, user, [{ key: "1", text: "Starbucks Senayan City", kind: "out" }]);
    expect(first.results[0]).toMatchObject({ categoryId: "makan-kopi", source: "ai" }); expect(first.results[0].cached).toBeUndefined(); expect(calls).toBe(1); expect(first.remaining).toBe(29);
    const again = await categorizeItems({ db, key: "k", fetchImpl: answer(0.1) }, user, [{ key: "7", text: "starbucks  senayan city", kind: "out" }]);   // spelling and case differ, the shop is the same
    expect(again.results[0]).toMatchObject({ key: "7", categoryId: "makan-kopi", confidence: 0.95, cached: true }); expect(calls).toBe(1); expect(again.cached).toBe(1); expect(again.ai).toBe(false); expect(again.remaining).toBe(29);
    const income = await categorizeItems({ db, key: undefined }, user, [{ key: "8", text: "Starbucks Senayan City", kind: "in" }]);
    expect(income.results[0].categoryId).toBeNull();                                         // income never borrows an expense answer
  });
  test("an unsure answer is remembered only briefly, a sure one for months; a deleted category or a taught rule wins over the memory", async () => {
    await pool.query("delete from finance.ai_category_cache where user_id=$1", [user]);
    await pool.query("insert into finance.ai_category_cache(user_id,key,kind,category_id,confidence,updated_at) values($1,'toko samar','out','makan',0.5,now() - interval '8 days'),($1,'toko yakin','out','makan',0.95,now() - interval '80 days'),($1,'toko hilang','out','kategori-dihapus',0.95,now()),($1,'warung pak eko','out','transport',0.95,now())", [user]);
    calls = 0; const f = fake(() => '{"results":[]}');
    const out = await categorizeItems({ db, key: "k", fetchImpl: f }, user, [{ key: "a", text: "Toko Samar", kind: "out" }, { key: "b", text: "Toko Yakin", kind: "out" }, { key: "c", text: "Toko Hilang", kind: "out" }, { key: "d", text: "Warung Pak Eko", kind: "out" }]);
    const by = Object.fromEntries(out.results.map((r) => [r.key, r]));
    expect(by.b).toMatchObject({ categoryId: "makan", cached: true });                       // sure and 80 days old: still used
    expect(by.d).toMatchObject({ categoryId: "makan", source: "rule" });                     // the person's rule (makan) beats the cached transport
    expect(by.a.cached).toBeUndefined(); expect(by.c.cached).toBeUndefined(); expect(calls).toBeGreaterThan(0);   // stale unsure answer and a vanished category go back to the model
  });
  test("the memory is cleaned of rows older than 120 days", async () => {
    await pool.query("insert into finance.ai_category_cache(user_id,key,kind,category_id,confidence,updated_at) values($1,'toko kuno','out','makan',0.95,now() - interval '200 days')", [user]);
    await categorizeItems({ db, key: "k", fetchImpl: fake(() => '{"results":[{"key":"z","categoryId":"c1","confidence":0.9}]}') }, user, [{ key: "z", text: "Toko Baru Banget", kind: "out" }]);
    expect((await pool.query("select count(*)::int n from finance.ai_category_cache where user_id=$1 and key='toko kuno'", [user])).rows[0].n).toBe(0);
  });
  test("HTTP: validates input and serves results", async () => {
    await pool.query("delete from finance.ai_usage where user_id=$1", [user]);
    const app = new Hono(); const json = (c: any, b: unknown, s = 200) => c.json(b, s);
    registerCategorizeRoutes(app, { db, key: "k", fetchImpl: fake(() => '{"results":[{"key":"1","categoryId":"c2","confidence":0.95}]}') }, () => user, json);
    expect((await app.request("/api/finance/categorize", { method: "POST", body: JSON.stringify({}) })).status).toBe(400);
    const r = await app.request("/api/finance/categorize", { method: "POST", body: JSON.stringify({ items: [{ key: "1", text: "Starbucks Senayan", kind: "out" }] }) });
    const j = await r.json() as any; expect(r.status).toBe(200); expect(j).toMatchObject({ success: true, minConfidence: 0.8 }); expect(j.results[0].key).toBe("1");
    const l = await app.request("/api/finance/categorize/learn", { method: "POST", body: JSON.stringify({ text: "Roti Boy Mall", categoryId: "makan" }) });
    expect(await l.json()).toMatchObject({ learned: true });
  });
});
