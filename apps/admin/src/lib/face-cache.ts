/**
 * Face descriptor cache — localStorage-based caching untuk:
 * - Mempercepat face verification (sidik jari wajah ga perlu fetch dari Supabase tiap kali)
 * - Menyimpan status model loading
 * - Fallback jika Supabase offline
 */

const CACHE_PREFIX = "face_cache_";
const DESCRIPTOR_KEY_PREFIX = CACHE_PREFIX + "desc_";
const MODEL_LOADED_KEY = CACHE_PREFIX + "models_loaded";

const THRESHOLD = 0.6; // euclidean distance threshold

interface CacheEntry {
  userId: string;
  descriptor: number[];
  timestamp: number;
}

/** Simpan face descriptor user ke localStorage */
export function cacheFaceDescriptor(userId: string, descriptor: number[]): void {
  try {
    const entry: CacheEntry = {
      userId,
      descriptor,
      timestamp: Date.now(),
    };
    localStorage.setItem(DESCRIPTOR_KEY_PREFIX + userId, JSON.stringify(entry));
  } catch {
    // localStorage penuh — silent
  }
}

/** Ambil face descriptor user dari cache */
export function getCachedFaceDescriptor(userId: string): number[] | null {
  try {
    const raw = localStorage.getItem(DESCRIPTOR_KEY_PREFIX + userId);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    return entry.descriptor;
  } catch {
    return null;
  }
}

/** Hapus cache face descriptor user tertentu */
export function clearFaceCache(userId: string): void {
  try {
    localStorage.removeItem(DESCRIPTOR_KEY_PREFIX + userId);
  } catch { /* silent */ }
}

/** Hapus semua cache face descriptor */
export function clearAllFaceCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DESCRIPTOR_KEY_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* silent */ }
}

/** Bandingkan dua face descriptor via euclidean distance */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/** Verifikasi face descriptor terhadap cache, return apakah match */
export function verifyFaceFromCache(
  capturedDescriptor: number[],
  userId: string,
): { match: boolean; distance: number } {
  const cached = getCachedFaceDescriptor(userId);
  if (!cached || cached.length === 0) {
    return { match: false, distance: Infinity };
  }

  const distance = euclideanDistance(capturedDescriptor, cached);
  return { match: distance <= THRESHOLD, distance };
}

/** Tandai bahwa face models sudah pernah di-load */
export function markModelsLoaded(): void {
  try {
    localStorage.setItem(MODEL_LOADED_KEY, "1");
  } catch { /* silent */ }
}

/** Cek apakah face models sudah pernah di-load di browser ini */
export function wereModelsLoaded(): boolean {
  try {
    return localStorage.getItem(MODEL_LOADED_KEY) === "1";
  } catch {
    return false;
  }
}
