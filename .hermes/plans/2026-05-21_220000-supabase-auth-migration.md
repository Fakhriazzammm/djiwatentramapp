# Migrasi Auth: BetterAuth + Yumi Auth Custom → Supabase Auth

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Konsolidasi 3 sistem auth (BetterAuth, Yumi Auth custom, Supabase Auth terpasang tapi tidak aktif) menjadi **1 sistem: Supabase Auth**.

**Architecture:** Dual-session transisi (Fase 1) → RLS proper (Fase 2) → Bersih-bersih (Fase 3). Zero downtime, zero operasional disruption.

**Tech Stack:** Supabase Auth + `@supabase/ssr` + custom claims di JWT

---

## Current Context

### Masalah Saat Ini

| Auth System | Digunakan Untuk | Status |
|---|---|---|
| **BetterAuth v1.4.9** | Sign-in form email/password | ✅ Dependency terinstall, ada `auth-client.ts`, **tapi VITE_AUTH_URL=localhost:3000 — server tidak jalan**. Praktis mati. |
| **Yumi Auth (custom)** | PIN login karyawan | ✅ Edge Function `yumi-auth/index.ts` — validasi PIN bcrypt, simpan session ke `yumi_sessions`, return custom token |
| **Supabase Auth** | RLS / DB queries | ✅ `auth.users` sudah terisi (migration 0012). `@supabase/ssr` sudah terinstall. **Tapi session tidak pernah di-set — berjalan anonymous.** |

### Security Migration 20260521 (sudah dilakukan)

```sql
-- Tercatat di migration:
-- "Note: With Better Auth, auth.uid() is always NULL (no Supabase Auth session)."
-- "This means owner-based policies will effectively deny UPDATE/DELETE to all anon users."
```

RLS tidak bisa membedakan user karena `auth.uid()` selalu NULL.

## Alternatives Analysis

### Option A: Dual Session → Pure Supabase Auth ✅ (RECOMMENDED)

| Fase | Perubahan | Dampak |
|---|---|---|
| Fase 1 | Edge Function login juga buat Supabase session | ✅ 0 dampak. Custom token tetap jalan. |
| Fase 2 | RLS diperketat pakai custom claims | ✅ Semua user udah login ulang (natural via Fase 1) |
| Fase 3 | Hapus BetterAuth + Yumi Auth custom | ✅ Stabil |

**Pros:** Zero downtime, bisa deploy bertahap, risk rendah
**Cons:** Ada transisi dual-session

### Option B: Langsung potong ke Supabase Auth

**Pros:** Lebih cepat
**Cons:** Semua user harus login ulang bersamaan. Risiko tinggi kalau error.

### Option C: Abaikan — Biarkan hybrid

**Pros:** Tidak ada kerja
**Cons:** 3 sistem auth yang tidak konsisten. RLS tidak bisa dipakai. Keamanan data lemah.

## Database Schema (Tidak Berubah — Hanya Pemahaman)

### `auth.users` (Supabase internal) — SUDAH TERISI
```
id            → UUID primary key
email         → username dari yumi_users (lowercase)
raw_user_meta_data → { name, source_id, slug, role_source_id, is_active, receive_report_emails }
```

### `public.yumi_users` — existing
```
source_id         → PK
auth_user_id      → UUID → auth.users.id (sudah diisi migration 0012)
name, username, password_hash, home_pin_hash, home_pin_fingerprint
role_source_id    → FK → yumi_roles
```

### `public.yumi_sessions` — akan dihapus di Fase 3
```
token, user_source_id, expires_at, last_seen_at
```
Custom session table — tidak diperlukan lagi setelah migrasi.

---

## Data Correlation & Sync — Critical Path

### Entity Relationship Map

