# Plan: Telegram Notification — Karyawan Baru

**Created:** 2026-05-21 20:30  
**Goal:** Kirim notifikasi Telegram ke grup report saat ada karyawan baru, dengan narasi "Selamat datang di Djiwa Tentram — Yumme Group".

---

## 1. Analisis Existing

### Infrastructure Telegram

| Komponen | Detail |
|----------|--------|
| Edge function | `send-telegram-report` — forward ke bot lokal di `43.129.54.5:8001/send-report` |
| Bot lokal | `yumi-ai-bot` — handle kirim pesan ke Telegram |
| Chat ID existing | `-1003991897388` (grup report lama) |
| Chat ID approve/welcome | **`-1003919891671`** (grup welcome baru) |
| Chat ID registrasi alert | **`-5204005129`** (grup notif pendaftaran) |

### Notifikasi Existing di `onboarding-admin`

Edge function `onboarding-admin` (action: `approve`) sudah punya notifikasi Telegram di **lines 322-358**:
- Pakai `TELEGRAM_BOT_TOKEN` + `TELEGRAM_REPORT_CHAT_ID` env vars
- Kirim ke grup report LAMA
- Pesan: info approve + link tanda tangan kontrak
- Format: **Markdown** — perlu diubah ke **plain text** (tanpa `*`, ``, `_`)

### Masalah
1. Notifikasi approve masih ke grup **lama**, belum ke grup **welcome** (`-1003919891671`)
2. Belum ada notifikasi saat registrasi baru masuk ke grup **alert** (`-5204005129`)
3. Semua notifikasi harus **plain text** — tidak boleh pakai Markdown/rich text

---

## 2. Pendekatan

### Opsi A: Via `send-telegram-report` (rekomendasi)
Gunakan edge function yang sudah ada. Langsung pake bot yang sudah connect ke grup.

**Cara panggil:**
```
POST https://xaemykhjpkgypqqpfdcb.supabase.co/functions/v1/send-telegram-report
Body: { "text": "...", "chat_id": "-1003919891671" }
```

**Keuntungan:** Pakai bot yang sudah terhubung, tidak perlu setup ulang.

### Opsi B: Via `onboarding-admin` langsung (existing pattern)
Edge function onboarding-admin sudah langsung panggil Telegram API dengan `TELEGRAM_BOT_TOKEN`.

**Keuntungan:** Service role — bisa query DB bebas.
**Kekurangan:** Perlu env var `TELEGRAM_BOT_TOKEN` di Supabase.

---

## 3. Aturan Penting

### Semua pesan WAJIB plain text:
- Tidak boleh ada `*` (bold)
- Tidak boleh ada `_` (italic)
- Tidak boleh ada `` ` `` (code)
- Tidak boleh ada `[link](url)` (markdown link)
- Gunakan teks biasa dengan emoji sebagai separator visual
- Gunakan garis `=` atau `-` untuk pembatas (bukan markdown)

---

## 4. Task Detail

### Task 1: Notifikasi Saat Admin Approve (via `onboarding-admin`)

**File:** `supabase/functions/onboarding-admin/index.ts`

**Perubahan:**
- Tambah env var baru: `TELEGRAM_WELCOME_CHAT_ID` untuk grup welcome (`-1003919891671`)
- Ganti format pesan dari Markdown ke **plain text**
- Kirim welcome ke grup baru, pertahankan notifikasi existing ke grup report lama (tapi juga diubah ke plain text)
- Env var baru: ambil dari `Deno.env.get("TELEGRAM_WELCOME_CHAT_ID")`

**Narasi welcome (plain text):**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 KARYAWAN BARU — DJIWA TENTRAM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Selamat datang di Djiwa Tentram Cafe & Resto,
bagian dari Yumme Group! 🌟

📋 Data Karyawan
  - Nama: Budi Santoso
  - Role: Barista
  - No HP: 0812xxxxxx
  - Tgl Mulai: 21 Mei 2026

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Pastikan data diri & kontrak sudah lengkap.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

— Manajemen Djiwa Tentram
```

### Task 2: Notifikasi Saat Registrasi Masuk

**File:** `apps/web/src/hooks/use-employee-onboarding-actions.ts`

**Perubahan:**
- Di `useHybridSubmitEmployeeApplication` — setelah insert berhasil, panggil `send-telegram-report` untuk kirim notifikasi ke grup alert (`-5204005129`)
- Format **plain text**

**Narasi alert registrasi (plain text):**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 PENDAFTARAN MASUK — DJIWA TENTRAM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ada pendaftar baru yang perlu direview! 👀

👤 Nama: Budi Santoso
📞 Kontak: 0812xxxxxx
🎯 Role: Barista
⏰ Waktu: 21 Mei 2026 14:30

🔗 Review: https://pos.djiwatentram.web.id/admin/operational-team/register/onboarding
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Task 3: Deploy & Konfigurasi

- Tambah env var `TELEGRAM_WELCOME_CHAT_ID=-1003919891671` di Supabase Dashboard
- Pastikan bot sudah join grup `-1003919891671` dan `-5204005129`
- Deploy edge function `onboarding-admin`
- Test: tes approve + tes registrasi

---

## 5. Dependency Graph

```
Level 1 (independen → paralel 🔥)
  ├── [1] onboarding-admin: tambah welcome ke -1003919891671 (plain text)
  └── [2] submit hook: tambah notif registrasi ke -5204005129 (plain text)

Level 2 (sequential)
  └── [3] Set env var + deploy + test
```

---

## 6. Wave Planning

### 🔥 Wave 1: Paralel (2 subagent)

| Subagent | Task | File | Grup |
|----------|------|------|:----:|
| A | Task 1: Notifikasi approve | `onboarding-admin/index.ts` | `-1003919891671` |
| B | Task 2: Notifikasi registrasi | `use-employee-onboarding-actions.ts` | `-5204005129` |

### ✅ Wave 2: Setup env & deploy

| Task | Detail |
|------|--------|
| Set `TELEGRAM_WELCOME_CHAT_ID` | Supabase Dashboard → `-1003919891671` |
| Bot join grup | Pastikan bot sudah join kedua grup |
| Deploy `onboarding-admin` | `npx supabase functions deploy onboarding-admin` |
| Test approve | Verifikasi welcome terkirim ke `-1003919891671` |
| Test registrasi | Verifikasi alert terkirim ke `-5204005129` |

---

## 7. Risk & Catatan

- **Bot harus join grup**: Bot yang dipakai (`yumi-ai-bot`) harus menjadi anggota grup `-1003919891671` dan `-5204005129` sebelum notifikasi bisa dikirim
- **Plain text only**: Hapus semua `*`, `_`, `` ` `` dari template pesan
- **Env var baru**: `TELEGRAM_WELCOME_CHAT_ID` harus ditambahkan di Supabase Dashboard → Edge Functions → onboarding-admin → Environment Variables
- **Duplicate notifikasi**: Pastikan welcome hanya dikirim saat approve, bukan saat update status lain
- **Fallback**: Jika notifikasi gagal (timeout/env var kosong), jangan gagalkan proses approve — cukup log warning (existing pattern)
- **send-telegram-report sudah ada**: Tidak perlu deploy fungsi baru untuk Task 2 — cukup panggil endpoint dari frontend

