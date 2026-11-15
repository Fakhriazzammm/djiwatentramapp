/** Prints every queued mail row that looks like one of the shapes that were once read as money.
 *
 *  `bun src/audit-mail-queue.ts`            every user
 *  `bun src/audit-mail-queue.ts <userId>`   one user
 *
 *  It only reads. A row is named here when its subject is a campaign, a report, a failed or unpaid
 *  bill, a warning, when its amount is under Rp1.000, when its date is far from today, or when it was
 *  read before the current rule set. Nothing is deleted: look at the row, then re-scan that window
 *  with `createImport` if the rules have moved since.
 */
import "./polyfill.js";
import { Pool } from "pg";
import { poolTx } from "./db.js";
import { auditQueue, auditSummary } from "./mail/audit.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: url, max: 2, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } });
const db = poolTx(pool);
const userId = process.argv[2];

const rows = await auditQueue(db, userId);
if (!rows.length) {
  console.log("no flagged rows", userId ? `for ${userId}` : "for any user");
} else {
  console.log("summary", JSON.stringify(auditSummary(rows)));
  for (const r of rows) {
    const day = r.at ? new Date(r.at).toISOString().slice(0, 10) : "----------";
    console.log([day, String(r.amount).padStart(9), r.direction.padEnd(7), r.status.padEnd(7), r.flags.join(",").padEnd(22), r.userId.slice(0, 12), r.subject.slice(0, 60)].join(" "));
  }
}
await pool.end();