```
auth.users                          yumi_users                         yumi_roles
┌──────────────────┐               ┌──────────────────────┐           ┌──────────────────┐
│ id (UUID)        │◄──1:1──────►│ auth_user_id (UUID)  │           │ source_id        │
│ email            │               │ source_id (PK)       │           │ name             │
│ raw_user_meta_data│              │ name                 │           │ permissions[]    │
│  ├─ source_id    │               │ role_source_id       │──FK──►    └──────────────────┘
│  ├─ role_name    │               │ home_pin_hash        │                      │
│  └─ is_active    │               │ is_active            │                      │
└──────────────────┘               └──────────────────────┘                      │
         │                                  │                                     │
         │        ┌─────────────────┐       │          ┌──────────────────┐       │
         │        │ yumi_sessions   │       │          │ pos schema tables│       │
         │        │ (Fase 3 dihapus)│       │          │ (products,        │       │
         │        │ token           │───────┤          │  inventory, etc.) │       │
         │        │ user_source_id  │◄──────┘          │ source_id         │───────┘
         │        └─────────────────┘                  └──────────────────┘
         │
         │        ┌─────────────────────────┐
         └────────►│ pos_users_public (view)  │
                  │ SELECT dari yumi_users  │
                  └─────────────────────────┘
```

### 1️⃣ `auth.users` ↔ `yumi_users` — Kunci Utama

**Kondisi saat ini (migration 0012):**
- ✅ Semua `yumi_users` sudah punya `auth_user_id` → `auth.users.id`
- ✅ `raw_user_meta_data` di `auth.users` menyimpan `source_id`, `name`, `role_source_id`, `is_active`
- ✅ PIN hash tetap di `yumi_users` (tidak di-sync ke `auth.users`)

**Yang HARUS dijaga:**

| Event | yumi_users | auth.users | Sinkron |
|---|---|---|---|
| Karyawan baru dibuat | INSERT → otomatis generate source_id | **HARUS INSERT** → auth.users baru, set auth_user_id | ✅ Via Edge Function atau trigger |
| Karyawan diaktifkan/dinonaktifkan | UPDATE is_active | UPDATE raw_user_meta_data->>'is_active' | ✅ Di Fase 2 via trigger |
| Role karyawan berubah | UPDATE role_source_id | UPDATE raw_user_meta_data->>'role_source_id' | ✅ Di Fase 2 via trigger |
| Nama karyawan berubah | UPDATE name | UPDATE raw_user_meta_data->>'name' | ✅ Di Fase 2 via trigger |
| PIN berubah | UPDATE home_pin_hash | **TIDAK PERLU** — PIN tetap di yumi_users | ✅ Aman |

### 2️⃣ Safety Net — Trigger PostgreSQL (Fase 2)

Buat trigger agar perubahan di `yumi_users` otomatis sync ke `auth.users`:

```sql
-- Trigger function: sync yumi_users → auth.users
create or replace function public.sync_yumi_user_to_auth()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.auth_user_id is not null then
    update auth.users
    set raw_user_meta_data = jsonb_build_object(
      'source_id', new.source_id,
      'name', new.name,
      'slug', new.slug,
      'role_source_id', new.role_source_id,
      'is_active', new.is_active,
      'receive_report_emails', new.receive_report_emails
    )
    where id = new.auth_user_id::uuid;
  end if;
  return new;
end;
$$;

create trigger trg_sync_yumi_user_to_auth
  after update of name, slug, role_source_id, is_active on public.yumi_users
  for each row
  execute function public.sync_yumi_user_to_auth();
```

### 3️⃣ User Baru — Dual Insert (Edge Function)

Saat admin membuat karyawan baru via UI (CRUD di `/admin/operational-team`):

**Flow saat ini:** INSERT ke `yumi_users` → selesai. ❌ Tidak ada auth.user.

**Flow baru (Fase 2):** 
1. INSERT ke `yumi_users` → simpan `source_id`
2. Panggil `supabaseAdmin.auth.admin.createUser()` → dapat `auth_user_id`
3. UPDATE `yumi_users.auth_user_id` dengan hasil step 2

**Implementasi di Edge Function atau RPC:**

