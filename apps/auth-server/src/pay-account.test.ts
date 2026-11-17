import { describe, expect, test } from "bun:test";
import { checkPin, isValidPin, isWeakPin, normalizePhone } from "./pay-account";

/** A tiny in-memory stand-in for the one table the PIN check touches. */
function fakePool(row: { pin_hash: string; failed_attempts: number; locked_until: string | null } | null) {
  const st = row ? { ...row } : null;
  return { st, query: async (sql: string, params: unknown[] = []) => {
    if (/^SELECT pin_hash/.test(sql)) return { rows: st ? [{ ...st }] : [] };
    if (/failed_attempts = 0, locked_until = NULL/.test(sql) && st) { st.failed_attempts = 0; st.locked_until = null; return { rows: [] }; }
    if (/SET failed_attempts = \$2/.test(sql) && st) { st.failed_attempts = Number(params[1]); st.locked_until = params[2] ? new Date(Date.now() + 15 * 60_000).toISOString() : null; return { rows: [] }; }
    return { rows: [] };
  } } as any;
}

describe("pin rules", () => {
  test("six digits only, and obvious ones are weak", () => {
    expect(isValidPin("482916")).toBe(true); expect(isValidPin("12345")).toBe(false); expect(isValidPin("12345a")).toBe(false); expect(isValidPin(482916)).toBe(false);
    expect(isWeakPin("123456")).toBe(true); expect(isWeakPin("000000")).toBe(true); expect(isWeakPin("482916")).toBe(false);
  });
  test("phone numbers are normalised to 08…", () => {
    expect(normalizePhone("+62 812-3456-7890")).toBe("081234567890"); expect(normalizePhone("6285156399831")).toBe("085156399831"); expect(normalizePhone("12345")).toBeNull();
  });
});

describe("checkPin", () => {
  test("no PIN set", async () => { expect(await checkPin(fakePool(null), "u1", "482916")).toMatchObject({ ok: false, error: "PIN_NOT_SET" }); });
  test("right and wrong PIN, then a lock after five misses", async () => {
    const hash = await Bun.password.hash("482916", { algorithm: "argon2id" }), pool = fakePool({ pin_hash: hash, failed_attempts: 0, locked_until: null });
    expect(await checkPin(pool, "u1", "482916")).toEqual({ ok: true });
    for (let i = 1; i <= 4; i += 1) expect(await checkPin(pool, "u1", "000001")).toMatchObject({ ok: false, error: "PIN_INVALID", attemptsLeft: 5 - i });
    expect(await checkPin(pool, "u1", "000001")).toMatchObject({ ok: false, error: "PIN_LOCKED" });
    expect(await checkPin(pool, "u1", "482916")).toMatchObject({ ok: false, error: "PIN_LOCKED" });
  });
  test("a missing PIN in the request is not counted as a wrong try", async () => {
    const hash = await Bun.password.hash("482916", { algorithm: "argon2id" }), pool = fakePool({ pin_hash: hash, failed_attempts: 0, locked_until: null });
    expect(await checkPin(pool, "u1", undefined)).toMatchObject({ ok: false, error: "PIN_REQUIRED" }); expect(pool.st.failed_attempts).toBe(0);
  });
});
