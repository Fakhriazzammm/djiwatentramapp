# Plan: Percepatan Face Recognition di `/attendance`

> **Goal:** Kurangi waktu scan wajah dari ~300-900ms menjadi <200ms, dan model loading dari 3-5s menjadi <1s.

---

## #1. Current State Analysis

### Component Stack

```
FaceRecognition.tsx (face-api.js)
├── Model: TinyFaceDetector + FaceLandmark68 + FaceRecognitionNet
├── CDN: raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights
├── Ukuran model: ~5-8MB total (3 file manifest + 3 weight files)
├── Detection: requestAnimationFrame loop, async sequential
└── Verifikasi: 2 stable consecutive → withFaceDescriptor → euclidean distance
```

### Bottleneck Tree

```
Load Models (3-5s)
├── Network: CDN GitHub (raw.githubusercontent) — latency + DNS
├── File size: 3 model weights ~5-8MB
└── Browser cache: tidak di-cache permanen (hanya HTTP cache)

Detect Face (100-300ms per frame)
├── tinyFaceDetector (WASM): 96px input → ~30-80ms
├── faceLandmark68 (WASM): align face → ~20-50ms
└── faceRecognitionNet (WASM): compute descriptor → ~50-150ms

Auto-Verify (2 frames × 100-300ms = 200-600ms)
└── Butuh 2 frame stabil berturut-turut
```

### Already Fixed (sesi ini)
| Optimasi | Sebelum | Sesudah | Efek |
|---|---|---|---|
| `inputSize` | 128 (46K px) | 96 (26K px) | ~2x faster |
| `scoreThreshold` | 0.5 | 0.6 | Less FP |
| `stableRef` | 3 frames | 2 frames | -1 cycle |
| `timeout` | 3000ms | 5000ms | Toleran |

---

## #2. Dependency Graph

```
Level 1 (independen → paralel 🔥)
├── A. Model lokal hosting — serve dari domain sendiri
├── B. Model IndexedDB cache — skip re-download
└── C. Detection pipeline — frame skip + dual-phase

Level 2 (dependen)
├── D. MediaPipe Face Landmarker — alternative library
├── E. Backend face matching — edge function
└── F. Preload on app startup — segera setelah login

Level 3 (opsional)
└── G. FaceDetector API native — Chrome-only fallback
```

---

## #3. Task Detail

### Task A: Host Model Files Lokal (🟢 Easy, High Impact)
**File:** `apps/web/public/models/` + `FaceRecognition.tsx`

**Masalah:** Model di-download dari GitHub CDN setiap kali buka attendance (kecuali HTTP cache masih valid).

**Solusi:**
```bash
# Download model files ke public/models/
mkdir -p apps/web/public/models
cd apps/web/public/models
# tiny_face_detector
curl -sLO https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-weights_manifest.json
curl -sLO https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-shard1
# face_landmark_68
curl -sLO https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-weights_manifest.json
curl -sLO https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-shard1
# face_recognition
curl -sLO https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-weights_manifest.json
curl -sLO https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-shard1
```

Update `CANDIDATES` di `FaceRecognition.tsx` — urutkan local path lebih dulu dari CDN.

**Verifikasi:** File di `public/models/` terbaca via `curl -sI /models/tiny_face_detector_model-weights_manifest.json`

---

### Task B: IndexedDB Cache Model (🟢 Easy, High Impact)
**File:** `FaceRecognition.tsx`

**Masalah:** Setiap refresh halaman, model di-download ulang (HTTP cache mungkin expired).

**Solusi:**
Gunakan `caches` API (CacheStorage) untuk menyimpan model weights setelah pertama kali download:

```typescript
// Cek cache dulu sebelum fetch dari CDN
const cache = await caches.open('face-models-v1');
const cachedResponse = await cache.match(url);
if (cachedResponse) return cachedResponse;

// Fallback ke fetch, lalu simpan ke cache
const response = await fetch(url);
cache.put(url, response.clone());
return response;
```

Atau alternatif: load models via `loadFromUri` sudah support path relatif — cukup pindahkan model ke `public/models/` (Task A selesai, Task B otomatis).

---

### Task C: Detection Pipeline - Frame Skip + Dual-Phase (🟡 Medium, High Impact)
**File:** `FaceRecognition.tsx`

