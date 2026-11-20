// Real Postgres, throwaway user. Skipped without DATABASE_URL.
import { afterAll, describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { poolTx } from "./db";
import { applySync, loadState } from "./sync";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const user = `itest-scope-${crypto.randomUUID().slice(0, 6)}`;
const pool = url ? new Pool({ connectionString: url, max: 2, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } }) : (null as unknown as Pool);
const db = pool ? poolTx(pool) : (null as never);

afterAll(async () => { if (pool) { await pool.query("delete from finance.accounts where user_id=$1", [user]); await pool.end(); } });

run("wallet scope (personal / business) round trip", () => {
  test("business is stored and returned; anything else becomes personal; changes persist", async () => {
    await applySync(db, user, { upserts: { accounts: [{ id: "kas", name: "Kas toko", type: "cash", opening: 500, scope: "business" }, { id: "bca", name: "BCA", type: "bank", opening: 0 }, { id: "x", name: "X", type: "bank", opening: 0, scope: "weird" }] } });
    let s = await loadState(db, user); const by = (id: string) => s.state.accounts.find((a: any) => a.id === id);
    expect(by("kas")).toMatchObject({ scope: "business" }); expect(by("bca")!.scope).toBeUndefined(); expect(by("x")!.scope).toBeUndefined();
    await applySync(db, user, { upserts: { accounts: [{ id: "bca", name: "BCA", type: "bank", opening: 0, scope: "business" }, { id: "kas", name: "Kas toko", type: "cash", opening: 500 }] } });
    s = await loadState(db, user);
    expect(by("bca")).toBeDefined(); expect(s.state.accounts.find((a: any) => a.id === "bca")).toMatchObject({ scope: "business" }); expect(s.state.accounts.find((a: any) => a.id === "kas")!.scope).toBeUndefined();
  });
});
