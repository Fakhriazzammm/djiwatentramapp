# Plan: Self-Service Profile — Backfill Supabase Auth + Edit Email/Password/PIN/Data

**Dibuat:** 2026-05-21
**Project:** `/opt/djiwatentramapp`

---

## 1. Current Context

### Auth Status (sekarang)

| User | `auth_user_id` | Login → Supabase JWT? |
|------|-------|-----------------------|
| Fakhri Azzam | `test-id` | ✅ Ya |
| Admin | ❌ NULL | ❌ Tidak |
| Kasir | ❌ NULL | ❌ Tidak |
| 7 lainnya | ❌ NULL | ❌ Tidak |

**Root cause:** `useHybridCreateUser()` langsung insert ke `yumi_users` tanpa membuat auth user di `auth.users`. `auth_user_id` hanya terisi jika frontend kirim parameter — yang tidak pernah terjadi untuk 9/10 user.

### Halaman `/karyawan/$username` (yang sudah ada)

| Fitur | Status |
|-------|--------|
| View profile (name, slug, role) | ✅ Ada |
| Edit name, email (username), slug | ✅ Ada (state + form) |
| Edit phone, identityNumber, address, birthDate, placeOfBirth, emergencyContact | ✅ Ada (tersimpan di `raw` JSONB) |
| Change PIN (old pin → new pin) | ✅ Ada (`useHybridUpdateUserPin`) |
| Password editing via Supabase Auth | ❌ Belum ada |
| Email editing via Supabase Auth | ❌ Belum ada (email = username, tidak bisa ganti independen) |
| Kolom `email` terpisah di DB | ❌ Tidak ada |
| View payslips | ✅ Ada |
| View attendance | ✅ Ada |

### Halaman `/register` (form fields)

| Kategori | Field |
|----------|-------|
| **Personal** | fullName, email, phone, identityNumber, address, birthDate, placeOfBirth, emergencyContactName, emergencyContactPhone |
| **Employment** | roleId/roleName, startDate, employmentType, monthlySalary, dailyAllowance, shiftRate, location, username, slug, homePin |
| **Contract** | title, plainText, clauses, signature, CV |
| **Agreements** | dataIsTrue, contractApproved |

### Gap Analysis (Register → Profile)

| Field | Register | Profile | Gap |
|-------|----------|---------|-----|
| fullName | ✅ | ✅ | ❌ OK |
| email | ✅ | ✅ (as username) | ⚠️ Tidak bisa ganti email independen dari username |
| phone | ✅ | ✅ | ✅ OK |
| identityNumber | ✅ | ✅ | ✅ OK |
| address | ✅ | ✅ | ✅ OK |
| birthDate | ✅ | ✅ | ✅ OK |
| placeOfBirth | ✅ | ✅ | ✅ OK |
| emergencyContactName | ✅ | ✅ | ✅ OK |
| emergencyContactPhone | ✅ | ✅ | ✅ OK |
| startDate | ✅ | ❌ | 🔴 Belum tampil |
| employmentType | ✅ | ❌ | 🔴 Belum tampil |
| location | ✅ | ❌ | 🔴 Belum tampil |
| homePin | ✅ | ✅ (change PIN) | ✅ OK |
| password | ❌ (tidak ada di register) | ❌ | 🔴 BARU — perlu form ganti password |

---

## 2. Proposed Approach

### Arsitektur

```
                    ┌───────────────────────┐
                    │   Supabase Auth        │
                    │   auth.users           │
                    └───────┬───────────────┘
                            │ auth_user_id
                    ┌───────▼───────────────┐
                    │   yumi_users           │
                    │   (source_id, name,    │
                    │    auth_user_id,       │
                    │    email, raw)         │
                    └───────┬───────────────┘
                            │ anon key
                    ┌───────▼───────────────┐
                    │   Frontend (Profile)    │
                    │   /karyawan/$username  │
                    └───────────────────────┘
```

### Key Decisions

