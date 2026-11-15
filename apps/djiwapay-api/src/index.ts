import { Hono } from "hono";
import { Pool } from "pg";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { authServerResolver, type Resolver } from "./auth.js";
import { applySync, loadState, type Tx } from "./sync.js";
import { poolTx } from "./db.js";
export { poolTx };
import { isEmptyRead, readReceipt, type ReceiptRead } from "./receipt.js";
import { disconnect as googleDisconnect, FEATURES, finishConnect, googleConfig, startConnect, status as googleStatus, syncCalendar, type Feature, type Fetch, type GoogleCfg } from "./google.js";
import { confirmDriveRemovals, confirmSheetDeletes, requestSheet, touchDrive } from "./google-sync.js";
import { ISSUERS } from "./mail/extract.js";
import { disableGmail, enableGmail, pollSoon } from "./gmail.js";
import { cancelImport, commitImport, createImport, importCheckItems, importState, undoImport } from "./gmail-import.js";
import { approve, ensureSource, getSource, originOf, reject, removeSource, reviewCount, reviewList } from "./mail/pipeline.js";

const DAILY_SCAN_LIMIT = Number(process.env.SCAN_DAILY_LIMIT || 30);
const MAX_IMAGE_BYTES = 3_500_000;

export type Deps = { db: Tx; resolve: Resolver; dir: string; aiKey?: string; read?: (dataUrl: string) => Promise<ReceiptRead>; google?: GoogleCfg | null; gfetch?: Fetch; mailDomain?: string };

