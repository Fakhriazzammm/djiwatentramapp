import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Star } from "lucide-react";

export const GOOGLE_REVIEW_URL = "https://g.page/r/Ccd6bRmm1GH4EAE/review";
const COUNTDOWN_SECONDS = 5;
/** Struk lama yang dibuka dari riwayat tidak memicu ajakan ulasan. */
const FRESH_WINDOW_MS = 2 * 60 * 60 * 1000;

const storageKey = (orderId: string) => `djiwa-google-review:${orderId}`;

function alreadyHandled(orderId: string) {
  try { return window.localStorage.getItem(storageKey(orderId)) === "1"; } catch { return false; }
}
function markHandled(orderId: string) {
  try { window.localStorage.setItem(storageKey(orderId), "1"); } catch { /* mode privat */ }
}

/** Buka ulasan Google di browser dalam aplikasi (tab kustom/overlay) agar pelanggan bisa kembali ke struk; bila diblokir, pakai tab yang sama (tombol kembali tetap membawa ke struk). */
export function openGoogleReview() {
  const opened = window.open(GOOGLE_REVIEW_URL, "_blank", "noopener,noreferrer");
  if (!opened) window.location.assign(GOOGLE_REVIEW_URL);
}

/**
 * Setelah pembayaran QRIS Mayar lunas: hitung mundur 5 detik lalu arahkan ke ulasan Google (sekali per pesanan).
 * Hanya dipasang untuk QRIS Mayar; pembayaran tunai di kasir dan Djiwa Pay tidak memicunya.
 */
export function GoogleReviewRedirect({ orderId, createdAt }: { orderId: string; createdAt?: number | string | null }) {
  const created = createdAt == null ? NaN : typeof createdAt === "number" ? createdAt : Date.parse(String(createdAt));
  const fresh = !Number.isFinite(created) || Date.now() - created < FRESH_WINDOW_MS;
  const [active, setActive] = useState(() => Boolean(orderId) && fresh && !alreadyHandled(orderId));
  const [left, setLeft] = useState(COUNTDOWN_SECONDS);
  const firedRef = useRef(false);

  const go = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    markHandled(orderId);
    setActive(false);
    openGoogleReview();
  }, [orderId]);

  const dismiss = () => {
    markHandled(orderId);
    setActive(false);
  };

  useEffect(() => {
    if (!active) return;
    if (left <= 0) {
      go();
      return;
    }
    const timer = window.setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [active, left, go]);

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="mx-auto w-full max-w-sm rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-950 shadow-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100"><Star className="h-4.5 w-4.5 fill-amber-400 text-amber-500" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-black leading-tight">Terima kasih, pembayaran berhasil!</p>
              <p className="text-[11.5px] leading-tight text-amber-900/80">Kami arahkan ke ulasan Google dalam {left} detik. Setelah itu kamu bisa kembali ke struk.</p>
            </div>
          </div>
          <div className="mt-2.5 flex gap-2">
            <button type="button" onClick={go} className="min-h-10 flex-1 rounded-full bg-amber-500 px-3 text-[12.5px] font-extrabold text-white active:scale-[.98]">Beri ulasan sekarang</button>
            <button type="button" onClick={dismiss} className="min-h-10 rounded-full px-4 text-[12.5px] font-bold text-amber-900 active:scale-[.98]">Nanti</button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
