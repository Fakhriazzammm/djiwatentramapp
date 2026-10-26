# Karyawan App — Absensi & Pendaftaran Wajah Implementation Plan

> **Goal:** Karyawan app (`apps/karyawan`) dapat melakukan absensi masuk/keluar + pendaftaran wajah (face registration) via `/attendance`. **Absensi bisa PIN ATAU Face — tidak harus keduanya.**
>
> **Architecture:** Copy proven flow dari POS app (`apps/pos`) ke karyawan app. Flow: Pilih Staff → Cek hasFace → (PIN-only / Face-only / PIN+Face Enroll) → Clock In/Out.
>
> **Route:** `apps/karyawan` sebagai PWA mandiri di domain karyawan.djiwatentram.web.id

**Tech Stack:** React 19, TanStack Router, face-api.js, react-webcam, Supabase, @yumipos/web-shared

---

## ⚠️ Verifikasi Logic: PIN ATAU Face — Daftar Wajah TANPA PIN

Backend hooks (`useHybridClockIn`, `useHybridClockOut`, `verifyAttendanceIdentity`) sudah mendukung **PIN-OR-Face**. Detail:

| Skenario | clockIn | clockOut |
|---|---|---|
| **Face-only** (user punya wajah, kamera jalan) | ✅ Tidak ada verifikasi identity — hanya log timestamp. Descriptor di-cache untuk clock-out nanti. | ✅ `verifyAttendanceIdentity` — check face descriptor vs stored. Cukup distance ≤ 0.6. |
| **PIN-only** (face model gagal load / user pilih PIN) | ✅ `clockIn` cek PIN jika pinCode dikirim. Verifikasi SHA-256. | ✅ `verifyAttendanceIdentity` — cek PIN fingerprint via SHA-256. Cukup PIN cocok. |
| **Face + PIN** (enroll mode) | ✅ PIN untuk verifikasi identitas + face descriptor disimpan. | ✅ Salah satu cukup. |

### 🔑 Perubahan flow: Daftar Wajah TANPA PIN

`useHybridEnrollFace` sudah mendukung `skipPinVerification: true` (Branch B di kode). Saat `skipPinVerification=true`, cukup cek user exist + aktif — TIDAK perlu PIN.

**Keputusan desain untuk karyawan app:**
- **Daftar wajah pertama** (hasFace=false): user → pilih staff → langsung FACE step (enroll) — **tanpa PIN**. Cukup kamera detect wajah → descriptor disimpan → clockIn.
- **Daftar ulang wajah** (hasFace=true): user → pilih staff → FACE step → tombol "Daftar Ulang Wajah" → `skipPinVerification=true` → **tanpa PIN**.
- **Absen PIN-only** (fallback): tetap ada tombol "Absen Pakai PIN" → PIN step → clockIn/Out tanpa kamera.
- **Tidak ada skenario yang memerlukan PIN + Face sekaligus** — baik daftar wajah baru maupun daftar ulang, PIN tidak diperlukan.

---

## ⚠️ Safety Rules (Production System — Zero Error Policy)

1. **No delete before verify** — POS app tetap berfungsi penuh. Tidak ada kode POS yang dihapus.
2. **Build test every phase** — Setiap fase selesai dengan `cd apps/karyawan && tsc --noEmit && vite build`
3. **Komponen di-copy, bukan dipindah** — FaceRecognition & face-cache di-duplikasi ke karyawan, POS tetap punya sendiri
4. **POS route link fix** — update path `/karyawan/$username` → `/$username` hanya di POS home, tanpa hapus route POS mana pun
5. **Dual-path deploy** — Karyawan app baru deploy dulu, baru verifikasi, baru delete old code paths

---

## Phase 1: Fix Route Mismatch

### Task 1.1: Fix POS home link ke profil karyawan

**Objective:** POS `home.lazy.tsx` navigasi ke `/karyawan/$username` (route POS lama) tapi karyawan app pakai route `/$username` langsung.

**Files:**
- Modify: `apps/pos/src/routes/home.lazy.tsx:316`

**Step 1: Patch route path**

```tsx
// OLD:
const to = user?.slug ? (`/karyawan/${user.slug}` as any) : ("/attendance" as any);
// NEW:
const to = user?.slug ? (`/${user.slug}` as any) : ("/attendance" as any);
```

