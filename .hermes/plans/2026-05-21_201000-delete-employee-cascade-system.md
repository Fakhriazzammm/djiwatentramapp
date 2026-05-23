# Plan: Delete Employee Cascade System

**Created:** 2026-05-21 20:10  
**Goal:** Sinkronkan delete karyawan di semua halaman admin, cascade hapus semua data terkait, pakai ConfirmationModal.

---

## 1. Analisis Masalah

### Tabel Relasi 1 Karyawan

```
employee_onboarding_applications (register/onboarding & riwayat)
  ├── id (UUID primary key)
  ├── approved_user_source_id ──→ pos_users_public._id
  └── seluruh data aplikasi (JSONB)

pos_users_public (karyawan/data)
  └── _id = approved_user_source_id ──→ hubungan ke aplikasi

yumi_users (auth login)
  └── source_id = pos_users_public._id ──→ hubungan ke user
```

### Status Saat Ini

| Halaman | Data Source | Ada Delete? | Cascade? | Popup? |
|---------|-------------|:-----------:|:--------:|:------:|
| `/register/onboarding` | `employee_onboarding_applications` | ✅ | ✅ via edge function | ❌ `window.confirm` |
| `/register/riwayat` | `employee_onboarding_applications` | ✅ | ✅ via edge function | ❌ `window.confirm` |
| `/karyawan/` (overview) | `pos.users` view | ✅ | ❌ Only `yumi_users` | ✅ ConfirmationModal |
| `/karyawan/data` | `pos_users_public` | ❌ | N/A | N/A |

### Masalah Utama

1. **Edge function `delete-employee-cascade`** hanya menerima `ids` (application UUID) — tidak menerima `source_ids` (pos_users_public._id). Karyawan pages tidak bisa pakai.
2. **Karyawan overview** (`useHybridDeleteUser`) hapus dari `yumi_users` SAJA — data onboarding & pos_users_public tetap ada.
3. **Karyawan data** tidak punya tombol delete sama sekali.
4. **Onboarding & riwayat** pakai `window.confirm` — tidak konsisten dengan ConfirmationModal yang sudah dipakai di karyawan overview.
5. **Edge function belum hapus face descriptor** — data wajah di `public.yumi_users.face_descriptor` perlu dibersihkan.

---

## 2. Dependency Graph

```
Level 1 (independen → paralel 🔥)
  ├── [1] Edge function: tambah parameter source_ids
  └── [2] ConfirmationModal: tambah subtitle, loading state

Level 2 (dependen → sequential — butuh [1] & [2])
  ├── [3] KaryawanOverview.tsx — ganti delete → cascade edge function + ConfirmationModal
  ├── [4] data.lazy.tsx — tambah tombol delete + ConfirmationModal + cascade
  ├── [5] onboarding.lazy.tsx — ganti window.confirm → ConfirmationModal
  └── [6] riwayat.lazy.tsx — ganti window.confirm → ConfirmationModal

Level 3 (verifikasi)
  └── [7] Build check, deploy edge function, commit
```

---

## 3. Task Detail

### Task 1: Edge Function — Tambah `source_ids` Parameter

**File:** `supabase/functions/delete-employee-cascade/index.ts`

**Perubahan:**
- Accept `source_ids: string[]` (opsional) di samping `ids`
- Jika `source_ids` diberikan:
  1. Cari applications WHERE `approved_user_source_id` IN source_ids
  2. Hapus `pos_users_public` WHERE `_id` IN source_ids
  3. Hapus `yumi_users` WHERE `source_id` IN source_ids
  4. Hapus `employee_onboarding_applications` WHERE hasil lookup
- Jika `ids` diberikan: behavior existing (tidak berubah)
- Tambah validasi: minimal salah satu dari `ids` atau `source_ids` harus diisi

**Contoh payload baru:**
```json
// Mode source_ids (dari karyawan pages)
{ "source_ids": ["usr_xxx", "usr_yyy"] }

// Mode ids (existing, dari onboarding/riwayat pages)
{ "ids": ["uuid-xxx", "uuid-yyy"] }
```

### Task 2: ConfirmationModal — Improve

**File:** `apps/web/src/components/ui/confirmation-modal.tsx`

**Perubahan:**
- Tambah prop opsional `subtitle?: string` — teks kecil di bawah judul
- Tambah prop opsional `loading?: boolean` — disable tombol konfirmasi + spinner
- Pesan (message) support multi-line dengan line breaks

### Task 3: KaryawanOverview — Cascade Delete

**File:** `apps/web/src/routes/admin/operational-team/-components/KaryawanOverview.tsx`

**Perubahan:**
- Hapus penggunaan `useHybridDeleteUser`
- Tambah fungsi `cascadeDeleteUsers(sourceId: string)` panggil edge function
- Update `handleDelete`:
  - Panggil edge function dengan `source_ids: [user._id]`
  - Update message ConfirmationModal jadi lebih detail

