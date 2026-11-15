// Real Postgres + an in-memory Google that stores what is written. Isolated user id, cleaned up. Skipped without DATABASE_URL.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { poolTx } from "./db";
import { SCOPES, finishConnect, googleConfig, startConnect } from "./google";
import { confirmDriveRemovals, confirmSheetDeletes, markSheetDirty, requestSheet, runGoogleDue, syncDrive, syncSheet, touchDrive } from "./google-sync";
import { FakeGoogle } from "./google-fake";
import { COL, KIND_LABEL, toSerial } from "./sheets/model";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const user = `itest-sy-${crypto.randomUUID().slice(0, 8)}`;
const pool = url ? new Pool({ connectionString: url, max: 2, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } }) : (null as unknown as Pool);
const db = pool ? poolTx(pool) : (null as never);
const cfg = googleConfig({ GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec", GOOGLE_TOKEN_KEY: Buffer.alloc(32, 9).toString("base64") })!;
const g = new FakeGoogle();
const dir = mkdtempSync(join(tmpdir(), "dpx-"));
let seq = 0;
const deps = () => ({ db, cfg, f: g.fetch, dir, newId: () => `sh-t${++seq}` });
const E = (id: string, over: Record<string, unknown> = {}) => ({ id, kind: "out", amount: 25000, category_id: "makan", account_id: "tunai", at: "2026-11-15T06:45:00Z", note: `Catatan ${id}`, source: "manual", ...over });
const addEntry = (e: ReturnType<typeof E>) => pool.query("insert into finance.entries(user_id,id,kind,amount,category_id,account_id,at,note,source) values($1,$2,$3,$4,$5,$6,$7,$8,$9)", [user, e.id, e.kind, e.amount, e.category_id, e.account_id, e.at, e.note, e.source]);
const entries = async () => (await pool.query("select id,amount,note,category_id,kind from finance.entries where user_id=$1 order by id", [user])).rows;
const row = (id: string) => { const i = g.catatan.findIndex((r) => r?.[COL.id] === id); return i < 0 ? null : { n: i + 2, cells: g.catatan[i] }; };

afterAll(async () => {
  if (!pool) return;
  for (const t of ["google_connections", "google_sheet_exports", "sheet_rows", "google_drive_files", "google_drive_state", "entries", "receipts", "accounts", "categories", "budgets", "bills", "goals", "debts", "assets", "profiles"]) await pool.query(`delete from finance.${t} where user_id=$1`, [user]);
  await pool.end();
});

run("workbook sync (real database, in-memory Google)", () => {
  test("connect, then the first pass builds the formatted workbook from the app's data", async () => {
    const state = new URL(await startConnect(db, cfg, user, ["drive"])).searchParams.get("state")!;
    await finishConnect(db, cfg, "code", state, ((u: string, i: RequestInit) => String(u).includes("/token") ? Promise.resolve(new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: `${SCOPES.email} ${SCOPES.drive}` }))) : String(u).includes("openid") ? Promise.resolve(new Response(JSON.stringify({ email: "t@example.com" }))) : g.fetch(u, i)) as unknown as typeof fetch);
    await pool.query("insert into finance.accounts(user_id,id,name,type) values($1,'bca','BCA ••1234','bank')", [user]);
    for (const id of ["a", "b", "c"]) await addEntry(E(id));
    await pool.query("insert into finance.budgets(user_id,category_id,limit_amount) values($1,'makan',500000)", [user]);
    await requestSheet(db, user);
    const out = await syncSheet(deps(), user);
    expect(out).toMatchObject({ ok: true, action: "built" });
    expect(g.styled).toBe(true);
    expect(g.catatan).toHaveLength(3);
    expect(row("a")!.cells.slice(COL.kind, COL.account + 1)).toEqual([KIND_LABEL.out, "Makan & minum", "Tunai"]);
    expect((await pool.query("select count(*)::int n from finance.sheet_rows where user_id=$1", [user])).rows[0].n).toBe(3);
    expect(await syncSheet(deps(), user)).toMatchObject({ ok: true, action: "idle" });      // nothing changed → one cheap check
  });

  test("an edit typed in the sheet reaches the app", async () => {
    g.userEditCell(row("a")!.n, COL.amount, 31000);
    g.userEditCell(row("a")!.n, COL.category, "Belanja");
    expect(await syncSheet(deps(), user)).toMatchObject({ ok: true, action: "synced", stats: { fromSheet: 1 } });
    const a = (await entries()).find((e) => e.id === "a")!;
    expect(Number(a.amount)).toBe(31000); expect(a.category_id).toBe("belanja");
    expect(row("a")!.cells[COL.status]).toContain("✓");
    expect(Number((await pool.query("select version from finance.profiles where user_id=$1", [user])).rows[0].version)).toBeGreaterThan(0);
  });

  test("a new row typed in the sheet becomes an entry with its ID written back", async () => {
    g.userAppendRow(["", toSerial("2026-11-16T03:00:00Z"), "Pemasukan", "Gaji", "BCA ••1234", "", 5000000, "Gaji November"]);
    await syncSheet(deps(), user);
    const created = (await entries()).find((e) => e.note === "Gaji November")!;
    expect(created).toMatchObject({ kind: "in", category_id: "gaji" });
    expect(row(created.id)).toBeTruthy();                                                   // the ID is in the sheet now
    expect(created.id).toMatch(/^sh-/);
  });

  test("a bad row is explained and changes nothing", async () => {
    g.userAppendRow(["", toSerial("2026-11-16T04:00:00Z"), "Pengeluaran", "Makan & minum", "Tunai", "", "banyak", "salah"]);
    await syncSheet(deps(), user);
    expect((await entries()).some((e) => e.note === "salah")).toBe(false);
    expect(String(g.catatan[g.catatan.length - 1][COL.status])).toContain("Jumlah");
    g.catatan.pop(); g.userEditCell(2, COL.note, g.catatan[0][COL.note]);                    // remove it again
  });

  test("changes made in the app reach the sheet: edit, add, delete", async () => {
    await pool.query("update finance.entries set amount=44000, note='Diubah di aplikasi' where user_id=$1 and id='b'", [user]);
    await addEntry(E("d", { note: "Baru dari aplikasi" }));
    await pool.query("delete from finance.entries where user_id=$1 and id='c'", [user]);
    await markSheetDirty(db, user);
    await syncSheet(deps(), user);
    expect(row("b")!.cells[COL.amount]).toBe(44000);
    expect(row("b")!.cells[COL.note]).toBe("Diubah di aplikasi");
    expect(row("d")).toBeTruthy();
    expect(row("c")).toBeNull();
  });

  test("deleting a row in the sheet deletes the entry", async () => {
    g.userDeleteRow(row("d")!.n);
    await syncSheet(deps(), user);
    expect((await entries()).some((e) => e.id === "d")).toBe(false);
  });

  test("a mass deletion in the sheet is held until the user confirms", async () => {
    for (let i = 0; i < 9; i++) await addEntry(E(`m${i}`));
    await markSheetDirty(db, user); await syncSheet(deps(), user);
    const before = (await entries()).length;
    g.userClearSheet();                                                                        // an emptied sheet looks like a mistake
    const out = await syncSheet(deps(), user);
    expect(out.action).toBe("held");
    expect((await entries()).length).toBe(before);
    expect((await pool.query("select status,hold from finance.google_sheet_exports where user_id=$1", [user])).rows[0].status).toBe("held");
    await confirmSheetDeletes(db, user);
    g.userClearSheet();
    await syncSheet(deps(), user);
    expect((await entries()).length).toBeLessThan(before);
  });

  test("a trashed spreadsheet is reported missing, not silently recreated", async () => {
    g.files.get(g.sheetId)!.trashed = true;
    await pool.query("update finance.google_sheet_exports set dirty=true where user_id=$1", [user]);
    expect(await syncSheet(deps(), user)).toMatchObject({ ok: false, action: "missing" });
    expect((await pool.query("select status from finance.google_sheet_exports where user_id=$1", [user])).rows[0].status).toBe("missing");
    expect(Object.keys(await runGoogleDue(deps())).filter((k) => k.startsWith("sheet:"))).toEqual([]);   // the scheduler leaves it alone
  });
});

