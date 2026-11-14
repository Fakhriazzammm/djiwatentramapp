import type { Hono } from "hono";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { auth as defaultAuth } from "./auth.js";
import { createGuards, json, text, ROLES } from "./manager-guards.js";
import { loadSnapshot, wibDay } from "./manager-data.js";
import { runDailyPlan } from "./manager-ai.js";

/**
 * Manager/Supervisor operational modules. All reads reuse the same tables and
 * functions as admin/pos/karyawan; writes stay inside the manager-owned tables
 * plus the existing finance/inventory/leave services.
 */
type Auth = typeof defaultAuth;

const EXPENSE_STATUS = new Set(["draft", "saved", "pending_approval", "rejected"]);
const PO_STATUS = new Set(["draft", "sent", "received", "cancelled"]);
const PAYMENT_METHODS = new Set(["cash", "qris", "transfer", "debit", "credit", "ewallet"]);
const CATEGORY_SLUG = /^[a-z0-9_]{1,40}$/;
const rp = (n: number) => Math.round(n);

type Item = { name: string; qty: number; unit: string; price: number; total: number; category: string };

function cleanItems(input: unknown, allowed: Set<string>): Item[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 200).flatMap((raw) => {
    const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const name = text(v.name, 120);
    const qty = Number(v.qty);
    const price = Number(v.price);
    if (!name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) return [];
    const unit = text(v.unit, 20) || "pcs";
    const cat = text(v.category, 40);
    const category = allowed.has(cat) ? cat : "lainnya";
    const total = Number.isFinite(Number(v.total)) ? Number(v.total) : Math.round(qty * price);
    return [{ name, qty, unit, price, total: Math.max(0, total), category }];
  });
}

