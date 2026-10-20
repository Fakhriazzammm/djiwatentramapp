const express = require("express");
const cors = require("cors");
const { execSync, spawn } = require("child_process");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3456);
const TABLE = "recruitment_candidates";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");

// ── Supabase config (baca dari .env agent, bukan hardcode) ──
function loadEnv(file) {
  try {
    const txt = fs.readFileSync(file, "utf8");
    const o = {};
    for (const line of txt.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) o[m[1]] = m[2].trim();
    }
    return o;
  } catch { return {}; }
}
const SUP = loadEnv(path.join(__dirname, "..", "..", "yumi-ai-bot", ".env"));
const SUPABASE_URL = SUP.SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SKEY = SUP.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const CV_BUCKET = "recruitment-cv";
const OUTSOURCING_AUTH_FILE = path.join(__dirname, ".outsourcing-auth.json");
const OUTSOURCING_SESSION_SECRET_FILE = path.join(__dirname, ".outsourcing-session-secret");
const HRD_BRIDGE_SECRET_FILE = process.env.REKRUTMEN_AUTH_BRIDGE_SECRET_FILE || "/etc/djiwatentramapp/recruitment-auth-bridge.secret";
function loadHrdBridgeSecret() { try { return process.env.REKRUTMEN_AUTH_BRIDGE_SECRET || fs.readFileSync(HRD_BRIDGE_SECRET_FILE, "utf8").trim(); } catch { return ""; } }
const HRD_BRIDGE_SECRET = loadHrdBridgeSecret();
function loadOutsourcingSessionSecret() {
  const configured = process.env.REKRUTMEN_OUTSOURCING_SESSION_SECRET;
  if (configured) return configured;
  try {
    const existing = fs.readFileSync(OUTSOURCING_SESSION_SECRET_FILE, "utf8").trim();
    if (existing) return existing;
  } catch {}
  const generated = crypto.randomBytes(32).toString("hex");
  try { fs.writeFileSync(OUTSOURCING_SESSION_SECRET_FILE, generated + "\n", { mode: 0o600 }); } catch {}
  return generated;
}
const OUTSOURCING_SESSION_SECRET = loadOutsourcingSessionSecret();

function readOutsourcingAuth() {
  try { return JSON.parse(fs.readFileSync(OUTSOURCING_AUTH_FILE, "utf8")); } catch { return null; }
}

function hashOutsourcingPin(pin, saltB64) {
  return crypto.scryptSync(String(pin), Buffer.from(saltB64, "base64"), 64).toString("base64");
}

function safeEqualText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function signOutsourcingSession(mustChange = false) {
  const payload = Buffer.from(JSON.stringify({ role: "outsourcing_readonly", mustChange, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", OUTSOURCING_SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyHrdBridgeSession(token) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!HRD_BRIDGE_SECRET || !payload || !signature) return null;
    const expected = crypto.createHmac("sha256", HRD_BRIDGE_SECRET).update(payload).digest("base64url");
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return safeEqualText(signature, expected) && data.role === "HRD" && Number(data.exp) > Date.now() ? data : null;
  } catch { return null; }
}

function verifyOutsourcingSession(token) {
  try {
    const [payload, signature] = String(token || "").split(".");
    const expected = crypto.createHmac("sha256", OUTSOURCING_SESSION_SECRET).update(payload).digest("base64url");
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return safeEqualText(signature, expected) && data.role === "outsourcing_readonly" && Number(data.exp) > Date.now() ? data : null;
  } catch { return null; }
}

// pastikan folder uploads ada (fallback)
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// upload buffer ke Supabase Storage (self-host), return public URL
async function uploadToStorage(objectPath, buffer, contentType) {
  const url = `${SUPABASE_URL}/storage/v1/object/${CV_BUCKET}/${encodeURIComponent(objectPath)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SKEY}`,
      apikey: SUPABASE_SKEY,
      "Content-Type": contentType || "application/octet-stream",
    },
    body: buffer,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error("Storage upload failed: " + res.status + " " + err.slice(0, 200));
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${CV_BUCKET}/${encodeURIComponent(objectPath)}`;
}

app.use(cors());
app.use(express.json({ limit: "15mb" }));

app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.post("/api/recruitment-outsourcing/login", (req, res) => {
  const auth = readOutsourcingAuth();
  const pin = String(req.body?.pin ?? "");
  if (!auth?.salt || !auth?.hash || !safeEqualText(hashOutsourcingPin(pin, auth.salt), auth.hash)) {
    return res.status(401).json({ error: "PIN tidak valid" });
  }
  return res.json({ token: signOutsourcingSession(Boolean(auth.mustChange)), mustChange: Boolean(auth.mustChange), readOnly: true });
});
app.post("/api/recruitment-outsourcing/change-pin", (req, res) => {
  const session = verifyOutsourcingSession(req.get("x-rekrutmen-outsourcing-session"));
  const nextPin = String(req.body?.pin ?? "");
  if (!session) return res.status(401).json({ error: "Sesi outsourcing tidak valid" });
  if (!/^\d{6}$/.test(nextPin) || nextPin === "000000") return res.status(400).json({ error: "PIN baru harus 6 digit dan tidak boleh 000000" });
  const salt = crypto.randomBytes(16).toString("base64");
  fs.writeFileSync(OUTSOURCING_AUTH_FILE, JSON.stringify({ salt, hash: hashOutsourcingPin(nextPin, salt), mustChange: false, updatedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  return res.json({ token: signOutsourcingSession(false), mustChange: false, readOnly: true });
});

// Legacy standalone candidate viewer is intentionally disabled; Admin SPA is the only protected viewer.
app.get("/admin.html", (_req, res) => res.redirect(302, "/admin"));
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith("index.html")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  },
}));
app.use("/uploads", express.static(UPLOAD_DIR));

// ── psql helper ──
function psql(sql) {
  const result = execSync(
    `docker exec -i supabase-db psql -U postgres -d postgres -t -A -F ',' -c '${sql.replace(/'/g, "'\"'\"'")}'`,
    { encoding: "utf-8", timeout: 10000 }
  );
  return result.trim();
}

