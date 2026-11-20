import type { Hono } from "hono";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import type { auth as defaultAuth } from "./auth.js";
import { createGuards, json, text } from "./manager-guards.js";

/**
 * Data untuk halaman Karyawan App di Manager (Ringkasan, Data, Kehadiran, Jadwal, Dokumen, Laporan).
 * Hanya Manager. Semua pembacaan memakai tabel/fungsi yang sama dengan Admin; penulisan jadwal
 * memakai pos.attendance_schedules (tabel yang sama dengan Jadwal Admin dan app Karyawan).
 */
type Auth = typeof defaultAuth;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const STATUSES = new Set(["scheduled", "confirmed", "off"]);
const MAX_RANGE_MS = 800 * 86_400_000;

const DIRECTORY_SQL = `
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    '_id', u.source_id, 'name', u.name, 'username', u.username, 'initial', upper(left(u.name, 1)),
    'slug', coalesce(nullif(u.slug, ''), split_part(u.username, '@', 1)),
    'photoUrl', coalesce(u.photo_url, a.photo_url), 'roleId', u.role_source_id, 'roleName', trim(r.name), 'isActive', u.is_active,
    'raw', jsonb_build_object(
      'phone', coalesce(nullif(btrim(u.raw->>'phone'), ''), nullif(btrim(a.phone), '')),
      'identityNumber', coalesce(nullif(u.raw->>'identityNumber', ''), a.identity_number),
      'birthDate', coalesce(nullif(u.raw->>'birthDate', ''), a.birth_date::text),
      'address', coalesce(nullif(u.raw->>'address', ''), a.address),
      'startDate', coalesce(nullif(u.raw->>'startDate', ''), a.employment->>'startDate'),
      'employmentType', coalesce(nullif(u.raw->>'employmentType', ''), a.employment->>'employmentType'),
      'contractDuration', coalesce(nullif(u.raw->'contractDuration', 'null'::jsonb), a.employment->'contractDuration'),
      'contractEndDate', coalesce(nullif(u.raw->>'contractEndDate', ''), a.employment->>'contractEndDate'),
      'jabatan', coalesce(nullif(u.raw->>'jabatan', ''), a.employment->>'jabatan'),
      'monthlySalary', coalesce(nullif(u.raw->'monthlySalary', 'null'::jsonb), a.employment->'monthlySalary'),
      'location', coalesce(nullif(u.raw->>'location', ''), a.employment->>'location'),
      'emergencyContactName', coalesce(nullif(u.raw->>'emergencyContactName', ''), a.emergency_contact->>'name'),
      'emergencyContactPhone', coalesce(nullif(u.raw->>'emergencyContactPhone', ''), a.emergency_contact->>'phone'),
      'cvUrl', coalesce(nullif(u.raw->>'cvUrl', ''), a.cv_url),
      'contracts', c.documents
    )
  ) ORDER BY u.name, u.source_id), '[]'::jsonb) AS rows
  FROM public.yumi_users u
  LEFT JOIN public.yumi_roles r ON r.source_id = u.role_source_id
  LEFT JOIN LATERAL (
    SELECT application.* FROM public.employee_onboarding_applications application
    WHERE application.approved_user_source_id = u.source_id AND application.status = 'approved'
    ORDER BY application.reviewed_at DESC NULLS LAST, application.created_at DESC, application.id LIMIT 1
  ) a ON true
  LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', application.id, 'registrationNumber', application.registration_number,
      'status', coalesce(nullif(application.raw->>'contractStatus', ''), application.contract_status),
      'pdfUrl', application.contract_pdf_url
    ) ORDER BY application.created_at DESC, application.id), '[]'::jsonb) AS documents
    FROM public.employee_onboarding_applications application
    WHERE application.approved_user_source_id = u.source_id AND application.status = 'approved'
  ) c ON true`;

