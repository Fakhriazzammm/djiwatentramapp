import { useEffect, useState } from "react";

const AUTH_BASE = "https://auth.zantara.id/api/auth";
const CUSTOMER_API_BASE = "https://api.yumme.id/v1/customer";
// Browser navigation needs the customer login page, not an auth API endpoint.
const LOGIN_URL = "https://djiwatentram.yumme.id/masuk";

type BookingCustomer = { sourceId: string; name: string; email: string; phone: string };

type AuthState = { isLoading: boolean; isAuthenticated: boolean; customer: BookingCustomer | null };

export function useBookingCustomerAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ isLoading: true, isAuthenticated: false, customer: null });
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const sessionResponse = await fetch(`${AUTH_BASE}/get-session`, { credentials: "include", headers: { Accept: "application/json" } });
        if (!sessionResponse.ok) throw new Error("session unavailable");
        const session = await sessionResponse.json() as { user?: { id?: string; name?: string | null; email?: string | null } };
        if (!session.user?.id) {
          if (active) setState({ isLoading: false, isAuthenticated: false, customer: null });
          return;
        }
        const profileResponse = await fetch(`${CUSTOMER_API_BASE}/profile`, { credentials: "include", headers: { Accept: "application/json" } });
        const profilePayload = await profileResponse.json().catch(() => null) as { success?: boolean; customer?: Record<string, unknown> } | null;
        const profile = profilePayload?.success ? profilePayload.customer : undefined;
        const customer: BookingCustomer = {
          sourceId: String(profile?.source_id ?? session.user.id),
          name: String(profile?.name ?? session.user.name ?? ""),
          email: String(profile?.email ?? session.user.email ?? ""),
          phone: String(profile?.phone ?? ""),
        };
        if (active) setState({ isLoading: false, isAuthenticated: true, customer });
      } catch {
        if (active) setState({ isLoading: false, isAuthenticated: false, customer: null });
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
