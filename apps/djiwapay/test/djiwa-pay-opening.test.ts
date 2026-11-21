import { describe, expect, test } from "bun:test";
import {
  DJIWA_PAY_OPENING_KEY,
  DJIWA_PAY_OPENING_LINES,
  markDjiwaPayOpeningSeen,
  nextOpeningLine,
  shouldShowDjiwaPayOpening,
} from "../src/lib/djiwa-pay-opening";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("Djiwa Pay first-launch opening", () => {
  test("plays on a fresh device and never after it was seen", () => {
    const storage = memoryStorage();
    expect(shouldShowDjiwaPayOpening("", storage)).toBe(true);
    markDjiwaPayOpeningSeen(storage);
    expect(storage.getItem(DJIWA_PAY_OPENING_KEY)).not.toBeNull();
    expect(shouldShowDjiwaPayOpening("", storage)).toBe(false);
  });

  test("?opening=1 forces it for review", () => {
    const storage = memoryStorage({ [DJIWA_PAY_OPENING_KEY]: "x" });
    expect(shouldShowDjiwaPayOpening("?opening=1", storage)).toBe(true);
  });

  test("skips when storage is unavailable or throws instead of replaying every launch", () => {
    expect(shouldShowDjiwaPayOpening("", null)).toBe(false);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(shouldShowDjiwaPayOpening("", broken)).toBe(false);
    expect(() => markDjiwaPayOpeningSeen(broken)).not.toThrow();
  });

  test("tap lines cycle", () => {
    expect(nextOpeningLine(0).line).toBe(DJIWA_PAY_OPENING_LINES[0]);
    expect(nextOpeningLine(DJIWA_PAY_OPENING_LINES.length).index).toBe(0);
    expect(nextOpeningLine(-1).index).toBe(DJIWA_PAY_OPENING_LINES.length - 1);
  });
});
