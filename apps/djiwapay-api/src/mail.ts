import "./polyfill.js";
import { Pool } from "pg";
import { poolTx } from "./db.js";
import { makeLlm } from "./mail/llm.js";
import { sweep } from "./mail/pipeline.js";
import { startSmtp } from "./mail/smtp.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const domain = process.env.MAIL_DOMAIN || "catat.djiwapay.web.id";
const pool = new Pool({ connectionString: url, max: 4, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } });
const db = poolTx(pool);
const key = process.env.HELIPOD_AI_KEY;
startSmtp(
  { db, domain, llm: key ? makeLlm({ key, model: process.env.MAIL_LLM_MODEL }) : undefined, trustMin: process.env.MAIL_TRUST_MIN ? Number(process.env.MAIL_TRUST_MIN) : undefined },
  { port: Number(process.env.MAIL_PORT || 25), hostname: domain, tlsKey: process.env.MAIL_TLS_KEY, tlsCert: process.env.MAIL_TLS_CERT },
);
setInterval(() => void sweep(db).catch(() => {}), 6 * 3600_000);