export function createApp(d: Deps) {
  const app = new Hono();
  const json = (c: any, body: unknown, status = 200) => c.body(JSON.stringify(body), status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  app.get("/api/finance/health", (c) => json(c, { ok: true }));
  app.use("/api/finance/*", async (c, next) => {
    if (c.req.path === "/api/finance/health" || c.req.path === "/api/finance/google/callback") return next();
    const userId = await d.resolve(c.req.header("cookie") || "");
    if (!userId) return json(c, { success: false, error: "UNAUTHORIZED" }, 401);
    c.set("userId" as never, userId as never);
    return next();
  });
  const uid = (c: any) => c.get("userId") as string;
  const google = d.google ?? null, mailDomain = d.mailDomain ?? "";
  // Keep Google in step with what the user just changed, without ever slowing or failing the request.
  const SCOPE_OF: Record<Feature, string> = { calendar: "https://www.googleapis.com/auth/calendar.events", drive: "https://www.googleapis.com/auth/drive.file", gmail: "https://www.googleapis.com/auth/gmail.readonly" };
  const connected = async (userId: string, feature: Feature) => {
    if (!google) return false;
    const r = await d.db.query("select granted_scopes from finance.google_connections where user_id=$1 and refresh_enc is not null", [userId]);
    return Boolean(r.rows[0]) && (r.rows[0].granted_scopes as string[]).includes(SCOPE_OF[feature]);
  };
  const later = (fn: () => Promise<unknown>) => void fn().catch((e) => console.error("background sync", e instanceof Error ? e.message : e));

  app.get("/api/finance/state", async (c) => json(c, { success: true, ...(await loadState(d.db, uid(c))) }));

  app.post("/api/finance/sync", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return json(c, { success: false, error: "BAD_REQUEST" }, 400);
    try {
      const out = await applySync(d.db, uid(c), body);
      const touchedBills = Boolean((body as any).upserts?.bills?.length || (body as any).deletes?.bills?.length);
      if (touchedBills && google) later(async () => { if (await connected(uid(c), "calendar")) await syncCalendar(d.db, google, uid(c), d.gfetch); });
      return json(c, { success: true, ...out });
    }
    catch (e) { console.error("sync failed", e instanceof Error ? e.message : e); return json(c, { success: false, error: "SYNC_FAILED" }, 500); }
  });

  app.post("/api/finance/receipts/scan", async (c) => {
    const body = await c.req.json().catch(() => null) as { image?: unknown; id?: unknown } | null;
    const image = typeof body?.image === "string" ? body.image : "";
    const m = image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return json(c, { success: false, error: "BAD_IMAGE" }, 400);
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length > MAX_IMAGE_BYTES) return json(c, { success: false, error: "IMAGE_TOO_LARGE" }, 413);
    const reader = d.read ?? (d.aiKey ? (u: string) => readReceipt(u, { key: d.aiKey! }) : null);
    if (!reader) return json(c, { success: false, error: "SCAN_UNAVAILABLE" }, 503);
    const userId = uid(c);
    const used = await d.db.query("insert into finance.scan_usage(user_id,scans) values($1,1) on conflict(user_id,day) do update set scans=finance.scan_usage.scans+1 returning scans", [userId]);
    if (Number(used.rows[0].scans) > DAILY_SCAN_LIMIT) return json(c, { success: false, error: "DAILY_LIMIT", limit: DAILY_SCAN_LIMIT }, 429);
    let read: ReceiptRead;
    try { read = await reader(image); } catch (e) {
      await d.db.query("update finance.scan_usage set scans=greatest(scans-1,0) where user_id=$1 and day=current_date", [userId]);
      console.error("scan failed", e instanceof Error ? e.message : e);
      return json(c, { success: false, error: "SCAN_FAILED" }, 502);
    }
    if (isEmptyRead(read)) {
      await d.db.query("update finance.scan_usage set scans=greatest(scans-1,0) where user_id=$1 and day=current_date", [userId]);
      return json(c, { success: false, error: "NOT_A_RECEIPT" }, 422);
    }
    const id = typeof body?.id === "string" && /^[\w-]{8,64}$/.test(body.id) ? body.id : crypto.randomUUID();
    const rel = join(userId.replace(/[^\w-]/g, "_"), `${id}.${m[1] === "jpeg" ? "jpg" : m[1]}`);
    await mkdir(join(d.dir, rel, ".."), { recursive: true });
    await writeFile(join(d.dir, rel), bytes);
    await d.db.query(`insert into finance.receipts(user_id,id,merchant,purchased_at,total,tax,confidence,items,model,image_path,image_bytes) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
      on conflict(user_id,id) do update set merchant=excluded.merchant,purchased_at=excluded.purchased_at,total=excluded.total,tax=excluded.tax,confidence=excluded.confidence,items=excluded.items,model=excluded.model,image_path=excluded.image_path,image_bytes=excluded.image_bytes`,
      [userId, id, read.merchant, read.purchasedAt, read.total, read.tax, read.confidence, JSON.stringify(read.items), read.model, rel, bytes.length]);
    if (google) later(async () => { if (await connected(userId, "drive")) await touchDrive(d.db, userId); });
    return json(c, { success: true, receipt: { id, ...read } });
  });

  app.get("/api/finance/receipts/:id/image", async (c) => {
    const r = await d.db.query("select image_path from finance.receipts where user_id=$1 and id=$2", [uid(c), c.req.param("id")]);
    const rel = r.rows[0]?.image_path as string | undefined;
    if (!rel) return json(c, { success: false, error: "NOT_FOUND" }, 404);
    const file = await readFile(join(d.dir, rel)).catch(() => null);
    if (!file) return json(c, { success: false, error: "NOT_FOUND" }, 404);
    return new Response(file, { headers: { "Content-Type": rel.endsWith(".png") ? "image/png" : rel.endsWith(".webp") ? "image/webp" : "image/jpeg", "Cache-Control": "private, max-age=3600" } });
  });

  app.delete("/api/finance/receipts/:id", async (c) => {
    const r = await d.db.query("delete from finance.receipts where user_id=$1 and id=$2 returning image_path", [uid(c), c.req.param("id")]);
    if (google) later(async () => { await d.db.query("update finance.google_drive_files set status='pending_trash' where user_id=$1 and receipt_id=$2", [uid(c), c.req.param("id")]); await touchDrive(d.db, uid(c)); });
    const rel = r.rows[0]?.image_path as string | undefined;
    if (rel) await unlink(join(d.dir, rel)).catch(() => {});
    return json(c, { success: true });
  });
  /* ---------- Google ---------- */
  app.get("/api/finance/google/status", async (c) => json(c, { success: true, ...(await googleStatus(d.db, google, uid(c))) }));
  app.post("/api/finance/google/connect", async (c) => {
    if (!google) return json(c, { success: false, error: "NOT_CONFIGURED" }, 503);
    const body = await c.req.json().catch(() => ({})) as { features?: unknown };
    const wanted = (Array.isArray(body.features) ? body.features : []).filter((x): x is Feature => (FEATURES as string[]).includes(String(x)));
    const features = wanted.length ? [...new Set(wanted)] : (["drive"] as Feature[]);
    // Keep what was granted before: asking for one more feature must not drop the others.
    const prev = await d.db.query("select granted_scopes from finance.google_connections where user_id=$1 and refresh_enc is not null", [uid(c)]);
    const have = (prev.rows[0]?.granted_scopes as string[] | undefined) ?? [];
    for (const f of FEATURES) if (have.includes(SCOPE_OF[f]) && !features.includes(f)) features.push(f);
    return json(c, { success: true, url: await startConnect(d.db, google, uid(c), features) });
  });
  app.get("/api/finance/google/callback", async (c) => {
    const back = (q: string) => c.redirect(`/integrasi?google=${q}`, 302);
    if (!google) return back("unavailable");
    const code = c.req.query("code"), state = c.req.query("state");
    if (c.req.query("error") || !code || !state) return back("denied");
    try {
      const out = await finishConnect(d.db, google, code, state, d.gfetch);
      later(async () => { if (out.features.gmail) await enableGmail(d.db, out.userId); if (out.features.calendar) await syncCalendar(d.db, google, out.userId, d.gfetch); if (out.features.drive) { await requestSheet(d.db, out.userId); await touchDrive(d.db, out.userId); } });
      return back("ok");
    } catch (e) { console.error("google connect", e instanceof Error ? e.message : e); return back("error"); }
  });
  app.post("/api/finance/google/gmail/poll", async (c) => { if (!(await connected(uid(c), "gmail"))) return json(c, { success: false, error: "NOT_CONNECTED" }, 409); await enableGmail(d.db, uid(c)); await pollSoon(d.db, uid(c)); return json(c, { success: true }); });
  // Import of old mail: scan (worker) -> preview -> commit. The API only creates, reads and decides.
  app.post("/api/finance/google/gmail/import", async (c) => {
    if (!(await connected(uid(c), "gmail"))) return json(c, { success: false, error: "NOT_CONNECTED" }, 409);
    const body = await c.req.json().catch(() => ({})) as { days?: unknown };
    await enableGmail(d.db, uid(c));
    return json(c, { success: true, id: await createImport(d.db, uid(c), Number(body.days ?? 90)) });
  });
  app.get("/api/finance/google/gmail/import", async (c) => json(c, { success: true, import: await importState(d.db, uid(c)) }));
  app.get("/api/finance/google/gmail/import/:id/items", async (c) => json(c, { success: true, items: await importCheckItems(d.db, uid(c), c.req.param("id")) }));
  app.post("/api/finance/google/gmail/import/:id/commit", async (c) => { const r = await commitImport(d.db, uid(c), c.req.param("id")); return r ? json(c, { success: true, ...r }) : json(c, { success: false, error: "NOT_READY" }, 409); });
  app.post("/api/finance/google/gmail/import/:id/undo", async (c) => { const r = await undoImport(d.db, uid(c), c.req.param("id")); return r ? json(c, { success: true, ...r }) : json(c, { success: false, error: "NOT_FOUND" }, 404); });
  app.post("/api/finance/google/gmail/import/cancel", async (c) => { await cancelImport(d.db, uid(c)); return json(c, { success: true }); });
  app.post("/api/finance/google/gmail/off", async (c) => { await disableGmail(d.db, uid(c)); return json(c, { success: true }); });
  app.post("/api/finance/google/disconnect", async (c) => { await googleDisconnect(d.db, google, uid(c), d.gfetch); return json(c, { success: true }); });
  const need = (c: any) => (!google ? json(c, { success: false, error: "NOT_CONFIGURED" }, 503) : null);
  app.post("/api/finance/google/calendar/sync", async (c) => need(c) ?? json(c, { success: true, ...(await syncCalendar(d.db, google!, uid(c), d.gfetch)) }));
  // Drive and Sheets are handled by the background worker; these only ask it to look now.
  app.post("/api/finance/google/drive/sync", async (c) => need(c) ?? (!(await connected(uid(c), "drive")) ? json(c, { success: false, error: "NOT_CONNECTED" }, 409) : (await touchDrive(d.db, uid(c)), json(c, { success: true, queued: true }))));
  app.post("/api/finance/google/sheets/export", async (c) => need(c) ?? (!(await connected(uid(c), "drive")) ? json(c, { success: false, error: "NOT_CONNECTED" }, 409) : (await requestSheet(d.db, uid(c), true), json(c, { success: true, queued: true }))));
  app.post("/api/finance/google/sheets/confirm", async (c) => { await confirmSheetDeletes(d.db, uid(c)); return json(c, { success: true }); });
  app.post("/api/finance/google/drive/confirm", async (c) => { await confirmDriveRemovals(d.db, uid(c)); return json(c, { success: true }); });

  /* ---------- Payment e-mail inbox ---------- */
  const sourceView = (s: any) => s && mailDomain ? { forwarding: Boolean(s.forwarding), address: `${s.token}@${mailDomain}`, enabled: Boolean(s.enabled), mailCount: Number(s.mail_count), lastMailAt: s.last_mail_at ? new Date(s.last_mail_at).toISOString() : null, trusted: Number(s.trusted_count), forwardCode: s.forward_code && s.forward_code_at && Date.now() - new Date(s.forward_code_at).getTime() < 3 * 3600_000 ? String(s.forward_code) : null } : null;
  app.get("/api/finance/inbound", async (c) => json(c, { success: true, importReady: Number((await d.db.query("select coalesce(max(staged),0)::int n from finance.gmail_import where user_id=$1 and status='ready'", [uid(c)])).rows[0]?.n ?? 0), configured: Boolean(mailDomain), filter: `from:(${ISSUERS.flatMap((i) => i.domains).join(" OR ")})`, source: sourceView(await getSource(d.db, uid(c))), review: await reviewCount(d.db, uid(c)) }));
  app.post("/api/finance/inbound/source", async (c) => {
    if (!mailDomain) return json(c, { success: false, error: "NOT_CONFIGURED" }, 503);
    const body = await c.req.json().catch(() => ({})) as { rotate?: unknown };
    const made = await ensureSource(d.db, uid(c), body.rotate === true);
    await d.db.query("update finance.inbound_sources set forwarding=true where user_id=$1", [uid(c)]);
    return json(c, { success: true, source: sourceView({ ...made, forwarding: true }) });
  });
  app.delete("/api/finance/inbound/source", async (c) => { await removeSource(d.db, uid(c), c.req.query("wipe") === "1"); return json(c, { success: true }); });
  app.get("/api/finance/inbound/review", async (c) => json(c, { success: true, items: await reviewList(d.db, uid(c)) }));
  app.post("/api/finance/inbound/:id/approve", async (c) => {
    const edits = await c.req.json().catch(() => ({}));
    const out = await approve(d.db, uid(c), c.req.param("id"), edits && typeof edits === "object" ? edits : {});
    return out ? json(c, { success: true, ...out }) : json(c, { success: false, error: "NOT_FOUND" }, 404);
  });
  app.post("/api/finance/inbound/:id/reject", async (c) => (await reject(d.db, uid(c), c.req.param("id"))) ? json(c, { success: true }) : json(c, { success: false, error: "NOT_FOUND" }, 404));
  app.get("/api/finance/inbound/:id/origin", async (c) => { const o = await originOf(d.db, uid(c), c.req.param("id")); return o ? json(c, { success: true, origin: o }) : json(c, { success: false, error: "NOT_FOUND" }, 404); });
  return app;
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: url, max: 5, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } });
  const app = createApp({ db: poolTx(pool), resolve: authServerResolver(), dir: process.env.RECEIPTS_DIR || "/var/lib/djiwapay-api/receipts", aiKey: process.env.HELIPOD_AI_KEY, google: googleConfig(), mailDomain: process.env.MAIL_DOMAIN || undefined });
  const port = Number(process.env.PORT || 3011);
  Bun.serve({ port, hostname: "127.0.0.1", fetch: app.fetch, maxRequestBodySize: 8 * 1024 * 1024 });
  console.log(`djiwapay-api listening on 127.0.0.1:${port}`);
}
