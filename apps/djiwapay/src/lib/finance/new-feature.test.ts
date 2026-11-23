import { describe, expect, test } from "bun:test";
import { expiresIn, isFresh, mergeSeen, NEW_TTL } from "./new-feature";

const T0 = Date.parse("2026-11-24T10:00:00Z"), iso = (ms: number) => new Date(ms).toISOString();

describe("the Baru badge lasts 2 days from the person's own first sight", () => {
  test("a feature nobody has seen is new, and its clock has not started", () => { expect(isFresh(undefined, T0)).toBe(true); expect(expiresIn(undefined, T0)).toBeNull(); });
  test("seen now: new for exactly 2 days, then not", () => {
    const seen = iso(T0);
    expect(isFresh(seen, T0 + NEW_TTL - 1)).toBe(true);
    expect(isFresh(seen, T0 + NEW_TTL)).toBe(false);
    expect(expiresIn(seen, T0 + 3_600_000)).toBe(NEW_TTL - 3_600_000);
    expect(expiresIn(seen, T0 + NEW_TTL + 5)).toBe(0);
  });
  test("two people see the same feature on different days and each gets their own two days", () => {
    const early = iso(T0), late = iso(T0 + 5 * 86_400_000), at = T0 + 6 * 86_400_000;
    expect(isFresh(early, at)).toBe(false);   // seen 6 days ago: gone
    expect(isFresh(late, at)).toBe(true);     // seen yesterday: still there
  });
  test("two devices of one person agree on the earliest sight", () => {
    const a = { x: iso(T0 + 1000), only_a: iso(T0) }, b = { x: iso(T0), only_b: iso(T0 + 5) };
    expect(mergeSeen(a, b)).toEqual({ x: iso(T0), only_a: iso(T0), only_b: iso(T0 + 5) });
  });
});
