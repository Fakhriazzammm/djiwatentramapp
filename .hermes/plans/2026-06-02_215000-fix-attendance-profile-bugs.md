# Plan: Perbaikan Bug Logika Attendance & Profile

**Date:** 2026-06-02
**Author:** Hermes Agent
**Status:** Draft

---

## Goal

Memperbaiki 9 bug (3 critical, 6 medium) yang ditemukan di route `/attendance` (`apps/karyawan/src/routes/attendance.lazy.tsx`) dan `/$username` (`apps/karyawan/src/routes/$username.lazy.tsx`).

---

## Current Context

- Monorepo pnpm/Vite, TanStack Router, React 19, Tailwind v4
- Commit terbaru: `791577b4` — bundle `index-Tb3pypnw.js` sudah live
- Sebelumnya sudah fix white screen (AnimatePresence crash) dan auto-detect user

---

## Bug 1 (🔴 CRITICAL): Navigasi ke `/$username` pakai `_id`, bukan `slug`

### Root Cause
`attendance.lazy.tsx:206`:
```ts
navigate({ to: `/${selectedUser.id}` as any });
```
`selectedUser.id` = `staff._id` (ObjectId). Tapi route `/$username` menggunakan `useHybridStaffBySlug(username)` yang mencari berdasarkan `slug`, bukan `_id`.

### Fix
1. Tambah field `slug` ke `selectedUser` state type (line 35-41)
2. Di `handleUserSelect` (line 165-169), simpan `slug: staff.slug`
3. Ganti navigasi jadi: `/${selectedUser.slug}`

### File
- `apps/karyawan/src/routes/attendance.lazy.tsx` — lines 35-41, 165-169, 206

---

## Bug 2 (🔴 CRITICAL): `handleClock` re-throws error — Unhandled via Face

### Root Cause
`attendance.lazy.tsx:207-210`:
```ts
catch (error: any) {
  throw new Error(msg);
}
```
Dipanggil dari face recognition (`onVerify` callback di line 497-499) tanpa try-catch. Jika clock gagal via face → **unhandled promise rejection**.

### Fix
- **Opsi A (direkomendasikan):** Hapus `throw new Error(msg)` dari `handleClock`, ganti jadi `toast.error(msg)` + `setIsClocking(false)`. Fungsi tidak perlu re-throw karena tiap caller sudah tangani sendiri (PIN via `catch`, Face via internal handling).
- **Opsi B:** Bungkus `handleClock()` di `onVerify` dengan try-catch.

### File
- `apps/karyawan/src/routes/attendance.lazy.tsx` — lines 207-213

---

## Bug 3 (🔴 CRITICAL): `handlePinSubmit` tidak clear PIN setelah error

### Root Cause
`attendance.lazy.tsx:228-233`:
```ts
catch (error: any) {
  toast.error(error?.message || "Gagal memproses absensi");
} finally {
  setIsVerifyingPin(false);
  // pinCode tidak di-reset
}
```
User salah PIN → bisa langsung tekan LANJUT tanpa input ulang.

### Fix
Tambah `setPinCode("")` di catch block.

### File
- `apps/karyawan/src/routes/attendance.lazy.tsx` — line 230

---

## Bug 4 (🟡 MEDIUM): `AnimatePresence mode="wait"` di `/$username`

### Root Cause
`$username.lazy.tsx:654`:
```tsx
<AnimatePresence mode="wait">
  {!isUnlocked ? (locked view) : (unlocked view)}
</AnimatePresence>
```
Sama persis dengan pola yang menyebabkan white screen di `/attendance`. Risiko tinggi di framer-motion v12 dengan conditional rendering.

### Fix
Ganti dengan ternary langsung tanpa `AnimatePresence`, atau gunakan `motion.div` dengan `key` terpisah tanpa wrapper mode="wait".

### File
- `apps/karyawan/src/routes/$username.lazy.tsx` — lines 654-1486

---

## Bug 5 (🟡 MEDIUM): Contract data hardcoded

### Root Cause
`$username.lazy.tsx:833-848` menampilkan "PKWT - Full Time", "6 Bulan", "28 Mei 2026" dll sebagai string literal, bukan dari `contractData`.

### Fix
Baca field dari `contractData.contract` atau `contractData.raw`:
```ts
const c = contractData.contract || contractData.raw || {};
// Tampilkan c.type, c.duration, c.startDate, c.endDate
```
Atau jika data tidak tersedia di DB, tampilkan placeholder "—".

### File
- `apps/karyawan/src/routes/$username.lazy.tsx` — lines 826-866

---

## Bug 6 (🟡 MEDIUM): `isUploadingPhoto` stuck `true` kalau upload gagal

### Root Cause
`$username.lazy.tsx:1119-1134`: `setIsUploadingPhoto(true)` sebelum upload. Jika `uploadError`, throw terjadi sebelum `setIsUploadingPhoto(false)`. Catch/finally tidak reset `isUploadingPhoto`.