| # | Keputusan | Approach | Alasan |
|---|-----------|----------|--------|
| 1 | **Password** — perlu current password? | **Tidak perlu.** Langsung `supabase.auth.updateUser({ password })` | Session sudah jadi bukti auth. UX lebih simpel. |
| 2 | **Email** — confirmation email atau bypass? | **Bypass via edge function.** `supabaseAdmin.auth.admin.updateUserById({ email, email_confirm: true })` | Internal app, tidak praktis minta user cek email. |
| 3 | **Kolom email** — perlu dipisah dari username? | **Ya.** `alter table add column email text` | Username untuk login, email untuk contact + Supabase Auth. Backfill: `email = username || '@djiwa.internal'` |

### Alur per Fitur

**Ganti Password:**
```
User klik "Simpan Password"
  → Frontend: supabase.auth.updateUser({ password: newPassword })
  → Supabase: update langsung (session valid = cukup)
  → toast.success("Password berhasil diperbarui")
```
✅ **3 baris kode frontend, tanpa edge function.**

**Ganti Email:**
```
User klik "Simpan Email"
  → Frontend: invoke yumi-auth { action: "updateEmail", newEmail }
  → Edge function: supabaseAdmin.auth.admin.updateUserById(authUserId, { email, email_confirm: true })
  → Return sukses
  → toast.success("Email berhasil diperbarui")
```
✅ **Bypass confirmation, langsung生效.**

**Ganti PIN (existing):**
```
User isi old PIN + new PIN
  → invoke yumi-auth { action: "changePin", oldPin, newPin }
  → Edge function verifikasi old PIN, update hash
  → toast.success
```
✅ **Sudah ada, tidak perlu diubah.**

**Update Data Lain (existing):**
```
User edit nama, telepon, alamat, dll
  → Frontend: update yumi_users.raw langsung via anon key
  → toast.success
```
✅ **Sudah ada di `useHybridUpdateUserProfile()`, tidak perlu diubah.**

### Phase 1: Migration — Tambah Kolom `email`

**File:** `supabase/migrations/20260521000012_add_yumi_users_email.sql`

```sql
alter table public.yumi_users add column if not exists email text;

-- Backfill email untuk user existing
update public.yumi_users set email = username || '@djiwa.internal'
where email is null and username is not null;
```

**Buat juga kolom `email` di `employee_onboarding_applications`:**
```sql
alter table public.employee_onboarding_applications add column if not exists email text;
```

### Phase 2: Backfill `auth_user_id` via Edge Function

**File:** `supabase/functions/yumi-auth/index.ts`

Tambah action `"backfillAuthUsers"`:

```typescript
async function handleBackfillAuthUsers() {
  const { data: users, error } = await supabaseAdmin
    .from("yumi_users")
    .select("source_id, username, name, raw")
    .is("auth_user_id", null);

  if (error) throw error;
  if (!users?.length) return { message: "All users already have auth_user_id", count: 0 };

  let created = 0;
  const errors_list: string[] = [];

  for (const user of users) {
    try {
      const email = `${user.username}@djiwa.internal`;
      const password = user.raw?.password || crypto.randomUUID().slice(0, 12);

      const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { source_id: user.source_id, name: user.name },
      });
      if (createError) { errors_list.push(`${user.username}: ${createError.message}`); continue; }

      await supabaseAdmin
        .from("yumi_users")
        .update({ auth_user_id: authUser.user.id })
        .eq("source_id", user.source_id);

      // Hapus password dari raw setelah dipindah ke auth.users
      if (user.raw?.password) {
        const { password: _, ...rest } = user.raw;
        await supabaseAdmin.from("yumi_users").update({ raw: rest }).eq("source_id", user.source_id);
      }

      created++;
    } catch (e: any) {
      errors_list.push(`${user.username}: ${e.message}`);
    }
  }

  return { message: `Backfill complete: ${created} user`, errors: errors_list };
}
```

Tambah routing:
```typescript
case "updateEmail":
  return await handleUpdateEmail(supabaseAdmin, payload);
case "backfillAuthUsers":
  return await handleBackfillAuthUsers();
```

### Phase 2b: Action `updateEmail` di Edge Function