**Confirmation title:** "Hapus Karyawan?"
**Confirmation message:**
```
Yakin ingin menghapus <nama>?
Seluruh data terkait akan terhapus permanen dari:
• Pendaftaran onboarding
• Riwayat kontrak
• Daftar data karyawan
• Akun login
```

### Task 4: Karyawan Data — Tambah Delete

**File:** `apps/web/src/routes/admin/operational-team/karyawan/data.lazy.tsx`

**Perubahan:**
- Import ConfirmationModal, cascade function
- Tambah state: `confirmDelete` (ConfirmationModal props), `deletingIds` (Set)
- Tambah tombol delete (Trash2) per baris
- Tambah bulk delete (checkbox + hapus terpilih)
- Panggil edge function dengan `source_ids: [row._id]`

### Task 5: Onboarding — Ganti Popup

**File:** `apps/web/src/routes/admin/onboarding.lazy.tsx`

**Perubahan:**
- Import ConfirmationModal
- Ganti `window.confirm` di `handleDeleteApplication` → ConfirmationModal
- Ganti `window.confirm` di `handleBulkDelete` → ConfirmationModal

### Task 6: Riwayat — Ganti Popup

**File:** `apps/web/src/routes/admin/operational-team/register/riwayat.lazy.tsx`

**Perubahan:**
- Import ConfirmationModal
- Ganti `window.confirm` di `handleSingleDelete` → ConfirmationModal
- Ganti `window.confirm` di `handleBulkDelete` → ConfirmationModal

---

## 4. Wave Planning

### 🔥 Wave 1: Paralel (2 subagent)

| Subagent | Task | File |
|----------|------|------|
| A | Task 1: Edge function | `supabase/functions/delete-employee-cascade/index.ts` |
| B | Task 2: ConfirmationModal | `confirmation-modal.tsx` |

### 🧠 Wave 2: Sequential (kamu kerjakan 4 task)

Setelah Wave 1 selesai dan diverifikasi:
| Prioritas | Task | File |
|:---------:|------|------|
| 1 | Task 3: KaryawanOverview | `KaryawanOverview.tsx` |
| 2 | Task 4: Karyawan data | `data.lazy.tsx` |
| 3 | Task 5: Onboarding | `onboarding.lazy.tsx` |
| 4 | Task 6: Riwayat | `riwayat.lazy.tsx` |

### ✅ Wave 3: Verifikasi

- [ ] Build check (`bun run build` or whatever frontend build)
- [ ] TypeScript typecheck
- [ ] Deploy edge function: `delete-employee-cascade`
- [ ] Git commit + push

---

## 5. Implementasi Detail

### Edge Function Signature (Final)

```typescript
interface Payload {
  ids?: string[];       // employee_onboarding_applications.id (existing)
  source_ids?: string[]; // pos_users_public._id (new)
}

interface Response {
  success: boolean;
  deleted: number;
  names: string[];
}
```

### ConfirmationModal Props (Final)

```typescript
interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  subtitle?: string;     // NEW: teks kecil di bawah judul
  message: string;       // support \n line breaks
  confirmText?: string;  // default "Konfirmasi"
  cancelText?: string;   // default "Batal"
  loading?: boolean;     // NEW: disable + spinner
  variant?: "danger" | "warning" | "info";
}
```

### Helper Function (shared di semua halaman)

```typescript
async function cascadeDeleteUsers(sourceIds: string[]) {
  if (sourceIds.length === 0) return;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const adminSecret = import.meta.env.VITE_ADMIN_SECRET || "";
  const res = await fetch(supabaseUrl + "/functions/v1/delete-employee-cascade", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": adminSecret,
    },
    body: JSON.stringify({ source_ids: sourceIds }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result?.error || "Gagal menghapus");
  return result;
}
```

---

## 6. Risk & Catatan

- **Data irreversible:** Cascade delete hapus semua data secara permanen — ConfirmationModal harus jelas informasinya.
- **Face descriptor:** `yumi_users.face_descriptor` akan ikut terhapus karena `yumi_users` di-delete berdasarkan `source_id` — aman.
- **Attendance records:** Tidak dihapus (history absensi tetap ada). Jika ingin dihapus, perlu diskusi — bisa mengacaukan laporan.
- **Payroll records:** Tidak dihapus (history penggajian tetap ada). Sama seperti attendance.
- **Storage files (CV, kontrak PDF):** File di storage buckets tidak dihapus otomatis oleh edge function. Perlu tambahan jika dianggap perlu.
- **Data integrity:** Edge function pakai `service_role` key — bypass RLS. Aman karena divalidasi dengan `x-admin-secret` header.
