const express = require("express");
const cors = require("cors");
const { execSync, spawn } = require("child_process");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3456);
const TABLE = "recruitment_candidates";
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
  const headerToken = req.get("x-yumi-session") || req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!headerToken || !SUPABASE_URL || !SUPABASE_SKEY) {
    return res.status(401).json({ error: "Authentication diperlukan" });
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
    if (!authRes.ok) return res.status(401).json({ error: "Sesi tidak valid" });
    const payload = await authRes.json();
    const session = payload?.session;
    const roleName = String(session?.role?.name || "").trim().toLowerCase();
    if (!session || roleName !== "admin") {
      return res.status(403).json({ error: "Akses admin diperlukan" });
    }
    res.locals.recruitmentAdmin = session.user;
    return next();
  } catch (error) {
    console.error("Recruitment auth validation failed:", error.message);
    return res.status(503).json({ error: "Layanan autentikasi tidak tersedia" });
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

// ── GET /api/recruitment-positions (hanya yang is_open=true) ──
app.get("/api/recruitment-positions", async (req, res) => {
  try {
    const raw = psql(
      `SELECT json_build_object('title', title, 'icon', icon, 'summary', summary, 'types', types, 'tags', tags)::text FROM pos.recruitment_positions WHERE is_open = true ORDER BY sort_order ASC`
    );
    if (!raw) return res.json([]);
    const rows = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    res.json(rows);
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
    const rows = raw ? raw.split("\\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
    return res.json({ applications: rows });
  } catch (e) {
    console.error("Recruitment status lookup failed:", e.message);
    return res.status(500).json({ error: "Status lamaran belum dapat dimuat" });
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

// ── Other tables (Interviews / Onboarding) ──
app.get("/api/table/:name", validateRecruitmentAdmin, (req, res) => { res.json({ records: [] }); });
app.post("/api/table/:name", (req, res) => { res.status(400).json({ error: "Table not supported" }); });
app.patch("/api/table/:name/:id", validateRecruitmentAdmin, (req, res) => { res.status(400).json({ error: "Table not supported" }); });

app.listen(PORT, "0.0.0.0", () => {
  console.log("Rekrutmen UI at http://localhost:" + PORT);
});