export const CUSTOMER_AUTH_BASE_URL = "https://auth.zantara.id/api/auth";
export const CUSTOMER_PROFILE_BASE_URL = "https://djiwatentram.yumme.id/api/customer";

export const REGISTRATION_CONSENT_TEXT = "Saya menyetujui Ketentuan Djiwa dan berbagi aktivitas pembelian di Komunitas. Saya dapat mengubah pilihan ini di Profil.";

export function validateCredentials(email: string, password: string, name?: string, consent?: boolean): string | null {
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return "Masukkan email yang valid.";
  if (!password.trim()) return "Password wajib diisi.";
  if (name !== undefined) {
    if (!name.trim()) return "Nama lengkap wajib diisi.";
    if (password.length < 8) return "Password minimal 8 karakter.";
    if (password.length > 128) return "Password maksimal 128 karakter.";
    if (!consent) return "Persetujuan wajib dipilih saat membuat akun.";
  }
  return null;
}

export function getSafeCustomerReturnUrl(searchString: string) {
  const search = new URLSearchParams(searchString);
  if (search.get("sso") !== "1") return null;
  const raw = search.get("returnTo");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const allowedOrigins = new Set([
      "https://merchandise.yumme.id",
      "https://ordermieyamin.yumme.id",
      "https://booking.yumme.id",
      "http://localhost:3010",
      "http://localhost:5174",
    ]);
    const isAllowedPath = /^\/[^/]+\/order$/.test(url.pathname) || url.pathname === "/";
    const step = url.searchParams.get("step");
    const stage = url.searchParams.get("stage");
    const isAllowedStep = step === null || step === "checkout" || step === "shipping" || step === "payment";
    const isAllowedStage = stage === null || stage === "order";
    const hasOnlySafeParams = [...url.searchParams.keys()].every((key) => key === "step" || key === "stage");
    if (url.username || url.password || !allowedOrigins.has(url.origin) || !isAllowedPath || !isAllowedStep || !isAllowedStage || !hasOnlySafeParams || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function customerAuthCallback(origin: string, search: string): string {
  const callback = new URL("/masuk", origin);
  const returnTo = getSafeCustomerReturnUrl(search);
  if (returnTo) {
    callback.searchParams.set("sso", "1");
    callback.searchParams.set("returnTo", returnTo);
  }
  return callback.toString();
}