```sql
-- RPC function: create karyawan + auth user in one transaction
create or replace function public.create_karyawan_with_auth(
  p_name text,
  p_username text,
  p_role_source_id text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_source_id text;
  v_auth_user_id uuid;
  v_result jsonb;
begin
  -- 1. Insert ke yumi_users
  v_source_id := 'yu_' || gen_random_uuid()::text;
  
  insert into public.yumi_users (
    source_id, name, username, role_source_id,
    home_pin_hash, is_active,
    created_at, updated_at
  ) values (
    v_source_id, p_name, p_username, p_role_source_id,
    crypt(p_pin, gen_salt('bf')), true,
    now(), now()
  );
  
  -- 2. Buat auth.users
  v_auth_user_id := gen_random_uuid();
  
  -- Catatan: INSERT langsung ke auth.users hanya bisa via 
  -- supabaseAdmin.auth.admin.createUser() dari Edge Function
  -- atau via trigger dari public schema
  
  -- 3. Update auth_user_id
  update public.yumi_users
  set auth_user_id = v_auth_user_id::text
  where source_id = v_source_id;
  
  return jsonb_build_object(
    'source_id', v_source_id,
    'auth_user_id', v_auth_user_id,
    'status', 'created'
  );
end;
$$;
```

**Atau lebih aman: buat Edge Function `onboarding-admin`** yang handle dual insert:
```
POST /functions/v1/onboarding-admin
Body: { action: "createUser", name, username, roleId, pin }
Edge Function:
  1. INSERT ke yumi_users (service_role)
  2. supabaseAdmin.auth.admin.createUser() (service_role)
  3. UPDATE yumi_users.auth_user_id
```

### 4️⃣ User Dinonaktifkan — Cascade Sync

Ketika admin menonaktifkan karyawan (`is_active = false`):

```sql
-- Trigger untuk sync deactivation
create or replace function public.deactivate_yumi_user()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.is_active = false and (old.is_active = true or old.is_active is null) then
    -- 1. Revoke semua session di yumi_sessions
    delete from public.yumi_sessions where user_source_id = new.source_id;
    
    -- 2. Revoke Supabase Auth session
    -- Note: Via Edge Function — tidak bisa dari SQL langsung
    -- Alternatif: set raw_user_meta_data → is_active = false
    update auth.users
    set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('is_active', false),
        banned_until = now() + interval '100 years'
    where id = new.auth_user_id::uuid;
  end if;
  
  if new.is_active = true and old.is_active = false then
    -- Reactivate
    update auth.users
    set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('is_active', true),
        banned_until = null
    where id = new.auth_user_id::uuid;
  end if;
  
  return new;
end;
$$;
```

### 5️⃣ Edge Functions — Tidak Terpengaruh

Semua Edge Functions menggunakan `service_role` key → **query langsung ke database**.
Tidak peduli auth system mana yang dipakai.

| Edge Function | Query | Sumber Data | Terpengaruh? |
|---|---|---|---|
| `yumi-auth` | yumi_users, yumi_sessions | Langsung via service_role | ❌ Tidak |
| `yumi-ai` | yumi_users, pos.products, dll | Langsung via service_role | ❌ Tidak |
| `auto-close-shifts` | pos.orders, pos.shifts | Langsung via service_role | ❌ Tidak |
| `send-telegram-report` | shift data | Langsung via service_role | ❌ Tidak |
| `record-financial-transaction` | transaksi | Langsung via service_role | ❌ Tidak |
| `onboarding-admin` | yumi_users | Langsung via service_role | ❌ Tidak |

### 6️⃣ Frontend Queries — Kritis di Fase 2

Sekarang: `createClient().schema("pos").from("products").select("*")` → anon (bisa akses semua)

Nanti: `createClient().schema("pos").from("products").select("*")` → authenticated + RLS

**Yang HARUS di-verify sebelum Fase 2:**
```typescript
// Setiap hook/komponen yang panggil createClient()
//  1. Apakah user sudah login (punya Supabase session)?
//  2. Apakah RLS policy allow query ini untuk role user?
//  3. Kalau belum login (halaman publik), apakah query masih berfungsi?
```

