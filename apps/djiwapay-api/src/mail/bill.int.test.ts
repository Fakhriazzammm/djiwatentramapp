// Real Postgres, isolated user. Skipped without DATABASE_URL.
import { afterAll, describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { poolTx } from "../index";
import { approve, processForUser, reviewGroups, reviewList, type RawMail } from "./pipeline";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const user = `itest-bl-${crypto.randomUUID().slice(0, 8)}`;
const pool = url ? new Pool({ connectionString: url, max: 2, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } }) : (null as unknown as Pool);
const db = pool ? poolTx(pool) : (null as never);
const NOW = new Date("2026-11-19T11:41:00Z");
const deps = () => ({ db, domain: "catat.djiwapay.web.id", now: () => NOW });
let n = 0;
const telkom = (over: Partial<RawMail> = {}): RawMail => ({
  messageId: `<b${++n}-${user}@x>`, from: "no-reply@telkomsel.com", to: [], subject: "Bill Event",
  text: "Plgn Yth, tagihan IndiHome bulan ini Rp340215. Jatuh tempo tgl 20-NOV-26, bayar dengan klik: tsel.id/bayarindihome Terimakasih jika sudah bayar", date: NOW,
  auth: { dmarcPass: true, dkimDomains: ["telkomsel.com"] }, ...over,
});
const send = (m: RawMail) => processForUser(deps(), user, 0, m);
const bills = async () => (await pool.query("select id,name,amount,day,icon,paid from finance.bills where user_id=$1", [user])).rows.map((r) => ({ ...r, amount: Number(r.amount), day: Number(r.day) }));
const entries = async () => (await pool.query("select id,kind,amount from finance.entries where user_id=$1", [user])).rows;

afterAll(async () => {
  if (!pool) return;
  for (const t of ["inbound_messages", "inbound_skips", "inbound_sources", "sender_hints", "merchant_rules", "entries", "accounts", "bills", "profiles"]) await pool.query(`delete from finance.${t} where user_id=$1`, [user]);
  await pool.end();
});

run("bill reminders become monthly bills after confirmation (real database)", () => {
  test("a reminder is queued as a bill to confirm; it records no spending and no bill yet", async () => {
    expect(await send(telkom())).toMatchObject({ status: "review", reason: "bill" });
    expect(await entries()).toHaveLength(0); expect(await bills()).toHaveLength(0);
    const item = (await reviewList(db, user)).find((i) => i.parsed.bill)!;
    expect(item.parsed).toMatchObject({ bill: true, amount: 340215, due: "2026-11-20", merchant: "IndiHome", issuer: expect.stringContaining("Telkom") });
  });

  test("the same reminder again, or a repeat in the same month, is not asked twice", async () => {
    expect(await send(telkom())).toMatchObject({ status: "duplicate", reason: "bill-exists" });
    expect((await reviewList(db, user)).filter((i) => i.parsed.bill)).toHaveLength(1);
  });

  test("a bill is never part of the shop-by-shop batch approval", async () => {
    const { groups } = await reviewGroups(db, user);
    expect(groups.some((g) => g.name.toLowerCase().includes("indihome"))).toBe(false);
  });

  test("approving makes it a monthly bill on its due day", async () => {
    const item = (await reviewList(db, user)).find((i) => i.parsed.bill)!;
    expect(await approve(db, user, item.id, {})).not.toBeNull();
    expect(await bills()).toEqual([expect.objectContaining({ name: "IndiHome", amount: 340215, day: 20, paid: [] })]);
    expect(await entries()).toHaveLength(0);
    expect(await send(telkom())).toMatchObject({ status: "duplicate" });                       // now it exists as a bill
  });

  test("the payment arriving from e-mail marks that month of the bill paid and records the spending once", async () => {
    const paid = await send(telkom({ subject: "Pembayaran Berhasil!", from: "no-reply@livin.id", auth: { dmarcPass: true, dkimDomains: ["livin.id"] },
      text: "Pembayaran berhasil. Pembayaran IndiHome sebesar Rp 340.215 berhasil pada 20/11/2026 09:10. No. Referensi: LV2011260910X1" }));
    expect(paid.status).toBe("auto");
    expect((await entries()).filter((e) => e.kind === "out")).toHaveLength(1);
    expect((await bills())[0].paid).toEqual(["2026-11"]);
  });

  test("a reminder without any amount is dropped", async () => {
    expect(await send(telkom({ text: "Segera lunasi tagihan Anda. Jatuh tempo tgl 22-NOV-26." }))).toMatchObject({ status: "ignored", reason: "bill" });
  });

  test("a changed amount next month updates the one bill instead of adding another", async () => {
    await send(telkom({ text: "Plgn Yth, tagihan IndiHome bulan ini Rp355000. Jatuh tempo tgl 20-DES-26, bayar dengan klik: tsel.id/bayarindihome Terimakasih jika sudah bayar", messageId: `<c-${user}@x>` }));
    const item = (await reviewList(db, user)).find((i) => i.parsed.bill && i.parsed.amount === 355000)!;
    expect(await approve(db, user, item.id, {})).not.toBeNull();
    expect(await bills()).toEqual([expect.objectContaining({ name: "IndiHome", amount: 355000, day: 20 })]);
  });
});