```typescript
async function handleUpdateEmail(supabaseAdmin: any, payload: JsonRecord) {
  const userId = normalizeUserId(payload.userId);
  const newEmail = normalizeToken(payload.newEmail);
  if (!userId || !newEmail) throw new Error("userId dan newEmail wajib");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw new Error("Format email tidak valid");

  // Dapatkan auth_user_id dari yumi_users
  const { data: user } = await supabaseAdmin
    .from("yumi_users")
    .select("auth_user_id")
    .eq("source_id", userId)
    .single();

  if (!user?.auth_user_id) throw new Error("User tidak memiliki Supabase Auth account");

  // Update email di Supabase Auth (bypass confirmation)
  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.auth_user_id, {
    email: newEmail,
    email_confirm: true,
  });
  if (error) throw error;

  // Update email di yumi_users
  await supabaseAdmin.from("yumi_users").update({ email: newEmail }).eq("source_id", userId);

  return { success: true };
}
```

### Phase 3: Update Profile Page — Password & Email Form

**File:** `apps/web/src/routes/karyawan.$username.lazy.tsx`

**Sudah ada:**
- `editEmail` state (line 82)
- `editOldPassword`, `editNewPassword` state (line 84-85)
- `isSavingProfile` state (line 86)

**Yang perlu ditambah/diubah:**

1. **Replace `editEmail` save logic** — sekarang simpan ke `username`, ganti jadi panggil edge function + update `email`
2. **Replace `editNewPassword` save logic** — sekarang simpan ke `raw.password`, ganti jadi `supabase.auth.updateUser()`
3. **Tambah section UI** untuk Auth Settings (email + password) — terpisah dari form data pribadi

```tsx
// ── Handler Update Email ──
async function handleSaveEmail() {
  if (!staff || !editEmail) return;
  setIsSavingProfile(true);
  try {
    await createClient().functions.invoke("yumi-auth", {
      body: { action: "updateEmail", userId: staff._id, newEmail: editEmail },
    });
    toast.success("Email berhasil diperbarui");
  } catch (e: any) {
    toast.error(`Gagal update email: ${e.message}`);
  } finally { setIsSavingProfile(false); }
}

// ── Handler Update Password (via Supabase Auth) ──
async function handleSavePassword() {
  if (!editNewPassword || editNewPassword.length < 6) {
    return toast.error("Password minimal 6 karakter");
  }
  setIsSavingProfile(true);
  try {
    const { error } = await createClient().auth.updateUser({ password: editNewPassword });
    if (error) throw error;
    toast.success("Password berhasil diperbarui");
    setEditNewPassword("");
  } catch (e: any) {
    toast.error(`Gagal update password: ${e.message}`);
  } finally { setIsSavingProfile(false); }
}
```

### Phase 3b: Tambah Employment Info (Readonly)

**Di form section yang sudah ada, tambah:**
```tsx
{/* Employment Info — readonly */}
<div className="space-y-2">
  <Label>Mulai Bekerja</Label>
  <p className="text-sm">{privateData?.raw?.startDate || "-"}</p>
</div>
<div className="space-y-2">
  <Label>Jenis Kepegawaian</Label>
  <p className="text-sm">{privateData?.raw?.employmentType === "probation" ? "Probation" : "Tetap" || "-"}</p>
</div>
<div className="space-y-2">
  <Label>Lokasi</Label>
  <p className="text-sm">{privateData?.raw?.location || "-"}</p>
</div>
```

### Phase 4: Update `useHybridCreateUser` — Auto Create Auth User

**File:** `apps/web/src/hooks/use-hybrid-write-actions.ts`

Setelah backfill, update `useHybridCreateUser()` agar setiap user baru **otomatis** dibuatkan Supabase Auth user:

```typescript
// Tambah di useHybridCreateUser setelah insert ke yumi_users:
try {
  const password = args?.password || crypto.randomUUID().slice(0, 12);
  const email = `${username}@djiwa.internal`;
  
  const { data: authData } = await createClient().functions.invoke("yumi-auth", {
    body: { action: "backfillAuthUsers", users: [{ sourceId, username: email, password }] },
    // Atau action baru: "createAuthUser"
  });
} catch (e) {
  console.warn("[createUser] failed to create auth user:", e);
  // Non-fatal — user tetap bisa login via custom session
}
```