run("receipt folder sync (real database, in-memory Google)", () => {
  const photo = (id: string, merchant: string) => { const rel = `${id}.jpg`; writeFileSync(join(dir, rel), Buffer.from([0xff, 0xd8, 0xff, 0xd9])); return pool.query("insert into finance.receipts(user_id,id,merchant,purchased_at,total,items,image_path) values($1,$2,$3,'2026-11-15T06:45:00Z',25000,'[]',$4)", [user, id, merchant, rel]); };
  const link = (entryId: string, rid: string, note: string) => pool.query("insert into finance.entries(user_id,id,kind,amount,category_id,account_id,at,note,source,receipt_id) values($1,$2,'out',25000,'makan','tunai','2026-11-15T06:45:00Z',$3,'receipt',$4)", [user, entryId, note, rid]);

  test("new receipt photos land in Djiwa Pay/Struk, named after the entry", async () => {
    await photo("r1", "Kopi Kenangan"); await link("er1", "r1", "Kopi Kenangan");
    await touchDrive(db, user);
    const out = await syncDrive(deps(), user);
    expect(out).toMatchObject({ ok: true, uploaded: 1 });
    const f = g.fileNamed(/Kopi Kenangan/)!;
    expect(f.name).toBe("2026-11-15 Kopi Kenangan.jpg");
    expect([...g.files.values()].filter((x) => x.mime.endsWith("folder")).map((x) => x.name).sort()).toEqual(["Djiwa Pay", "Struk"]);
    expect((await syncDrive(deps(), user)).uploaded).toBe(0);                                  // not uploaded twice
  });

  test("renaming the entry in the app renames the file in Drive", async () => {
    await pool.query("update finance.entries set note='Ngopi pagi' where user_id=$1 and id='er1'", [user]);
    expect(await syncDrive(deps(), user)).toMatchObject({ renamedInDrive: 1 });
    expect(g.fileNamed(/Ngopi pagi/)!.name).toBe("2026-11-15 Ngopi pagi.jpg");
  });

  test("renaming the file in Drive renames the entry in the app", async () => {
    g.fileNamed(/Ngopi pagi/)!.name = "2026-11-15 Sarapan di Warung.jpg";
    expect(await syncDrive(deps(), user)).toMatchObject({ renamedInApp: 1 });
    expect((await pool.query("select note from finance.entries where user_id=$1 and id='er1'", [user])).rows[0].note).toBe("Sarapan di Warung");
  });

  test("deleting a receipt in the app moves its Drive file to the bin", async () => {
    await photo("r2", "Toko Buku"); await link("er2", "r2", "Toko Buku");
    await syncDrive(deps(), user);
    const f = g.fileNamed(/Toko Buku/)!;
    await pool.query("update finance.google_drive_files set status='pending_trash' where user_id=$1 and receipt_id='r2'", [user]);
    await pool.query("delete from finance.receipts where user_id=$1 and id='r2'", [user]);
    expect(await syncDrive(deps(), user)).toMatchObject({ trashed: 1 });
    expect(g.files.get(f.id)!.trashed).toBe(true);
  });

  test("a photo the user deletes in Drive disappears from the app too", async () => {
    const f = g.fileNamed(/Sarapan/)!; g.files.get(f.id)!.trashed = true;
    expect(await syncDrive(deps(), user)).toMatchObject({ removedInDrive: 1 });
    expect((await pool.query("select 1 from finance.receipts where user_id=$1 and id='r1'", [user])).rows).toHaveLength(0);
    expect((await pool.query("select receipt_id from finance.entries where user_id=$1 and id='er1'", [user])).rows[0].receipt_id).toBeNull();   // the entry stays
    expect(existsSync(join(dir, "r1.jpg"))).toBe(false);
  });

  test("deleting the whole folder is held for confirmation, not applied", async () => {
    for (let i = 0; i < 7; i++) { await photo(`b${i}`, `Struk ${i}`); await link(`eb${i}`, `b${i}`, `Struk ${i}`); }
    await syncDrive(deps(), user);
    for (const f of g.files.values()) if (!f.mime.endsWith("folder") && f.appProperties.receiptId?.startsWith("b")) f.trashed = true;
    const out = await syncDrive(deps(), user);
    expect(out.held).toContain("7 foto struk");
    expect((await pool.query("select count(*)::int n from finance.receipts where user_id=$1 and id like 'b%'", [user])).rows[0].n).toBe(7);
    await confirmDriveRemovals(db, user);
    expect(await syncDrive(deps(), user)).toMatchObject({ removedInDrive: 7 });
  });
});
