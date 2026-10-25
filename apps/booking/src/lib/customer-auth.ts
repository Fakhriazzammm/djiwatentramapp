import { useEffect, useState } from "react";

const AUTH_BASE = import.meta.env.VITE_AUTH_URL?.trim() || "https://api.djiwatentram.web.id";
const CUSTOMER_APP_ORIGIN = import.meta.env.VITE_CUSTOMER_APP_URL?.trim() || "https://djiwatentram.yumme.id";
const LOGIN_URL = `${CUSTOMER_APP_ORIGIN}/masuk`;

type BookingCustomer = { sourceId: string; name: string; email: string; phone: string };

type AuthState = { isLoading: boolean; isAuthenticated: boolean; customer: BookingCustomer | null };

export async function fetchBookingCustomer(): Promise<BookingCustomer | null> {
  const sessionResponse = await fetch(`${AUTH_BASE}/api/auth/get-session`, { credentials: "include", headers: { Accept: "application/json" } });
  if (!sessionResponse.ok) throw new Error("session unavailable");
  const session = await sessionResponse.json() as { user?: { id?: string; name?: string | null; email?: string | null } } | null;
  if (!session?.user?.id) return null;

  const profileResponse = await fetch(`${AUTH_BASE}/v1/customer/profile`, { credentials: "include", headers: { Accept: "application/json" } });
  const profilePayload = await profileResponse.json().catch(() => null) as { success?: boolean; customer?: Record<string, unknown> } | null;
  const profile = profilePayload?.success ? profilePayload.customer : undefined;
  return {
    sourceId: String(profile?.source_id ?? session.user.id),
    name: String(profile?.name ?? session.user.name ?? ""),
    email: String(profile?.email ?? session.user.email ?? ""),
    phone: String(profile?.phone ?? ""),
  };
}

export function useBookingCustomerAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ isLoading: true, isAuthenticated: false, customer: null });
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const customer = await fetchBookingCustomer();
        if (active) setState(customer ? { isLoading: false, isAuthenticated: true, customer } : { isLoading: false, isAuthenticated: false, customer: null });
      } catch {
        if (active) setState({ isLoading: false, isAuthenticated: false, customer: null });
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