Rubah line 316 dari `` `/karyawan/${user.slug}` `` jadi `` `/${user.slug}` ``.

**Step 2: Build test**

```bash
cd /opt/djiwatentramapp && npx turbo run build --filter=@yumipos/pos
```

Expected: Build sukses tanpa error.

**Step 3: Git commit**

```bash
cd /opt/djiwatentramapp && git add apps/pos/src/routes/home.lazy.tsx && git commit -m "fix: update POS profile link from /karyawan/:slug to /:slug"
```

---

## Phase 2: Install Dependencies & Setup Infrastructure

### Task 2.1: Add face-api.js & react-webcam to karyawan app

**Objective:** Tambah dependency untuk face recognition.

**Files:**
- Modify: `apps/karyawan/package.json`

**Step 1: Add dependencies**

Tambah `"face-api.js": "^0.22.2"` dan `"react-webcam": "^7.2.0"` ke `dependencies` di `apps/karyawan/package.json`.

**Step 2: Install**

```bash
cd /opt/djiwatentramapp && cd apps/karyawan && bun add face-api.js react-webcam
```

**Step 3: Build test**

```bash
cd /opt/djiwatentramapp && npx turbo run build --filter=@yumipos/karyawan
```

**Step 4: Git commit**

```bash
git add apps/karyawan/package.json apps/karyawan/bun.lock && git commit -m "feat: add face-api.js and react-webcam deps to karyawan app"
```

---

### Task 2.2: Create face-cache.ts in karyawan app

**Objective:** localStorage caching untuk face descriptor + model loaded flag. Copy dari POS app.

**Files:**
- Create: `apps/karyawan/src/lib/face-cache.ts`

**Step 1: Create file**

Copy konten dari `apps/pos/src/lib/face-cache.ts` ke `apps/karyawan/src/lib/face-cache.ts`.

Isinya: `cacheFaceDescriptor`, `getCachedFaceDescriptor`, `clearFaceCache`, `clearAllFaceCache`, `euclideanDistance`, `verifyFaceFromCache`, `markModelsLoaded`, `wereModelsLoaded` — semua fungsi dengan prefix `face_cache_` di localStorage.

**Step 2: Build test**

```bash
cd /opt/djiwatentramapp && npx turbo run build --filter=@yumipos/karyawan
```

**Step 3: Git commit**

```bash
git add apps/karyawan/src/lib/face-cache.ts && git commit -m "feat: add face-cache lib to karyawan app"
```

---

### Task 2.3: Create FaceRecognition component in karyawan app

**Objective:** Komponen kamera + face detection + descriptor extraction menggunakan face-api.js. Copy dari POS app dengan path alias `@/` yang sudah sesuai.

**Files:**
- Create: `apps/karyawan/src/components/auth/FaceRecognition.tsx`
- Create: `apps/karyawan/src/components/ui/button.tsx` (jika belum ada)

**Step 1: Check UI components**

Cek apakah `apps/karyawan/src/components/ui/button.tsx` sudah ada:

```bash
ls apps/karyawan/src/components/ui/button.tsx 2>/dev/null || echo "NOT FOUND"
```

Jika belum ada, copy dari `apps/pos/src/components/ui/button.tsx`.

**Step 2: Create FaceRecognition component**

Copy konten dari `apps/pos/src/components/auth/FaceRecognition.tsx` ke `apps/karyawan/src/components/auth/FaceRecognition.tsx`.

Ubah import path jika perlu — POS pakai `@/components/ui/button` — karyawan juga pakai alias `@/` jadi sama.

Component ini memiliki:
- `mode: "enroll" | "verify"`
- `onCapture`, `onVerify`, `onMatch`, `onModelError` callbacks
- Model loading dari CDN (jsdelivr → unpkg → github raw)
- 2-phase detection: fast detection (150ms) → full pipeline with descriptor
- Oval frame overlay + green box + vignette
- `preloadFaceModels()` exported function

**Step 3: Build test**

```bash
cd /opt/djiwatentramapp && npx turbo run build --filter=@yumipos/karyawan
```

**Step 4: Git commit**

```bash
git add apps/karyawan/src/components/ && git commit -m "feat: add FaceRecognition component to karyawan app"
```

---

## Phase 3: Rewrite Attendance Route

### Task 3.1: Add preloadFaceModels to karyawan root

**Objective:** Preload face-api models saat app mount biar `/attendance` cepat.