async function validateRecruitmentAdmin(req, res, next) {
  const hrdSession = verifyHrdBridgeSession(req.get("x-rekrutmen-hrd-session"));
  if (hrdSession) {
    const candidateStatusPatch = req.method === "PATCH"
      && /^\/api\/table\/Candidates\/[0-9a-f-]+$/i.test(req.path)
      && Object.keys(req.body || {}).every((key) => key === "Status");
    const candidateBulkStatus = req.method === "POST"
      && req.path === "/api/rekrutmen/candidates/bulk"
      && req.body?.action === "status";
    if (req.method !== "GET" && !candidateStatusPatch && !candidateBulkStatus) {
      return res.status(403).json({ error: "Sesi HRD hanya dapat membaca data atau mengubah status kandidat" });
    }
    res.locals.recruitmentAdmin = { role: "HRD", id: hrdSession.sub, userId: hrdSession.sub };
    res.locals.readOnly = !(candidateStatusPatch || candidateBulkStatus);
    return next();
  }
  if (!req.get("x-yumi-session") && !req.get("authorization")) return res.status(401).json({ error: "HRD Google authentication diperlukan" });
  const outsourcingSession = verifyOutsourcingSession(req.get("x-rekrutmen-outsourcing-session"));
  if (outsourcingSession) {
    const candidateStatusPatch = req.method === "PATCH" && /^\/api\/table\/Candidates\/[0-9a-f-]+$/i.test(req.path);
    if (req.method !== "GET" && !candidateStatusPatch) return res.status(403).json({ error: "Akses outsourcing hanya dapat membaca atau mengubah status kandidat" });
    res.locals.recruitmentAdmin = { role: "outsourcing_readonly" };
    res.locals.readOnly = !candidateStatusPatch;
    return next();
  }
  const headerToken = req.get("x-yumi-session") || req.get("authorization")?.replace(/^Bearer\s+/i, "");
  const standardized = req.path.startsWith("/api/rekrutmen/");
  const authError = (status, code, message) => {
    if (standardized) return res.status(status).json({ error: { code, message }, data: null, meta: {} });
    return res.status(status).json({ error: message });
  };
  if (!headerToken || !SUPABASE_URL || !SUPABASE_SKEY) {
    return authError(401, "AUTH_REQUIRED", "Authentication diperlukan");
  }

  try {
    const authRes = await fetch(`${SUPABASE_URL}/functions/v1/yumi-auth`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SKEY,
        Authorization: `Bearer ${SUPABASE_SKEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "validateSession", token: headerToken }),
    });
    if (!authRes.ok) return authError(401, "AUTH_INVALID", "Sesi tidak valid");
    const payload = await authRes.json();
    const session = payload?.session;
    const roleName = String(session?.role?.name || "").trim().toLowerCase();
    const permissions = Array.isArray(session?.role?.permissions)
      ? session.role.permissions.map(String)
      : [];
    const allowedName = ["admin", "administrator", "owner", "superadmin", "super admin", "manager"].includes(roleName);
    const allowedPermission = permissions.includes("users:manage");
    if (!session || (!allowedName && !allowedPermission)) {
      return authError(403, "ADMIN_REQUIRED", "Akses admin diperlukan");
    }
    res.locals.recruitmentAdmin = session.user;
    return next();
  } catch (error) {
    console.error("Recruitment auth validation failed:", error.message);
    return authError(503, "AUTH_UNAVAILABLE", "Layanan autentikasi tidak tersedia");
  }
}

function validateCandidatePayload(body) {
  const required = ["Nama Lengkap", "Jenis Kelamin", "Tanggal Lahir", "Email", "Nomor Telepon/HP", "Posisi Dilamar", "Full time/Part time"];
  const missing = required.filter((key) => !String(body?.[key] ?? "").trim());
  if (missing.length) return `Field wajib belum lengkap: ${missing.join(", ")}`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.Email).trim())) return "Format email tidak valid";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body["Tanggal Lahir"]).trim())) return "Format tanggal lahir tidak valid";
  if (!/^[0-9+()\s.-]{8,30}$/.test(String(body["Nomor Telepon/HP"]).trim())) return "Format nomor telepon tidak valid";
  return null;
}

function deleteUploadedObject(url) {
  if (!url || !SUPABASE_URL || !SUPABASE_SKEY) return;
  try {
    const marker = `/storage/v1/object/public/${CV_BUCKET}/`;
    const index = String(url).indexOf(marker);
    if (index < 0) return;
    const objectPath = decodeURIComponent(String(url).slice(index + marker.length));
    fetch(`${SUPABASE_URL}/storage/v1/object/${CV_BUCKET}/${encodeURIComponent(objectPath)}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_SKEY, Authorization: `Bearer ${SUPABASE_SKEY}` },
    }).catch((error) => console.warn("CV orphan cleanup failed:", error.message));
  } catch (error) {
    console.warn("CV orphan cleanup skipped:", error.message);
  }
}