**Daftar file yang perlu di-audit:**
- `apps/web/src/hooks/use-hybrid-pos-data.ts`
- `apps/web/src/hooks/use-hybrid-write-actions.ts`
- `apps/web/src/hooks/use-hybrid-attendance-data.ts`
- `apps/web/src/hooks/use-hybrid-inventory-data.ts`
- `apps/web/src/hooks/use-hybrid-payroll-data.ts`
- Semua file yang import `createClient()` dari `@/lib/client`

### 7️⃣ `pos_users_public` View — Tidak Berubah

View ini SELECT dari `yumi_users` — tetap berfungsi selama `yumi_users` masih ada.
Tidak perlu perubahan. Hanya perlu pastikan RLS-nya allow:
```sql
grant select on public.pos_users_public to anon, authenticated;
```

### 8️⃣ Data Consistency Checksheet Sebelum Fase 2

Sebelum RLS diperketat, verifikasi:

- [ ] Semua `yumi_users` punya `auth_user_id` yang valid
  ```sql
  select count(*) from public.yumi_users u
  left join auth.users a on a.id = u.auth_user_id::uuid
  where u.auth_user_id is null or a.id is null;
  -- Expected: 0
  ```
- [ ] Semua `auth.users.raw_user_meta_data` berisi `source_id` yang match
  ```sql
  select count(*) from auth.users a
  join public.yumi_users u on u.auth_user_id = a.id::text
  where a.raw_user_meta_data->>'source_id' <> u.source_id;
  -- Expected: 0
  ```
- [ ] Semua user aktif di `yumi_users` juga aktif di `auth.users`
  ```sql
  select u.source_id, u.name from public.yumi_users u
  join auth.users a on a.id = u.auth_user_id::uuid
  where u.is_active = true and a.banned_until is not null;
  -- Expected: 0
  ```
- [ ] Tidak ada `yumi_sessions` yang reference user non-existent
  ```sql
  select count(*) from public.yumi_sessions s
  left join public.yumi_users u on u.source_id = s.user_source_id
  where u.source_id is null;
  -- Expected: 0
  ```

### 9️⃣ Rollback Plan

Kalau terjadi masalah setelah Fase 2:

```sql
-- Rollback: Kembalikan RLS ke anon all
create policy "anon_all_yumi_users" on public.yumi_users
  for all to anon, authenticated
  using (true)
  with check (true);

-- Revoke hanya untuk authenticated
grant insert, update, delete on public.yumi_users to anon;
```

Frontend: Tidak perlu rollback — custom token masih jalan, Supabase session bonus.

---

## Status Progress

### ✅ Fase 1 (Selesai — 21 May 2026)
- Edge Function `yumi-auth`: loginWithPin juga buat Supabase Auth session
- Frontend `yumi-auth-client.ts`: setSession setelah login + signOut saat logout
- Build & Deployed ✅

### ✅ Fase 2 Preparasi (Selesai — 21 May 2026)
- SQL migration `20260522_supabase_auth_preparatory.sql` — deployed ✅
  - `sync_yumi_user_to_auth()` trigger ✅
  - `deactivate_yumi_user()` trigger ✅
  - `get_yumi_user_claims()` function ✅
- Frontend audit — 30 file dengan `createClient()` teridentifikasi ✅
- RLS proper **menunggu** semua user login ulang via Fase 1

### ✅ Fase 3.1 — Hapus BetterAuth (Selesai — 21 May 2026)
- `auth-client.ts`, `sign-in-form.tsx`, `sign-up-form.tsx` — **Dihapus** ✅
- `better-auth` dari `package.json` — **Dihapus** ✅
- 5 file masih import authClient — **Diperbaiki** ✅
- Build sukses, bundle size −38 kB ✅

### ✅ Fase 3.2 (Partial) — Supabase Session Recovery (Selesai — 21 May 2026)
- `validateYumiSession`: cek Supabase session FIRST via claims RPC ✅
- `useYumiAuth`: recoverFromSupabaseSession saat token lokal hilang ✅
- Users dengan Supabase session tidak butuh localStorage token ✅