**Files:**
- Modify: `apps/karyawan/src/routes/__root.tsx`

**Step 1: Add import + preload effect**

Tambah di `__root.tsx`:

```tsx
import { preloadFaceModels } from "@/components/auth/FaceRecognition";
```

Tambah di dalam `RootContent` component, sebelum atau sesudah auth effect:

```tsx
useEffect(() => {
  preloadFaceModels();
}, []);
```

**Step 2: Build test**

```bash
cd /opt/djiwatentramapp && npx turbo run build --filter=@yumipos/karyawan
```

**Step 3: Git commit**

```bash
git add apps/karyawan/src/routes/__root.tsx && git commit -m "feat: preload face models in karyawan root"
```

---

### Task 3.2: Export attendance hooks from @yumipos/web-shared

**Objective:** Pastikan `useHybridClockIn`, `useHybridClockOut`, `useHybridEnrollFace`, `useHybridVerifyHomePin` bisa diimpor dari `@yumipos/web-shared`.

**Files:**
- Modify: `packages/yumipos-web-shared/src/index.ts`

**Step 1: Cek status**

```bash
grep -n "ClockIn\|ClockOut\|EnrollFace\|VerifyHomePin" packages/yumipos-web-shared/src/index.ts
```

Jika belum ada:

**Step 2: Tambah export**

```ts
export {
  useHybridClockIn,
  useHybridClockOut,
  useHybridEnrollFace,
  useHybridVerifyHomePin,
} from "./hooks/use-hybrid-write-actions";
```

**Step 3: Verifikasi hooks sudah ada di shared**

```bash
grep -n "useHybridClockIn\|useHybridClockOut\|useHybridEnrollFace\|useHybridVerifyHomePin" packages/yumipos-web-shared/src/hooks/use-hybrid-write-actions.ts | head -10
```

Expected: fungsi-fungsi ini sudah ada di shared package (line ~4734+). Jika tidak ada berarti hanya di POS — copy ke shared.

Hook-hook ini sudah menggunakan `hasSupabaseConfig` + dummy `api` proxy, jadi aman untuk semua app.

**Step 4: Build test**

```bash
cd /opt/djiwatentramapp && npx turbo run build --filter=@yumipos/web-shared
```

**Step 5: Git commit**

```bash
git add packages/yumipos-web-shared/src/index.ts && git commit -m "feat: export attendance write hooks from web-shared"
```

---

### Task 3.3: Rewrite attendance.lazy.tsx with full attendance flow (PIN OR Face)

**Objective:** Ganti halaman `/attendance` dari yang hanya jadwal jadi full check-in/check-out flow dengan dukungan PIN-OR-Face.

**Files:**
- Create: `apps/karyawan/src/routes/attendance.lazy.tsx` (overwrite existing)

**Flow implementasi (khusus karyawan app — daftar wajah TANPA PIN):**

```
                  ┌──────────────────┐
                  │   SELECT step    │
                  │  Grid pilih user │
                  └───────┬──────────┘
                          │
                    ┌─────▼──────┐
                    │ Cek hasFace │
                    └─────┬──────┘
                 ┌────────┴─────────────────┐
                 ▼                          ▼
         ┌──────────────────────┐   ┌──────────────┐
         │  FACE step (enroll)  │   │  FACE step   │
         │  daftar wajah baru   │   │ (verify mode)│
         │  skipPinVerification │   │  absen biasa │
         └──────────┬───────────┘   └──────┬───────┘
                    │                       │
                    └──────────┬────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  handleFaceProcessed │
                    │  (isEnrolling?       │
                    │   → enrollFace dulu) │
                    │  → clockIn/Out       │
                    └──────────┬──────────┘
                               ▼
                    ┌──────────────┐
                    │  PIN step    │ ← hanya "Absen Pakai PIN" fallback
                    │  (optional)  │
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │   SUCCESS    │
                    └──────────────┘
```

**Keputusan penting (beda dari POS app):**

1. **User baru / belum punya wajah (hasFace=false)**: masuk langsung ke `face` step dengan `mode="enroll"` — **tanpa PIN**. Cukup kamera detect → descriptor disimpan → clockIn.

2. **User sudah punya wajah (hasFace=true)**: masuk langsung ke `face` step dengan `mode="verify"`. Kalau face match → clockIn/Out.

