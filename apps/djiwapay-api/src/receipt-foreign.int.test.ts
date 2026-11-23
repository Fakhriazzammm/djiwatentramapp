// Real database, isolated user. Foreign-currency receipts: rupiah value, refund, top-up, duplicates.
import { afterAll, describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { poolTx } from "./db";
import { normalizeReceiptDocument } from "./receipt-document";
import { confirmReceipt, findDuplicate } from "./receipt-records";
import { applySync } from "./sync";
const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const p = url ? new Pool({ connectionString: url, max: 4, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } }) : null;
const db = p ? poolTx(p) : null!;
const user = `itest-foreign-${crypto.randomUUID()}`;
const item = (name: string, price: number) => ({ name, nameOriginal: name, qty: 1, unit: "", unitPrice: price, discount: 0, price, categoryId: "makan", confidence: 0.95, components: [] });
const jp = (extra: Record<string, unknown> = {}) => normalizeReceiptDocument({ kind: "itemized", language: "ja", merchant: "Saizeriya", merchantOriginal: "サイゼリヤ", currency: "JPY", purchasedAt: "2025-11-25T04:14:00Z", total: 1200, items: [item("A", 400), item("B", 500), item("C", 300)], fx: { rate: 106.34, date: "2025-11-25", source: "frankfurter" }, ...extra });
const seed = (id: string, d = jp(), sha = "sha-" + id) => p!.query("insert into finance.receipts(user_id,id,merchant,purchased_at,total,items,details,image_sha) values($1,$2,$3,$4,$5,'[]'::jsonb,$6::jsonb,$7)", [user, id, d.merchant, d.purchasedAt, d.total, JSON.stringify({ version: 2, original: d }), sha]);
afterAll(async () => { if (!p) return; for (const t of ["entries", "receipts", "accounts", "categories", "profiles"]) await p.query(`delete from finance.${t} where user_id=$1`, [user]); await p.end(); });
run("foreign receipts in Postgres", () => {
  test("setup", async () => {
    await applySync(db, user, { upserts: { accounts: [{ id: "tunai", name: "Tunai", type: "cash", opening: 0 }, { id: "suica", name: "Suica", type: "ewallet", opening: 0, currency: "JPY" }], categories: [{ id: "belanja", name: "Belanja", income: false }, { id: "refund", name: "Refund", income: true }, { id: "transfer", name: "Transfer", income: false }] } });
    const a = (await p!.query("select currency from finance.accounts where user_id=$1 and id='suica'", [user])).rows[0]; expect(a.currency).toBe("JPY");
  });
  test("a yen receipt becomes one rupiah expense that remembers the yen, the rate and the trip", async () => {
    await seed("jp-1");
    const r = await confirmReceipt(db, user, "jp-1", { document: jp(), reviewed: true, accountId: "tunai", categoryId: "belanja" });
    expect(r.entry.amount).toBe(127608); expect(r.entry.foreignCurrency).toBe("JPY"); expect(r.entry.foreignAmount).toBe(1200); expect(r.entry.fxRate).toBeCloseTo(106.34, 4);
    expect(r.entry.tags).toEqual(["trip:JPY-2025-11"]);
    expect(Number((await p!.query("select total from finance.receipts where user_id=$1 and id='jp-1'", [user])).rows[0].total)).toBe(1200);   // the receipt keeps what is printed
  });
  test("a foreign receipt without a rate is refused", async () => {
    await seed("jp-2", jp({ fx: undefined }));
    await expect(confirmReceipt(db, user, "jp-2", { document: jp({ fx: undefined }), reviewed: true, accountId: "tunai", categoryId: "belanja" })).rejects.toMatchObject({ code: "FX_REQUIRED" });
  });
  test("a refund is income and needs an income category", async () => {
    const d = jp({ kind: "refund", total: 1000, items: [item("A", 1000)] }); await seed("jp-3", d);
    await expect(confirmReceipt(db, user, "jp-3", { document: d, reviewed: true, accountId: "tunai", categoryId: "belanja" })).rejects.toMatchObject({ code: "INVALID_ACCOUNT_OR_CATEGORY" });
    const r = await confirmReceipt(db, user, "jp-3", { document: d, reviewed: true, accountId: "tunai", categoryId: "refund" });
    expect(r.entry.kind).toBe("in"); expect(r.entry.amount).toBe(106340);
  });
  test("a transit top-up moves money between wallets and needs a destination", async () => {
    const d = jp({ kind: "topup", total: 1000, items: [item("Deposit", 500), item("Charge", 500)] }); await seed("jp-4", d);
    await expect(confirmReceipt(db, user, "jp-4", { document: d, reviewed: true, accountId: "tunai", categoryId: "transfer" })).rejects.toMatchObject({ code: "INVALID_ACCOUNT_OR_CATEGORY" });
    await expect(confirmReceipt(db, user, "jp-4", { document: d, reviewed: true, accountId: "tunai", categoryId: "transfer", toAccountId: "tunai" })).rejects.toMatchObject({ code: "INVALID_ACCOUNT_OR_CATEGORY" });
    const r = await confirmReceipt(db, user, "jp-4", { document: d, reviewed: true, accountId: "tunai", categoryId: "transfer", toAccountId: "suica" });
    expect(r.entry.kind).toBe("tf"); expect(r.entry.toAccountId).toBe("suica"); expect(r.entry.amount).toBe(106340);
  });
  test("the same photo, or the same amount at the same minute, is flagged; unrelated ones are not", async () => {
    await seed("jp-5", jp(), "sha-jp-1");
    expect((await findDuplicate(db, user, "jp-5", "sha-jp-1", { total: 5, purchasedAt: null }))?.reason).toBe("photo");
    expect((await findDuplicate(db, user, "jp-6", "sha-other", { total: 1200, purchasedAt: "2025-11-25T04:14:30Z" }))?.reason).toBe("amount");
    expect(await findDuplicate(db, user, "jp-6", "sha-other", { total: 1201, purchasedAt: "2025-11-25T04:14:30Z" })).toBeNull();
    expect(await findDuplicate(db, user, "jp-6", "sha-other", { total: 1200, purchasedAt: "2025-11-25T09:00:00Z" })).toBeNull();
  });
  test("an older client's sync cannot erase the yen on an entry", async () => {
    const id = "receipt:jp-1";
    await applySync(db, user, { upserts: { entries: [{ id, kind: "out", amount: 127608, categoryId: "belanja", accountId: "tunai", at: "2025-11-25T04:14:00Z", source: "receipt", receiptId: "jp-1", tags: ["trip:JPY-2025-11"] }] } }).catch(() => {});
    const row = (await p!.query("select foreign_currency, foreign_amount from finance.entries where user_id=$1 and id=$2", [user, id])).rows[0];
    expect(row.foreign_currency).toBe("JPY"); expect(Number(row.foreign_amount)).toBe(1200);
  });
});
