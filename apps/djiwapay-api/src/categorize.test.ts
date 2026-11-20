import { describe, expect, test } from "bun:test";
import { CATEGORIZE_FALLBACK, CATEGORIZE_MODEL, aiCategorize, buildPrompt, parseCategorization, type CatDef, type Item } from "./categorize";

const cats: CatDef[] = [
  { id: "makan", name: "Makan & minum", income: false }, { id: "makan-kopi", name: "Kopi & minuman", income: false, parentId: "makan" }, { id: "makan-warung", name: "Restoran & warung", income: false, parentId: "makan" },
  { id: "transport", name: "Transportasi", income: false }, { id: "transport-bbm", name: "BBM", income: false, parentId: "transport" },
  { id: "transfer", name: "Transfer", income: false }, { id: "gaji", name: "Gaji", income: true }, { id: "gaji-pokok", name: "Gaji pokok", income: true, parentId: "gaji" },
];
const items: Item[] = [{ key: "a", text: "Kopi Kenangan", kind: "out", amount: 32000 }, { key: "b", text: "Pertamax SPBU", kind: "out" }, { key: "c", text: "Gaji Nov", kind: "in" }];

describe("prompt", () => {
  test("lists categories under short codes, never offers transfer, includes the person's own examples", () => {
    const { system, byCode, shots } = buildPrompt(cats, [{ text: "Warteg Bu Tini", categoryId: "makan-warung" }, { text: "x", categoryId: "tidak-ada" }]);
    expect(system).toContain("PENGELUARAN:"); expect(system).toContain("PEMASUKAN:"); expect(system).not.toContain("Transfer");
    expect(system).toMatch(/c1 = Makan & minum: c2 = Kopi & minuman; c3 = Restoran & warung/);
    expect(shots).toEqual(['"Warteg Bu Tini" -> c3']);   // examples ride with the items so the long category list stays identical between calls
    expect(system).not.toContain("Warteg"); expect(buildPrompt(cats, []).system).toBe(system);
    expect(byCode.get("c2")!.id).toBe("makan-kopi"); expect(system.length).toBeLessThan(2000);
  });
});

describe("parsing the model's answer", () => {
  const { byCode } = buildPrompt(cats, []);
  test("reads {results:[...]} and a bare array, even inside a code fence", () => {
    const a = parseCategorization('{"results":[{"key":"a","categoryId":"c2","confidence":0.95}]}', items, byCode);
    const b = parseCategorization('```json\n[{"key":"a","categoryId":"c2","confidence":0.9},{"key":"b","categoryId":"c5","confidence":0.7}]\n```', items, byCode);
    expect(a.get("a")).toEqual({ categoryId: "makan-kopi", confidence: 0.95 }); expect(b.get("b")).toEqual({ categoryId: "transport-bbm", confidence: 0.7 });
  });
  test("drops unknown keys, unknown codes and the wrong kind (income for an expense)", () => {
    const got = parseCategorization('{"results":[{"key":"zzz","categoryId":"c2","confidence":1},{"key":"a","categoryId":"c99","confidence":1},{"key":"a","categoryId":"c6","confidence":1},{"key":"c","categoryId":"c2","confidence":1},{"key":"c","categoryId":"c6","confidence":2}]}', items, byCode);
    expect([...got.keys()]).toEqual(["c"]); expect(got.get("c")).toEqual({ categoryId: "gaji", confidence: 1 });
  });
  test("garbage gives nothing instead of throwing", () => { expect(parseCategorization("maaf, saya tidak bisa", items, byCode).size).toBe(0); expect(parseCategorization("", items, byCode).size).toBe(0); });
});

describe("calling the model", () => {
  const reply = (content: string, status = 200) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
  test("primary model runs without thinking and its answer is used", async () => {
    const seen: any[] = [];
    const f = (async (_u: string, init: RequestInit) => { seen.push(JSON.parse(String(init.body))); return reply('{"results":[{"key":"a","categoryId":"c2","confidence":0.92}]}'); }) as never;
    const got = await aiCategorize({ key: "k", fetchImpl: f }, items.slice(0, 1), cats, []);
    expect(got.get("a")!.categoryId).toBe("makan-kopi"); expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ model: CATEGORIZE_MODEL, enable_thinking: false, temperature: 0 }); expect(seen[0].messages[1].content).not.toContain("0000");
  });
  test("falls back to the second model when the first errors or answers nothing", async () => {
    const models: string[] = [];
    const f = (async (_u: string, init: RequestInit) => { const m = JSON.parse(String(init.body)).model; models.push(m); return m === CATEGORIZE_MODEL ? reply("tidak tahu") : reply('[{"key":"a","categoryId":"c3","confidence":0.85}]'); }) as never;
    expect((await aiCategorize({ key: "k", fetchImpl: f }, items.slice(0, 1), cats, [])).get("a")!.categoryId).toBe("makan-warung");
    expect(models).toEqual([CATEGORIZE_MODEL, CATEGORIZE_FALLBACK]);
    const e500 = (async () => reply("", 500)) as never;
    expect((await aiCategorize({ key: "k", fetchImpl: e500 }, items.slice(0, 1), cats, [])).size).toBe(0);
  });
  test("a rejected key stops at once instead of trying the other model", async () => {
    let n = 0; const f = (async () => { n++; return reply("", 401); }) as never;
    await expect(aiCategorize({ key: "bad", fetchImpl: f }, items.slice(0, 1), cats, [])).rejects.toThrow("AI_401"); expect(n).toBe(1);
  });
});