3. **Daftar ulang wajah**: tombol **"Daftar Ulang Wajah"** di face step → `setIsEnrolling(true)` → `skipPinVerification=true` → ganti descriptor lama dengan yang baru — **tanpa PIN**.

4. **Fallback PIN**: tombol **"Absen Pakai PIN"** untuk bypass kamera (kamera rusak / cahaya gelap / face loading gagal) → PIN step → `handleFaceProcessed()` tanpa descriptor → clockIn/Out.

5. **Face loading gagal**: `onModelError` → langsung pindah ke PIN step dengan info "Gagal muat kamera. Gunakan PIN."

**State machine:**

| Step | Trigger | Next |
|---|---|---|
| `select` | User picks staff + hasFace=true | `face` (isEnrolling=false) |
| `select` | User picks staff + hasFace=false | `face` (isEnrolling=true, skipPin=true) |
| `face` (enroll) | Face detected | `handleFaceProcessed()` → enrollFace + clockIn → `success` |
| `face` (verify) | Face match verified | `handleFaceProcessed()` → clockIn/Out → `success` |
| `face` | "Daftar Ulang Wajah" clicked | `face` (isEnrolling=true, skipPin=true) |
| `face` | "Absen Pakai PIN" clicked | `pin` |
| `pin` | PIN verified | `handleFaceProcessed()` → clockIn/Out → `success` |
| Face loading fail | onModelError fired | `pin` + toast "Gunakan PIN" |

**Logic for `handlePinSubmit`:**

```tsx
const handlePinSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (pin.length !== 6) return;
  setIsVerifyingPin(true);
  try {
    const result = await verifyPin({ pinCode: pin, userId: user?.id });
    if (user && result.userId !== user.id) {
      toast.error("PIN ini bukan milik Anda.");
      return;
    }
    // PIN-only attendance (fallback — kamera error / user pilih PIN)
    await handleFaceProcessed(); // no descriptor → PIN-only clockIn/Out
  } catch (err: any) {
    toast.error(err.message || "PIN salah.");
  } finally {
    setIsVerifyingPin(false);
  }
};
```

**Step 1: Buat attendance page baru**

```tsx
// apps/karyawan/src/routes/attendance.lazy.tsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { FaceRecognition, preloadFaceModels } from "@/components/auth/FaceRecognition";
import { Button } from "@yumipos/web-shared/components/ui/button";
import { Input } from "@yumipos/web-shared/components/ui/input";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import {
  Coffee, ArrowLeft, KeyRound, Loader2, UserCheck,
  MapPin, AlertCircle, CheckCircle2, Clock, Navigation,
  CalendarClock, RefreshCw, Camera, ChevronLeft
} from "lucide-react";
import {
  useHybridSiteSettings,
  useHybridPublicUsers,
  useHybridCurrentlyInStore,
  useHybridClockIn,
  useHybridClockOut,
  useHybridEnrollFace,
  useHybridVerifyHomePin,
} from "@yumipos/web-shared";
```

**Step 2: Component structure**

```tsx
function KaryawanAttendancePage() {
  const [step, setStep] = useState<"select"|"pin"|"face"|"success">("select");
  const [pin, setPin] = useState("");
  const [user, setUser] = useState<{...} | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [userLocation, setUserLocation] = useState<{...} | null>(null);
  const [isInRadius, setIsInRadius] = useState(false);
  
  // Hooks
  const siteSettings = useHybridSiteSettings();
  const allStaff = useHybridPublicUsers();
  const currentlyIn = useHybridCurrentlyInStore();
  const verifyPin = useHybridVerifyHomePin();
  const enrollFace = useHybridEnrollFace();
  const clockIn = useHybridClockIn();
  const clockOut = useHybridClockOut();
  
  // shift detection, geolocation, handleFaceProcessed, handlePinSubmit
  // (sama seperti POS tapi dengan modifikasi PIN-OR-Face)
}
```

**Step 3: Implementasi handleUserSelect — PIN-OR-Face aware**

```tsx
const handleUserSelect = (staff: any) => {
  const isCurrentlyIn = currentlyIn?.some((s: any) => s._id === staff._id);
  setUser({
    id: staff._id,
    name: staff.name,
    hasFace: !!staff.hasFace,
    isCurrentlyIn,
    roleName: staff.roleName || "",
  });

  if (!staff.hasFace) {
    // Belum punya wajah → face step langsung (enroll mode, skip PIN)
    setStep("face");
    setIsEnrolling(true);
  } else {
    // Sudah punya wajah → face step (verify mode)
    setStep("face");
    setIsEnrolling(false);
  }
};
```

