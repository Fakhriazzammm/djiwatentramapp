import { describe, expect, test } from "bun:test";
import { notifyUser, registerPushRoutes } from "./push";
import { pushFor } from "./mail/pipeline";
import { Hono } from "hono";

function fakeDb() {
  const subs = [{ endpoint: "https://push.example/a", p256dh: "p".repeat(20), auth: "a".repeat(12) }, { endpoint: "https://push.example/dead", p256dh: "p".repeat(20), auth: "a".repeat(12) }];
  return { subs, query: async (sql: string, p: unknown[] = []) => {
    if (/^select endpoint/.test(sql)) return { rows: [...subs] };
    if (/^delete/.test(sql)) { const i = subs.findIndex((s) => s.endpoint === p[1]); if (i >= 0) subs.splice(i, 1); return { rows: [] }; }
    return { rows: [] };
  } };
}
describe("notifyUser", () => {
  test("sends to every device and drops a dead one", async () => {
    const db = fakeDb(), sent: string[] = [];
    const n = await notifyUser(db, "u1", { id: "x1", tone: "out", label: "Dari email", title: "Pengeluaran", message: "Kopi", at: "2026-11-18T00:00:00Z" }, async (sub) => { if (sub.endpoint.endsWith("dead")) throw Object.assign(new Error("gone"), { statusCode: 410 }); sent.push(sub.endpoint); });
    expect(n).toBe(1); expect(sent).toEqual(["https://push.example/a"]); expect(db.subs.map((s) => s.endpoint)).toEqual(["https://push.example/a"]);
  });
  test("never throws, even when the database does", async () => { expect(await notifyUser({ query: async () => { throw new Error("db down"); } }, "u1", { id: "x", tone: "in", label: "", title: "", message: "", at: "" }, async () => {})).toBe(0); });
});
describe("pushFor", () => {
  test("words an automatic record and a review the way the app does", () => {
    const a = pushFor("auto", { kind: "out", amount: 58000, merchant: "ICEPEDIA BOYOLALI", issuer: "Mandiri", accountHint: "4399" }, "m1", null);
    expect(a).toMatchObject({ tone: "out", title: "Pengeluaran", sign: "−", amount: 58000, route: "/riwayat?baru=1" }); expect(a.message).toContain("Mandiri ••4399");
    const t = pushFor("auto", { kind: "tf", transfer: { amount: 50000 }, merchant: "ShopeePay" }, "m2", null);
    expect(t).toMatchObject({ tone: "move", title: "Pindah dana", sign: "⇄", amount: 50000 });
    expect(pushFor("review", { direction: "out", amount: 9000, subject: "Pembayaran Berhasil!" }, "m3", null)).toMatchObject({ tone: "mail", route: "/tinjau" });
  });
});
describe("push routes", () => {
  const app = () => { const a = new Hono(), db = fakeDb(); registerPushRoutes(a, { db }, () => "u1", (c, b, s = 200) => c.json(b, s as never), async () => {}); return { a, db }; };
  test("rejects a malformed subscription and accepts a proper one", async () => {
    const { a } = app();
    expect((await a.request("/api/finance/push/subscribe", { method: "POST", body: JSON.stringify({ endpoint: "http://x", keys: {} }) })).status).toBe(400);
    expect((await a.request("/api/finance/push/subscribe", { method: "POST", body: JSON.stringify({ endpoint: "https://push.example/ok-endpoint", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } }) })).status).toBe(200);
  });
});