### 📦 Siap Deploy (Menunggu User Login Ulang)
- `20260522_supabase_auth_preparatory.sql` — **SUDAH DEPLOYED** ✅
- `20260523_rls_tighten.sql` — **SIAP DEPLOY** ⏳
  - Revoke anon write + policy admin-only untuk yumi_users/yumi_roles
  - Revoke anon schema pos + policy authenticated
  - Revoke yumi_sessions (hanya service_role)
  - Restore anon SELECT untuk public views

## Plan Detail

---

## Fase 1: Dual Session — Supabase Auth + Custom Token Berjalan Bersama

### Task 1.1: Ubah Edge Function `yumi-auth` — loginWithPin juga buat Supabase session

**File:** `supabase/functions/yumi-auth/index.ts`

**Perubahan:**
Setelah PIN validasi berhasil dan sebelum return response, tambahkan:

```typescript
// Dapatkan auth_user_id dari yumi_users
const { data: userRecord } = await supabaseAdmin
  .from("yumi_users")
  .select("auth_user_id")
  .eq("source_id", user.source_id)
  .single();

let accessToken: string | null = null;
let refreshToken: string | null = null;

if (userRecord?.auth_user_id) {
  // Buat Supabase session untuk user ini
  const { data: sessionData, error: sessionError } = 
    await supabaseAdmin.auth.admin.createSession({
      user_id: userRecord.auth_user_id,
    });
  
  if (!sessionError && sessionData) {
    accessToken = sessionData.access_token;
    refreshToken = sessionData.refresh_token;
  }
}
```

**Response ditambah:**
```typescript
return {
  token,               // Custom token (existing — backward compat)
  expiresAt,
  user: { ... },
  supabaseAccessToken: accessToken,   // NEW
  supabaseRefreshToken: refreshToken, // NEW
};
```

**⚠️ Catatan:** `supabaseAdmin.auth.admin.createSession()` memerlukan Supabase Management API atau `service_role` key yang sudah dipakai. Fungsi ini membuat session yang valid di `auth.sessions`.

### Task 1.2: Ubah frontend `yumi-auth-client.ts` — set Supabase session setelah login

**File:** `apps/web/src/lib/yumi-auth-client.ts`

**Perubahan di `loginWithYumiPin`:**
Setelah menerima response dari Edge Function, jika ada `supabaseAccessToken`:
```typescript
import { createClient } from "@/lib/client";

// ... setelah dapat response ...
if (response.supabaseAccessToken && response.supabaseRefreshToken) {
  const supabase = createClient();
  await supabase.auth.setSession({
    access_token: response.supabaseAccessToken,
    refresh_token: response.supabaseRefreshToken,
  });
}
```

**Perubahan di `validateYumiSession`:**
Untuk session valid, pastikan Supabase session masih aktif:
```typescript
// Setelah validasi custom token berhasil
if (typeof window !== "undefined") {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    // Coba refresh — user mungkin sessionnya expired
    const { error: refreshError } = await supabase.auth.refreshSession();
    // Kalau gagal, tidak masalah — custom token masih valid
  }
}
```

### Task 1.3: Ubah frontend `yumi-auth-client.ts` — logout juga dari Supabase

**Perubahan di `logoutYumiSession`:**
```typescript
try {
  const supabase = createClient();
  await supabase.auth.signOut();
} catch {
  // Silent — custom token tetap dihapus
}
// ... existing custom session logout ...
```

### Task 1.4: Build & Deploy

```bash
# Verifikasi build
cd /opt/djiwatentramapp/apps/web && bun run build

# Deploy Edge Function
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" npx supabase functions deploy yumi-auth --no-verify-jwt --project-ref xaemykhjpkgypqqpfdcb
```

**Verifikasi:**
1. Login PIN seperti biasa — harus tetap berhasil
2. Cek console → `supabase.auth.getSession()` harus return session valid
3. Cek `auth.sessions` di Supabase Dashboard → ada session baru
4. User lama yang belum login ulang — tetap bisa pakai custom token

---

## Fase 2: RLS Proper + Custom Claims

### Task 2.1: Migration SQL — tambah custom claims untuk role/permissions