**Masalah:** Setiap frame menjalankan `detectSingleFace → withFaceLandmarks → withFaceDescriptor` padahal untuk frame ke-1 kita cuma butuh tahu "apakah ada wajah?" — descriptor tidak perlu sampai frame ke-2.

**Solusi Dual-Phase Detection:**

```
Frame 1: detectSingleFace ONLY (no landmarks, no descriptor)
         → if face found, increment counter, schedule next frame
         
Frame 2: detectSingleFace → withFaceLandmarks → withFaceDescriptor
         → if face still found AND counter >= 2, auto-verify
         → else, reset counter back to 0
```

Ini menghemat ~70-200ms per frame pertama karena skip landmark + descriptor.

**Perubahan kode:**
```typescript
// Phase 1: Fast detect (no descriptor)
const det1 = await faceapi.detectSingleFace(vid,
  new faceapi.TinyFaceDetectorOptions({ inputSize: 96, scoreThreshold: 0.6 })
);

if (!det1) {
  // No face — reset
  stableRef.current = 0;
  setFace(false);
  drawBox(null);
  continueLoop();
  return;
}

setFace(true);
stableRef.current += 1;

if (stableRef.current >= 2) {
  // Phase 2: Full detect with descriptor
  const det2 = await faceapi
    .detectSingleFace(vid, new faceapi.TinyFaceDetectorOptions({ inputSize: 96, scoreThreshold: 0.6 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  
  if (!det2) {
    stableRef.current = 0;
    continueLoop();
    return;
  }
  
  // Auto-verify
  alreadyRef.current = true;
  await onVerify(Array.from(det2.descriptor));
  setSt("success");
} else {
  // Just need one more frame — wait for next detection
  drawBox(det1);
}

continueLoop();
```

---

### Task D: MediaPipe Face Landmarker (🔴 Heavy, Very High Impact)
**File:** `FaceRecognition.tsx` — major rewrite

**Masalah:** face-api.js berjalan di WASM + CPU, tidak memanfaatkan GPU/WebGL. MediaPipe dari Google menggunakan WebGL + GPU delegate — **5-10x lebih cepat**.

**Solusi:**
Ganti `face-api.js` dengan `@mediapipe/tasks-vision`:

```typescript
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const vision = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
);

const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    delegate: "GPU",  // ← GPU accelerated!
  },
  runningMode: "VIDEO",
  numFaces: 1,
  outputFaceBlendshapes: false,
  outputFacialTransformationMatrixes: false,
});
```

**Performa:** ~5-15ms per frame (vs 100-300ms face-api.js)

**Tantangan:**
- MediaPipe Face Landmarker tidak built-in face descriptor (embedding vector)
- Untuk face recognition, perlu model tambahan (FaceNet / ArcFace)
- Alternatif: kirim cropped face ke Edge Function untuk compute descriptor
- Ukuran WASM ~12MB

---

### Task E: Backend Face Matching via Edge Function (🟡 Medium, Medium Impact)
**File:** `use-hybrid-write-actions.ts` + new Edge Function

**Masalah:** Face matching saat ini dilakukan di browser via `euclideanDistance`. Ini berarti:
1. Face descriptor harus di-download ke browser (via `yumi_users.raw->faceDescriptor`)
2. Biometric data (face descriptor) terekspos ke client

**Solusi:** Buat Edge Function `verify-face` yang menerima face descriptor + userId, lalu compute matching di server (service_role).

```typescript
// Frontend → Kirim descriptor ke server
const { data } = await supabase.functions.invoke("verify-face", {
  body: { userId, faceDescriptor: desc }
});

// Edge Function → SELECT stored descriptor + compute distance
const user = await supabase.from("yumi_users")
  .select("raw->>faceDescriptor")
  .eq("source_id", userId)
  .single();

const distance = euclideanDistance(input, stored);
return { match: distance <= 0.6, distance };
```

**Keuntungan:**
- Biometric data tidak perlu SELECT dari client side (tidak perlu grant `raw` ke anon)
- Compute di server lebih cepat (Deno)
- Security hardening lebih ketat

---

### Task F: Preload Models Sejak Awal (🟢 Easy, Medium Impact)
**File:** `__root.tsx` + `FaceRecognition.tsx`

**Masalah:** `preloadFaceModels()` hanya dipanggil saat user sampai di `step === "select"`. Jika user auto-authenticated, mereka langsung ke face step sebelum model selesai load.

