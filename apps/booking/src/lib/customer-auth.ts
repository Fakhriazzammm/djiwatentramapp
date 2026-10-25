import { useEffect, useState } from "react";

// These are the same-origin API bridges used by the deployed customer bundle.
// Keep auth and profile on the same canonical domain so browser cookies work.
const AUTH_BASE = "https://api.djiwatentram.web.id/api/auth";
const CUSTOMER_API_BASE = "https://api.djiwatentram.web.id/api/customer";
// Browser navigation needs the customer login page, not an auth API endpoint.
const LOGIN_URL = "https://djiwatentram.web.id/masuk";

type BookingCustomer = { sourceId: string; name: string; email: string; phone: string };

type AuthState = { isLoading: boolean; isAuthenticated: boolean; customer: BookingCustomer | null; error: string | null };

const AUTH_TIMEOUT_MS = 8000;

async function authFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    return await fetch(url, { credentials: "include", headers: { Accept: "application/json" }, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

export function useBookingCustomerAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ isLoading: true, isAuthenticated: false, customer: null, error: null });
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const sessionResponse = await authFetch(`${AUTH_BASE}/get-session`);
        if (!sessionResponse.ok) throw new Error("session unavailable");
        const session = await sessionResponse.json() as { user?: { id?: string; name?: string | null; email?: string | null } };
        if (!session.user?.id) {
          if (active) setState({ isLoading: false, isAuthenticated: false, customer: null, error: null });
          return;
        }
        const profileResponse = await authFetch(`${CUSTOMER_API_BASE}/profile`);
        if (!profileResponse.ok) throw new Error(`profile request failed (${profileResponse.status})`);
        const profilePayload = await profileResponse.json().catch(() => null) as { success?: boolean; customer?: Record<string, unknown> } | null;
        const profile = profilePayload?.success ? profilePayload.customer : undefined;
        const customer: BookingCustomer = {
          sourceId: String(profile?.source_id ?? session.user.id),
          name: String(profile?.name ?? session.user.name ?? ""),
          email: String(profile?.email ?? session.user.email ?? ""),
          phone: String(profile?.phone ?? ""),
        };
        if (active) setState({ isLoading: false, isAuthenticated: true, customer, error: null });
      } catch (error: unknown) {
        const message = error instanceof DOMException && error.name === "AbortError"
          ? "Layanan login terlalu lama merespons. Periksa koneksi lalu coba lagi."
          : "Layanan login tidak dapat dihubungi. Coba lagi beberapa saat lagi.";
        if (active) setState({ isLoading: false, isAuthenticated: false, customer: null, error: message });
      }
    })();
    return () => { active = false; };
  }, []);
  return state;
}

export function redirectToBookingLogin() {
  const returnTo = `${window.location.origin}/?step=checkout`;
  const url = new URL(LOGIN_URL);
  url.searchParams.set("sso", "1");
  url.searchParams.set("returnTo", returnTo);
  window.location.assign(url.toString());
}