**File:** `supabase/migrations/20260522_custom_jwt_claims.sql`

```sql
-- Function to get user claims for JWT
create or replace function public.get_yumi_user_claims()
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  claims jsonb;
begin
  select jsonb_build_object(
    'role_name', r.name,
    'permissions', coalesce(r.permissions, '[]'::jsonb),
    'source_id', u.source_id,
    'name', u.name
  ) into claims
  from auth.users au
  join public.yumi_users u on u.auth_user_id = au.id
  left join public.yumi_roles r on r.source_id = u.role_source_id
  where au.id = auth.uid();
  
  return coalesce(claims, '{}'::jsonb);
end;
$$;

-- Grant access
grant execute on function public.get_yumi_user_claims to authenticated;

-- Create a hook to inject claims (Supabase Auth hook)
-- Note: This requires the custom claims hook to be registered via SQL or Dashboard
```

### Task 2.2: Migration SQL — perketat RLS berdasarkan custom claims

```sql
-- Revoke anon write access dari yumi_users
revoke insert, update, delete on public.yumi_users from anon;

-- Update RLS untuk yumi_users: hanya user yang punya role admin bisa write
drop policy if exists "anon_insert_users" on public.yumi_users;
drop policy if exists "anon_update_users" on public.yumi_users;
drop policy if exists "anon_delete_users" on public.yumi_users;

create policy "admin_insert_users" on public.yumi_users
  for insert to authenticated
  with check (
    public.get_yumi_user_claims()->>'role_name' = 'admin'
  );

create policy "admin_update_users" on public.yumi_users
  for update to authenticated
  using (public.get_yumi_user_claims()->>'role_name' = 'admin')
  with check (true);

create policy "admin_delete_users" on public.yumi_users
  for delete to authenticated
  using (public.get_yumi_user_claims()->>'role_name' = 'admin');
```

### Task 2.3: Migration SQL — perketat RLS untuk tabel operasional

```sql
-- Revoke anon dari tabel pos schema
revoke all on schema pos from anon;

-- Update policy: hanya authenticated users
create policy "pos_products_auth_all" on pos.products
  for all to authenticated
  using (true)
  with check (true);

-- ... repeat for all pos schema tables
-- Untuk write-sensitive tables, tambah role check:
create policy "pos_inventory_admin_write" on pos.inventory
  for insert to authenticated
  with check (public.get_yumi_user_claims()->>'role_name' in ('admin', 'owner'));
```

### Task 2.4: Hapus fallback local session (base64 local session)

**File:** `apps/web/src/lib/yumi-auth-client.ts`

Setelah semua user login ulang via Supabase session:
- Hapus `LOCAL_TOKEN_PREFIX` logic
- Hapus `encodeLocalSession` / `decodeLocalSession`
- Hapus fallback `sha256Hex` PIN verification client-side

---

## Fase 3: Bersih-bersih — Hapus BetterAuth + Yumi Auth Custom

### Task 3.1: Hapus BetterAuth

**Files:**
- `apps/web/src/lib/auth-client.ts` — **HAPUS**
- Remove `better-auth` from `package.json`

**Frontend:**
- `apps/web/src/components/sign-in-form.tsx` — ganti ke Supabase Auth UI atau hapus jika tidak dipakai
- `apps/web/src/components/sign-up-form.tsx` — hapus

### Task 3.2: Ubah `useYumiAuth` — ganti session validation ke Supabase Auth

**File:** `apps/web/src/hooks/useYumiAuth.tsx`

- Ubah `validateYumiSession` → gunakan `supabase.auth.getUser()` + custom claims dari JWT
- Ubah `logout` → `supabase.auth.signOut()`
- Hapus `localStorage` session logic

### Task 3.3: Drop `yumi_sessions` table

**File:** Migration SQL

```sql
-- Setelah memastikan tidak ada yang menggunakan custom token
drop table if exists public.yumi_sessions;
```

### Task 3.4: Hapus `listPublicUsers` dari Edge Function

Setelah RLS dan views sudah proper, `listPublicUsers` bisa diganti dengan query langsung ke view `pos_users_public` via Supabase client yang sudah punya session valid.

