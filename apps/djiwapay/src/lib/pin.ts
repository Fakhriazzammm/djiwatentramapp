/** Djiwa Pay PIN: six digits, checked on the server before money moves. The screen that asks for it registers itself here. */
export type PinStatus = { set: boolean; lockedUntil: string | null };
export type PinRequest = { reason: string; mode: "enter" | "create"; error?: string };
export class PinError extends Error { constructor(message: string, readonly code: string, readonly lockedUntil?: string) { super(message); } }
export class PinCancelled extends Error { constructor() { super("PIN dibatalkan"); } }

let requester: ((r: PinRequest) => Promise<string | null>) | null = null;
export const registerPinRequester = (fn: (r: PinRequest) => Promise<string | null>) => { requester = fn; return () => { if (requester === fn) requester = null; }; };
export const requestPin = (r: PinRequest): Promise<string | null> => (requester ? requester(r) : Promise.resolve(null));

const post = (path: string, body?: unknown, method = "POST") => fetch(`/api/pay-bridge${path}`, { method, credentials: "include", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const read = async (res: Response) => ({ ok: res.ok, status: res.status, ...(await res.json().catch(() => ({}))) } as { ok: boolean; status: number; success?: boolean; error?: string; attemptsLeft?: number; lockedUntil?: string; [k: string]: unknown });

export async function getPinStatus(): Promise<PinStatus> {
  const r = await read(await fetch("/api/pay-bridge/pin/status", { credentials: "include" }));
  if (!r.ok) throw new Error("Status PIN belum bisa dimuat");
  return { set: Boolean(r.set), lockedUntil: (r.lockedUntil as string | null) ?? null };
}
export const pinMessage = (r: { error?: string; attemptsLeft?: number; lockedUntil?: string }) =>
  r.error === "PIN_INVALID" ? `PIN salah. Sisa percobaan ${r.attemptsLeft ?? 0}.`
  : r.error === "PIN_LOCKED" ? `PIN terkunci sementara karena terlalu banyak salah. Coba lagi ${r.lockedUntil ? `pukul ${new Date(r.lockedUntil).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : "nanti"}.`
  : r.error === "WEAK_PIN" ? "PIN terlalu mudah ditebak. Hindari angka berurutan atau kembar."
  : r.error === "INVALID_PIN" ? "PIN harus 6 angka." : r.error === "PIN_EXISTS" ? "PIN sudah dibuat. Gunakan ubah PIN." : r.error === "WRONG_PASSWORD" ? "Kata sandi salah." : r.error === "NO_PASSWORD" ? "Akun ini belum punya kata sandi. Atur kata sandi lebih dulu." : "Permintaan PIN gagal. Coba lagi.";

export async function createPin(pin: string): Promise<void> { const r = await read(await post("/pin/set", { pin })); if (!r.ok) throw new PinError(pinMessage(r), r.error ?? "ERROR"); }
export async function changePin(pin: string, newPin: string): Promise<void> { const r = await read(await post("/pin/change", { pin, newPin })); if (!r.ok) throw new PinError(pinMessage(r), r.error ?? "ERROR", r.lockedUntil); }
export async function resetPin(password: string, newPin: string): Promise<void> { const r = await read(await post("/pin/reset", { password, newPin })); if (!r.ok) throw new PinError(pinMessage(r), r.error ?? "ERROR"); }
export async function verifyPin(pin: string): Promise<void> { const r = await read(await post("/pin/verify", { pin })); if (!r.ok) throw new PinError(pinMessage(r), r.error ?? "ERROR", r.lockedUntil); }

/**
 * Runs a request that needs the PIN: asks for it (creating one first when none exists), retries on a wrong PIN, and gives up
 * with a message when the PIN is locked. Any other answer, good or bad, is handed back to the caller untouched.
 */
export async function pinGuarded(reason: string, send: (pin: string) => Promise<Response>): Promise<Response> {
  let mode: PinRequest["mode"] = (await getPinStatus().catch(() => ({ set: true }))).set ? "enter" : "create", error: string | undefined, known: string | null = null;
  for (let tries = 0; tries < 12; tries += 1) {
    const pin = known ?? await requestPin({ reason, mode, error });
    if (!pin) throw new PinCancelled();
    if (mode === "create") {
      try { await createPin(pin); } catch (e) { error = e instanceof Error ? e.message : "PIN belum bisa dibuat"; if (e instanceof PinError && e.code === "PIN_EXISTS") { mode = "enter"; error = undefined; } continue; }
      mode = "enter"; error = undefined; known = pin;
    }
    const res = await send(pin);
    if (res.ok) return res;
    const r = await read(res.clone());
    if (r.error === "PIN_INVALID" || r.error === "PIN_REQUIRED") { error = pinMessage({ ...r, error: "PIN_INVALID" }); known = null; continue; }
    if (r.error === "PIN_LOCKED") throw new PinError(pinMessage(r), "PIN_LOCKED", r.lockedUntil);
    if (r.error === "PIN_NOT_SET") { mode = "create"; known = null; continue; }
    return res;
  }
  throw new PinError("Terlalu banyak percobaan PIN", "PIN_RETRIES");
}