---

## 3. Step-by-Step Plan

| # | Task | File | Dep |
|---|------|------|-----|
| 1 | Migration: add `email` column to yumi_users | `supabase/migrations/20260521000012_add_yumi_users_email.sql` | — |
| 2 | Edge function: add `backfillAuthUsers` + `updateEmail` actions | `supabase/functions/yumi-auth/index.ts` | — |
| 3 | Run backfill via terminal (one-time) | Terminal | #1, #2 |
| 4 | Profile page: password form (via supabase.auth.updateUser) | `karyawan.$username.lazy.tsx` | — |
| 5 | Profile page: email form (via edge function updateEmail) | `karyawan.$username.lazy.tsx` | #2 |
| 6 | Profile page: employment info (readonly) | `karyawan.$username.lazy.tsx` | — |
| 7 | Update `useHybridCreateUser` — auto create auth user on new user | `use-hybrid-write-actions.ts` | #2 |
| 8 | Deploy edge function | Terminal | #2 |
| 9 | Commit + push | Git | Semua |

### Dependency Graph

```
Level 1 (independen → paralel 🔥)
  ├── [1] Migration: add email column
  └── [2] Edge function: backfillAuthUsers + updateEmail actions

Level 2 (independen → paralel 🔥)
  ├── [3] Run backfill (one-time) ← butuh [1], [2]
  ├── [4] Profile: password form (auth.updateUser) 
  ├── [6] Profile: employment info (readonly)
  
Level 3 (dependen)
  ├── [5] Profile: email form ← butuh [2]
  └── [7] Create user auto-auth ← butuh [2]

Level 4
  ├── [8] Deploy edge function ← butuh semua perubahan
  └── [9] commit + push ← butuh [8]
```

---

## 4. Database Schema

### yumi_users (after migration)

| Column | Type | Editable? | Notes |
|--------|------|-----------|-------|
| `source_id` | text PK | ❌ | Auto-generated |
| `username` | text | ✅ | Login identifier |
| `email` | text (NEW) | ✅ via edge fn | Separate from username |
| `name` | text | ✅ | via profile |
| `role_source_id` | text FK | ❌ (admin only) | |
| `auth_user_id` | text | ❌ | Set by backfill |
| `is_active` | boolean | ❌ (admin only) | |
| `slug` | text | ✅ | via profile |
| `home_pin_fingerprint` | text | ✅ (via change PIN) | SHA256 hash |
| `raw` | jsonb | ✅ (nested fields) | phone, address, dll |

### auth.users (Supabase internal — backfill value)

| Column | Value |
|--------|-------|
| `email` | `{username}@djiwa.internal` |
| `password` | dari `raw.password` atau random |
| `email_confirmed_at` | `now()` |
| `user_metadata` | `{source_id, name}` |

---

## 5. Implementation Notes

### Tab Corruption Warning
`karyawan.$username.lazy.tsx` dan `use-hybrid-write-actions.ts` menggunakan **tab indentation**. Gunakan `execute_code` dengan Python `open()`, jangan `patch` tool untuk multi-line edits.

### File Size Warning
`use-hybrid-write-actions.ts` = 6032+ lines. Jangan gunakan `read_file` tanpa `limit` parameter. Gunakan `terminal('cat')` atau Python `open()` untuk membaca.

### Verifikasi Backfill
```bash
npx supabase db query "SELECT source_id, name, auth_user_id, email FROM yumi_users ORDER BY name;" --linked
```
Expected: 10/10 users with auth_user_id + email filled.

### Risiko

| Risiko | Mitigasi |
|--------|----------|
| Email `{username}@djiwa.internal` bentrok | Username unique → aman |
| Password di raw JSONB plaintext | Backfill hapus password dari raw setelah dipindah |
| User tidak bisa login (password berbeda) | Password dari raw atau random — kirim via admin/Telegram |
| Backfill rate limit (30 createUser/day) | Hanya 9 user → aman |
| updateEmail gagal karena email sudah dipakai | Error handling + toast.error |