**Solusi:** Panggil `preloadFaceModels()` lebih awal — saat app mount:

```typescript
// __root.tsx
import { preloadFaceModels } from "@/components/auth/FaceRecognition";

// Di root layout, segera setelah user login terdeteksi
useEffect(() => {
  if (isAuthenticated) {
    // Preload face models tanpa blocking UI
    preloadFaceModels();
  }
}, [isAuthenticated]);
```

---

### Task G: Native FaceDetector API sebagai Fallback (🟡 Medium, Chrome-only)
**File:** `FaceRecognition.tsx`

**Chrome 70+ punya built-in FaceDetector API yang hardware-accelerated:**
```typescript
const faceDetector = new FaceDetector({
  maxDetectedFaces: 1,
  fastMode: true,
});

// Detect face in <10ms (GPU accelerated)
const faces = await faceDetector.detect(video);
if (faces.length > 0) {
  // Gunakan bounding box untuk crop, kirim ke face-api.js descriptor saja
  const face = faces[0];
  const desc = await computeDescriptorOnly(video, face.boundingBox);
}
```

**Keuntungan:** ~10ms vs ~80ms untuk detection phase
**Kekurangan:** Hanya Chrome, perlu fallback ke face-api.js untuk browser lain

---

## #4. Wave Planning

### Wave 1 (🔥 Paralel — 3 task)
Semua independent:

| Task | File | Subagent | Estimasi |
|---|---|---|---|
| **A. Model Lokal** | Download → `public/models/` + update `CANDIDATES` | ✅ | 10 menit |
| **F. Preload Awal** | `__root.tsx` + `FaceRecognition.tsx` | ✅ | 5 menit |
| **G. FaceDetector Fallback** (opsional) | `FaceRecognition.tsx` | ✅ | 30 menit |

### Wave 2 (Sequential — depends on Wave 1)
| Task | File | Subagent | Estimasi |
|---|---|---|---|
| **C. Dual-Phase Detection** | `FaceRecognition.tsx` | ✅ | 20 menit |

### Wave 3 (Independent — bisa parallel dengan Wave 2)
| Task | File | Subagent | Estimasi |
|---|---|---|---|
| **E. Backend Face Matching** | Edge Function + `use-hybrid-write-actions.ts` | 🏗️ orchestrator | 45 menit |

### Wave 4 (Heavy — last)
| Task | File | Subagent | Estimasi |
|---|---|---|---|
| **D. MediaPipe Migrate** | `FaceRecognition.tsx` rewrite | 🏗️ orchestrator | 2-3 jam |

---

## #5. Risk & Catatan

### Data Integrity
- `inputSize=96` mungkin kurang akurat untuk wajah kecil/jauh — uji dengan berbagai jarak kamera
- Jika false negative meningkat, naikkan kembali ke `inputSize=128`

### Security
- Task E (backend face matching) menghilangkan kebutuhan grant `raw` ke anon — lebih secure
- Face descriptor tetap biometric data — jangan di-log

### Compatibility
- MediaPipe Face Landmarker WASM ~12MB — download size besar
- Chrome FaceDetector API hanya Chrome ≥ 70 — perlu fallback
- face-api.js model ~5MB — lebih kecil dari MediaPipe

### Deployment
- Model files di `public/models/` ikut bundle build — cek size bundle setelah deploy
- Edge Function baru perlu di-deploy via `npx supabase functions deploy`

---

## #6. Prioritaskan

| Priority | Task | Effort | Impact | Alasan |
|---|---|---|---|---|
| **P0** | A. Model Lokal | 🟢 10m | 🔥 | Langsung kurangi latency network |
| **P0** | F. Preload Awal | 🟢 5m | 🔥 | Models ready sebelum user sampai |
| **P1** | C. Dual-Phase | 🟡 20m | 🔥 | Hemat 1 siklus descriptor |
| **P1** | B. IndexedDB Cache | 🟢 10m | 🔥 | Skip download setelah 1x |
| **P2** | E. Backend Match | 🟡 45m | 🔒 | Hardening security |
| **P3** | D. MediaPipe | 🔴 2-3j | 🚀 | 5-10x faster (long-term) |
| **P3** | G. Native Fallback | 🟡 30m | 🟢 | Chrome optimization |
