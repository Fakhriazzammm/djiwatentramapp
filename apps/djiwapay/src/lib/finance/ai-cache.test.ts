import { describe, expect, test } from "bun:test";
import { MAX_ENTRIES, isKnownUnsure, loadMemory, memoryId, normalize, recall, remember, saveMemory } from "./ai-cache";

const fake = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: m }; };
const DAY = 86_400_000, T0 = Date.UTC(2026, 10, 20);

describe("shop memory in the browser", () => {
  test("the same shop spelled differently is one key; income and expense are kept apart", () => {
    expect(normalize("Starbucks  Senayan City!")).toBe("starbucks senayan city"); expect(memoryId("STARBUCKS senayan city", "out")).toBe(memoryId("Starbucks Senayan City.", "out"));
    expect(memoryId("Kopi", "in")).not.toBe(memoryId("Kopi", "out")); expect(normalize("x".repeat(80)).length).toBe(40);
  });
  test("a confident answer is reused for 90 days, an unsure one for 7, then it counts as unknown", () => {
    const m = { ...remember({}, memoryId("Toko Yakin", "out"), "makan", 0.95, T0), ...remember({}, memoryId("Toko Samar", "out"), "makan", 0.5, T0) };
    expect(recall(m, memoryId("Toko Yakin", "out"), T0 + 89 * DAY)?.c).toBe("makan"); expect(recall(m, memoryId("Toko Yakin", "out"), T0 + 91 * DAY)).toBeNull();
    expect(isKnownUnsure(m, memoryId("Toko Samar", "out"), T0 + 6 * DAY)).toBe(true); expect(isKnownUnsure(m, memoryId("Toko Samar", "out"), T0 + 8 * DAY)).toBe(false); expect(isKnownUnsure(m, memoryId("Toko Yakin", "out"), T0)).toBe(false);
  });
  test("each person has their own memory", () => {
    const s = fake();
    saveMemory("alice", remember({}, memoryId("Kopi Tuku", "out"), "makan-kopi", 0.9, T0), s); saveMemory("bob", remember({}, memoryId("Kopi Tuku", "out"), "belanja", 0.9, T0), s);
    expect(loadMemory("alice", s)[memoryId("Kopi Tuku", "out")].c).toBe("makan-kopi"); expect(loadMemory("bob", s)[memoryId("Kopi Tuku", "out")].c).toBe("belanja"); expect(loadMemory("carol", s)).toEqual({});
  });
  test("only the newest shops are kept, and damaged or blocked storage never throws", () => {
    let m = {}; for (let i = 0; i < MAX_ENTRIES + 25; i++) m = remember(m, memoryId(`Toko nomor ${i}`, "out"), "makan", 0.9, T0 + i);
    const s = fake(); saveMemory("p", m, s); const back = loadMemory("p", s);
    expect(Object.keys(back).length).toBe(MAX_ENTRIES); expect(back[memoryId("Toko nomor 424", "out")]).toBeDefined(); expect(back[memoryId("Toko nomor 0", "out")]).toBeUndefined();
    const bad = { getItem: () => "{rusak", setItem: () => { throw new Error("full"); } };
    expect(loadMemory("p", bad)).toEqual({}); expect(() => saveMemory("p", m, bad)).not.toThrow(); expect(loadMemory("p", null)).toEqual({});
  });
  test("names too short to mean anything are not remembered", () => { expect(remember({}, memoryId("ab", "out"), "makan", 0.9)).toEqual({}); });
});
