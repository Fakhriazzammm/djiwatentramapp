const express = require("express");
const cors = require("cors");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3456;
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
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

// ── psql helper ──
function psql(sql) {
  const result = execSync(
    `docker exec -i supabase-db psql -U postgres -d postgres -t -A -F ',' -c '${sql.replace(/'/g, "'\"'\"'")}'`,
    { encoding: "utf-8", timeout: 10000 }
  );
  return result.trim();
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
app.get("/api/table/Candidates", async (req, res) => {
  try {
    const sql = `SELECT id, nama_lengkap, jenis_kelamin, tanggal_lahir, email, nomor_telepon, sosial_media, posisi_dilamar, tipe_kerja, notes, status, application_date, created_at, cv_url FROM pos.${TABLE} ORDER BY created_at DESC`;
    const raw = execSync(
      `docker exec -i supabase-db psql -U postgres -d postgres -t -A -F '|||' -c '${sql.replace(/'/g, "'\"'\"'")}'`,
      { encoding: "utf-8", timeout: 10000 }
    );
    const records = [];
    for (const line of raw.trim().split("\n").filter(Boolean)) {
      const cols = line.split("|||");
      if (cols.length < 14) continue;
      records.push({
        id: cols[0],
        createdTime: cols[12],
        fields: {
          "Nama Lengkap": cols[1] || "",
          "Jenis Kelamin": cols[2] || "",
          "Tanggal Lahir": cols[3] || null,
          "Email": cols[4] || "",
          "Nomor Telepon/HP": cols[5] || "",
          "Sosial Media Instagram/Tiktok": cols[6] || "",
          "Posisi Dilamar": cols[7] || "",
          "Full time/Part time": cols[8] || "",
          "Notes": cols[9] || "",
          "Status": cols[10] || "Application Received",
          "Application Date": cols[11] || null,
          "CV URL": cols[13] || "",
        },
      });
    }
    res.json({ records });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/upload-cv (ke Supabase Storage self-host) ──
app.post("/api/upload-cv", async (req, res) => {
  try {
    const { data, filename } = req.body;
    if (!data || !filename) return res.status(400).json({ error: "data & filename required" });
    const allowed = [".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"];
    const ext = path.extname(filename).toLowerCase();
    if (!allowed.includes(ext)) return res.status(400).json({ error: "Tipe file tidak didukung" });
    const m = data.match(/^data:([A-Za-z0-9/+-]+);base64,(.+)$/);
    if (!m) return res.status(400).json({ error: "Format base64 tidak valid" });
    const contentType = m[1];
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 8 * 1024 * 1024) return res.status(400).json({ error: "Maksimal 8MB" });
    const safeName = Date.now() + "-" + filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const url = await uploadToStorage(safeName, buf, contentType);
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/table/Candidates ──
app.post("/api/table/Candidates", async (req, res) => {
  try {
    const b = req.body;
    const esc = (v) => { if (v == null) return "NULL"; return "'" + String(v).replace(/'/g, "''") + "'"; };
    const sql = `INSERT INTO pos.${TABLE}
(nama_lengkap, jenis_kelamin, tanggal_lahir, email, nomor_telepon, sosial_media, posisi_dilamar, tipe_kerja, notes, status, application_date, cv_url)
VALUES (${esc(b["Nama Lengkap"])}, ${esc(b["Jenis Kelamin"])}, ${esc(b["Tanggal Lahir"])}, ${esc(b["Email"])}, ${esc(b["Nomor Telepon/HP"])}, ${esc(b["Sosial Media Instagram/Tiktok"])}, ${esc(b["Posisi Dilamar"])}, ${esc(b["Full time/Part time"])}, ${esc(b["Notes"])}, ${esc(b["Status"] || "Application Received")}, ${esc(b["Application Date"] || new Date().toISOString().split("T")[0])}, ${esc(b["CV URL"])}) RETURNING id`;
    const result = execSync(
      `docker exec -i supabase-db psql -U postgres -d postgres -t -A -c '${sql.replace(/'/g, "'\"'\"'")}'`,
      { encoding: "utf-8", timeout: 10000 }
    );
    const newId = result.trim();
    // ── Notifikasi ke grup [Report] via yumi-ai-bot ──
    try {
      const notifPayload = JSON.stringify({
        nama_lengkap: b["Nama Lengkap"],
        jenis_kelamin: b["Jenis Kelamin"],
        tanggal_lahir: b["Tanggal Lahir"],
        email: b["Email"],
        nomor_telepon: b["Nomor Telepon/HP"],
        sosial_media: b["Sosial Media Instagram/Tiktok"],
        posisi_dilamar: b["Posisi Dilamar"],
        tipe_kerja: b["Full time/Part time"],
        cv_url: b["CV URL"],
        created_at: new Date().toISOString().split("T")[0],
      });
      const notifScript = "/opt/djiwatentramapp/yumi-ai-bot/notify_new_applicant.py";
      execSync(`python3 ${notifScript} '${notifPayload.replace(/'/g, "'\"'\"'")}'`, {
        encoding: "utf-8",
        timeout: 15000,
      });
    } catch (notifErr) {
      console.error("Notif lamaran gagal (non-fatal):", notifErr.message);
    }
    res.json({ records: [{ id: newId, fields: b }] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/table/Candidates/:id ──
app.patch("/api/table/Candidates/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const sets = [];
    if (req.body.Status) sets.push(`status = '${req.body.Status.replace(/'/g, "''")}'`);
    if (req.body.Notes) sets.push(`notes = '${req.body.Notes.replace(/'/g, "''")}'`);
    if (!sets.length) return res.status(400).json({ error: "No fields to update" });
    sets.push("updated_at = NOW()");
    const sql = `UPDATE pos.${TABLE} SET ${sets.join(", ")} WHERE id = '${id}'`;
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
app.delete("/api/table/Candidates/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const sql = `DELETE FROM pos.${TABLE} WHERE id = '${id}'`;
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
app.get("/api/table/:name", (req, res) => { res.json({ records: [] }); });
app.post("/api/table/:name", (req, res) => { res.status(400).json({ error: "Table not supported" }); });
app.patch("/api/table/:name/:id", (req, res) => { res.status(400).json({ error: "Table not supported" }); });

app.listen(PORT, "0.0.0.0", () => {
  console.log("Rekrutmen UI at http://localhost:" + PORT);
});