import { describe, expect, test } from "bun:test";
import { goldPerGram, signRef, verifyRef } from "./assets.js";

describe("gold reference price", () => {
  test("converts USD/oz and USD/IDR to IDR per gram, carrying the last rate over gaps", () => {
    const gold = new Map([["2026-11-10", 3110.35], ["2026-11-11", 3110.35], ["2026-11-12", 3110.35]]);
    const idr = new Map([["2026-11-10", 16000], ["2026-11-12", 16500]]);
    expect(goldPerGram(gold, idr)).toEqual([["2026-11-10", 1_600_000], ["2026-11-11", 1_600_000], ["2026-11-12", 1_650_000]]);
  });
});

describe("signed photo links", () => {
  test("accepts a fresh link, rejects expired, tampered and wrong-key links", () => {
    const t = signRef("u1", "s1", Date.now() + 60_000, "k");
    expect(verifyRef(t, Date.now(), "k")).toEqual({ u: "u1", i: "s1" });
    expect(verifyRef(t, Date.now() + 120_000, "k")).toBeNull();
    expect(verifyRef(t, Date.now(), "other")).toBeNull();
    expect(verifyRef(t.replace(/.$/, (ch) => (ch === "A" ? "B" : "A")), Date.now(), "k")).toBeNull();
  });
});
