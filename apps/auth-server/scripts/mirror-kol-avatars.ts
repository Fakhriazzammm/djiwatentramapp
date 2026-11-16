// Satu kali jalan: salin foto Google yang masih berupa URL pihak ketiga ke pos.kol_avatars.
// Jalankan di server dengan DB_PASSWORD di environment: bun scripts/mirror-kol-avatars.ts
import { Pool } from "pg";
import { mirrorGoogleAvatar } from "../src/kol-portal";

const pool = new Pool({ host: "localhost", port: 5433, user: "supabase_admin", password: process.env.DB_PASSWORD, database: "postgres" });
const rows = (await pool.query(`select source_id, avatar_url from pos.kol_creators where avatar_url ~ '^https://[a-z0-9-]+[.]googleusercontent[.]com/' order by created_at`)).rows;
let ok = 0;
let failed = 0;
for (const row of rows) {
  const stored = await mirrorGoogleAvatar(pool, row.source_id, row.avatar_url);
  if (stored) ok++; else failed++;
}
console.log(JSON.stringify({ found: rows.length, mirrored: ok, failed }));
await pool.end();
