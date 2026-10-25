import { useEffect, useState } from "react";

// These are the same-origin API bridges used by the deployed customer bundle.
// Keep auth and profile on the same canonical domain so browser cookies work.
const AUTH_BASE = "https://api.djiwatentram.web.id/api/auth";
const CUSTOMER_API_BASE = "https://api.djiwatentram.web.id/api/customer";
// Browser navigation needs the customer login page, not an auth API endpoint.
const LOGIN_URL = "https://djiwatentram.web.id/masuk";

export type BookingCustomer = { sourceId: string; name: string; email: string; phone: string };

type AuthState = { isLoading: boolean; isAuthenticated: boolean; customer: BookingCustomer | null; error: string | null };

type SessionUser = { id?: string; name?: string | null; email?: string | null };

export function parseCustomerProfile(payload: unknown, sessionUser: SessionUser): BookingCustomer | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const body = payload as { success?: unknown; customer?: unknown };
  if (body.success !== true || !body.customer || typeof body.customer !== "object" || Array.isArray(body.customer)) return null;
  const profile = body.customer as Record<string, unknown>;
  const sourceId = String(profile.source_id ?? sessionUser.id ?? "").trim();
  const name = String(profile.name ?? sessionUser.name ?? "").trim();
  const email = String(profile.email ?? sessionUser.email ?? "").trim();
  const phone = String(profile.phone ?? "").trim();
  if (!sourceId || !name || !email || !phone) return null;
  return { sourceId, name, email, phone };
}

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
        const session = await sessionResponse.json() as { user?: { id?: string; name?: string | null; email?: string | null } } | null;
        if (!session?.user?.id) {
          if (active) setState({ isLoading: false, isAuthenticated: false, customer: null, error: null });
          return;
        }
        const profileResponse = await authFetch(`${CUSTOMER_API_BASE}/profile`);
        if (!profileResponse.ok) throw new Error(`profile request failed (${profileResponse.status})`);
        const profilePayload = await profileResponse.json().catch(() => null);
        const customer = parseCustomerProfile(profilePayload, session.user);
        if (!customer) throw new Error("customer profile is incomplete");
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

export function buildBookingLoginUrl(origin = window.location.origin) {
  const returnTo = `${origin}/?step=checkout`;
  const url = new URL(LOGIN_URL);
  url.searchParams.set("sso", "1");
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}

export function redirectToBookingLogin() {
  window.location.assign(buildBookingLoginUrl());
}