### Fix
Pindahkan `setIsUploadingPhoto(false)` ke `finally` block, atau gunakan pattern:
```ts
try {
  setIsUploadingPhoto(true);
  // upload...
  setIsUploadingPhoto(false);
} catch (err) {
  setIsUploadingPhoto(false); // ← reset di catch juga
  throw err;
}
```
atau gunakan `finally`:
```ts
try {
  setIsUploadingPhoto(true);
  // upload...
} finally {
  setIsUploadingPhoto(false);
}
```

### File
- `apps/karyawan/src/routes/$username.lazy.tsx` — lines 1117-1135

---

## Bug 7 (🟡 MEDIUM): Foto profile upload ke bucket "employee-contracts"

### Root Cause
`$username.lazy.tsx:1124`:
```ts
.from("employee-contracts").upload(objectPath, editPhotoFile, ...)
```
Bucket kontrak bukan tempat untuk foto profil.

### Fix
1. Buat bucket baru `profile-photos` di Supabase (via admin)
2. Ganti `.from("employee-contracts")` → `.from("profile-photos")`
3. Update path object jadi `profile-photos/${staff?.slug || username}_${Date.now()}.${ext}`
4. Ganti `getPublicUrl` dari bucket yang sama

### File
- `apps/karyawan/src/routes/$username.lazy.tsx` — lines 1124, 1131

---

## Bug 8 (🟡 MEDIUM): Icon `Navigation` untuk error kamera (salah konteks)

### Root Cause
`attendance.lazy.tsx:475`: Error screen "KAMERA TIDAK TERSEDIA" menggunakan icon `<Navigation />` (kompas), seharusnya `<Camera />` dengan tambahan visual error (warna merah).

### Fix
Ganti `<Navigation>` → `<Camera />`. Bisa juga tambah `XCircle` overlay atau efek.

### File
- `apps/karyawan/src/routes/attendance.lazy.tsx` — line 475

---

## Bug 9 (🟡 MEDIUM): `useEffect` timpa form edit saat data refetch

### Root Cause
`$username.lazy.tsx:548-566`: `useEffect` dengan dependency `[staff, privateData, isUnlocked]` akan overwrite form state (`editName`, `editPhone`, etc.) setiap kali data refetch — termasuk saat user sedang mengedit.

### Fix
Gunakan ref (`useRef`) untuk flag initial load:
```ts
const hasLoaded = useRef(false);
useEffect(() => {
  if (!hasLoaded.current && staff && isUnlocked) {
    hasLoaded.current = true;
    setEditName(staff.name || "");
    // ...
  }
}, [staff, privateData, isUnlocked]);
```
Atau hanya set saat `isEditMode` false (belum mulai edit).

### File
- `apps/karyawan/src/routes/$username.lazy.tsx` — lines 548-566

---

## Implementation Order

1. **Bug 1** — slug di selectedUser + navigasi fix
2. **Bug 2** — hapus re-throw di handleClock
3. **Bug 3** — reset pinCode di catch
4. **Bug 8** — icon Navigation → Camera
5. **Bug 4** — hapus AnimatePresence di $username
6. **Bug 5** — contract data dari DB (konfirmasi dulu field mana yang available)
7. **Bug 6** — isUploadingPhoto finally fix
8. **Bug 9** — initial-load ref guard
9. **Bug 7** — bucket baru + path update

Steps 1-4 (bug 1,2,3,8) = **high priority** — semua di `attendance.lazy.tsx`.  
Steps 5-9 (bug 4,5,6,7,9) — semua di `$username.lazy.tsx`.

## Verification

1. Build lokal: `cd /opt/djiwatentramapp && npx vite build apps/karyawan --mode production`
2. Push ke GitHub: `git push origin main`
3. Verifikasi Vercel deploy: cek bundle hash `curl -sL https://karyawan.djiwatentram.web.id/attendance | grep -oP 'src="/assets/index-\K[A-Za-z0-9]+'`
4. Test flow: login → `/attendance` auto-detect → face/PIN → sukses → redirect ke `/{slug}` (bukan `/{_id}`)
5. Test profile page tidak white screen
6. Test PIN salah: harus clear input
7. Test upload foto error: spinner hilang

## Risk & Mitigation

| Risk | Mitigation |
|---|---|
| Contract data field tidak ada di DB | Fallback hardcoded sementara → tampilkan "—" jika field null |
| Bucket `profile-photos` belum dibuat | Buat via Supabase dashboard atau `supabase storage create` CLI |
| AnimatePresence removal bikin animasi loss | Ganti dengan `motion.div` standalone + `key` untuk fade transition |
| Navigasi ke slug berbeda dari ID yang diharapkan | Pastikan staff record selalu punya `slug` field |

## Open Questions

1. Apakah perlu bucket baru `profile-photos` atau bisa pake bucket `public` dengan path prefix?
2. Contract data — field apa saja yang tersedia di `contractData.contract`? Perlu investigasi DB response shape.
3. Apakah `useHybridStaffBySlug` menerima `slug` saja atau juga `_id`? (Jika menerima keduanya, Bug 1 mungkin tidak perlu fix — perlu verifikasi)
