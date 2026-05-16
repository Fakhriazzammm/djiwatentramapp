# Register Page Mobile UX Improvement Plan

> **Goal:** Refine `/register` and `/register/selesai/*` pages for true mobile-first experience — legible text, smooth transitions, proper keyboard handling, safe area support, and per-step validation.

**Architecture:** All changes are in `register.lazy.tsx` (main wizard), `contract-preview.tsx` (contract display), and `register.selesai.$registrationNumber.lazy.tsx` (tracking page). No backend changes needed — pure UI/UX refinements using existing Tailwind utilities and optional framer-motion.

**Tech Stack:** React + Tailwind + shadcn/ui + framer-motion (already in deps for selesai page)

---

### Task 1: Fix ContractPreview font size untuk mobile

**Objective:** Contract text minimal 12px di mobile, naik ke 14px di tablet+

**Files:**
- Modify: `apps/web/src/components/employee-onboarding/contract-preview.tsx:99` (body text)
- Modify: `apps/web/src/components/employee-onboarding/contract-preview.tsx:111` (plain text fallback)
- Modify: `apps/web/src/components/employee-onboarding/contract-preview.tsx:88,121,126,132,137,141,147` (label/signature area)

**Step 1: Ubah body contract dari `text-[11px]` ke `text-xs sm:text-sm`**

Di `contract-preview.tsx`:
- Line 99: `text-justify text-[11px] leading-[1.8] sm:text-xs sm:leading-[1.9]` → `text-justify text-xs leading-[1.7] sm:text-sm sm:leading-[1.9]`
- Line 111 (plain text fallback): same change
- Line 88: `text-[11px]` → `text-xs`
- Line 121: `text-[10px]` → `text-xs`
- Line 126: `h-16 object-contain sm:mt-4 sm:h-24` → `h-20 object-contain sm:mt-4 sm:h-24` (bigger signature on mobile)
- Line 132: `text-sm` → `text-xs sm:text-sm`
- Line 141: same as line 126
- Line 137: `text-[10px]` → `text-xs`
- Line 147: `text-sm` → `text-xs sm:text-sm`
- Line 123: `text-[11px]` → `text-xs`
- Line 91: `text-xl` → `text-lg sm:text-xl`

**Step 2: Verify**

Build/Run dev server, inspect mobile viewport (375px width) — contract body reads at 12px (not 11px), signature labels at 12px (not 10px).

---

### Task 2: Fix SignaturePad hint text size

**Objective:** Tanda tangan instruction minimal 12px di mobile

**Files:**
- Modify: `apps/web/src/components/employee-onboarding/signature-pad.tsx:94`

**Step 1: Ubah font size**

Line 94: `text-[10px] text-muted-foreground sm:text-xs` → `text-xs text-muted-foreground sm:text-sm`

---

### Task 3: Add per-step validation on "Lanjut" button

**Objective:** Setiap step tervalidasi sebelum user bisa lanjut. Error ditampilkan via toast.

**Files:**
- Modify: `apps/web/src/routes/register.lazy.tsx:430-439` (navigation onClick)

**Step 1: Buat fungsi `validateStep(step: number)`**

Tambahkan fungsi baru di dalam `RegisterPage` component, sebelum return:

```typescript
function validateStep(step: number): boolean {
  const errors: string[] = [];
  switch (step) {
    case 0: {
      const p = draft.personal;
      if (!p.fullName.trim()) errors.push("Nama lengkap wajib diisi");
      if (!p.phone.trim()) errors.push("No HP wajib diisi");
      if (!p.identityNumber.trim()) errors.push("NIK wajib diisi");
      break;
    }
    case 1: {
      const e = draft.employment;
      if (!e.roleId) errors.push("Jabatan wajib dipilih");
      if (!e.homePin || e.homePin.length < 6) errors.push("PIN login harus 6 digit");
      if (!e.username.trim()) errors.push("Username wajib diisi");
      break;
    }
    case 2: {
      // contract step — no validation needed, read-only
      break;
    }
    case 3: {
      if (!draft.signatureDataUrl) errors.push("Tanda tangan wajib diisi");
      if (!draft.agreements.dataIsTrue) errors.push("Centang pernyataan data benar");
      if (!draft.agreements.contractApproved) errors.push("Centang persetujuan kontrak");
      break;
    }
  }
  errors.forEach((e) => toast.error(e));
  return errors.length === 0;
}
```

**Step 2: Ubah onClick handler "Lanjut"**

Line 431-434:
```tsx
onClick={() => {
  if (!validateStep(step)) return;
  if (step === 1 && !draft.contract.plainText) applyTemplate();
  setStep((s) => Math.min(3, s + 1));
}}
```

