import { describe, expect, test } from "bun:test";
import { isKnownPayPath, parseWalletPath } from "../src/lib/djiwa-pay-routes";
import { diffState, emptySnapshot, snapshotOf } from "../src/lib/finance/sync";
import { emptyState } from "../src/lib/finance/store";
import { CHANNEL_NAME } from "../src/lib/finance/integrations";

describe("integration routes", () => {
  test("Integrasi and Tinjau are known Pay pages", () => {
    expect(parseWalletPath("/integrasi")).toEqual({ page: "integrations" });
    expect(parseWalletPath("/tinjau")).toEqual({ page: "review" });
    expect(isKnownPayPath("/tinjau")).toBe(true);
  });
});

describe("e-mail entries survive local-first sync", () => {
  test("an entry pulled from the server keeps its origin and is not re-sent or deleted", () => {
    const entry = { id: "em-1", kind: "out" as const, amount: 25000, categoryId: "makan", accountId: "email-gopay", at: "2026-11-15T06:45:00.000Z", note: "Kopi Kenangan", tags: [], source: "email" as const, inboundId: "in-1", createdAt: "2026-11-15T06:46:00.000Z" };
    const state = { ...emptyState(), entries: [entry] };
    expect(diffState(snapshotOf(state), state)).toBeNull();                       // nothing to push after a pull
    const body = diffState(emptySnapshot(), state)!;
    expect((body.upserts.entries as any[])[0]).toMatchObject({ source: "email", inboundId: "in-1" });   // origin is sent back intact
    expect(diffState(snapshotOf(state), { ...state, entries: [] })!.deletes.entries).toEqual(["em-1"]); // undo = delete
  });
  test("channel names are readable", () => { expect(CHANNEL_NAME.gopay).toBe("GoPay"); expect(CHANNEL_NAME.mandiri).toBe("Mandiri"); });
});
