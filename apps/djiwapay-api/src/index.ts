import { randomUUID } from "node:crypto";
import { rereadMail } from "./mail/reread.js";
import { makeLlm } from "./mail/llm.js";
import { Hono } from "hono";
import { Pool } from "pg";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { authServerEmailResolver, authServerResolver, type Resolver } from "./auth.js";
import { registerAdminRoutes, registerTrackRoute, seedAdmins, type AuthDb } from "./admin.js";
import { applySync, loadState, type Tx } from "./sync.js";
import { poolTx } from "./db.js";
import { registerAssetRoutes } from "./assets.js";
import { registerStockRoutes } from "./stocks/service.js";
import { registerRateRoutes } from "./rates/service.js";
import { makeCategorizer, registerCategorizeRoutes } from "./categorize.js";
import { registerNewsRoutes } from "./news.js";
import { registerPushRoutes } from "./push.js";
import { registerDiscoveryRoutes } from "./discoveries.js";
export { poolTx };
import { attachReceipt, confirmReceipt, getReceipt, ReceiptProblem } from "./receipt-records.js";
import { isEmptyRead, locateReceiptText, readReceipt, type ReceiptRead } from "./receipt.js";
import { disconnect as googleDisconnect, FEATURES, SCOPES, finishConnect, googleConfig, startConnect, status as googleStatus, syncCalendar, type Feature, type Fetch, type GoogleCfg } from "./google.js";
import { confirmDriveRemovals, confirmSheetDeletes, requestSheet, touchDrive } from "./google-sync.js";
import { ISSUERS } from "./mail/extract.js";
import { ensureHook, getHook, hookConfig, hookScript, HOOK_MAX_BYTES, receiveHook, removeHook, SCRIPT_VERSION, type HookDeps } from "./hook.js";
import { broadQuery } from "./mail/generic.js";
import { disableGmail, enableGmail, pollSoon } from "./gmail.js";
import { cancelImport, commitImport, createImport, importCheckItems, importState, undoImport } from "./gmail-import.js";
import { approveGroup, rejectGroup, reviewGroups, approve, ensureSource, getSource, originOf, reject, removeSource, reviewCount, reviewList } from "./mail/pipeline.js";

const DAILY_SCAN_LIMIT = Number(process.env.SCAN_DAILY_LIMIT || 30);
const MAX_IMAGE_BYTES = 3_500_000;

export type Deps = { db: Tx; resolve: Resolver; authDb?: AuthDb | null; resolveEmail?: (cookie: string) => Promise<string | null>; dir: string; aiKey?: string; read?: (dataUrl: string) => Promise<ReceiptRead>; google?: GoogleCfg | null; gfetch?: Fetch; mailDomain?: string; hook?: HookDeps; publicUrl?: string };