**Step 3: Verify**

Buka register page di mobile viewport, coba "Lanjut" tanpa mengisi data diri → toast error muncul. Isi data diri → Lanjut → toast tidak muncul.

---

### Task 4: Add slide transition between wizard steps

**Objective:** Setiap step berganti dengan animasi slide-up / fade-in halus

**Files:**
- Modify: `apps/web/src/routes/register.lazy.tsx` — wrap setiap step content dengan `AnimatePresence` + `motion.div`

**Step 1: Import framer-motion**

Tambahkan di imports:
```tsx
import { AnimatePresence, motion } from "framer-motion";
```
(Cek dulu apakah sudah ada atau perlu `npm i framer-motion` — selesai page sudah pakai, kemungkinan sudah di package.json)

**Step 2: Wrap step container**

Di setiap step (`step === 0`, `step === 1`, `step === 2`, `step === 3`), bungkus dengan:

```tsx
<AnimatePresence mode="wait">
  {step === 0 && (
    <motion.div
      key="step-0"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* existing card content */}
    </motion.div>
  )}
</AnimatePresence>
```

Lakukan hal yang sama untuk step 1, 2, 3 dengan `key="step-1"` dst.

**Step 3: Verify**

Buka register page, tap Lanjut/Sebelumnya → konten lama fade-out, konten baru slide-up masuk dengan mulus.

---

### Task 5: Add safe area insets untuk notched devices

**Objective:** Konten tidak terpotong notch/lubang kamera di HP modern

**Files:**
- Modify: `apps/web/src/routes/register.lazy.tsx:243` (outer container)
- Modify: `apps/web/src/routes/register.lazy.tsx:222` (registration disabled container)

**Step 1: Ganti `px-3` dengan safe area di container utama**

Line 243:
```tsx
<div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 px-[--safe-area-left] py-6 pr-[--safe-area-right] sm:px-4 sm:py-8">
```
→ tapi `px-3` perlu dipertahankan sebagai fallback. Gunakan:

```tsx
className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 px-3 py-6 sm:px-4 sm:py-8"
style={{ paddingLeft: "var(--safe-area-left, 0.75rem)", paddingRight: "var(--safe-area-right, 0.75rem)" }}
```

(Atau pakai class-based: tambahkan class `inset-safe` di index.css lalu pakai.)

Alternatif lebih simpel: Gunakan inline `style` seperti di atas.

Lakukan hal yang sama untuk container disabled registration (line 222).

Juga tambahkan `pb-[--safe-area-bottom]` via style di container.

**Step 2: Verify**

Inspect element di mobile viewport — `padding-left` dan `padding-right` menunjukkan nilai `env(safe-area-inset-left)` di browser yang support.

---

### Task 6: Scroll input into view saat keyboard muncul

**Objective:** Input yang terfokus tidak tertutup keyboard mobile

**Files:**
- Modify: `apps/web/src/routes/register.lazy.tsx` — tambahkan `scrollMarginBottom` pada container card step 1 ataupakai `scroll-into-view-if-needed` di event focus

**Step 1: Tambahkan scroll-margin pada CardContent step 1**

Line 292:
```tsx
<CardContent className="grid gap-3 sm:gap-4 md:grid-cols-2 scroll-mb-40">
```

`scroll-mb-40` memberi ruang 160px di bawah saat browser scroll ke elemen focus.

**Step 2: Alternatif — tambahkan event onFocus pada input PIN**

Tambahkan handler ke input PIN (line 322):
```tsx
onFocus={() => setTimeout(() => {
  document.getElementById("pin-input")?.scrollIntoView({ behavior: "smooth", block: "center" });
}, 300)}
```

Tambahkan `id="pin-input"` ke Input PIN.

**Step 3: Verify**

Di mobile (atau Chrome DevTools dengan mobile emulation + keyboard), focus ke PIN input → halaman scroll otomatis sehingga input terlihat.

---

### Task 7: Add loading skeleton ke main register page

**Objective:** Tampilkan skeleton card saat roles dan siteSettings masih loading

**Files:**
- Modify: `apps/web/src/routes/register.lazy.tsx` — tambahkan skeleton sebelum render utama

**Step 1: Buat kondisi loading**

Di awal `RegisterPage`, cek apakah data masih loading:

```tsx
const roles = useHybridStaffRoles() ?? [];
const siteSettings = useHybridSiteSettings();
const isLoading = roles.length === 0 && !siteSettings;
```

**Step 2: Tampilkan skeleton saat loading**

