/**
 * First-launch opening: the animated mascot greets a customer the very first
 * time Djiwa Pay opens on a device, then never again. Bump the version to show
 * a new opening to everyone once.
 */
export const DJIWA_PAY_OPENING_KEY = "djiwapay:opening-seen:v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function safeStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * True when the opening should play. `?opening=1` forces it (review/QA);
 * without storage (private mode, blocked site data) we skip it rather than
 * replay the greeting on every launch.
 */
export function shouldShowDjiwaPayOpening(search = "", storage: StorageLike | null = safeStorage()): boolean {
  if (new URLSearchParams(search).get("opening") === "1") return true;
  if (!storage) return false;
  try {
    return storage.getItem(DJIWA_PAY_OPENING_KEY) === null;
  } catch {
    return false;
  }
}

export function markDjiwaPayOpeningSeen(storage: StorageLike | null = safeStorage()): void {
  try {
    storage?.setItem(DJIWA_PAY_OPENING_KEY, new Date().toISOString());
  } catch {
    /* storage is optional */
  }
}

/** What the mascot says on each tap, cycling. */
export const DJIWA_PAY_OPENING_LINES = [
  "Tangkap koinnya!",
  "Bisa tangkap tiga koin?",
  "Satu koin lagi masuk tabungan.",
  "Pengeluaran hari ini sudah dicatat?",
  "Siap mulai!",
] as const;

export function nextOpeningLine(index: number): { index: number; line: string } {
  const next = ((index % DJIWA_PAY_OPENING_LINES.length) + DJIWA_PAY_OPENING_LINES.length) % DJIWA_PAY_OPENING_LINES.length;
  return { index: next, line: DJIWA_PAY_OPENING_LINES[next] };
}
