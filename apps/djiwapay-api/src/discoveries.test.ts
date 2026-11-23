import { describe, expect, test } from "bun:test";
import { isTracked } from "./discoveries.js";

const BCA = { id: "bca", name: "BCA" }, GOPAY = { id: "gopay", name: "GoPay" };
const acc = (id: string, name: string) => ({ id, name });

describe("what counts as already tracked", () => {
  test("nothing anywhere: a new bank", () => { expect(isTracked({ accounts: [], others: [] }, BCA, "4821").tracked).toBe(false); });
  test("the very wallet mail would create", () => { expect(isTracked({ accounts: [acc("email-bca-4821", "BCA ••4821")], others: [] }, BCA, "4821").tracked).toBe(true); });
  test("a wallet the person named by hand covers the bank", () => { expect(isTracked({ accounts: [acc("w1", "BCA Tahapan")], others: [] }, BCA, "").tracked).toBe(true); });
  test("a known bank with an unseen number is a new account of that bank, offered a merge", () => {
    const r = isTracked({ accounts: [acc("w1", "BCA Tahapan")], others: [] }, BCA, "9902");
    expect(r.tracked).toBe(false); expect(r.sameIssuer.map((a) => a.id)).toEqual(["w1"]);
  });
  test("an asset, a bill or a loan from that issuer also counts", () => {
    expect(isTracked({ accounts: [], others: ["KPR BCA"] }, BCA, "").tracked).toBe(true);
    expect(isTracked({ accounts: [], others: ["GoPay Later"] }, GOPAY, "").tracked).toBe(true);
  });
  test("a longer word does not count: Bcad is not BCA", () => { expect(isTracked({ accounts: [], others: ["Bcad corp"] }, BCA, "").tracked).toBe(false); });
});

import { scanQuery } from "./mailbox-scan.js";
describe("mailbox scan query", () => {
  test("only transaction-like mail from the bank's own domains", () => {
    const q = scanQuery(["jago.com", "bankjago.com"]);
    expect(q).toContain("from:(jago.com OR bankjago.com)"); expect(q).toContain("subject:(transaksi OR"); expect(q).toContain("newer_than:420d");
  });
});