export function registerManagerKaryawan(app: Hono, auth: Auth, pool: Pool) {
  const { member } = createGuards(auth, pool);
  const guard = async (c: Parameters<typeof member>[0]) => {
    const m = await member(c);
    if ("res" in m) return m;
    if (m.role !== "manager") return { res: json({ success: false, error: "FORBIDDEN" }, 403) } as const;
    return m;
  };

  app.get("/api/manager/karyawan/directory", async (c) => {
    const m = await guard(c);
    if ("res" in m) return m.res;
    const r = await pool.query(DIRECTORY_SQL);
    return json({ success: true, rows: r.rows[0]?.rows ?? [] });
  });

  // Aktif/nonaktif karyawan. Nonaktif = tidak muncul di Jadwal dan pemilih shift.
  app.post("/api/manager/karyawan/directory/status", async (c) => {
    const m = await guard(c);
    if ("res" in m) return m.res;
    const b = (await c.req.json().catch(() => ({}))) as { userId?: unknown; isActive?: unknown };
    const userId = text(b.userId, 120);
    if (!userId || typeof b.isActive !== "boolean") return json({ success: false, error: "INVALID" }, 400);
    const target = await pool.query(
      `SELECT u.source_id, lower(btrim(coalesce(r.name, ''))) AS role_name
         FROM public.yumi_users u
         LEFT JOIN public.yumi_roles r ON r.source_id = u.role_source_id
        WHERE u.source_id = $1`,
      [userId],
    );
    const row = target.rows[0];
    if (!row) return json({ success: false, error: "NOT_FOUND" }, 404);
    if (["admin", "administrator", "owner", "superadmin", "super admin"].includes(String(row.role_name))) {
      return json({ success: false, error: "PROTECTED_ROLE" }, 403);
    }
    await pool.query(
      `UPDATE public.yumi_users
          SET is_active = $2,
              raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
                'statusChangedAt', now(),
                'statusChangedBy', $3
              )
        WHERE source_id = $1`,
      [userId, b.isActive, `manager:${m.userId}`],
    );
    return json({ success: true, userId, isActive: b.isActive });
  });

  app.get("/api/manager/karyawan/attendance", async (c) => {
    const m = await guard(c);
    if ("res" in m) return m.res;
    const start = Number(c.req.query("start"));
    const end = Number(c.req.query("end"));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > MAX_RANGE_MS) return json({ success: false, error: "RANGE_INVALID" }, 400);
    const day = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);
    const [logs, scheds, site] = await Promise.all([
      pool.query(
        `SELECT "userId", type, "timestamp", location, raw->>'penaltyAmount' AS penalty
           FROM public.pos_attendance_logs WHERE "timestamp" >= $1 AND "timestamp" < $2 ORDER BY "timestamp" ASC LIMIT 30000`,
        [Math.max(0, start - 86_400_000), end],
      ),
      pool.query(
        `SELECT user_id, date::text AS date, shift_name, start_time::text AS start_time, end_time::text AS end_time, status
           FROM pos.attendance_schedules WHERE date >= $1::date AND date <= $2::date LIMIT 30000`,
        [start <= 0 ? "2020-01-01" : day(start), day(end - 1)],
      ),
      pool.query(`SELECT raw->>'attendanceLat' AS lat, raw->>'attendanceLng' AS lng, raw->>'attendanceRadius' AS radius FROM public.pos_site_settings WHERE raw ? 'attendanceRadius' LIMIT 1`),
    ]);
    const s = site.rows[0];
    return json({
      success: true,
      logs: logs.rows.map((r) => ({
        userId: String(r.userId), type: String(r.type), timestamp: Number(r.timestamp),
        location: r.location && typeof r.location === "object" ? { lat: Number(r.location.lat), lng: Number(r.location.lng) } : null,
        penalty: Number(r.penalty ?? 0) || 0,
      })),
      schedules: scheds.rows.map((r) => ({ userId: String(r.user_id), date: String(r.date), shiftName: String(r.shift_name ?? ""), startTime: r.start_time ?? null, endTime: r.end_time ?? null, status: r.status ?? null })),
      geofence: s && s.lat && s.lng ? { lat: Number(s.lat), lng: Number(s.lng), radius: Number(s.radius ?? 100) } : null,
    });
  });

  app.get("/api/manager/karyawan/schedules", async (c) => {
    const m = await guard(c);
    if ("res" in m) return m.res;
    const from = text(c.req.query("from"), 10);
    const to = text(c.req.query("to"), 10);
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || to < from) return json({ success: false, error: "RANGE_INVALID" }, 400);
    const [rows, staff, site] = await Promise.all([
      pool.query(
        `SELECT source_id AS id, user_id, date::text AS date, shift_name, start_time::text AS start_time, end_time::text AS end_time, status, raw
           FROM pos.attendance_schedules WHERE date BETWEEN $1::date AND $2::date ORDER BY date, user_id LIMIT 5000`,
        [from, to],
      ),
      pool.query(
        `SELECT u.source_id AS id, u.name, trim(coalesce(r.name, '')) AS role_name
           FROM public.yumi_users u LEFT JOIN public.yumi_roles r ON r.source_id = u.role_source_id
          WHERE u.is_active
            AND lower(trim(coalesce(r.name, ''))) NOT IN ('owner', 'admin', 'administrator', 'superadmin', 'super admin', 'manager', 'hrd', 'client_viewer')
            AND NOT (coalesce(r.permissions, '[]'::jsonb) ? 'users:manage')
          ORDER BY u.name`,
      ),
      pool.query(`SELECT raw->'shiftSettings'->'shiftSchedules' AS shifts FROM public.pos_site_settings WHERE raw ? 'shiftSettings' LIMIT 1`),
    ]);
    const shifts = Array.isArray(site.rows[0]?.shifts) ? site.rows[0].shifts : [];
    return json({
      success: true,
      schedules: rows.rows.map((r) => ({ id: r.id, userId: r.user_id, date: r.date, shiftName: r.shift_name, startTime: r.start_time, endTime: r.end_time, status: r.status, raw: r.raw ?? {} })),
      staff: staff.rows.map((r) => ({ id: r.id, name: r.name, roleName: r.role_name })),
      shifts: shifts.map((s: { name?: string; openTime?: string; closeTime?: string }) => ({ name: String(s.name ?? ""), openTime: s.openTime ?? null, closeTime: s.closeTime ?? null })).filter((s: { name: string }) => s.name),
    });
  });

  type CellBody = { userId?: unknown; date?: unknown; shiftName?: unknown; startTime?: unknown; endTime?: unknown; status?: unknown; note?: unknown };
  const cleanRow = (b: CellBody) => {
    const userId = text(b.userId, 120);
    const date = text(b.date, 10);
    const shiftName = text(b.shiftName, 60);
    const status = text(b.status, 20) || "scheduled";
    const start = typeof b.startTime === "string" && TIME_RE.test(b.startTime) ? b.startTime : null;
    const end = typeof b.endTime === "string" && TIME_RE.test(b.endTime) ? b.endTime : null;
    if (!userId || !DATE_RE.test(date) || !shiftName || !STATUSES.has(status)) return null;
    return { userId, date, shiftName, status, start: status === "off" ? null : start, end: status === "off" ? null : end, note: text(b.note, 200) || null };
  };

  app.post("/api/manager/karyawan/schedules/cell", async (c) => {
    const m = await guard(c);
    if ("res" in m) return m.res;
    const row = cleanRow((await c.req.json().catch(() => ({}))) as CellBody);
    if (!row) return json({ success: false, error: "INVALID" }, 400);
    const existing = await pool.query(`SELECT source_id FROM pos.attendance_schedules WHERE user_id = $1 AND date = $2::date ORDER BY created_at LIMIT 1`, [row.userId, row.date]);
    if (existing.rows[0]) {
      await pool.query(
        `UPDATE pos.attendance_schedules SET shift_name = $2, start_time = $3::time, end_time = $4::time, status = $5, updated_at = now() WHERE source_id = $1`,
        [existing.rows[0].source_id, row.shiftName, row.start, row.end, row.status],
      );
    } else {
      await pool.query(
        `INSERT INTO pos.attendance_schedules (source_id, user_id, date, shift_name, start_time, end_time, status, note, raw) VALUES ($1,$2,$3::date,$4,$5::time,$6::time,$7,$8,$9::jsonb)`,
        [randomUUID(), row.userId, row.date, row.shiftName, row.start, row.end, row.status, row.note, JSON.stringify({ source: "manager", by: m.userId })],
      );
    }
    return json({ success: true });
  });

  app.delete("/api/manager/karyawan/schedules/cell", async (c) => {
    const m = await guard(c);
    if ("res" in m) return m.res;
    const userId = text(c.req.query("userId"), 120);
    const date = text(c.req.query("date"), 10);
    if (!userId || !DATE_RE.test(date)) return json({ success: false, error: "INVALID" }, 400);
    await pool.query(`DELETE FROM pos.attendance_schedules WHERE user_id = $1 AND date = $2::date AND NOT (raw ? 'coveredBy' OR raw ? 'coverFor')`, [userId, date]);
    return json({ success: true });
  });

  // Ganti jadwal banyak orang dalam satu rentang (generator otomatis, salin minggu lalu).
  app.post("/api/manager/karyawan/schedules/bulk", async (c) => {
    const m = await guard(c);
    if ("res" in m) return m.res;
    const b = (await c.req.json().catch(() => ({}))) as { rows?: unknown; userIds?: unknown; start?: unknown; end?: unknown };
    const start = text(b.start, 10);
    const end = text(b.end, 10);
    const userIds = Array.isArray(b.userIds) ? b.userIds.map((x) => text(x, 120)).filter(Boolean).slice(0, 200) : [];
    const rows = (Array.isArray(b.rows) ? b.rows.slice(0, 8000) : []).map((x) => cleanRow((x ?? {}) as CellBody));
    if (!DATE_RE.test(start) || !DATE_RE.test(end) || end < start || userIds.length === 0 || rows.some((r) => !r)) return json({ success: false, error: "INVALID" }, 400);
    if ((Date.parse(end) - Date.parse(start)) / 86_400_000 > 190) return json({ success: false, error: "RANGE_TOO_LONG" }, 400);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Baris pengganti shift (izin/sakit) tidak ikut diganti agar penugasan tidak hilang diam-diam.
      const del = await client.query(
        `DELETE FROM pos.attendance_schedules WHERE user_id = ANY($1::text[]) AND date BETWEEN $2::date AND $3::date AND NOT (raw ? 'coveredBy' OR raw ? 'coverFor')`,
        [userIds, start, end],
      );
      for (const r of rows as NonNullable<ReturnType<typeof cleanRow>>[]) {
        if (r.date < start || r.date > end || !userIds.includes(r.userId)) continue;
        const taken = await client.query(`SELECT 1 FROM pos.attendance_schedules WHERE user_id = $1 AND date = $2::date LIMIT 1`, [r.userId, r.date]);
        if (taken.rows[0]) continue;
        await client.query(
          `INSERT INTO pos.attendance_schedules (source_id, user_id, date, shift_name, start_time, end_time, status, note, raw) VALUES ($1,$2,$3::date,$4,$5::time,$6::time,$7,$8,$9::jsonb)`,
          [randomUUID(), r.userId, r.date, r.shiftName, r.start, r.end, r.status, r.note, JSON.stringify({ source: "manager-generator", by: m.userId })],
        );
      }
      await client.query("COMMIT");
      return json({ success: true, inserted: rows.length, deleted: del.rowCount ?? 0 });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      return json({ success: false, error: "BULK_FAILED", message: e instanceof Error ? e.message : "" }, 500);
    } finally {
      client.release();
    }
  });
}
