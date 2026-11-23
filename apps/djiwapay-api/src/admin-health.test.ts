import { describe, expect, test } from "bun:test";
import { dataHealth } from "./admin-health.js";

const one = { total: 0, on_: 0, bad: 0, active: 0, weak: 0, users: 0, received: 0, calls: 0, atlimit: 0, rows: 0, hits: 0 };
const db = { query: async (text: string) => {
  if (/group by 1 order by 6 desc/.test(text)) return { rows: [{ channel: "bca", ok: 6, bad: 4, rejected: 1, waiting: 2, total: 11 }, { channel: "gopay", ok: 50, bad: 0, rejected: 0, waiting: 0, total: 50 }] };
  if (/from finance.inbound_messages where created_at >=.*group by 1$/.test(text.replace(/\s+/g, " "))) return { rows: [{ status: "auto", n: 40 }, { status: "approved", n: 10 }, { status: "review", n: 6 }, { status: "failed", n: 1 }, { status: "ignored", n: 3 }] };
  if (/count\(\*\)::int (users|total|rows)/.test(text) && !/group by/.test(text)) return { rows: [one] };
  return { rows: [] };
} } as never;

describe("admin data health", () => {
  test("the share of mail that became records, and the banks that fail most", async () => {
    const h = await dataHealth({ db, authDb: null, emailOf: async () => null }, "2026-11-01", "2026-11-24");
    expect(h.mail).toMatchObject({ total: 60, recorded: 50, waiting: 6, failed: 1 });
    expect(h.mail.readRate).toBeGreaterThan(80);
    expect(h.banks[0]).toMatchObject({ channel: "bca", readRate: 60 });
    expect(h.worstBanks[0].channel).toBe("bca");
    expect(h.ai.dailyLimit).toBeGreaterThan(0);
  });
});