**Step 4: Implementasi handlePinSubmit — dengan 2 pilihan untuk user baru**

Setelah PIN verified, user baru (isEnrolling=true) lihat 2 tombol:
- `📷 Daftarkan Wajah` → `setStep("face")` (tetap isEnrolling=true)
- `🔑 Lewati, Absen Pakai PIN` → panggil `handleFaceProcessed()` tanpa descriptor

**Step 5: handleFaceProcessed — dengan skipPinVerification untuk enroll**

```tsx
const handleFaceProcessed = async (descriptor?: number[]) => {
  if (!user) return;
  try {
    // Geofence check
    if (siteSettings?.attendanceLat && !isInRadius) {
      toast.error("Gagal: Anda di luar radius kafe.");
      return;
    }
    
    // Jika enroll mode + ada descriptor → daftar wajah TANPA PIN
    if (isEnrolling && descriptor) {
      await enrollFace({
        userId: user.id,
        faceDescriptor: descriptor,
        skipPinVerification: true, // ← TANPA PIN
      });
      toast.success("Wajah berhasil terdaftar!");
      setUser(prev => prev ? { ...prev, hasFace: true } : prev);
    }
    
    // Clock In atau Out — PIN saja (tanpa descriptor) juga valid
    const payload = {
      userId: user.id,
      faceDescriptor: descriptor, // optional — bisa undefined
      pinCode: pin || undefined,  // optional — bisa undefined
      location: userLocation || undefined,
    };
    
    if (user.isCurrentlyIn) {
      await clockOut(payload); // verifyAttendanceIdentity: PIN OR Face
    } else {
      await clockIn(payload);  // PIN check only if pinCode provided
    }
    
    setStep("success");
    setTimeout(() => navigate({ to: `/${user.id}` }), 3000);
  } catch (err: any) {
    toast.error(err?.message || "Gagal absensi");
  }
};
```

**Geofencing:**
- `getCurrentPosition()` single-shot + 1 retry (2s)
- Haversine distance vs `attendanceLat/Lng` + `attendanceRadius`
- Client-side + server-side (`validateGeofence()` di hooks)

**Shift detection:**
- Dari `siteSettings.shiftSettings.shiftSchedules`
- Deteksi shift berdasarkan jam lokal device

**Step 6: Build test**

```bash
cd /opt/djiwatentramapp && npx turbo run build --filter=@yumipos/karyawan
```

**Step 7: Git commit**

```bash
git add apps/karyawan/src/routes/attendance.lazy.tsx && git commit -m "feat: add PIN-OR-Face attendance flow to karyawan app"
```

---

## Phase 4: Upgrade Face Recognition — Cepat & Reliabel

### Analisis bottleneck saat ini

| Tahap | Waktu | Penyebab |
|---|---|---|
| **Model download** | 1-5 detik (tergantung CDN + koneksi) | 3 file model (~5MB total) dari CDN jsdelivr |
| **Model load ke memory** | ~200ms | face-api.js neural net initialization |
| **Face detection (1x)** | ~150ms | TinyFaceDetector dgn inputSize=96 |
| **Face descriptor (1x)** | ~200ms | FaceRecognitionNet forward pass |

**Target:** Model loading < 1 detik, face detection + descriptor < 150ms total.

### Task 4.1: Self-host face-api model weights

**Objective:** Hapus dependency CDN — model weights disimpan di `public/face-models/` dan di-load dari origin yang sama (lebih cepat).

**Files:**
- Create: `apps/karyawan/public/face-models/` — simpan 3 model files
- Modify: `apps/karyawan/src/components/auth/FaceRecognition.tsx` — ganti MODEL_CDNS ke origin path
- *(sama untuk POS app)*
- Modify: `apps/pos/src/components/auth/FaceRecognition.tsx`

**Model files yang dibutuhkan:**
```
public/face-models/
  tiny_face_detector_model-shard1
  tiny_face_detector_model-weights_manifest.json
  face_landmark_68_model-shard1
  face_landmark_68_model-weights_manifest.json
  face_recognition_model-shard1
  face_recognition_model-weights_manifest.json
```

**Step 1: Buat script download models**