export function registerManagerModules(app: Hono, auth: Auth, pool: Pool) {
  const { member, owner } = createGuards(auth, pool);

  const setting = async (key: string, fallback: Record<string, unknown>) => {
    const r = await pool.query(`SELECT value FROM public.mgr_settings WHERE key = $1`, [key]);
    return { ...fallback, ...((r.rows[0]?.value ?? {}) as Record<string, unknown>) };
  };
  const categories = async () => {
    const r = await pool.query(`SELECT slug, label, icon FROM public.mgr_expense_categories WHERE active ORDER BY position, slug`);
    return r.rows as { slug: string; label: string; icon: string }[];
  };

  // ---------- dashboard ----------
  app.get("/api/manager/dashboard", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const day = wibDay(0);
    const [snap, tasks, doneToday, expenses] = await Promise.all([
      loadSnapshot(pool),
      pool.query(`SELECT count(*)::int AS n FROM public.mgr_tasks WHERE status = 'open' AND assignee_role = $1`, [m.role]),
      pool.query(`SELECT count(*)::int AS n FROM public.mgr_tasks WHERE status = 'done' AND assignee_role = $1 AND done_at >= $2`, [m.role, new Date(day.start).toISOString()]),
      pool.query(
        `SELECT id, merchant, total::text, status, tx_date FROM public.mgr_expense_drafts
          WHERE ($1 = 'manager' OR created_by = $2) ORDER BY created_at DESC LIMIT 5`,
        [m.role, m.userId],
      ),
    ]);
    return json({
      success: true,
      name: m.name,
      role: m.role,
      snapshot: snap,
      tasks: { open: tasks.rows[0]?.n ?? 0, doneToday: doneToday.rows[0]?.n ?? 0 },
      recentExpenses: expenses.rows,
    });
  });

  app.post("/api/manager/plan/refresh", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const out = await runDailyPlan(pool);
    return json({ success: true, ...out });
  });

  // ---------- finance ----------
  app.get("/api/manager/finance", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    if (m.role !== "manager") return json({ success: false, error: "FORBIDDEN" }, 403);
    const days = Math.min(90, Math.max(1, Number(c.req.query("days") ?? 7) || 7));
    const now = Date.now();
    const start = now - days * 86_400_000;
    const series = Array.from({ length: days }, (_, i) => {
      const d = wibDay(i - days + 1);
      return { key: d.date, start_ms: d.start, end_ms: d.end };
    });
    const [cash, sales, txs, byCategory] = await Promise.all([
      pool.query(`SELECT public.admin_cashflow_summary($1,$2) AS r`, [start, now]),
      pool.query(`SELECT public.admin_sales_summary($1::jsonb) AS r`, [JSON.stringify(series)]),
      pool.query(
        `SELECT source_id, tx_type, amount::text, category, description, merchant, tx_date, payment_method, status
           FROM pos.financial_transactions
          WHERE tx_date >= $1 AND tx_date < $2 AND COALESCE(category,'') <> 'HPP'
          ORDER BY tx_date DESC LIMIT 200`,
        [start, now],
      ),
      pool.query(
        `SELECT COALESCE(NULLIF(category,''),'lainnya') AS category, COALESCE(sum(amount),0)::text AS total
           FROM pos.financial_transactions
          WHERE tx_type = 'expense' AND tx_date >= $1 AND tx_date < $2 AND COALESCE(category,'') <> 'HPP'
          GROUP BY 1 ORDER BY sum(amount) DESC`,
        [start, now],
      ),
    ]);
    const c0 = (cash.rows[0]?.r ?? { income: 0, expense: 0, net: 0 }) as Record<string, number>;
    return json({
      success: true,
      days,
      cash: { income: Number(c0.income ?? 0), expense: Number(c0.expense ?? 0), net: Number(c0.net ?? 0) },
      sales: (sales.rows[0]?.r ?? []) as { key: string; orders: number; revenue: number }[],
      transactions: txs.rows,
      byCategory: byCategory.rows.map((r) => ({ category: r.category as string, total: Number(r.total) })),
    });
  });

  // ---------- expenses (shared with the Telegram bot tables) ----------
  app.get("/api/manager/expenses", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const status = text(c.req.query("status"), 20);
    const filter = EXPENSE_STATUS.has(status) ? status : "all";
    const [drafts, cats, policy, format] = await Promise.all([
      pool.query(
        `SELECT id, channel, created_by, created_by_name, status, photo_url, merchant, tx_date, payment_method,
                items, total::text, finance_source_id, decision_note, created_at
           FROM public.mgr_expense_drafts
          WHERE ($1::text = 'all' OR status = $1) AND ($2 = 'manager' OR created_by = $3)
          ORDER BY created_at DESC LIMIT 100`,
        [filter, m.role, m.userId],
      ),
      categories(),
      setting("expense_policy", { approvalAbove: 1_000_000, photoMin: 100_000, dup: true }),
      setting("expense_format", {}),
    ]);
    return json({ success: true, drafts: drafts.rows, categories: cats, policy, format, role: m.role });
  });

  const insertExpense = async (
    row: { merchant: string; txDate: number; paymentMethod: string; items: Item[]; total: number; photoUrl: string | null; note: string },
    actor: { userId: string; name: string },
    draftId?: string,
  ) => {
    const sourceId = `mgr_${randomUUID().replace(/-/g, "")}`;
    const summary = row.items.map((i) => `${i.name} ${i.qty}${i.unit} @${rp(i.price)}`).join(", ").slice(0, 400);
    const category = row.items[0]?.category ?? "lainnya";
    const id = draftId ?? randomUUID();
    const saved = await pool.query(
      `INSERT INTO public.mgr_expense_drafts
         (id, channel, created_by, created_by_name, status, photo_url, merchant, tx_date, payment_method, items, total, finance_source_id)
       VALUES ($1, 'app', $2, $3, 'saved', $4, $5, $6, $7, $8::jsonb, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         status = 'saved', photo_url = EXCLUDED.photo_url, merchant = EXCLUDED.merchant, tx_date = EXCLUDED.tx_date,
         payment_method = EXCLUDED.payment_method, items = EXCLUDED.items, total = EXCLUDED.total,
         finance_source_id = EXCLUDED.finance_source_id, updated_at = now()
       RETURNING *`,
      [id, actor.userId, actor.name, row.photoUrl, row.merchant, new Date(row.txDate).toISOString(), row.paymentMethod, JSON.stringify(row.items), row.total, sourceId],
    );
    await pool.query(
      `INSERT INTO pos.financial_transactions
         (source_id, tx_type, amount, category, description, merchant, tx_date, payment_method, status, creation_time, raw)
       VALUES ($1, 'expense', $2, $3, $4, $5, $6, $7, 'completed', $8, $9::jsonb)`,
      [
        sourceId,
        row.total,
        category,
        `Pengeluaran ${row.merchant}${summary ? ` · ${summary}` : ""}${row.note ? ` · ${row.note}` : ""}`.slice(0, 500),
        row.merchant,
        row.txDate,
        row.paymentMethod,
        Date.now(),
        JSON.stringify({ kind: "manager_expense", draftId: id, items: row.items, createdBy: actor.userId, note: row.note }),
      ],
    );
    return saved.rows[0];
  };

  app.post("/api/manager/expenses", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const cats = await categories();
    const allowed = new Set(cats.map((x) => x.slug));
    const items = cleanItems(b.items, allowed);
    const merchant = text(b.merchant, 120);
    const txDate = typeof b.txDate === "string" ? Date.parse(b.txDate) : NaN;
    if (!merchant) return json({ success: false, error: "MERCHANT_REQUIRED" }, 400);
    if (!Number.isFinite(txDate)) return json({ success: false, error: "DATE_REQUIRED" }, 400);
    const sum = items.reduce((n, i) => n + i.total, 0);
    const total = Math.round(Number(b.total) > 0 ? Number(b.total) : sum);
    if (!(total > 0)) return json({ success: false, error: "TOTAL_REQUIRED" }, 400);
    const paymentMethod = PAYMENT_METHODS.has(text(b.paymentMethod, 20)) ? text(b.paymentMethod, 20) : "cash";
    const photoUrl = /^(\/api\/manager\/uploads\/|https?:\/\/)/.test(text(b.photoUrl, 2000)) ? text(b.photoUrl, 2000) : null;
    const policy = await setting("expense_policy", { approvalAbove: 1_000_000 });
    const needsApproval = m.role === "supervisor" && total >= Number(policy.approvalAbove ?? 1_000_000);
    const row = {
      merchant,
      txDate,
      paymentMethod,
      items: items.length ? items : [{ name: merchant, qty: 1, unit: "pcs", price: total, total, category: allowed.has(text(b.category, 40)) ? text(b.category, 40) : "lainnya" }],
      total,
      photoUrl,
      note: text(b.note, 300),
    };
    if (needsApproval) {
      const id = randomUUID();
      const inserted = await pool.query(
        `INSERT INTO public.mgr_expense_drafts
           (id, channel, created_by, created_by_name, status, photo_url, merchant, tx_date, payment_method, items, total)
         VALUES ($1,'app',$2,$3,'pending_approval',$4,$5,$6,$7,$8::jsonb,$9) RETURNING *`,
        [id, m.userId, m.name, row.photoUrl, row.merchant, new Date(row.txDate).toISOString(), row.paymentMethod, JSON.stringify(row.items), row.total],
      );
      return json({ success: true, pendingApproval: true, draft: inserted.rows[0] }, 202);
    }
    const draft = await insertExpense(row, m);
    return json({ success: true, pendingApproval: false, draft }, 201);
  });

  app.patch("/api/manager/expenses/:id", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    if (m.role !== "manager") return json({ success: false, error: "FORBIDDEN" }, 403);
    const b = (await c.req.json().catch(() => ({}))) as { decision?: unknown; note?: unknown };
    const decision = text(b.decision, 10);
    if (!["approve", "reject"].includes(decision)) return json({ success: false, error: "DECISION_INVALID" }, 400);
    const cur = await pool.query(
      `SELECT * FROM public.mgr_expense_drafts WHERE id = $1 AND status = 'pending_approval'`,
      [c.req.param("id")],
    );
    const d = cur.rows[0];
    if (!d) return json({ success: false, error: "NOT_FOUND" }, 404);
    if (decision === "reject") {
      const r = await pool.query(
        `UPDATE public.mgr_expense_drafts SET status = 'rejected', decision_note = NULLIF($1,''), decided_by = $2, updated_at = now()
          WHERE id = $3 RETURNING *`,
        [text(b.note, 300), m.userId, d.id],
      );
      return json({ success: true, draft: r.rows[0] });
    }
    const items = (d.items ?? []) as Item[];
    const total = Number(d.total ?? 0);
    const saved = await insertExpense(
      {
        merchant: String(d.merchant ?? ""),
        txDate: new Date(d.tx_date).getTime(),
        paymentMethod: String(d.payment_method ?? "cash"),
        items,
        total,
        photoUrl: (d.photo_url as string) ?? null,
        note: text(b.note, 300),
      },
      m,
      d.id,
    );
    await pool.query(`UPDATE public.mgr_expense_drafts SET decision_note = NULLIF($1,''), decided_by = $2 WHERE id = $3`, [text(b.note, 300), m.userId, d.id]);
    return json({ success: true, draft: saved });
  });

  // ---------- receipt OCR (same gateway/model as the daily plan) ----------
  const uploadRoot = () => process.env.MANAGER_UPLOAD_DIR || join(process.cwd(), ".runtime", "manager-uploads");

  app.post("/api/manager/expenses/scan", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const b = (await c.req.json().catch(() => ({}))) as { image?: unknown; hint?: unknown };
    const dataUrl = text(b.image, 12_000_000);
    const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) return json({ success: false, error: "IMAGE_REQUIRED" }, 400);
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length < 1024) return json({ success: false, error: "IMAGE_TOO_SMALL" }, 400);
    if (bytes.length > 8 * 1024 * 1024) return json({ success: false, error: "IMAGE_TOO_LARGE" }, 413);
    const filename = `${randomUUID()}.${ext}`;
    const root = uploadRoot();
    await mkdir(root, { recursive: true, mode: 0o750 });
    await writeFile(join(root, filename), bytes, { mode: 0o640 });
    const imageUrl = `/api/manager/uploads/${filename}`;

    const key = process.env.HELIPOD_AI_KEY?.trim();
    if (!key) return json({ success: false, error: "AI_UNAVAILABLE", imageUrl }, 503);
    const cats = await categories();
    const base = (process.env.HELIPOD_AI_BASE_URL?.trim() || "https://ai.helipod.io/v1").replace(/\/$/, "");
    const prompt = [
      "Baca foto struk/nota belanja toko kafe ini. Balas HANYA JSON dengan bentuk:",
      '{"merchant":"","date":"YYYY-MM-DD","paymentMethod":"cash|qris|transfer|debit|credit","total":0,"items":[{"name":"","qty":1,"unit":"pcs","price":0,"category":"slug"}]}',
      "Aturan: harga adalah harga satuan; total = jumlah qty*price (tanpa pembulatan aneh). Bila tanggal tidak terbaca pakai hari ini.",
      "Pilih category hanya dari slug berikut:",
      cats.map((x) => `${x.slug} (${x.label})`).join(", "),
      "Bila ragu memakai 'lainnya'. Jangan menambah penjelasan di luar JSON.",
      text(b.hint, 200) ? `Catatan petugas: ${text(b.hint, 200)}` : "",
    ].filter(Boolean).join("\n");
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: process.env.HELIPOD_VISION_MODEL?.trim() || "qwen3.7-flash",
          temperature: 0.1,
          messages: [{ role: "user", content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ] }],
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) return json({ success: false, error: "AI_FAILED", imageUrl }, 502);
      const content = ((await res.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
      const raw = JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1)) as Record<string, unknown>;
      const allowed = new Set(cats.map((x) => x.slug));
      const items = cleanItems(raw.items, allowed);
      const sum = items.reduce((n, i) => n + i.total, 0);
      const total = Math.round(Number(raw.total) > 0 ? Number(raw.total) : sum);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date)) ? `${raw.date}T12:00:00+07:00` : new Date().toISOString();
      const method = PAYMENT_METHODS.has(String(raw.paymentMethod)) ? String(raw.paymentMethod) : "cash";
      return json({
        success: true,
        imageUrl,
        draft: { merchant: text(raw.merchant, 120), date, paymentMethod: method, items, total },
      });
    } catch {
      return json({ success: false, error: "AI_FAILED", imageUrl }, 502);
    }
  });

  app.get("/api/manager/uploads/:file", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const file = c.req.param("file");
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/i.test(file)) return c.text("Not found", 404);
    try {
      const buf = await readFile(join(uploadRoot(), file));
      const type = file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
      return new Response(buf, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" } });
    } catch {
      return c.text("Not found", 404);
    }
  });

  // ---------- stock & opname (same tables as Admin/Karyawan) ----------
  app.get("/api/manager/stock", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const [mode, snap, inv] = await Promise.all([
      pool.query(`SELECT pos.current_inventory_stock_mode() AS m`),
      pool.query(`SELECT public.manual_stock_snapshot() AS r`),
      pool.query(
        `SELECT source_id, ingredient_name, unit, display_unit, base_unit, operational_unit,
                preferred_purchase_unit, unit_conversions, content_to_base_factor::text,
                pack_net_quantity::text, pack_net_unit, last_purchase_price::text,
                category, ingredient_group, low_stock_threshold::text, quantity::text
           FROM pos.inventory ORDER BY ingredient_name`,
      ),
    ]);
    const s = (snap.rows[0]?.r ?? { items: [] }) as { items: Record<string, unknown>[] };
    const byId = new Map(s.items.map((i) => [String(i.inventoryId), i]));
    const items = inv.rows.map((r) => ({
      ...r,
      ...(byId.get(r.source_id as string) ?? { mode: "availability", status: "unknown", quantity: null, unit: r.operational_unit || "pcs" }),
    }));
    return json({ success: true, mode: mode.rows[0]?.m ?? "integrated", items });
  });

  app.post("/api/manager/stock/save", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const inventoryId = text(b.inventoryId, 80);
    const mode = text(b.mode, 20);
    if (!inventoryId || !["availability", "count"].includes(mode)) return json({ success: false, error: "INPUT_INVALID" }, 400);
    const input: Record<string, unknown> = { inventoryId, mode, unit: text(b.unit, 10) || "pcs" };
    if (text(b.note, 500)) input.note = text(b.note, 500);
    if (mode === "count") {
      const q = Number(b.quantity);
      if (!Number.isInteger(q) || q < 0) return json({ success: false, error: "QUANTITY_INVALID" }, 400);
      input.quantity = q;
    } else {
      const status = text(b.status, 20);
      if (!["available", "out", "unknown"].includes(status)) return json({ success: false, error: "STATUS_INVALID" }, 400);
      input.status = status;
    }
    if (b.expectedUpdatedAt === null) input.expectedUpdatedAt = null;
    else if (typeof b.expectedUpdatedAt === "number") input.expectedUpdatedAt = b.expectedUpdatedAt;
    try {
      const r = await pool.query(`SELECT public.manual_stock_save($1::jsonb,$2,$3) AS r`, [JSON.stringify(input), m.userId, m.name]);
      return json({ success: true, item: r.rows[0]?.r });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "STOCK_SAVE_FAILED";
      return json({ success: false, error: "STOCK_SAVE_FAILED", message: msg }, 409);
    }
  });

  app.post("/api/manager/stock/conversion", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = text(b.inventoryId, 80);
    if (!id) return json({ success: false, error: "INVENTORY_REQUIRED" }, 400);
    const factor = b.contentToBaseFactor === null || b.contentToBaseFactor === "" ? null : Number(b.contentToBaseFactor);
    if (factor !== null && (!Number.isFinite(factor) || factor <= 0)) return json({ success: false, error: "FACTOR_INVALID" }, 400);
    const packQty = b.packNetQuantity === null || b.packNetQuantity === "" ? null : Number(b.packNetQuantity);
    try {
      const r = await pool.query(
        `UPDATE pos.inventory SET
           base_unit = COALESCE(NULLIF($2,''), base_unit, unit),
           preferred_purchase_unit = NULLIF($3,''),
           content_to_base_factor = $4,
           pack_net_quantity = $5,
           pack_net_unit = NULLIF($6,'')
         WHERE source_id = $1
         RETURNING source_id, ingredient_name, base_unit, preferred_purchase_unit,
                   content_to_base_factor::text, pack_net_quantity::text, pack_net_unit`,
        [id, text(b.baseUnit, 20), text(b.purchaseUnit, 20), factor, packQty, text(b.packNetUnit, 20)],
      );
      if (!r.rows[0]) return json({ success: false, error: "NOT_FOUND" }, 404);
      return json({ success: true, item: r.rows[0] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "CONVERSION_FAILED";
      return json({ success: false, error: "CONVERSION_FAILED", message: msg }, 409);
    }
  });

  app.get("/api/manager/stock/history", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const id = text(c.req.query("inventoryId"), 80);
    if (!id) return json({ success: false, error: "INVENTORY_REQUIRED" }, 400);
    const r = await pool.query(`SELECT public.manual_stock_history($1) AS r`, [id]);
    return json({ success: true, history: r.rows[0]?.r ?? [] });
  });

  // ---------- team, leave approvals, payroll ----------
  app.get("/api/manager/team", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const day = wibDay(0);
    const q = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      try { return (await pool.query(sql, params)).rows as T[]; } catch { return []; }
    };
    const [att, leaves, periods] = await Promise.all([
      q<{ r: unknown }>(`SELECT public.admin_attendance_today($1,$2) AS r`, [day.start, day.end]),
      q<Record<string, unknown>>(
        `SELECT id, user_id, user_name, leave_type, start_date, end_date, reason, status, review_notes, created_at
           FROM public.attendance_leave_requests
          WHERE status = 'pending' OR created_at >= now() - interval '30 days'
          ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 60`,
      ),
      q<Record<string, unknown>>(
        `SELECT id, period_name, start_date, end_date, status FROM pos.payroll_periods ORDER BY start_date DESC LIMIT 6`,
      ),
    ]);
    const periodId = text(c.req.query("period"), 40) || String(periods[0]?.id ?? "");
    const items = periodId
      ? await q<Record<string, unknown>>(
          `SELECT i.user_id, i.user_name, i.role_name, i.total_shifts, i.total_hours::text, i.gross_pay::text, i.deductions::text, i.net_pay::text,
                  p.period_name, p.status AS period_status
             FROM pos.payroll_run_items i
             JOIN pos.payroll_runs r ON r.id = i.payroll_run_id
             JOIN pos.payroll_periods p ON p.id = r.payroll_period_id
            WHERE r.payroll_period_id = $1::uuid ORDER BY i.user_name`,
          [periodId],
        )
      : [];
    const slips = await q<{ status: string; n: number }>(
      `SELECT status, count(*)::int AS n FROM pos.payslips GROUP BY status`,
    );
    return json({
      success: true,
      attendance: (att[0]?.r ?? { staff: [], total: 0, present: 0 }) as unknown,
      leaves,
      payroll: { periods, periodId, items, slips },
    });
  });

  app.post("/api/manager/team/leaves/:id", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    if (m.role !== "manager") return json({ success: false, error: "FORBIDDEN" }, 403);
    const b = (await c.req.json().catch(() => ({}))) as { status?: unknown; note?: unknown };
    const status = text(b.status, 20);
    if (!["approved", "rejected"].includes(status)) return json({ success: false, error: "STATUS_INVALID" }, 400);
    try {
      const r = await pool.query(`SELECT public.review_attendance_leave_request($1::uuid,$2,$3,$4,$5,$6) AS r`, [
        c.req.param("id"), m.userId, m.name, m.role, status, text(b.note, 2000) || null,
      ]);
      return json({ success: true, request: r.rows[0]?.r });
    } catch (e) {
      return json({ success: false, error: "REVIEW_FAILED", message: e instanceof Error ? e.message : "" }, 409);
    }
  });

  // ---------- purchasing / PO ----------
  app.get("/api/manager/purchase-orders", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    if (m.role !== "supervisor" && m.role !== "manager") return json({ success: false, error: "FORBIDDEN" }, 403);
    const r = await pool.query(`SELECT *, total::text FROM public.mgr_purchase_orders ORDER BY created_at DESC LIMIT 100`);
    return json({ success: true, orders: r.rows });
  });

  app.post("/api/manager/purchase-orders", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const supplier = text(b.supplierName, 160);
    const rawItems = Array.isArray(b.items) ? b.items.slice(0, 200) : [];
    const items = rawItems.flatMap((x) => {
      const v = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
      const name = text(v.name, 120);
      const qty = Number(v.qty);
      const price = Number(v.price);
      if (!name || !Number.isFinite(qty) || qty <= 0) return [];
      const unit = text(v.unit, 20) || "pcs";
      return [{ name, qty, unit, price: Number.isFinite(price) ? price : 0, total: Math.round(qty * (Number.isFinite(price) ? price : 0)) }];
    });
    if (!supplier || items.length === 0) return json({ success: false, error: "SUPPLIER_ITEMS_REQUIRED" }, 400);
    const total = items.reduce((n, i) => n + i.total, 0);
    const number = `PO-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
    const r = await pool.query(
      `INSERT INTO public.mgr_purchase_orders (number, supplier_name, items, total, status, note, created_by, created_by_name)
       VALUES ($1,$2,$3::jsonb,$4,'draft',NULLIF($5,''),$6,$7) RETURNING *, total::text`,
      [number, supplier, JSON.stringify(items), total, text(b.note, 600), m.userId, m.name],
    );
    return json({ success: true, order: r.rows[0] }, 201);
  });

  app.patch("/api/manager/purchase-orders/:id", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const b = (await c.req.json().catch(() => ({}))) as { status?: unknown };
    const status = text(b.status, 20);
    if (!PO_STATUS.has(status)) return json({ success: false, error: "STATUS_INVALID" }, 400);
    const r = await pool.query(
      `UPDATE public.mgr_purchase_orders SET status = $1, updated_at = now() WHERE id = $2 RETURNING *, total::text`,
      [status, c.req.param("id")],
    );
    if (!r.rows[0]) return json({ success: false, error: "NOT_FOUND" }, 404);
    return json({ success: true, order: r.rows[0] });
  });

  // ---------- documents ----------
  app.get("/api/manager/documents/:slug", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const r = await pool.query(
      `SELECT slug, position, category, title, body, updated_at FROM public.mgr_documents
        WHERE slug = $1 AND $2 = ANY (roles)`,
      [c.req.param("slug"), m.role],
    );
    if (!r.rows[0]) return json({ success: false, error: "NOT_FOUND" }, 404);
    return json({ success: true, document: r.rows[0] });
  });

  // ---------- settings (defaults from the plan document) ----------
  app.get("/api/manager/settings", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const r = await pool.query(`SELECT key, value, updated_at FROM public.mgr_settings ORDER BY key`);
    return json({ success: true, settings: r.rows });
  });

  app.put("/api/manager/settings/:key", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const key = text(c.req.param("key"), 40);
    const managerKeys = new Set(["expense_policy", "opname_policy", "payroll_policy"]);
    if (!managerKeys.has(key)) return json({ success: false, error: "FORBIDDEN" }, 403);
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    if (!b.value || typeof b.value !== "object") return json({ success: false, error: "VALUE_REQUIRED" }, 400);
    if (JSON.stringify(b.value).length > 5000) return json({ success: false, error: "TOO_LARGE" }, 413);
    const r = await pool.query(
      `INSERT INTO public.mgr_settings (key, value, updated_by) VALUES ($1,$2::jsonb,$3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING key, value, updated_at`,
      [key, JSON.stringify(b.value), m.userId],
    );
    return json({ success: true, setting: r.rows[0] });
  });

  // ---------- owner overview ----------
  app.get("/api/admin-manager/overview", async (c) => {
    const o = await owner(c);
    if ("res" in o) return o.res;
    const [snap, pending, expenses, orders, settings] = await Promise.all([
      loadSnapshot(pool),
      pool.query(`SELECT count(*)::int AS n FROM public.mgr_memberships WHERE status = 'pending'`),
      pool.query(
        `SELECT COALESCE(sum(total),0)::text AS total, count(*)::int AS n FROM public.mgr_expense_drafts
          WHERE status IN ('saved','pending_approval') AND created_at >= date_trunc('month', now())`,
      ),
      pool.query(`SELECT count(*)::int AS n FROM public.mgr_purchase_orders WHERE status IN ('draft','sent')`),
      pool.query(`SELECT key, value FROM public.mgr_settings ORDER BY key`),
    ]);
    return json({
      success: true,
      snapshot: snap,
      pendingMemberships: pending.rows[0]?.n ?? 0,
      expensesThisMonth: { total: Number(expenses.rows[0]?.total ?? 0), count: expenses.rows[0]?.n ?? 0 },
      openPurchaseOrders: orders.rows[0]?.n ?? 0,
      settings: settings.rows,
    });
  });

  // Owner may edit any setting, including AI and stock policy.
  app.put("/api/admin-manager/settings/:key", async (c) => {
    const o = await owner(c);
    if ("res" in o) return o.res;
    const key = text(c.req.param("key"), 40);
    if (!/^[a-z0-9_]{1,40}$/.test(key)) return json({ success: false, error: "KEY_INVALID" }, 400);
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const value = b.value && typeof b.value === "object" ? b.value : null;
    if (!value) return json({ success: false, error: "VALUE_REQUIRED" }, 400);
    if (JSON.stringify(value).length > 20_000) return json({ success: false, error: "TOO_LARGE" }, 413);
    const r = await pool.query(
      `INSERT INTO public.mgr_settings (key, value, updated_by) VALUES ($1,$2::jsonb,$3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING key, value, updated_at`,
      [key, JSON.stringify(value), o.userId],
    );
    return json({ success: true, setting: r.rows[0] });
  });

  // Roles are exported for the app's own gating (kept in sync with guards).
  void ROLES;
  void CATEGORY_SLUG;
}