export function createApp(d: Deps) {
  const app = new Hono();
  const json = (c: any, body: unknown, status = 200) => c.body(JSON.stringify(body), status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  app.get("/api/finance/health", (c) => json(c, { ok: true }));
  app.use("/api/finance/*", async (c, next) => {
    if (c.req.path === "/api/finance/health" || c.req.path === "/api/finance/google/callback" || c.req.path.startsWith("/api/finance/assets/ref/") || c.req.path.startsWith("/api/finance/hook/") || c.req.path === "/api/finance/track") return next();
    const userId = await d.resolve(c.req.header("cookie") || "");
    if (!userId) return json(c, { success: false, error: "UNAUTHORIZED" }, 401);
    c.set("userId" as never, userId as never);
    return next();
  });
  const uid = (c: any) => c.get("userId") as string;
  registerTrackRoute(app, { db: d.db, userOf: d.resolve });
  registerAdminRoutes(app, { db: d.db, authDb: d.authDb ?? null, emailOf: d.resolveEmail ?? (async () => null) }, json);
  registerAssetRoutes(app, { db: d.db, dir: d.dir, aiKey: d.aiKey }, uid, json);
  registerNewsRoutes(app, json);
  registerPushRoutes(app, { db: d.db }, uid, json);
  registerDiscoveryRoutes(app, { db: d.db }, uid, json);
  const google = d.google ?? null, mailDomain = d.mailDomain ?? "";
  // Keep Google in step with what the user just changed, without ever slowing or failing the request.

  /** Granted by Google AND not switched off on the Integrasi page. `key` is the switch (calendar, sheets, receipts) when it differs from the scope's feature. */
  const connected = async (userId: string, feature: Feature, key: string = feature) => {
    if (!google) return false;
    const r = await d.db.query("select granted_scopes, off_features from finance.google_connections where user_id=$1 and refresh_enc is not null", [userId]);
    return Boolean(r.rows[0]) && (r.rows[0].granted_scopes as string[]).includes(SCOPES[feature]) && !((r.rows[0].off_features as string[] | null) ?? []).includes(key);
  };
  const later = (fn: () => Promise<unknown>) => void fn().catch((e) => console.error("background sync", e instanceof Error ? e.message : e));
  registerStockRoutes(app, { db: d.db }, uid, json, { driveConnected: (userId) => connected(userId, "drive") });
  registerRateRoutes(app, { db: d.db }, json);
  registerCategorizeRoutes(app, { db: d.db, key: process.env.HELIPOD_AI_KEY, limit: process.env.CATEGORIZE_DAILY_LIMIT ? Number(process.env.CATEGORIZE_DAILY_LIMIT) : undefined }, uid, json);

  app.get("/api/finance/state", async (c) => {
    const state = await d.db.tx(async (q) => {
      await q.query("set transaction isolation level repeatable read read only");
      return loadState(q, uid(c));
    });
    return json(c, { success: true, ...state });
  });

  app.post("/api/finance/sync", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return json(c, { success: false, error: "BAD_REQUEST" }, 400);
    try {
      const out = await applySync(d.db, uid(c), body);
      const touchedBills = Boolean((body as any).upserts?.bills?.length || (body as any).deletes?.bills?.length);
      if (touchedBills && google) later(async () => { if (await connected(uid(c), "calendar")) await syncCalendar(d.db, google, uid(c), d.gfetch); });
      return json(c, { success: true, ...out });
    }
    catch (e) {
      if (e instanceof Error && ["RECEIPT_CONFIRMATION_REQUIRED", "LOAN_CHANGED_BY_EMAIL"].includes(e.message)) return json(c, { success: false, error: e.message }, 409);
      console.error("sync failed", e instanceof Error ? e.message : e); return json(c, { success: false, error: "SYNC_FAILED" }, 500);
    }
  });

  const analyzeImage = async (userId: string, image: string) => {
    const reader = d.read ?? (d.aiKey ? (u: string) => readReceipt(u, { key: d.aiKey! }) : null);
    if (!reader) return { error: "SCAN_UNAVAILABLE", status: 503 } as const;
    const used = await d.db.query("insert into finance.scan_usage(user_id,scans) values($1,1) on conflict(user_id,day) do update set scans=finance.scan_usage.scans+1 returning scans", [userId]);
    if (Number(used.rows[0].scans) > DAILY_SCAN_LIMIT) return { error: "DAILY_LIMIT", status: 429 } as const;
    let read: ReceiptRead;
    try { read = await reader(image); } catch (e) {
      await d.db.query("update finance.scan_usage set scans=greatest(scans-1,0) where user_id=$1 and day=current_date", [userId]);
      console.error("scan failed", e instanceof Error ? e.message : e);
      return { error: "SCAN_FAILED", status: 502 } as const;
    }
    if (isEmptyRead(read)) {
      await d.db.query("update finance.scan_usage set scans=greatest(scans-1,0) where user_id=$1 and day=current_date", [userId]);
      return { error: "NOT_A_RECEIPT", status: 422 } as const;
    }
    return { read } as const;
  };

  app.post("/api/finance/receipts/scan", async (c) => {
    const body = await c.req.json().catch(() => null) as { image?: unknown; id?: unknown } | null;
    const image = typeof body?.image === "string" ? body.image : "";
    const m = image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return json(c, { success: false, error: "BAD_IMAGE" }, 400);
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length > MAX_IMAGE_BYTES) return json(c, { success: false, error: "IMAGE_TOO_LARGE" }, 413);
    const userId = uid(c);
    const [analysis, boxes] = await Promise.all([analyzeImage(userId, image), d.aiKey && !d.read ? locateReceiptText(image, { key: d.aiKey }) : Promise.resolve({})]);
    if ("error" in analysis) return json(c, { success: false, error: analysis.error }, analysis.status);
    const read = analysis.read;
    // Server-generated IDs make scan documents/images immutable across retries.
    const id = randomUUID();
    const rel = join(userId.replace(/[^\w-]/g, "_"), `${id}.${m[1] === "jpeg" ? "jpg" : m[1]}`);
    await mkdir(join(d.dir, rel, ".."), { recursive: true });
    await writeFile(join(d.dir, rel), bytes);
    await d.db.query(`insert into finance.receipts(user_id,id,merchant,purchased_at,total,tax,confidence,items,model,image_path,image_bytes,details) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12::jsonb)
`,
      [userId, id, read.merchant, read.purchasedAt, read.total, read.tax, read.confidence, JSON.stringify(read.items), read.model, rel, bytes.length, JSON.stringify({ version: 2, original: read })]);
    if (google) later(async () => { if (await connected(userId, "drive", "receipts")) await touchDrive(d.db, userId); });
    return json(c, { success: true, receipt: { id, ...read }, boxes });
  });

  app.get("/api/finance/receipts/:id", async c => {
    try { return json(c, { success: true, receipt: await getReceipt(d.db, uid(c), c.req.param("id")) }); }
    catch (e) { if (e instanceof ReceiptProblem) return json(c, { success: false, error: e.code }, e.status); throw e; }
  });
  app.post("/api/finance/receipts/:id/confirm", async c => {
    try {
      const out = await confirmReceipt(d.db, uid(c), c.req.param("id"), await c.req.json().catch(()=>null));
      return json(c, { success: true, ...out });
    } catch (e) { if (e instanceof ReceiptProblem) return json(c, { success: false, error: e.code }, e.status); console.error("receipt confirmation failed"); return json(c, { success: false, error: "SAVE_FAILED" }, 500); }
  });

  app.post("/api/finance/receipts/:id/attach", async c => {
    try { return json(c, { success: true, ...(await attachReceipt(d.db, uid(c), c.req.param("id"), await c.req.json().catch(()=>null))) }); }
    catch (e) { if (e instanceof ReceiptProblem) return json(c, { success: false, error: e.code }, e.status); console.error("receipt attach failed"); return json(c, { success: false, error: "SAVE_FAILED" }, 500); }
  });

  app.post("/api/finance/receipts/:id/revise", async c => {
    try { return json(c, { success: true, ...(await confirmReceipt(d.db, uid(c), c.req.param("id"), await c.req.json().catch(()=>null), true)) }); }
    catch (e) { if (e instanceof ReceiptProblem) return json(c, { success: false, error: e.code }, e.status); console.error("receipt revision failed"); return json(c, { success: false, error: "SAVE_FAILED" }, 500); }
  });

  app.post("/api/finance/receipts/:id/reread", async c => {
    const userId = uid(c), id = c.req.param("id");
    const found = await d.db.query("select * from finance.receipts where user_id=$1 and id=$2", [userId,id]);
    const row = found.rows[0];
    if (!row?.image_path) return json(c, { success: false, error: "NOT_FOUND" }, 404);
    const bytes = await readFile(join(d.dir,row.image_path)).catch(()=>null);
    if (!bytes) return json(c, { success: false, error: "NOT_FOUND" }, 404);
    const mime = row.image_path.endsWith(".png") ? "png" : row.image_path.endsWith(".webp") ? "webp" : "jpeg";
    const result = await analyzeImage(userId, `data:image/${mime};base64,${bytes.toString("base64")}`);
    if ("error" in result) return json(c, { success: false, error: result.error }, result.status);
    // Read-only until an explicit review/revise; never adjust historical money in OCR.
    return json(c, { success: true, receipt: { id, ...result.read, revision: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null } });
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
    const requested: Feature[] = wanted.length ? [...new Set(wanted)] : ["drive"];
    const features = [...requested];
    // Keep what was granted before: asking for one more feature must not drop the others.
    const prev = await d.db.query("select granted_scopes from finance.google_connections where user_id=$1 and refresh_enc is not null", [uid(c)]);
    const have = (prev.rows[0]?.granted_scopes as string[] | undefined) ?? [];
    for (const f of FEATURES) if (have.includes(SCOPES[f]) && !features.includes(f)) features.push(f);
    return json(c, { success: true, url: await startConnect(d.db, google, uid(c), features, requested) });
  });
  app.get("/api/finance/google/callback", async (c) => {
    const back = (q: string) => c.redirect(`/integrasi?google=${q}`, 302);
    if (!google) return back("unavailable");
    const code = c.req.query("code"), state = c.req.query("state");
    if (c.req.query("error") || !code || !state) return back("denied");
    try {
      const out = await finishConnect(d.db, google, code, state, d.gfetch);
      const setup: Promise<unknown>[] = [];
      if (out.features.gmail && out.requested.includes("gmail")) setup.push(enableGmail(d.db, out.userId));
      if (out.features.drive) setup.push(requestSheet(d.db, out.userId), touchDrive(d.db, out.userId));
      if (out.features.calendar) later(() => syncCalendar(d.db, google, out.userId, d.gfetch));
      const results = await Promise.allSettled(setup);
      if (results.some((result) => result.status === "rejected")) {
        console.error("google connect: integration setup failed");
        return back("setup");
      }
      return back(out.partial ? "partial" : "ok");
    } catch (e) {
      const error = e instanceof Error ? e.message : "";
      if (error === "NO_FEATURE_GRANTED") return back("denied");
      if (error === "ACCOUNT_MISMATCH") return back("account");
      console.error("google connect", error || "failed");
      return back("error");
    }
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
  // Per-service switches. Gmail has its own (/gmail/off, /gmail/poll). Turning on needs the scope Google already granted; otherwise the page goes through consent.
  const SWITCH: Record<string, Feature> = { calendar: "calendar", sheets: "drive", receipts: "drive" };
  app.post("/api/finance/google/feature/:key/off", async (c) => {
    const key = c.req.param("key"); if (!SWITCH[key]) return json(c, { success: false, error: "UNKNOWN_FEATURE" }, 400);
    await d.db.query("update finance.google_connections set off_features = (select coalesce(array_agg(distinct x),'{}') from unnest(off_features || $2::text[]) x), updated_at=now() where user_id=$1", [uid(c), [key]]);
    return json(c, { success: true });
  });
  app.post("/api/finance/google/feature/:key/on", async (c) => {
    const key = c.req.param("key"); const scope = SWITCH[key]; if (!scope) return json(c, { success: false, error: "UNKNOWN_FEATURE" }, 400);
    if (!(await connected(uid(c), scope, "-"))) return json(c, { success: false, error: "NOT_CONNECTED" }, 409);
    await d.db.query("update finance.google_connections set off_features = array_remove(off_features, $2), updated_at=now() where user_id=$1", [uid(c), key]);
    if (google) {
      if (key === "calendar") later(() => syncCalendar(d.db, google, uid(c), d.gfetch));
      else if (key === "sheets") await requestSheet(d.db, uid(c), true);
      else await touchDrive(d.db, uid(c));
    }
    return json(c, { success: true });
  });
  app.post("/api/finance/google/disconnect", async (c) => { await googleDisconnect(d.db, google, uid(c), d.gfetch); return json(c, { success: true }); });
  const need = (c: any) => (!google ? json(c, { success: false, error: "NOT_CONFIGURED" }, 503) : null);
  app.post("/api/finance/google/calendar/sync", async (c) => need(c) ?? json(c, { success: true, ...(await syncCalendar(d.db, google!, uid(c), d.gfetch)) }));
  // Drive and Sheets are handled by the background worker; these only ask it to look now.
  app.post("/api/finance/google/drive/sync", async (c) => need(c) ?? (!(await connected(uid(c), "drive", "receipts")) ? json(c, { success: false, error: "NOT_CONNECTED" }, 409) : (await touchDrive(d.db, uid(c)), json(c, { success: true, queued: true }))));
  app.post("/api/finance/google/sheets/export", async (c) => need(c) ?? (!(await connected(uid(c), "drive", "sheets")) ? json(c, { success: false, error: "NOT_CONNECTED" }, 409) : (await requestSheet(d.db, uid(c), true), json(c, { success: true, queued: true }))));
  app.post("/api/finance/google/sheets/confirm", async (c) => { await confirmSheetDeletes(d.db, uid(c)); return json(c, { success: true }); });
  app.post("/api/finance/google/drive/confirm", async (c) => { await confirmDriveRemovals(d.db, uid(c)); return json(c, { success: true }); });

  /* ---------- Apps Script hook (alternative to Gmail OAuth): public, authenticated by its URL token ---------- */
  const hookBase = (d.publicUrl ?? "https://djiwapay.web.id").replace(/\/$/, "");
  const hookView = (h: any) => h ? { enabled: true, url: `${hookBase}/api/finance/hook/${h.token}`, script: hookScript(`${hookBase}/api/finance/hook/${h.token}`), scriptVersion: Number(h.script_version ?? 1), currentScriptVersion: SCRIPT_VERSION, lastAt: h.last_at ? new Date(h.last_at).toISOString() : null, lastStatus: h.last_status ?? null, lastReason: h.last_reason ?? null, received: Number(h.received) } : { enabled: false };
  const hits = new Map<string, { n: number; t: number }>();
  const hookLimited = (key: string) => { const now = Date.now(), h = hits.get(key); if (!h || now - h.t > 600_000) { hits.set(key, { n: 1, t: now }); return false; } h.n++; return h.n > 400; };
  app.get("/api/finance/hook/:token", async (c) => { const cfg = await hookConfig(d.db, c.req.param("token"), Number(c.req.query("v")) || undefined); return cfg ? json(c, { success: true, ...cfg }) : json(c, { success: false, error: "TOKEN_INVALID" }, 404); });
  app.post("/api/finance/hook/:token", async (c) => {
    if (!d.hook) return json(c, { success: false, error: "NOT_CONFIGURED" }, 503);
    const token = c.req.param("token");
    if (hookLimited(token)) return json(c, { success: false, error: "RATE_LIMITED" }, 429);
    const len = Number(c.req.header("content-length") ?? 0);
    if (len > HOOK_MAX_BYTES) return json(c, { success: false, error: "TOO_LARGE" }, 413);
    const raw = Buffer.from(await c.req.arrayBuffer());
    try { const r = await receiveHook(d.hook, token, raw); return json(c, r.body, r.code); }
    catch (e) { console.error("hook", e instanceof Error ? e.message : e); return json(c, { success: false, error: "TRY_AGAIN" }, 503); }
  });
  app.get("/api/finance/inbound/hook", async (c) => json(c, { success: true, available: Boolean(d.hook), ...hookView(await getHook(d.db, uid(c))) }));
  app.post("/api/finance/inbound/hook", async (c) => {
    if (!d.hook) return json(c, { success: false, error: "NOT_CONFIGURED" }, 503);
    const body = await c.req.json().catch(() => ({})) as { rotate?: unknown };
    return json(c, { success: true, available: true, ...hookView(await ensureHook(d.db, uid(c), body.rotate === true)) });
  });
  app.delete("/api/finance/inbound/hook", async (c) => { await removeHook(d.db, uid(c)); return json(c, { success: true }); });

  /* ---------- Payment e-mail inbox ---------- */
  const sourceView = (s: any) => s && mailDomain ? { forwarding: Boolean(s.forwarding), address: `${s.token}@${mailDomain}`, enabled: Boolean(s.enabled), mailCount: Number(s.mail_count), lastMailAt: s.last_mail_at ? new Date(s.last_mail_at).toISOString() : null, trusted: Number(s.trusted_count), forwardCode: s.forward_code && s.forward_code_at && Date.now() - new Date(s.forward_code_at).getTime() < 3 * 3600_000 ? String(s.forward_code) : null } : null;
  app.get("/api/finance/inbound", async (c) => json(c, { success: true, importReady: Number((await d.db.query("select coalesce(max(staged),0)::int n from finance.gmail_import where user_id=$1 and status='ready'", [uid(c)])).rows[0]?.n ?? 0), autoRecent: Number((await d.db.query("select count(*)::int n from finance.inbound_messages where user_id=$1 and status='auto' and created_at > greatest(now() - interval '24 hours', $2::timestamptz) and import_id is null", [uid(c), (() => { const t = Date.parse(c.req.query("autoSince") ?? ""); return Number.isFinite(t) ? new Date(t).toISOString() : "1970-01-01T00:00:00Z"; })()])).rows[0]?.n ?? 0), configured: Boolean(mailDomain), broad: ((await d.db.query("select broad from finance.inbound_sources where user_id=$1", [uid(c)])).rows[0]?.broad === true), broadFilter: broadQuery(), filter: `from:(${ISSUERS.flatMap((i) => i.domains).join(" OR ")})`, source: sourceView(await getSource(d.db, uid(c))), review: await reviewCount(d.db, uid(c)) }));
  // Opt in (or out) of recognising money movements from senders that are not on the bank list. Nothing found this way is recorded without a tap.
  app.post("/api/finance/inbound/broad", async (c) => {
    const b = await c.req.json().catch(() => ({})) as { enabled?: unknown };
    await ensureSource(d.db, uid(c));
    await d.db.query("update finance.inbound_sources set broad=$2 where user_id=$1", [uid(c), b.enabled === true]);
    return json(c, { success: true, broad: b.enabled === true });
  });
  app.post("/api/finance/inbound/source", async (c) => {
    if (!mailDomain) return json(c, { success: false, error: "NOT_CONFIGURED" }, 503);
    const body = await c.req.json().catch(() => ({})) as { rotate?: unknown };
    const made = await ensureSource(d.db, uid(c), body.rotate === true);
    await d.db.query("update finance.inbound_sources set forwarding=true where user_id=$1", [uid(c)]);
    return json(c, { success: true, source: sourceView({ ...made, forwarding: true }) });
  });
  app.delete("/api/finance/inbound/source", async (c) => { await removeSource(d.db, uid(c), c.req.query("wipe") === "1"); return json(c, { success: true }); });
  app.get("/api/finance/inbound/review", async (c) => {
    const offset = Number(c.req.query("offset") || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000) return json(c,{success:false,error:"INVALID_OFFSET"},400);
    return json(c,{success:true,items:await reviewList(d.db,uid(c),offset),total:await reviewCount(d.db,uid(c))});
  });
  app.get("/api/finance/inbound/groups", async (c) => json(c, { success: true, ...(await reviewGroups(d.db, uid(c))), total: await reviewCount(d.db, uid(c)) }));
  app.post("/api/finance/inbound/groups/approve", async (c) => {
    const b = await c.req.json().catch(() => null) as { key?: unknown; categoryId?: unknown; accountId?: unknown } | null;
    if (!b || typeof b.key !== "string" || b.key.length > 80 || typeof b.categoryId !== "string" || !/^[\w-]{1,80}$/.test(b.categoryId)) return json(c, { success: false, error: "INVALID_GROUP" }, 400);
    const r = await approveGroup(d.db, uid(c), b.key, { categoryId: b.categoryId, accountId: typeof b.accountId === "string" && /^[\w-]{1,80}$/.test(b.accountId) ? b.accountId : undefined });
    return r ? json(c, { success: true, ...r }) : json(c, { success: false, error: "NOT_FOUND" }, 404);
  });
  app.post("/api/finance/inbound/groups/reject", async (c) => {
    const b = await c.req.json().catch(() => null) as { key?: unknown } | null;
    if (!b || typeof b.key !== "string" || b.key.length > 80) return json(c, { success: false, error: "INVALID_GROUP" }, 400);
    return json(c, { success: true, rejected: await rejectGroup(d.db, uid(c), b.key) });
  });
  app.post("/api/finance/inbound/bulk", async(c)=>{
    const body=await c.req.json().catch(()=>null);
    if(!body || !["approve","reject"].includes(body.action) || !Array.isArray(body.ids) || !body.ids.length || body.ids.length>200 || body.ids.some((id:unknown)=>typeof id!=="string"|| !/^[a-f0-9-]{36}$/i.test(id))) return json(c,{success:false,error:"INVALID_BATCH"},400);
    const results=[];
    for(const id of [...new Set<string>(body.ids)]){try{const ok=body.action==="approve"?await approve(d.db,uid(c),id,{}):await reject(d.db,uid(c),id);results.push({id,ok:Boolean(ok)});}catch{results.push({id,ok:false});}}
    return json(c,{success:true,results});
  });
  app.post("/api/finance/inbound/:id/reread",async(c)=>{
    if(!google)return json(c,{success:false,error:"NOT_CONNECTED"},409);
    try{return json(c,{success:true,details:await rereadMail(d.db,uid(c),c.req.param("id"),google,d.gfetch,d.aiKey?makeLlm({key:d.aiKey}):undefined)});}catch(e){return json(c,{success:false,error:e instanceof Error?e.message:"READ_FAILED"},409);}
  });
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
  const authPool = process.env.AUTH_DATABASE_URL ? new Pool({ connectionString: process.env.AUTH_DATABASE_URL, max: 3 }) : null;
  await seedAdmins(poolTx(pool)).catch((e) => console.error("admin seed failed", e instanceof Error ? e.message : e));
  const app = createApp({ db: poolTx(pool), resolve: authServerResolver(), resolveEmail: authServerEmailResolver(), authDb: authPool ? { query: (t, p) => authPool.query(t, p as any[]) } : null, dir: process.env.RECEIPTS_DIR || "/var/lib/djiwapay-api/receipts", aiKey: process.env.HELIPOD_AI_KEY, google: googleConfig(), mailDomain: process.env.MAIL_DOMAIN || undefined, publicUrl: process.env.PUBLIC_URL || undefined,
    hook: await (async () => { const { toRawMail } = await import("./mail/smtp.js"); const key = process.env.HELIPOD_AI_KEY; const db = poolTx(pool);
      return { db, toMail: toRawMail, pipeline: { db, domain: process.env.MAIL_DOMAIN || "catat.djiwapay.web.id", llm: key ? makeLlm({ key, model: process.env.MAIL_LLM_MODEL }) : undefined, categorize: key ? makeCategorizer({ db, key }) : undefined } }; })() });
  const port = Number(process.env.PORT || 3011);
  Bun.serve({ port, hostname: "127.0.0.1", fetch: app.fetch, maxRequestBodySize: 8 * 1024 * 1024 });
  console.log(`djiwapay-api listening on 127.0.0.1:${port}`);
}