Tambahkan sebelum `if (!registrationEnabled)`:

```tsx
if (isLoading) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4 py-8">
      <div className="w-full max-w-lg space-y-4">
        <div className="mx-auto h-14 w-14 animate-pulse rounded-2xl bg-muted" />
        <div className="mx-auto h-5 w-48 animate-pulse rounded-md bg-muted" />
        <div className="mx-auto h-3 w-32 animate-pulse rounded bg-muted" />
        <Card>
          <CardContent className="space-y-4 px-6 py-10">
            <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-10 w-2/3 animate-pulse rounded-lg bg-muted" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

**Step 3: Verify**

Refresh register page — skeleton muncul sebelum form terisi. Roles dan settings siap → skeleton digantikan form.

---

### Task 8: Fix salary preview wrap di mobile

**Objective:** Preview gaji tidak wrap awkwardly di layar sempit

**Files:**
- Modify: `apps/web/src/routes/register.lazy.tsx:318`

**Step 1: Ubah layout salary preview jadi stacked di mobile**

Line 318:
```tsx
{onboardingSettings.salaryPreview.enabled && onboardingSettings.salaryPreview.candidateVisibility !== "hidden" && (
  <div className="rounded-lg border bg-primary/5 p-3 text-sm md:col-span-2">
    <p className="font-medium">Preview Gaji</p>
    <div className="mt-1 flex flex-col gap-0.5 text-muted-foreground sm:flex-row sm:gap-3">
      <span>Bulanan {formatOnboardingCurrency(draft.employment.monthlySalary)}</span>
      <span className="hidden sm:inline">•</span>
      <span>Harian {formatOnboardingCurrency(draft.employment.dailyAllowance)}</span>
      <span className="hidden sm:inline">•</span>
      <span>Shift {formatOnboardingCurrency(draft.employment.shiftRate)}</span>
    </div>
  </div>
)}
```

**Step 2: Verify**

Di mobile viewport sempit (320px), salary preview tampil sebagai 3 baris terpisah. Di tablet+ tetap horizontal dengan separator bullet.

---

### Task 9: Improve contract/signature phase buttons di mobile (selesai page)

**Objective:** Tombol aksi di fase kontrak/tanda tangan tidak bersampingan di mobile

**Files:**
- Modify: `apps/web/src/routes/register.selesai.$registrationNumber.lazy.tsx:382-389` (contract buttons)
- Modify: `apps/web/src/routes/register.selesai.$registrationNumber.lazy.tsx:428-435` (signature buttons)

**Step 1: Ubah `flex justify-end gap-2` jadi `flex-col` di mobile**

Line 382-389:
```tsx
<div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
  <Button variant="outline" onClick={() => setPhase("tracking")}>
    Batal
  </Button>
  <Button onClick={() => setPhase("signature")}>
    Setuju & Lanjut ke Tanda Tangan
  </Button>
</div>
```

Line 428-435:
```tsx
<div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
  <Button variant="outline" onClick={() => setPhase("contract")} disabled={isSigning}>
    Kembali
  </Button>
  <Button onClick={handleSignContract} disabled={isSigning || !agreedData || !agreedContract || !signatureDataUrl}>
    {isSigning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memproses...</> : "Kirim Tanda Tangan"}
  </Button>
</div>
```

**Step 2: Verify**

Di mobile, tombol Kembali dan Setuju stack vertikal dengan `gap-2`. Di tablet+ tetap horizontal `justify-end`.

---

## Execution Order

| # | Task | Est. Time | Dependencies |
|---|------|-----------|-------------|
| 1 | ContractPreview font size | 3 min | — |
| 2 | SignaturePad hint text | 1 min | — |
| 3 | Per-step validation | 8 min | — |
| 4 | Slide transitions | 10 min | — |
| 5 | Safe area insets | 5 min | — |
| 6 | Scroll into view on focus | 5 min | — |
| 7 | Loading skeleton | 8 min | — |
| 8 | Salary preview wrap | 3 min | — |
| 9 | Contract/signature buttons mobile | 3 min | — |

**Total: ~46 minutes**

---

## Verification Checklist

- [ ] Contract body readable at 12px min on 375px viewport
- [ ] Signature hint text ≥12px on mobile
- [ ] "Lanjut" without filling shows toast errors
- [ ] Back/Next triggers fade animation between steps
- [ ] Content not clipped on notched phone (safe area)
- [ ] PIN input scrolls into view when focused with keyboard
- [ ] Skeleton appears while data loads
- [ ] Salary preview is stacked (not horizontal wrapping) on mobile
- [ ] Contract/signature buttons stack vertically on mobile