Buat `scripts/download-face-models.sh`:
```bash
#!/bin/bash
# Download face-api.js model weights
BASE_URL="https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights"
DEST="apps/karyawan/public/face-models"

mkdir -p "$DEST"

for FILE in \
  tiny_face_detector_model-shard1 \
  tiny_face_detector_model-weights_manifest.json \
  face_landmark_68_model-shard1 \
  face_landmark_68_model-weights_manifest.json \
  face_recognition_model-shard1 \
  face_recognition_model-weights_manifest.json; do
  echo "Downloading $FILE..."
  curl -sL "$BASE_URL/$FILE" -o "$DEST/$FILE"
done

echo "Done! Models saved to $DEST"
```

Jalankan:
```bash
cd /opt/djiwatentramapp && bash scripts/download-face-models.sh
```

**Step 2: Update FaceRecognition.tsx — load dari origin**

```tsx
// OLD — CDN with 3 fallbacks:
const MODEL_CDNS = [
  "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights",
  "https://unpkg.com/face-api.js@0.22.2/weights",
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights",
];

// NEW — origin path (langsung, tanpa fallback):
const MODEL_PATH = "/face-models";
```

Simplify `loadModelsImpl()`:
```tsx
async function loadModelsImpl(): Promise<boolean> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 3000);
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_PATH),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_PATH),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_PATH),
    ]);
    clearTimeout(timer);
    return true;
  } catch {
    // Fallback ke CDN jika model gagal di-load dari origin
    for (const cp of [
      "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights",
      "https://unpkg.com/face-api.js@0.22.2/weights",
    ]) {
      try { await Promise.all([/* ... */]); return true; } catch {}
    }
    return false;
  }
}
```

**Step 3: Add .gitignore untuk model files (optional)**

```gitignore
# face-api model weights — download via script
apps/*/public/face-models/
```

Atau commit langsung (file kecil ~5MB total — fine untuk git).

**Step 4: Juga di POS app**

Copy model files ke `apps/pos/public/face-models/` dan update `FaceRecognition.tsx` yang sama di POS.

**Step 5: Build test**

```bash
cd /opt/djiwatentramapp && npx turbo run build --filter=@yumipos/karyawan --filter=@yumipos/pos
```

**Step 6: Git commit**

```bash
git add apps/karyawan/public/ apps/pos/public/ scripts/download-face-models.sh && git commit -m "perf: self-host face-api model weights, remove CDN dependency"
```

**Dampak:** Model loading turun dari 1-5 detik (CDN) menjadi **~50-200ms** (origin, SW cache hit).

---

### Task 4.2: Web Worker untuk face detection pipeline

**Objective:** Pindahkan face-api.js processing ke Web Worker agar UI thread tidak terblokir.

**Files:**
- Create: `apps/karyawan/src/lib/face-worker.ts`
- Create: `apps/karyawan/public/face-worker.js` (compiled)
- Modify: `apps/karyawan/src/components/auth/FaceRecognition.tsx`

**Step 1: Buat worker script**

```ts
// face-worker.ts — compiled ke public/face-worker.js
import * as faceapi from "face-api.js";

const MODEL_PATH = "/face-models";
let loaded = false;

async function ensureModels() {
  if (loaded) return;
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_PATH),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_PATH),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_PATH),
  ]);
  loaded = true;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, imageData, width, height } = e.data;
  
  if (type === "detect") {
    await ensureModels();
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(imageData, 0, 0);
    
    const det = await faceapi
      .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 96, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();
    
    if (det) {
      self.postMessage({ type: "result", descriptor: Array.from(det.descriptor) });
    } else {
      self.postMessage({ type: "result", descriptor: null });
    }
  }
};
```

**Step 2: Update FaceRecognition untuk kirim frame ke worker**

Di FaceRecognition.tsx, ganti face-api.js direct call dengan kirim `ImageData` ke worker:

```tsx
const workerRef = useRef<Worker | null>(null);

useEffect(() => {
  workerRef.current = new Worker("/face-worker.js");
  return () => workerRef.current?.terminate();
}, []);

// Di detect loop, kirim frame ke worker:
const detectViaWorker = async () => {
  const vid = wRef.current?.video;
  if (!vid) return;
  
  // Capture frame ke canvas + ImageData
  const canvas = document.createElement("canvas");
  canvas.width = vid.videoWidth;
  canvas.height = vid.videoHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(vid, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  workerRef.current?.postMessage({
    type: "detect",
    imageData,
    width: canvas.width,
    height: canvas.height,
  });
};
```