// ── GET /api/recruitment-positions (semua posisi + is_open) ──
app.get("/api/recruitment-positions", async (req, res) => {
  try {
    const raw = psql(
      `SELECT json_build_object('title', title, 'icon', icon, 'summary', summary, 'types', types, 'tags', tags, 'is_open', is_open)::text FROM pos.recruitment_positions ORDER BY sort_order ASC`
    );
    if (!raw) return res.json([]);
    const rows = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/recruitment-positions-admin (semua posisi + is_open) ──
app.get("/api/recruitment-positions-admin", validateRecruitmentAdmin, async (req, res) => {
  try {
    const raw = psql(
      `SELECT json_build_object('id', id, 'title', title, 'icon', icon, 'summary', summary, 'types', types, 'tags', tags, 'is_open', is_open, 'sort_order', sort_order)::text FROM pos.recruitment_positions ORDER BY sort_order ASC, title ASC`
    );
    if (!raw) return res.json([]);
    const rows = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/recruitment-positions/:id (admin toggle is_open) ──
app.patch("/api/recruitment-positions/:id", validateRecruitmentAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: "ID posisi tidak valid" });
    }
    const body = req.body || {};
    if (typeof body.is_open !== "boolean") return res.status(400).json({ error: "is_open harus boolean" });
    const sql = `UPDATE pos.recruitment_positions SET is_open = ${body.is_open} WHERE id = '${id}' RETURNING id, title, is_open`;
    const out = execSync(
      `docker exec -i supabase-db psql -U postgres -d postgres -t -A -F '|' -c '${sql.replace(/'/g, "'\"'\"'")}'`,
      { encoding: "utf-8", timeout: 10000 }
    );
    res.json({ success: true, updated: body.is_open });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/table/Candidates ──
app.get("/api/table/Candidates", validateRecruitmentAdmin, async (req, res) => {
  try {
    const sql = `SELECT json_build_object('id',id,'nama_lengkap',nama_lengkap,'jenis_kelamin',jenis_kelamin,'tanggal_lahir',tanggal_lahir,'email',email,'nomor_telepon',nomor_telepon,'sosial_media',sosial_media,'posisi_dilamar',posisi_dilamar,'tipe_kerja',tipe_kerja,'notes',notes,'status',status,'application_date',application_date,'created_at',created_at,'cv_url',cv_url)::text FROM pos.${TABLE} ORDER BY created_at DESC`;
    const raw = execSync(
      `docker exec -i supabase-db psql -U postgres -d postgres -t -A -c '${sql.replace(/'/g, "'\"'\"'")}'`,
      { encoding: "utf-8", timeout: 10000 }
    );
    const records = [];
    for (const line of raw.trim().split("\n").filter(Boolean)) {
      try {
        const row = JSON.parse(line);
        records.push({
          id: row.id,
          createdTime: row.created_at,
          fields: {
            "Nama Lengkap": row.nama_lengkap || "",
            "Jenis Kelamin": row.jenis_kelamin || "",
            "Tanggal Lahir": row.tanggal_lahir || null,
            "Email": row.email || "",
            "Nomor Telepon/HP": row.nomor_telepon || "",
            "Sosial Media Instagram/Tiktok": row.sosial_media || "",
            "Posisi Dilamar": row.posisi_dilamar || "",
            "Full time/Part time": row.tipe_kerja || "",
            "Notes": row.notes || "",
            "Status": row.status || "Application Received",
            "Application Date": row.application_date || null,
            "CV URL": row.cv_url || "",
          },
        });
      } catch {}
    }
    res.json({ records });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/upload-cv (ke Supabase Storage self-host) ──
app.post("/api/upload-cv", async (req, res) => {
  try {
    const { data, filename } = req.body || {};
    const allowedTypes = {
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
    };
    const originalName = path.basename(String(filename));
    const ext = path.extname(originalName).toLowerCase();
    if (!Object.hasOwn(allowedTypes, ext)) return res.status(400).json({ error: "Tipe file tidak didukung" });
    const m = String(data).match(/^data:([A-Za-z0-9/+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!m || m[1].toLowerCase() !== allowedTypes[ext]) return res.status(400).json({ error: "Format atau tipe file tidak valid" });
    const encoded = m[2].replace(/\s/g, "");
    if (!encoded || encoded.length % 4 === 1) return res.status(400).json({ error: "Format base64 tidak valid" });
    const buf = Buffer.from(encoded, "base64");
    if (!buf.length) return res.status(400).json({ error: "File kosong atau base64 tidak valid" });
    if (buf.length > 8 * 1024 * 1024) return res.status(400).json({ error: "Maksimal 8MB" });
    const safeName = `${crypto.randomUUID()}-${originalName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const url = await uploadToStorage(safeName, buf, allowedTypes[ext]);
    res.json({ url });
  } catch (e) {
    console.error("CV upload failed:", e.message);
    res.status(500).json({ error: "CV tidak dapat diunggah saat ini" });
  }
});

// ── Public status lookup (only matching email + phone, no CV/notes) ──
app.post("/api/recruitment-status", (req, res) => {
  try {
    const esc = (v) => `'${String(v ?? "").replace(/'/g, "''")}'`;
    const email = String(req.body?.email || "").trim();
    const phone = String(req.body?.phone || "").trim();
    if (!email || !phone) return res.status(400).json({ error: "Email dan nomor WhatsApp wajib diisi" });
    const sql = `SELECT json_build_object('name', nama_lengkap, 'position', posisi_dilamar, 'work_type', tipe_kerja, 'application_date', application_date, 'created_at', created_at, 'status', status)::text FROM pos.${TABLE} WHERE lower(trim(email)) = lower(trim(${esc(email)})) AND regexp_replace(nomor_telepon, '[^0-9]', '', 'g') = regexp_replace(${esc(phone)}, '[^0-9]', '', 'g') ORDER BY created_at DESC LIMIT 20`;
    const raw = psql(sql);
    const rows = raw ? raw.split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
    return res.json({ applications: rows });
  } catch (e) {
    console.error("Recruitment status lookup failed:", e.message);
    return res.status(500).json({ error: "Status lamaran belum dapat dimuat" });
  }
});

// ── Public stats (only aggregate counts, no PII) ──
app.get("/api/recruitment-stats", async (req, res) => {
  try {
    const raw = psql(`SELECT json_build_object(
      'positions', (SELECT COUNT(*) FROM pos.recruitment_positions WHERE is_open = true),
      'applicants', (SELECT COUNT(*) FROM pos.${TABLE}),
      'byPosition', (SELECT COALESCE(json_agg(json_build_object('title', title, 'count', cnt)), '[]'::json)
                     FROM (
                       SELECT posisi_dilamar AS title, COUNT(*) AS cnt
                       FROM pos.${TABLE} GROUP BY posisi_dilamar
                     ) s)
    )::text`);
    if (!raw) return res.json({ positions: 0, applicants: 0, byPosition: [] });
    return res.json(JSON.parse(raw.trim().split("\n").filter(Boolean)[0]));
  } catch (e) {
    console.error("Recruitment stats failed:", e.message);
    return res.status(500).json({ error: "Statistik belum dapat dimuat" });
  }
});

// ── POST /api/table/Candidates ──
app.post("/api/table/Candidates", async (req, res) => {
  try {
    const b = req.body || {};
    const validationError = validateCandidatePayload(b);
    if (validationError) return res.status(400).json({ error: validationError });
    const esc = (v) => { if (v == null) return "NULL"; return "'" + String(v).replace(/'/g, "''") + "'"; };
    const email = String(b["Email"]).trim();
    const position = String(b["Posisi Dilamar"]).trim();
    const lockKey = `${email.toLowerCase()}|${position.toLowerCase()}`;
    const openPosition = psql(`SELECT 1 FROM pos.recruitment_positions WHERE title = ${esc(position)} AND is_open = true LIMIT 1`);
    if (!openPosition) return res.status(400).json({ error: "Posisi yang dipilih sudah tidak tersedia" });

    // Advisory lock + dedupe check + insert berada dalam satu statement atomic.
    const sql = `WITH lock AS (
  SELECT pg_advisory_xact_lock(hashtext(${esc(lockKey)}))
), existing AS (
  SELECT c.id FROM pos.${TABLE} c, lock
  WHERE lower(trim(c.email)) = lower(trim(${esc(email)}))
    AND lower(trim(c.posisi_dilamar)) = lower(trim(${esc(position)}))
    AND c.created_at > NOW() - INTERVAL '5 minutes'
  ORDER BY c.created_at DESC LIMIT 1
), inserted AS (
  INSERT INTO pos.${TABLE}
    (nama_lengkap, jenis_kelamin, tanggal_lahir, email, nomor_telepon, sosial_media, posisi_dilamar, tipe_kerja, notes, status, application_date, cv_url)
  SELECT ${esc(String(b["Nama Lengkap"]).trim())}, ${esc(String(b["Jenis Kelamin"]).trim())}, ${esc(String(b["Tanggal Lahir"]).trim())}, ${esc(email)}, ${esc(String(b["Nomor Telepon/HP"]).trim())}, ${esc(String(b["Sosial Media Instagram/Tiktok"] || "").trim())}, ${esc(position)}, ${esc(String(b["Full time/Part time"]).trim())}, ${esc(String(b["Notes"] || "").trim())}, 'Application Received', CURRENT_DATE, ${esc(String(b["CV URL"] || "").trim())}
  FROM lock WHERE NOT EXISTS (SELECT 1 FROM existing)
  RETURNING id
)
SELECT json_build_object('duplicate', true, 'id', id)::text FROM existing
UNION ALL
SELECT json_build_object('duplicate', false, 'id', id)::text FROM inserted`;
    const result = psql(sql);
    const record = result ? JSON.parse(result.split("\n").filter(Boolean)[0]) : null;
    if (!record?.id) throw new Error("Database tidak mengembalikan ID kandidat");
    if (record.duplicate) {
      deleteUploadedObject(b["CV URL"]);
      return res.json({ records: [{ id: record.id, fields: b, duplicate: true }] });
    }

    const notifPayload = JSON.stringify({
      nama_lengkap: b["Nama Lengkap"], jenis_kelamin: b["Jenis Kelamin"], tanggal_lahir: b["Tanggal Lahir"],
      email, nomor_telepon: b["Nomor Telepon/HP"], sosial_media: b["Sosial Media Instagram/Tiktok"],
      posisi_dilamar: position, tipe_kerja: b["Full time/Part time"], cv_url: b["CV URL"],
      created_at: new Date().toISOString().split("T")[0],
    });
    const notifScript = "/opt/djiwatentramapp/yumi-hrd-agent/notify_new_applicant.py";
    const notifier = spawn("python3", [notifScript, notifPayload], { detached: true, stdio: "ignore" });
    notifier.on("error", (error) => console.error("Notif lamaran gagal dijalankan:", error.message));
    notifier.unref();
    return res.json({ records: [{ id: record.id, fields: b }] });
  } catch (e) {
    console.error("Candidate insert failed:", e.message);
    return res.status(500).json({ error: "Lamaran tidak dapat disimpan saat ini" });
  }
});

// ── PATCH /api/table/Candidates/:id ──
app.patch("/api/table/Candidates/:id", validateRecruitmentAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: "ID kandidat tidak valid" });
    }
    const body = req.body || {};
    const sets = [];
    if (Object.hasOwn(body, "Status")) {
      const status = String(body.Status || "").trim();
      if (!status) return res.status(400).json({ error: "Status tidak boleh kosong" });
      sets.push(`status = '${status.replace(/'/g, "''")}'`);
    }
    if (Object.hasOwn(body, "Notes")) sets.push(`notes = ${body.Notes == null ? "NULL" : `'${String(body.Notes).replace(/'/g, "''")}'`}`);
    if (!sets.length) return res.status(400).json({ error: "No fields to update" });
    sets.push("updated_at = NOW()");
    const sql = `UPDATE pos.${TABLE} SET ${sets.join(", ")} WHERE id = '${id}' RETURNING id`;
    execSync(
      `docker exec -i supabase-db psql -U postgres -d postgres -c '${sql.replace(/'/g, "'\"'\"'")}'`,
      { encoding: "utf-8", timeout: 10000 }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/table/Candidates/:id ──
app.delete("/api/table/Candidates/:id", validateRecruitmentAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: "ID kandidat tidak valid" });
    }
    const sql = `DELETE FROM pos.${TABLE} WHERE id = '${id}' RETURNING id`;
    execSync(
      `docker exec -i supabase-db psql -U postgres -d postgres -c '${sql.replace(/'/g, "'\"'\"'")}'`,
      { encoding: "utf-8", timeout: 10000 }
    );
    res.json({ success: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Recruitment read models ──
// Interviews has no backing table in the current schema; never present it as an
// empty dataset. Onboarding is a read-only projection of the real application
// table used by the onboarding flow.
app.get("/api/table/Onboarding", validateRecruitmentAdmin, (req, res) => {
  try {
    const sql = `SELECT json_build_object('id', id, 'created_at', created_at, 'updated_at', updated_at, 'status', status, 'full_name', full_name, 'email', email, 'phone', phone, 'employment', employment, 'raw', raw, 'review_notes', review_notes, 'reviewed_at', reviewed_at)::text FROM public.employee_onboarding_applications ORDER BY created_at DESC`;
    const raw = execSync(
      `docker exec -i supabase-db psql -U postgres -d postgres -t -A -c '${sql.replace(/'/g, "'\"'\"'")}'`,
      { encoding: "utf-8", timeout: 10000 },
    );
    const records = raw.trim().split("\n").filter(Boolean).map((line) => {
      const row = JSON.parse(line);
      const employment = row.employment && typeof row.employment === "object" ? row.employment : {};
      const source = row.raw && typeof row.raw === "object" ? row.raw : {};
      const startDate = employment.startDate || employment.start_date || source.startDate || source.start_date || null;
      const probationEndDate = employment.probationEndDate || employment.probation_end_date || source.probationEndDate || source.probation_end_date || null;
      const trainingSchedule = source.trainingSchedule || source.training_schedule || null;
      return {
        id: row.id,
        createdTime: row.created_at,
        fields: {
          Employee: row.full_name || "",
          "Onboarding ID": row.id,
          "Start Date": startDate,
          "Probation End Date": probationEndDate,
          "Training Completion Status": row.status || "pending",
          "Document Collection Status": null,
          "Training Schedule": trainingSchedule,
          Notes: row.review_notes || "",
          Email: row.email || "",
          "Nomor Telepon/HP": row.phone || "",
          "Reviewed At": row.reviewed_at || null,
        },
      };
    });
    res.json({ records, readOnly: true, source: "public.employee_onboarding_applications" });
  } catch (e) {
    console.error("Onboarding read model failed:", e.message);
    res.status(500).json({ error: "Data onboarding tidak dapat dimuat saat ini" });
  }
});

app.get("/api/table/Interviews", validateRecruitmentAdmin, (req, res) => {
  res.status(404).json({ error: "Interview tracking belum tersedia: belum ada tabel sumber di schema recruitment" });
});

app.get("/api/table/:name", validateRecruitmentAdmin, (req, res) => { res.status(404).json({ error: "Read model recruitment tidak tersedia" }); });
app.post("/api/table/:name", (req, res) => { res.status(400).json({ error: "Table not supported" }); });
app.patch("/api/table/:name/:id", validateRecruitmentAdmin, (req, res) => { res.status(400).json({ error: "Table not supported" }); });

// ── Standardized recruitment admin contract ──
// New admin resources use { data, meta } and the same session middleware.
function adminEnvelope(res, data, meta = {}) {
  return res.json({ data, meta });
}

function adminError(res, status, code, message) {
  return res.status(status).json({ error: { code, message }, data: null, meta: {} });
}

function pageParams(req) {
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  const pageSize = Math.max(1, Math.min(500, Number.parseInt(req.query.pageSize || req.query.limit, 10) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function uuidOrNull(value) {
  const id = String(value || "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

function queryAdminRows(sql) {
  const raw = psql(sql).trim();
  if (!raw) return [];
  try {
    return [JSON.parse(raw)];
  } catch {
    return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  }
}

function runAdminMutation(sql) {
  return queryAdminRows(sql);
}

function candidateSummary(row) {
  return {
    id: row.id,
    airtableId: row.airtable_id || "",
    name: row.nama_lengkap || "",
    gender: row.jenis_kelamin || "",
    birthDate: row.tanggal_lahir || null,
    email: row.email || "",
    phone: row.nomor_telepon || "",
    socialMedia: row.sosial_media || "",
    position: row.posisi_dilamar || "",
    workType: row.tipe_kerja || "",
    notes: row.notes || "",
    status: row.status || "Application Received",
    applicationDate: row.application_date || null,
    createdAt: row.created_at || null,
    cvUrl: row.cv_url || "",
  };
}

function candidateDetail(row) {
  return { ...candidateSummary(row), notes: row.notes || "", cvUrl: row.cv_url || "" };
}

function candidateSelect(extra = "") {
  return `SELECT json_build_object('id',id,'airtable_id',airtable_id,'nama_lengkap',nama_lengkap,'jenis_kelamin',jenis_kelamin,'tanggal_lahir',tanggal_lahir,'email',email,'nomor_telepon',nomor_telepon,'sosial_media',sosial_media,'posisi_dilamar',posisi_dilamar,'tipe_kerja',tipe_kerja,'notes',notes,'status',status,'application_date',application_date,'created_at',created_at,'cv_url',cv_url)::text FROM pos.${TABLE} ${extra}`;
}

function requireUuid(req, res, label) {
  const id = uuidOrNull(req.params.id);
  if (!id) {
    adminError(res, 400, "INVALID_ID", `${label} ID tidak valid`);
    return null;
  }
  return id;
}

app.get("/api/rekrutmen/dashboard", validateRecruitmentAdmin, (req, res) => {
  try {
    const row = queryAdminRows(`SELECT json_build_object(
      'totalCandidates',(SELECT COUNT(*) FROM pos.${TABLE}),
      'openPositions',(SELECT COUNT(*) FROM pos.recruitment_positions WHERE is_open = true),
      'totalPositions',(SELECT COUNT(*) FROM pos.recruitment_positions),
      'statusCounts',(SELECT COALESCE(json_object_agg(status,cnt),'{}'::json) FROM (SELECT COALESCE(status,'Unknown') status,COUNT(*) cnt FROM pos.${TABLE} GROUP BY status) s),
      'positionCounts',(SELECT COALESCE(json_object_agg(position,cnt),'{}'::json) FROM (SELECT COALESCE(posisi_dilamar,'Unknown') position,COUNT(*) cnt FROM pos.${TABLE} GROUP BY posisi_dilamar) s)
    )::text`)[0] || {};
    adminEnvelope(res, row, { generatedAt: new Date().toISOString() });
  } catch (e) {
    adminError(res, 503, "BACKEND_UNAVAILABLE", "Dashboard recruitment tidak dapat dimuat");
  }
});

app.get("/api/rekrutmen/candidates", validateRecruitmentAdmin, (req, res) => {
  try {
    const { page, pageSize, offset } = pageParams(req);
    const filter = String(req.query.status || "").trim();
    const where = filter ? `WHERE status = ${sqlLiteral(filter)}` : "";
    const rows = queryAdminRows(`${candidateSelect(`${where} ORDER BY created_at DESC NULLS LAST LIMIT ${pageSize} OFFSET ${offset}`)}`);
    const total = Number(queryAdminRows(`SELECT json_build_object('count',COUNT(*) )::text FROM pos.${TABLE} ${where}`)[0]?.count || 0);
    adminEnvelope(res, rows.map(candidateSummary), { page, pageSize, total, hasMore: offset + rows.length < total });
  } catch (e) {
    adminError(res, 503, "BACKEND_UNAVAILABLE", "Daftar kandidat tidak dapat dimuat");
  }
});

app.get("/api/rekrutmen/candidates.csv", validateRecruitmentAdmin, (req, res) => {
  try {
    const rows = queryAdminRows(`${candidateSelect("ORDER BY created_at DESC NULLS LAST")}`);
    const cols = ["id","name","email","phone","position","workType","status","applicationDate","createdAt"];
    const csv = [cols.join(","), ...rows.map((r) => { const v = candidateSummary(r); return cols.map((c) => `"${String(v[c] ?? "").replace(/"/g, '""')}"`).join(","); })].join("\n");
    res.type("text/csv").set("Content-Disposition", 'attachment; filename="recruitment-candidates.csv"').send(csv);
  } catch (e) { adminError(res, 503, "BACKEND_UNAVAILABLE", "CSV kandidat tidak dapat dibuat"); }
});

app.post("/api/rekrutmen/candidates/bulk", validateRecruitmentAdmin, (req, res) => {
  try {
    const action = String(req.body?.action || "").trim();
    if (res.locals.readOnly && action !== "status") return adminError(res, 403, "READ_ONLY_SESSION", "Sesi ini hanya boleh mengubah status kandidat");
    const ids = Array.from(new Set(Array.isArray(req.body?.ids) ? req.body.ids.map((value) => String(value)) : []));
    if (!ids.length || ids.length > 200) return adminError(res, 400, "INVALID_IDS", "Pilih 1 sampai 200 kandidat");
    if (ids.some((id) => !UUID_RE.test(id))) return adminError(res, 400, "INVALID_ID", "ID kandidat tidak valid");
    const idList = ids.map(sqlLiteral).join(",");
    if (action === "status") {
      const status = String(req.body?.status || "").trim();
      const allowed = ["Application Received", "Screening", "Interview Scheduled", "Interview Completed", "Offer", "Hired", "Onboarding", "Selesai", "Rejected", "Withdrawn"];
      if (!allowed.includes(status)) return adminError(res, 400, "INVALID_STATUS", "Status bulk tidak valid");
      if (status === "Interview Scheduled") return adminError(res, 400, "INTERVIEW_SCHEDULE_REQUIRED", "Bulk Interview Scheduled memerlukan jadwal interview per kandidat");
      const row = runAdminMutation(`WITH selected AS (SELECT id,status FROM pos.${TABLE} WHERE id IN (${idList})), updated AS (UPDATE pos.${TABLE} c SET status=${sqlLiteral(status)},updated_at=NOW() FROM selected WHERE c.id=selected.id RETURNING c.id,selected.status AS from_status,c.status AS to_status), history AS (INSERT INTO pos.recruitment_candidate_status_history (candidate_id,from_status,to_status,note,changed_by,metadata) SELECT id,from_status,to_status,'Bulk status update',${sqlLiteral(uuidOrNull(res.locals.recruitmentAdmin?.id || res.locals.recruitmentAdmin?.userId))},jsonb_build_object('bulk',true) FROM updated RETURNING candidate_id) SELECT json_build_object('updated',(SELECT COUNT(*) FROM history),'ids',COALESCE((SELECT json_agg(candidate_id) FROM history),'[]'::json))::text`)[0] || { updated: 0, ids: [] };
      return adminEnvelope(res, row, { resource: "candidate-bulk-status" });
    }
    if (action === "delete") {
      const row = runAdminMutation(`WITH selected AS (SELECT id FROM pos.${TABLE} WHERE id IN (${idList})), audit AS (INSERT INTO pos.recruitment_audit_logs (entity_type,entity_id,action,actor_user_id,metadata) SELECT 'candidate',id,'bulk_delete',${sqlLiteral(uuidOrNull(res.locals.recruitmentAdmin?.id || res.locals.recruitmentAdmin?.userId))},jsonb_build_object('bulk',true) FROM selected), deleted_tasks AS (DELETE FROM pos.recruitment_onboarding_tasks t USING selected WHERE t.candidate_id=selected.id), deleted_interviews AS (DELETE FROM pos.recruitment_interviews i USING selected WHERE i.candidate_id=selected.id), deleted_history AS (DELETE FROM pos.recruitment_candidate_status_history h USING selected WHERE h.candidate_id=selected.id), deleted AS (DELETE FROM pos.${TABLE} c USING selected WHERE c.id=selected.id RETURNING c.id) SELECT json_build_object('deleted',(SELECT COUNT(*) FROM deleted),'ids',COALESCE((SELECT json_agg(id) FROM deleted),'[]'::json))::text`)[0] || { deleted: 0, ids: [] };
      return adminEnvelope(res, row, { resource: "candidate-bulk-delete" });
    }
    return adminError(res, 400, "INVALID_ACTION", "Aksi bulk tidak valid");
  } catch (e) { adminError(res, 503, "BACKEND_UNAVAILABLE", "Aksi bulk kandidat gagal diproses"); }
});

app.get("/api/rekrutmen/candidates/:id", validateRecruitmentAdmin, (req, res) => {
  const id = requireUuid(req, res, "Kandidat");
  if (!id) return;
  try {
    const row = queryAdminRows(`${candidateSelect(`WHERE id = ${sqlLiteral(id)} LIMIT 1`)}`)[0];
    if (!row) return adminError(res, 404, "NOT_FOUND", "Kandidat tidak ditemukan");
    adminEnvelope(res, candidateDetail(row), { resource: "candidate" });
  } catch (e) {
    adminError(res, 503, "BACKEND_UNAVAILABLE", "Detail kandidat tidak dapat dimuat");
  }
});

app.patch("/api/rekrutmen/candidates/:id", validateRecruitmentAdmin, (req, res) => {
  const id = requireUuid(req, res, "Kandidat");
  if (!id) return;
  try {
    const body = req.body || {};
    const sets = [];
    if (Object.hasOwn(body, "status")) {
      const status = String(body.status || "").trim();
      if (!status || status.length > 80) return adminError(res, 400, "INVALID_STATUS", "Status tidak valid");
      sets.push(`status = ${sqlLiteral(status)}`);
    }
    if (Object.hasOwn(body, "notes")) sets.push(`notes = ${body.notes == null ? "NULL" : sqlLiteral(String(body.notes).slice(0, 10000))}`);
    if (!sets.length) return adminError(res, 400, "NO_FIELDS", "Tidak ada field yang dapat diubah");
    sets.push("updated_at = NOW()");
    const row = runAdminMutation(`UPDATE pos.${TABLE} SET ${sets.join(", ")} WHERE id = ${sqlLiteral(id)} RETURNING json_build_object('id',id,'status',status,'notes',notes)::text`)[0];
    if (!row) return adminError(res, 404, "NOT_FOUND", "Kandidat tidak ditemukan");
    adminEnvelope(res, row, { resource: "candidate" });
  } catch (e) {
    adminError(res, 503, "BACKEND_UNAVAILABLE", "Kandidat tidak dapat diubah");
  }
});

app.get("/api/rekrutmen/positions", validateRecruitmentAdmin, (req, res) => {
  try {
    const { page, pageSize, offset } = pageParams(req);
    const rows = queryAdminRows(`SELECT json_build_object('id',id,'title',title,'icon',icon,'summary',summary,'types',types,'tags',tags,'isOpen',is_open,'sortOrder',sort_order)::text FROM pos.recruitment_positions ORDER BY sort_order ASC NULLS LAST,title ASC LIMIT ${pageSize} OFFSET ${offset}`);
    const total = Number(queryAdminRows("SELECT json_build_object('count',COUNT(*))::text FROM pos.recruitment_positions")[0]?.count || 0);
    adminEnvelope(res, rows, { page, pageSize, total, hasMore: offset + rows.length < total });
  } catch (e) {
    adminError(res, 503, "TABLE_UNAVAILABLE", "Tabel posisi recruitment belum tersedia");
  }
});

app.post("/api/rekrutmen/positions", validateRecruitmentAdmin, (req, res) => {
  try {
    const b = req.body || {};
    const title = String(b.title || "").trim();
    if (!title || title.length > 160) return adminError(res, 400, "INVALID_TITLE", "Title posisi wajib diisi");
    const bool = typeof b.isOpen === "boolean" ? b.isOpen : true;
    const row = runAdminMutation(`INSERT INTO pos.recruitment_positions (title,icon,summary,types,tags,is_open,sort_order) VALUES (${sqlLiteral(title)},${sqlLiteral(b.icon || "")},${sqlLiteral(b.summary || "")},${sqlLiteral(JSON.stringify(Array.isArray(b.types) ? b.types : []))}::jsonb,${sqlLiteral(JSON.stringify(Array.isArray(b.tags) ? b.tags : []))}::jsonb,${bool},${Number.isFinite(Number(b.sortOrder)) ? Math.trunc(Number(b.sortOrder)) : 0}) RETURNING json_build_object('id',id,'title',title,'icon',icon,'summary',summary,'types',types,'tags',tags,'isOpen',is_open,'sortOrder',sort_order)::text`)[0];
    adminEnvelope(res, row, { resource: "position" });
  } catch (e) {
    adminError(res, 503, "TABLE_UNAVAILABLE", "Posisi tidak dapat dibuat; periksa schema recruitment");
  }
});

function pipelineStatus(status) {
  return status === "Applied" ? "Application Received" : status || "Application Received";
}

app.get("/api/rekrutmen/pipeline", validateRecruitmentAdmin, (req, res) => {
  try {
    const candidates = queryAdminRows(`${candidateSelect("ORDER BY created_at DESC NULLS LAST")}`).map((row) => ({ ...candidateSummary(row), id: row.id, nama_lengkap: row.nama_lengkap || "", jenis_kelamin: row.jenis_kelamin || "", tanggal_lahir: row.tanggal_lahir || null, sosial_media: row.sosial_media || "", airtable_id: row.airtable_id || "", email: row.email || "", nomor_telepon: row.nomor_telepon || "", posisi_dilamar: row.posisi_dilamar || "", tipe_kerja: row.tipe_kerja || "", notes: row.notes || "", status: pipelineStatus(row.status), sourceStatus: row.status || "Application Received", application_date: row.application_date || null, created_at: row.created_at || null, cv_url: row.cv_url || "" }));
    const interviews = queryAdminRows("SELECT row_to_json(t)::text FROM (SELECT * FROM pos.recruitment_interviews ORDER BY scheduled_at ASC NULLS LAST, created_at DESC) t");
    const onboarding = queryAdminRows("SELECT row_to_json(t)::text FROM (SELECT * FROM pos.recruitment_onboarding_tasks ORDER BY due_date ASC NULLS LAST, created_at ASC) t");
    const interviewByCandidate = new Map();
    for (const interview of interviews) {
      const current = interviewByCandidate.get(interview.candidate_id);
      if (!current || new Date(interview.scheduled_at || "9999-12-31").getTime() < new Date(current.scheduled_at || "9999-12-31").getTime()) interviewByCandidate.set(interview.candidate_id, interview);
    }
    const onboardingByCandidate = new Map();
    for (const task of onboarding) {
      const entry = onboardingByCandidate.get(task.candidate_id) || { completed: 0, total: 0, overdue: 0, nextTask: null };
      entry.total += 1;
      if (task.status === "completed" || task.status === "skipped") entry.completed += 1;
      if (task.due_date && task.status !== "completed" && task.status !== "skipped" && new Date(`${task.due_date}T23:59:59+07:00`) < new Date()) entry.overdue += 1;
      if (!entry.nextTask && task.status !== "completed" && task.status !== "skipped") entry.nextTask = task.label;
      onboardingByCandidate.set(task.candidate_id, entry);
    }
    const data = candidates.map((candidate) => ({ ...candidate, latestInterview: interviewByCandidate.get(candidate.id) || null, onboardingProgress: onboardingByCandidate.get(candidate.id) || null }));
    adminEnvelope(res, data, { total: data.length, generatedAt: new Date().toISOString() });
  } catch (e) { adminError(res, 503, "BACKEND_UNAVAILABLE", "Pipeline recruitment tidak dapat dimuat"); }
});

app.post("/api/rekrutmen/candidates/:id/status-transition", validateRecruitmentAdmin, (req, res) => {
  const id = requireUuid(req, res, "Kandidat");
  if (!id) return;
  try {
    const allowed = ["Application Received", "Screening", "Interview Scheduled", "Interview Completed", "Offer", "Hired", "Onboarding", "Selesai", "Rejected", "Withdrawn"];
    const toStatus = String(req.body?.toStatus || "").trim();
    const expectedStatus = String(req.body?.expectedStatus || "").trim();
    const note = String(req.body?.reason || "").trim().slice(0, 1000);
    if (!allowed.includes(toStatus)) return adminError(res, 400, "INVALID_STATUS", "Status pipeline tidak valid");
    const current = queryAdminRows(`SELECT json_build_object('id',id,'status',status)::text FROM pos.${TABLE} WHERE id=${sqlLiteral(id)} LIMIT 1`)[0];
    if (!current) return adminError(res, 404, "NOT_FOUND", "Kandidat tidak ditemukan");
    if (toStatus === "Interview Scheduled") {
      const scheduled = queryAdminRows(`SELECT json_build_object('scheduled',EXISTS(SELECT 1 FROM pos.recruitment_interviews WHERE candidate_id=${sqlLiteral(id)} AND scheduled_at IS NOT NULL AND status <> 'Cancelled'))::text`)[0]?.scheduled;
      if (scheduled !== true && scheduled !== "true") return adminError(res, 400, "INTERVIEW_SCHEDULE_REQUIRED", "Jadwal interview wajib dibuat sebelum kandidat masuk tahap Interview Scheduled");
    }
    const expectedCondition = expectedStatus === "Application Received" ? `(status=${sqlLiteral(expectedStatus)} OR status='Applied')` : `status=${sqlLiteral(expectedStatus || current.status)}`;
    const sql = `WITH current_row AS (SELECT id,status FROM pos.${TABLE} WHERE id=${sqlLiteral(id)} AND ${expectedCondition} FOR UPDATE), updated AS (UPDATE pos.${TABLE} c SET status=${sqlLiteral(toStatus)},updated_at=NOW() FROM current_row WHERE c.id=current_row.id RETURNING c.id,current_row.status AS from_status,c.status AS to_status), history AS (INSERT INTO pos.recruitment_candidate_status_history (candidate_id,from_status,to_status,note,changed_by,metadata) SELECT id,from_status,to_status,${sqlLiteral(note)},${sqlLiteral(uuidOrNull(res.locals.recruitmentAdmin?.id || res.locals.recruitmentAdmin?.userId))},'{}'::jsonb FROM updated RETURNING candidate_id) SELECT json_build_object('id',updated.id,'fromStatus',updated.from_status,'toStatus',updated.to_status)::text FROM updated JOIN history ON history.candidate_id=updated.id`;
    const row = runAdminMutation(sql)[0];
    if (!row) return adminError(res, 409, "STATUS_CONFLICT", "Status kandidat sudah berubah atau tidak sesuai dengan kondisi terakhir");
    adminEnvelope(res, row, { resource: "candidate-status-transition" });
  } catch (e) { adminError(res, 503, "BACKEND_UNAVAILABLE", "Status kandidat tidak dapat disimpan"); }
});

app.patch("/api/rekrutmen/positions/:id", validateRecruitmentAdmin, (req, res) => {
  const id = requireUuid(req, res, "Posisi");
  if (!id) return;
  try {
    const b = req.body || {}; const sets = [];
    if (Object.hasOwn(b, "title")) { const v = String(b.title || "").trim(); if (!v || v.length > 160) return adminError(res, 400, "INVALID_TITLE", "Title posisi tidak valid"); sets.push(`title=${sqlLiteral(v)}`); }
    if (Object.hasOwn(b, "icon")) sets.push(`icon=${sqlLiteral(b.icon || "")}`);
    if (Object.hasOwn(b, "summary")) sets.push(`summary=${sqlLiteral(b.summary || "")}`);
    if (Object.hasOwn(b, "types")) sets.push(`types=${sqlLiteral(JSON.stringify(Array.isArray(b.types) ? b.types : []))}::jsonb`);
    if (Object.hasOwn(b, "tags")) sets.push(`tags=${sqlLiteral(JSON.stringify(Array.isArray(b.tags) ? b.tags : []))}::jsonb`);
    if (Object.hasOwn(b, "isOpen")) { if (typeof b.isOpen !== "boolean") return adminError(res, 400, "INVALID_IS_OPEN", "isOpen harus boolean"); sets.push(`is_open=${b.isOpen}`); }
    if (Object.hasOwn(b, "sortOrder")) sets.push(`sort_order=${Math.trunc(Number(b.sortOrder) || 0)}`);
    if (!sets.length) return adminError(res, 400, "NO_FIELDS", "Tidak ada field yang dapat diubah");
    const row = runAdminMutation(`UPDATE pos.recruitment_positions SET ${sets.join(",")} WHERE id=${sqlLiteral(id)} RETURNING json_build_object('id',id,'title',title,'icon',icon,'summary',summary,'types',types,'tags',tags,'isOpen',is_open,'sortOrder',sort_order)::text`)[0];
    if (!row) return adminError(res, 404, "NOT_FOUND", "Posisi tidak ditemukan");
    adminEnvelope(res, row, { resource: "position" });
  } catch (e) { adminError(res, 503, "TABLE_UNAVAILABLE", "Posisi tidak dapat diubah; periksa schema recruitment"); }
});

app.delete("/api/rekrutmen/positions/:id", validateRecruitmentAdmin, (req, res) => {
  const id = requireUuid(req, res, "Posisi");
  if (!id) return;
  try {
    const row = runAdminMutation(`DELETE FROM pos.recruitment_positions WHERE id=${sqlLiteral(id)} RETURNING json_build_object('id',id)::text`)[0];
    if (!row) return adminError(res, 404, "NOT_FOUND", "Posisi tidak ditemukan");
    adminEnvelope(res, row, { resource: "position" });
  } catch (e) { adminError(res, 503, "TABLE_UNAVAILABLE", "Posisi tidak dapat dihapus; periksa schema recruitment"); }
});

function tableResource(table, label) {
  return (req, res) => {
    try {
      const { page, pageSize, offset } = pageParams(req);
      const rows = queryAdminRows(`SELECT row_to_json(t)::text FROM (SELECT * FROM ${table} ORDER BY created_at DESC NULLS LAST LIMIT ${pageSize} OFFSET ${offset}) t`);
      const total = Number(queryAdminRows(`SELECT json_build_object('count',COUNT(*))::text FROM ${table}`)[0]?.count || 0);
      adminEnvelope(res, rows, { page, pageSize, total, hasMore: offset + rows.length < total, resource: label });
    } catch (e) { adminError(res, 503, "TABLE_UNAVAILABLE", `Tabel ${label} belum tersedia di schema recruitment`); }
  };
}

app.get("/api/rekrutmen/interviews", validateRecruitmentAdmin, tableResource("pos.recruitment_interviews", "interviews"));
app.get("/api/rekrutmen/onboarding", validateRecruitmentAdmin, tableResource("pos.recruitment_onboarding_tasks", "onboarding-tasks"));
app.get("/api/rekrutmen/reports", validateRecruitmentAdmin, (req, res) => {
  try {
    const row = queryAdminRows(`SELECT json_build_object('byStatus',(SELECT COALESCE(json_agg(x),'[]'::json) FROM (SELECT COALESCE(status,'Unknown') status,COUNT(*) count FROM pos.${TABLE} GROUP BY status ORDER BY count DESC) x),'byPosition',(SELECT COALESCE(json_agg(x),'[]'::json) FROM (SELECT COALESCE(posisi_dilamar,'Unknown') position,COUNT(*) count FROM pos.${TABLE} GROUP BY posisi_dilamar ORDER BY count DESC) x))::text`)[0] || {};
    adminEnvelope(res, row, { generatedAt: new Date().toISOString() });
  } catch (e) { adminError(res, 503, "BACKEND_UNAVAILABLE", "Laporan recruitment tidak dapat dimuat"); }
});

app.post("/api/rekrutmen/interviews", validateRecruitmentAdmin, (req, res) => {
  try {
    const b = req.body || {};
    const candidateId = uuidOrNull(b.candidateId || b.candidate_id);
    if (!candidateId) return adminError(res, 400, "INVALID_CANDIDATE_ID", "candidateId wajib berupa UUID");
    const status = String(b.status || "Scheduled");
    const allowed = ["Scheduled", "Rescheduled", "Completed", "Passed", "Failed", "Cancelled"];
    if (!allowed.includes(status)) return adminError(res, 400, "INVALID_STATUS", "Status interview tidak valid");
    const row = runAdminMutation(`INSERT INTO pos.recruitment_interviews (candidate_id,scheduled_at,timezone,interviewer_user_id,location,meeting_url,status,notes,feedback,result,created_by,metadata) VALUES (${sqlLiteral(candidateId)},${sqlLiteral(b.scheduledAt || b.scheduled_at)},${sqlLiteral(b.timezone || "Asia/Jakarta")},${sqlLiteral(uuidOrNull(b.interviewerUserId || b.interviewer_user_id))},${sqlLiteral(b.location || "")},${sqlLiteral(b.meetingUrl || b.meeting_url || "")},${sqlLiteral(status)},${sqlLiteral(b.notes || "")},${sqlLiteral(b.feedback || "")},${sqlLiteral(b.result || "")},${sqlLiteral(uuidOrNull(res.locals.recruitmentAdmin?.id || res.locals.recruitmentAdmin?.userId))},${sqlLiteral(JSON.stringify(b.metadata || {}))}::jsonb) RETURNING row_to_json(recruitment_interviews)::text`)[0];
    adminEnvelope(res, row, { resource: "interview" });
  } catch (e) { adminError(res, 503, "TABLE_UNAVAILABLE", "Interview belum tersedia di schema recruitment"); }
});

app.patch("/api/rekrutmen/interviews/:id", validateRecruitmentAdmin, (req, res) => {
  const id = requireUuid(req, res, "Interview");
  if (!id) return;
  try {
    const b = req.body || {}; const sets = [];
    const textFields = { scheduledAt: "scheduled_at", timezone: "timezone", interviewerUserId: "interviewer_user_id", location: "location", meetingUrl: "meeting_url", notes: "notes", feedback: "feedback", result: "result" };
    for (const [input, column] of Object.entries(textFields)) if (Object.hasOwn(b, input)) sets.push(`${column}=${input === "interviewerUserId" ? sqlLiteral(uuidOrNull(b[input])) : sqlLiteral(b[input])}`);
    if (Object.hasOwn(b, "status")) { const allowed = ["Scheduled", "Rescheduled", "Completed", "Passed", "Failed", "Cancelled"]; if (!allowed.includes(String(b.status))) return adminError(res, 400, "INVALID_STATUS", "Status interview tidak valid"); sets.push(`status=${sqlLiteral(b.status)}`); }
    if (Object.hasOwn(b, "metadata")) sets.push(`metadata=${sqlLiteral(JSON.stringify(b.metadata || {}))}::jsonb`);
    if (!sets.length) return adminError(res, 400, "NO_FIELDS", "Tidak ada field yang dapat diubah");
    sets.push("updated_at=NOW()");
    const row = runAdminMutation(`UPDATE pos.recruitment_interviews SET ${sets.join(",")} WHERE id=${sqlLiteral(id)} RETURNING row_to_json(recruitment_interviews)::text`)[0];
    if (!row) return adminError(res, 404, "NOT_FOUND", "Interview tidak ditemukan");
    adminEnvelope(res, row, { resource: "interview" });
  } catch (e) { adminError(res, 503, "TABLE_UNAVAILABLE", "Interview tidak dapat diubah; periksa schema recruitment"); }
});

app.patch("/api/rekrutmen/onboarding/:id/tasks", validateRecruitmentAdmin, (req, res) => {
  const id = requireUuid(req, res, "Task onboarding");
  if (!id) return;
  try {
    const status = String(req.body?.status || "");
    const allowed = ["pending", "in_progress", "completed", "skipped", "cancelled"];
    if (!allowed.includes(status)) return adminError(res, 400, "INVALID_STATUS", "Status task onboarding tidak valid");
    const completedAt = status === "completed" ? "NOW()" : "NULL";
    const row = runAdminMutation(`UPDATE pos.recruitment_onboarding_tasks SET status=${sqlLiteral(status)},completed_at=${completedAt},updated_at=NOW() WHERE id=${sqlLiteral(id)} RETURNING row_to_json(recruitment_onboarding_tasks)::text`)[0];
    if (!row) return adminError(res, 404, "NOT_FOUND", "Task onboarding tidak ditemukan");
    adminEnvelope(res, row, { resource: "onboarding-task" });
  } catch (e) { adminError(res, 503, "TABLE_UNAVAILABLE", "Task onboarding belum tersedia di schema recruitment"); }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Rekrutmen UI at http://localhost:" + PORT);
});