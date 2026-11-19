import "./polyfill.js";
import { Pool } from "pg";
import { poolTx } from "./db.js";
import { makeLlm } from "./mail/llm.js";
import { auditPending, sweep } from "./mail/pipeline.js";
import { startSmtp, toRawMail } from "./mail/smtp.js";
import { googleConfig } from "./google.js";
import { runDue } from "./gmail.js";
import { runGoogleDue } from "./google-sync.js";
import { runStocksDue } from "./stocks/service.js";
import { runRatesDue } from "./rates/service.js";
import { runImports } from "./gmail-import.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const domain = process.env.MAIL_DOMAIN || "catat.djiwapay.web.id";
const pool = new Pool({ connectionString: url, max: 4, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } });
const db = poolTx(pool);
const key = process.env.HELIPOD_AI_KEY;
const pipeline = { db, domain, llm: key ? makeLlm({ key, model: process.env.MAIL_LLM_MODEL }) : undefined, trustMin: process.env.MAIL_TRUST_MIN ? Number(process.env.MAIL_TRUST_MIN) : undefined };
startSmtp(
  pipeline,
  { port: Number(process.env.MAIL_PORT || 25), hostname: domain, tlsKey: process.env.MAIL_TLS_KEY, tlsCert: process.env.MAIL_TLS_CERT },
);
// Run once after restart as well: deploying a fix must expose old queued reads immediately.
void auditPending(db).catch((e) => console.error("mail audit", e));
setInterval(() => void sweep(db).catch((e) => console.error("mail sweep", e)), 6 * 3600_000);

// BI-Rate: no Google needed. Cheap when nothing is due (one indexed lookup); fetches Bank Indonesia's page hourly, every 10 minutes around the monthly decision.
let busyR = false;
setInterval(async () => { if (busyR) return; busyR = true; try { await runRatesDue({ db }); } catch (e) { console.error("rates tick", e instanceof Error ? e.message : e); } finally { busyR = false; } }, 20_000);
console.log("bi-rate watcher on");

// Gmail direct: every 20 s look for users whose turn has come (each user is polled every ~5 min, or right away on request).
const cfg = googleConfig();
if (cfg) {
  let busy = false;
  setInterval(async () => { if (busy) return; busy = true; try { await runDue({ db, cfg, pipeline, toMail: toRawMail }); } catch (e) { console.error("gmail tick", e instanceof Error ? e.message : e); } finally { busy = false; } }, 20_000);
  console.log("gmail poller on");
  // Sheets and Drive two-way sync share the same loop: the API only raises flags, this does the work.
  let busyG = false;
  const dir = process.env.RECEIPTS_DIR || "/var/lib/djiwapay-api/receipts";
  setInterval(async () => { if (busyG) return; busyG = true; try { await runGoogleDue({ db, cfg, dir }); await runStocksDue({ db, cfg, dir }); } catch (e) { console.error("google tick", e instanceof Error ? e.message : e); } finally { busyG = false; } }, 20_000);
  console.log("google sheets/drive sync on");
  // Old-mail imports scan in short time-boxed steps so a long mailbox never blocks the other jobs.
  let busyI = false;
  setInterval(async () => { if (busyI) return; busyI = true; try { await runImports({ db, cfg, pipeline, toMail: toRawMail }); } catch (e) { console.error("import tick", e instanceof Error ? e.message : e); } finally { busyI = false; } }, 5_000);
  console.log("gmail import scanner on");
}