**Step 3: Build worker**

Worker terpisah — perlu vite config tambahan atau build manual. Simpan sebagai file terpisah di `public/` agar bisa diakses sebagai worker URL.

Alternatif: gunakan `new Worker(new URL("./face.worker", import.meta.url))` — Vite handle build otomatis.

**Step 4: Build test**

```bash
cd /opt/djiwatentramapp && npx turbo run build --filter=@yumipos/karyawan
```

**Dampak:** UI thread tidak pernah terblokir — animasi, toast, dan button tetap responsif selama detection.

---

### Task 4.3: Native FaceDetector API dengan face-api.js fallback

**Objective:** Gunakan browser-native `FaceDetector` API (Chromium) — **zero model download, instant detect**. Fallback ke face-api.js untuk browser lain.

**Files:**
- Modify: `apps/karyawan/src/lib/face-detector.ts` (create)
- Modify: `apps/karyawan/src/components/auth/FaceRecognition.tsx`

**Step 1: Buat unified face detector**

```ts
// apps/karyawan/src/lib/face-detector.ts

type FaceDetectionResult = {
  descriptor: number[];
} | null;

/**
 * Browser-native FaceDetector API — zero download, instant.
 * Hanya tersedia di Chromium ≥ 70 (Chrome, Edge, Opera, Samsung).
 */
async function detectNative(video: HTMLVideoElement): Promise<FaceDetectionResult> {
  try {
    const fd = new (window as any).FaceDetector({
      maxDetectedFaces: 1,
      fastMode: true,
    });
    const faces = await fd.detect(video);
    if (faces.length === 0) return null;
    
    // Native FaceDetector hanya kasih bounding box — tidak ada face descriptor.
    // Kita perlu face-api.js hanya untuk descriptor extraction.
    // Tapi ini masih lebih cepat karena:
    // 1. FaceDetector API detect dalam <10ms (vs 150ms TinyFaceDetector)
    // 2. Kita skip landmark detection
    // 3. FaceRecognitionNet jalan lebih cepat karena input sudah di-crop
    
    // Crop wajah dari video berdasarkan bounding box
    const face = faces[0];
    const box = face.boundingBox;
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = 150;
    cropCanvas.height = 150;
    const ctx = cropCanvas.getContext("2d")!;
    ctx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, 150, 150);
    
    // Extract descriptor pake face-api.js FaceRecognitionNet aja
    // (model ini sudah di-load, lebih ringan dari full pipeline)
    if (!faceapi.nets.faceRecognitionNet.loaded) return null;
    const fullDesc = await faceapi.extractFaceDescriptor(cropCanvas) as any;
    if (!fullDesc) return null;
    
    return { descriptor: Array.from(fullDesc) };
  } catch {
    return null;
  }
}
```

**Simpler approach — gunakan @vladmandic/face-api (maintained fork):**
Jika native FaceDetector terlalu kompleks, alternatif: upgrade ke `@vladmandic/face-api` yang 3-5x lebih cepat dari `face-api.js`.

**Step 2: Upgrade ke @vladmandic/face-api**

```bash
cd apps/karyawan && bun remove face-api.js && bun add @vladmandic/face-api
```

Perubahan import:
```tsx
// OLD:
import * as faceapi from "face-api.js";

// NEW:
import * as faceapi from "@vladmandic/face-api";
```

API kompatibel (sama dengan face-api.js) tapi dengan optimasi:
- SIMD WebAssembly untuk neural net inference (2-5x faster)
- Lebih kecil bundle size
- Maintained active (face-api.js last update 2021)
- Dukungan TypeScript lebih baik

**Step 3: Optimasi parameter detection**

Di FaceRecognition.tsx, turunkan input size dan threshold untuk kecepatan:

```tsx
// OLD (akurat tapi lambat):
new faceapi.TinyFaceDetectorOptions({ inputSize: 96, scoreThreshold: 0.6 })

// NEW (lebih cepat, cukup untuk absensi jarak dekat):
new faceapi.TinyFaceDetectorOptions({ inputSize: 64, scoreThreshold: 0.5 })
```

Dampak: `inputSize: 96 → 64` mengurangi pixel processing dari 9216 ke 4096 = **~55% lebih cepat**.

