# Plan: Supabase RLS & Security Audit — Peningkatan Kemampuan Zantara

## Goal

Audit dan improve keamanan Supabase project Djiwa Tentram secara menyeluruh — RLS policies, view security, edge function auth, storage policies, dan column grants. Dokumentasikan semua temuan sebagai skill `supabase-rls-patterns` agar bisa dipakai ulang.

---

## Current Context

### Database Architecture

```
Schema publik (public.*):
  └── ~40 views (pos_*) — dibaca oleh frontend via anon key
  
Schema private (pos.*):
  └── ~20+ underlying tables — ditulis via service_role / Edge Function

Auth model: Better Auth (bukan Supabase Auth)
  → Semua request Supabase via anon role
  → `authenticated` policies TIDAK PERNAH match
  → Edge Function proxy pattern untuk admin operations
```

### Known Security Posture

| Area | Status | Notes |
|------|--------|-------|
| RLS Policies | ~30+ policies di 13 migration files | Tersebar, perlu diverifikasi coverage |
| Views (public.*) | ~40 views | Perlu cek `SELECT *` atau column leak |
| Edge Functions (8) | 3 punya auth (x-cron-secret, x-admin-secret), 5 belum diverifikasi | `yumi-ai`, `yumi-auth`, `record-financial-transaction`, `send-telegram-report` perlu dicek |
| Storage Buckets | 3 migration files tentang storage | Perlu audit policies |
| Column Grants | Pernah ada revoke all → re-grant parsial | Perlu verifikasi completeness |
| `executeSql` | Ada di `yumi-ai` fungsi | 🔴 Critical — harus dicek auth-nya |
| Plaintext Secrets | Udah difix (SHA-256 fingerprint) | Perlu verifikasi ga ada yang lolos |

---

## Step-by-Step Plan

### Phase 1: Database RLS Audit (5 subagent paralel 🔥)

**[P1] Audit semua tabel — RLS enabled?**
- Query `pg_class` untuk tabel di schema `pos.*` dan `public.*`
- Identifikasi tabel tanpa RLS
- Cek `relrowsecurity = false`

**[P2] Audit semua RLS policies — roles & coverage**
- Extract dari `pg_policies` untuk semua tabel
- Verifikasi: tiap tabel punya policy untuk SELECT, INSERT, UPDATE, DELETE?
- Tandai policy yang pakai `authenticated` (gak akan match — Better Auth!)

**[P3] Audit column grants — data leak**
- `information_schema.column_privileges` untuk anon + authenticated
- Cari: `face_descriptor`, `raw` JSONB, `password_hash`, `home_pin_hash`, dll
- Bandingkan dengan migration `0004_auth_core.sql` (revoke all) dan re-grant

**[P4] Audit view definitions — SELECT * leak?**
- Baca semua view definition dari migration files
- Cari `SELECT *` yang bisa leak column dari underlying table
- Cari view yang join ke tabel sensitif tapi gak filter column

**[P5] Audit storage bucket policies**
- Query `storage.buckets` + `storage.policies`
- Cek bucket mana yang public write
- Verifikasi contract document bucket security

### Phase 2: Edge Function Security Audit (3 subagent paralel 🔥)

**[P6] Audit edge functions tanpa auth**
- Baca `index.ts` tiap function
- Cek: ada auth check? (JWT, secret header, API key)
- Prioritas: `yumi-ai` (executeSql!), `record-financial-transaction`, `send-telegram-report`

**[P7] Audit executeSql risk**
- `yumi-ai` punya action `executeSql` — siapa yang bisa panggil?
- Cek auth guard-nya
- Dokumentasi risk level

**[P8] Audit CORS & deployment config**
- Cek `config.toml` untuk tiap function
- verifyJWT setting
- CORS headers

### Phase 3: Research & Skill Creation (sequential)

**[P9] Research advanced RLS patterns**
- Subquery in policies (multi-tenant)
- Recursive policies
- Custom claims for fine-grained access
- RLS performance optimization

**[P10] Buat skill `supabase-rls-patterns`**
- Semua temuan audit
- Pattern untuk project Better Auth + Supabase
- Debug checklist untuk "data exists but empty"
- Column grant template yang benar

### Phase 4: Implementation (sequential)

**[P11] Fix temuan critical**
- Tambah auth ke edge function yang belum
- Fix view yang leak column
- Tambah RLS policy yang missing
- Fix column grants yang kurang

**[P12] Build & verify**
- `turbo build` (no type errors)
- Test di browser untuk admin pages
- Verifikasi: semua halaman yang pake CRUD masih jalan

---

## Files Likely to Change

| File | Change |
|------|--------|
| `supabase/migrations/NNNNN_fix_rls_audit.sql` | Migration baru untuk fix RLS |
| `supabase/functions/yumi-ai/index.ts` | Tambah auth guard |
| `supabase/functions/record-financial-transaction/index.ts` | Verifikasi / tambah auth |
| `supabase/functions/send-telegram-report/index.ts` | Verifikasi / tambah auth |
| `supabase/functions/yumi-auth/index.ts` | Verifikasi auth pattern |
| `supabase/migrations/NNNNN_fix_view_definitions.sql` | Fix view yang leak |
| `.hermes/skills/supabase-rls-patterns/SKILL.md` | **BARU** — skill documentation |

---

## Dependency Graph

```
📊 Dependency Graph:

Level 1 (independen → paralel 🔥) — 5 subagent
  ├── [P1] Audit RLS enabled? 
  ├── [P2] Audit RLS policies coverage
  ├── [P3] Audit column grants
  ├── [P4] Audit view definitions  
  └── [P5] Audit storage policies

Level 2 (independen → paralel 🔥) — 3 subagent
  ├── [P6] Audit edge function auth
  ├── [P7] Audit executeSql risk
  └── [P8] Audit CORS & config

Level 3 (dependen → sequential)
  ├── [P9] Research advanced patterns ← butuh [P1]-[P8]
  └── [P10] Buat skill supabase-rls-patterns ← butuh [P9]

Level 4 (dependen → sequential)
  ├── [P11] Fix temuan critical ← butuh [P10]
  └── [P12] Build & verify ← butuh [P11]

🔥 Wave 1: [P1]-[P5] — 5 subagent paralel
🔥 Wave 2: [P6]-[P8] — 3 subagent paralel
👤 Kamu: [P9] Research, [P10] Skill creation
👤 Kamu: [P11] Fix implementation, [P12] Build & verify
```

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migration baru mengubah RLS yang udah jalan | Admin pages bisa error | Test di staging / local dulu |
| View fix (SELECT * → column explicit) | Frontend minta column yang gak ada | Bandingkan dengan frontend query |
| Auth baru di edge function | Frontend yang panggil bisa 401 | Cek caller frontend & update |
| ExecuteSql di-yumi-ai di-hardening | AI feature bisa break | Buat auth gradual: log dulu, baru block |

---

## Verification

```
[ ] Phase 1: Semua tabel punya RLS enabled?
[ ] Phase 1: Tidak ada column leak ke anon?
[ ] Phase 1: View tidak SELECT * dari tabel sensitif?
[ ] Phase 1: Storage bucket policies aman?
[ ] Phase 2: Semua edge function punya auth?
[ ] Phase 2: executeSql terproteksi?
[ ] Phase 4: Build success (turbo build)
[ ] Phase 4: Admin CRUD masih jalan
[ ] Phase 4: AI features masih jalan
[ ] Phase 3: Skill supabase-rls-patterns terbuat
```
