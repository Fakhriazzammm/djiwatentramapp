import { describe, expect, test } from "bun:test";
import { buildBackup, checkBackup, BACKUP_FORMAT } from "./backup.js";

describe("backup file", () => {
  test("only a Djiwa Pay backup of a known format is accepted", () => {
    expect(checkBackup(null)).toBe("NOT_A_BACKUP");
    expect(checkBackup({ app: "other" })).toBe("NOT_A_BACKUP");
    expect(checkBackup({ app: "djiwa-pay", format: 99, state: {} })).toBe("FORMAT_UNSUPPORTED");
    expect(checkBackup({ app: "djiwa-pay", format: BACKUP_FORMAT })).toBe("NO_STATE");
    expect(checkBackup({ app: "djiwa-pay", format: BACKUP_FORMAT, state: {} })).toBeNull();
  });
  test("the file carries everything and nothing secret", async () => {
    const empty = { rows: [] as any[] };
    const db = { query: async (text: string) => { if (/from finance.profiles/.test(text)) return { rows: [{ version: 3, onboarded: true, overrides: {}, pockets: [] }] }; return empty; }, tx: async (fn: (q: unknown) => unknown) => fn(db) } as never;
    const b = await buildBackup(db, "u1", new Date("2026-11-24T00:00:00Z"));
    expect(b).toMatchObject({ app: "djiwa-pay", format: 1, exportedAt: "2026-11-24T00:00:00.000Z" });
    expect(Object.keys(b.summary)).toEqual(expect.arrayContaining(["accounts", "entries", "loans", "assets", "merchantRules", "payeeMeta", "stockTrades"]));
    expect(JSON.stringify(b)).not.toMatch(/token|password|secret|@/i);
  });
});
