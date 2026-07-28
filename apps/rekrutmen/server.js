const express = require("express");
const cors = require("cors");
const { execSync } = require("child_process");
const path = require("path");

const app = express();
const PORT = 3456;
const TABLE = "recruitment_candidates";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── psql helper ──
function psql(sql) {
  const result = execSync(
    `docker exec -i supabase-db psql -U postgres -d postgres -t -A -F ',' -c '${sql.replace(/'/g, "'\"'\"'")}'`,
    { encoding: "utf-8", timeout: 10000 }
  );
  return result.trim();
}

// ── GET /api/table/Candidates ──
app.get("/api/table/Candidates", async (req, res) => {
  try {
    const sql = `SELECT id, nama_lengkap, jenis_kelamin, tanggal_lahir, email, nomor_telepon, sosial_media, posisi_dilamar, tipe_kerja, notes, status, application_date, created_at FROM pos.${TABLE} ORDER BY created_at DESC`;
    const raw = execSync(
      `docker exec -i supabase-db psql -U postgres -d postgres -t -A -F '|||' -c '${sql.replace(/'/g, "'\"'\"'")}'`,
      { encoding: "utf-8", timeout: 10000 }
    );
    const records = [];
    for (const line of raw.trim().split("\n").filter(Boolean)) {
      const cols = line.split("|||");
      if (cols.length < 13) continue;
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
        },
      });
    }
    res.json({ records });
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
(nama_lengkap, jenis_kelamin, tanggal_lahir, email, nomor_telepon, sosial_media, posisi_dilamar, tipe_kerja, notes, status, application_date)
VALUES (${esc(b["Nama Lengkap"])}, ${esc(b["Jenis Kelamin"])}, ${esc(b["Tanggal Lahir"])}, ${esc(b["Email"])}, ${esc(b["Nomor Telepon/HP"])}, ${esc(b["Sosial Media Instagram/Tiktok"])}, ${esc(b["Posisi Dilamar"])}, ${esc(b["Full time/Part time"])}, ${esc(b["Notes"])}, ${esc(b["Status"] || "Application Received")}, ${esc(b["Application Date"] || new Date().toISOString().split("T")[0])}) RETURNING id`;
    const result = execSync(
      `docker exec -i supabase-db psql -U postgres -d postgres -t -A -c '${sql.replace(/'/g, "'\"'\"'")}'`,
      { encoding: "utf-8", timeout: 10000 }
    );
    const newId = result.trim();
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

// ── Other tables (Interviews / Onboarding) ──
app.get("/api/table/:name", (req, res) => { res.json({ records: [] }); });
app.post("/api/table/:name", (req, res) => { res.status(400).json({ error: "Table not supported" }); });
app.patch("/api/table/:name/:id", (req, res) => { res.status(400).json({ error: "Table not supported" }); });

app.listen(PORT, "0.0.0.0", () => {
  console.log("Rekrutmen UI at http://localhost:" + PORT);
});