---

## Files Changed (Complete List)

### Fase 1 (Prioritas — Zero Risk)
| File | Perubahan |
|---|---|
| `supabase/functions/yumi-auth/index.ts` | Tambah `supabaseAdmin.auth.admin.createSession()` di loginWithPin |
| `apps/web/src/lib/yumi-auth-client.ts` | Tambah `supabase.auth.setSession()` setelah login |
| `apps/web/src/lib/yumi-auth-client.ts` | Tambah `supabase.auth.signOut()` di logout |

### Fase 2 (Setelah Stabil)
| File | Perubahan |
|---|---|
| `supabase/migrations/20260522_custom_jwt_claims.sql` | NEW — Function + claims hook |
| `supabase/migrations/20260523_rls_tighten.sql` | NEW — RLS policies proper |
| `apps/web/src/lib/yumi-auth-client.ts` | Hapus local session fallback |

### Fase 3 (Setelah Semua Pindah)
| File | Perubahan |
|---|---|
| `apps/web/src/lib/auth-client.ts` | HAPUS |
| `apps/web/src/components/sign-in-form.tsx` | Hapus atau ganti |
| `apps/web/src/components/sign-up-form.tsx` | Hapus atau ganti |
| `apps/web/src/hooks/useYumiAuth.tsx` | Ganti ke Supabase Auth |
| `package.json` | Hapus better-auth |
| Migration SQL | Drop yumi_sessions |

## Verification Plan

### Setelah Fase 1
- [ ] Login PIN → cek console `supabase.auth.getSession()` → harus ada session
- [ ] Cek `auth.sessions` di Supabase Dashboard → ada session baru
- [ ] Cek `auth.users` → `last_sign_in_at` terupdate
- [ ] Build: `cd /opt/djiwatentramapp/apps/web && bun run build` → sukses
- [ ] Edge Function: deploy & test via `supabase functions serve` atau langsung invoke

### Setelah Fase 2
- [ ] Cek RLS: user staff tidak bisa insert ke `yumi_users` → error
- [ ] Cek RLS: user admin bisa insert → sukses
- [ ] Cek query: `createClient().from("pos.products").select("*")` → masih berfungsi
- [ ] Cek query: `createClient().from("yumi_users").select("home_pin_hash")` → harus error (column-level revoked)

### Setelah Fase 3
- [ ] BetterAuth tidak ada di dependencies → build sukses
- [ ] `sign-in-form.tsx` tidak dipanggil di mana pun → aman hapus
- [ ] `yumi_sessions` table empty → aman drop

## Risks & Mitigation

| Risk | Mitigation |
|---|---|
| `supabaseAdmin.auth.admin.createSession()` error | Return tetap sukses — custom token tetap jalan. Supabase session bonus. |
| User login dari device lama (browser cached session) | Tidak masalah — custom token tetap valid. |
| RLS terlalu ketat — user tidak bisa akses fitur | Uji di staging dulu. Rollback migration jika ada yang broken. |
| BetterAuth sign-in form broken | Tidak masalah — VITE_AUTH_URL=localhost, server tidak jalan. Praktis mati. |

## Integration Points

### AI/LLM - Yumi AI
- `yumi-ai` Edge Function menggunakan `service_role` key → **tidak terpengaruh**
- Query AI ke database tetap via `supabaseAdmin` → tidak perlu JWT

### Telegram Bot
- Bot menggunakan `service_role` key → **tidak terpengaruh**

### POS Hardware
- Integrasi kamera/face recognition ada di frontend → **tidak terpengaruh** (session tetap jalan via localStorage)

### Purchasing Agent
- Menggunakan Edge Functions + `service_role` → **tidak terpengaruh**

---

## Execution Order

```
Fase 1 → Build → Deploy → Tunggu 1-2 hari
    ↓ (semua user login ulang natural)
Fase 2 → Migration SQL → Build → Deploy
    ↓ (stabil 1 minggu)
Fase 3 → Hapus BetterAuth → Build → Deploy
```