**Step 4: Detection scheduling — lebih agresif**

```tsx
// OLD: 
timerIdRef.current = setTimeout(detect, 150); // Phase 1 loop

// NEW — lebih cepat:
timerIdRef.current = setTimeout(detect, 80);  // Phase 1 loop
```

Fase 2 juga lebih cepat — skip "stableRef" waiting:
```tsx
// OLD: 2-phase (fast detect → full pipeline on next tick)
// NEW: langsung full pipeline di setiap frame
const det = await faceapi.detectSingleFace(vid, opts)
  .withFaceLandmarks()
  .withFaceDescriptor();
```

**Step 5: Build test**

```bash
cd /opt/djiwatentramapp && npx turbo run build --filter=@yumipos/karyawan
```

**Step 6: Git commit**

```bash
git add apps/karyawan/ && git commit -m "perf: upgrade face detection with @vladmandic/face-api + optimized params"
```

---

### Ringkasan Peningkatan Kinerja

| Improvement | Estimasi Percepatan | Notes |
|---|---|---|
| Self-host model weights | 5-10x | CDN 1-5s → origin 50-200ms |
| Web Worker pipeline | UI tetap responsif | Tidak ada jank/block |
| @vladmandic/face-api | 2-5x | SIMD WebAssembly |
| inputSize 96→64 | 2x | 9216→4096 pixels |
| threshold 0.6→0.5 | 1.5x | Lebih cepat detect pertama |
| Detection freq 150→80ms | 2x | Loop lebih rapat |

**Target akhir:** Wajah terdeteksi + descriptor dalam **<500ms** dari camera mount.

---

## Phase 5: Verification & Deploy

### Task 5.1: Full build verification

```bash
cd /opt/djiwatentramapp

# Build all affected packages
npx turbo run build --filter=@yumipos/karyawan --filter=@yumipos/pos --filter=@yumipos/web-shared

# Type check
cd apps/karyawan && npx tsc --noEmit
cd ../pos && npx tsc --noEmit

# Git status
git status
```

### Task 5.2: Deploy

```bash
cd /opt/djiwatentramapp

# Commit all remaining changes
git add -A
git commit -m "feat: add PIN-OR-Face attendance flow to karyawan app"

# Push
git push origin main
```

Vercel auto-deploy untuk karyawan app akan build dari `apps/karyawan`. Jangan debug CF Pages build failures — Vercel yang handle.

### Task 5.3: Manual verification scenarios

**Skenario A — Face-only absen (user punya wajah):**
1. Buka karyawan.djiwatentram.web.id → `/attendance`
2. Pilih staff yang **sudah punya wajah**
3. Kamera muncul → deteksi wajah → "Berhasil Absen Masuk"
4. Cek log kehadiran di profil — muncul check_in hari ini

**Skenario B — Daftar wajah baru + absen (TANPA PIN):**
1. Buka `/attendance` → pilih staff **belum punya wajah**
2. Kamera muncul langsung → deteksi wajah → "Wajah berhasil terdaftar!" → "Berhasil Absen Masuk"
3. **Tidak perlu PIN sama sekali**

**Skenario C — Daftar ulang wajah (TANPA PIN):**
1. Buka `/attendance` → pilih staff yang sudah punya wajah
2. Klik **"Daftar Ulang Wajah"**
3. Kamera detect wajah baru → descriptor diganti → "Wajah berhasil diperbarui!" → absen
4. **Tidak perlu PIN**

**Skenario D — PIN-only (kamera error / user pilih PIN):**
1. Buka `/attendance` → pilih staff
2. Klik **"Absen Pakai PIN"**
3. Masukkan PIN 6 digit → "Berhasil Absen Masuk"
4. Verifikasi log kehadiran

---

## Rollback Plan

Jika deploy gagal:

```bash
git revert HEAD
git push origin main
```

Jika error parsial (misal face loading gagal):

- Karyawan app fallback ke PIN — absensi tetap jalan
- Tidak ada data loss — attendance via Supabase mirror
- Face enrollment bisa ditunda nanti

---

**Estimasi:** 3-4 jam kerja total (dengan build test setiap fase)
**Risiko:** Rendah — POS app tidak disentuh kecuali route link fix
**Key improvement:** User baru bisa skip face enrollment — PIN-only langsung absen
