import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { authClient } from "@/lib/auth-client";
import { CUSTOMER_PROFILE_BASE_URL, customerAuthCallback, validateCredentials } from "@/lib/customer-auth-flow";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────

export type CustomerUser = {
  sourceId: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  customerDescription: string | null;
  photoUrl: string | null;
  nickname: string | null;
  birthDate: string | null;
  gender: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  marketingConsent: boolean;
  sharePurchaseActivity: boolean;
  purchaseActivityNameMode: "first_name" | "full_name";
  profileCompletedAt: string | null;
  username: string;
  totalPoints: number;
  lifetimePoints: number;
  totalOrders: number;
  totalSpent: number;
  walletBalance: number;
  walletHeldBalance: number;
  walletTotalCredited: number;
  walletTotalDebited: number;
  walletStatus: "active" | "blocked";
  lastOrderAt: string | null;
  createdAt: string | null;
};

type CustomerSession = {
  user: CustomerUser;
};

interface CustomerAuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  session: CustomerSession | null;
  customer: CustomerUser | undefined;
  registrationNeedsEmailConfirm: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    name: string,
    sharePurchaseActivity?: boolean,
  ) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
}

// ── Helpers ────────────────────────────────────────────────────

function deriveUsername(email: string | null, name?: string | null): string {
  // ponytail: name-priority, email fallback; slug spaces/dots → hyphen
  const base = (name?.trim() || email?.split("@")[0] || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base || "user";
}

function mapCustomerRow(row: Record<string, unknown>): CustomerUser {
  return {
    sourceId: String(row.source_id ?? ""),
    email: (row.email as string) ?? null,
    name: (row.name as string) ?? null,
    phone: (row.phone as string) ?? null,
    customerDescription: (row.customer_description as string) ?? null,
    photoUrl: (row.photo_url as string) ?? null,
    nickname: (row.nickname as string) ?? null,
    birthDate: (row.birth_date as string) ?? null,
    gender: (row.gender as string) ?? null,
    address: (row.address as string) ?? null,
    city: (row.city as string) ?? null,
    province: (row.province as string) ?? null,
    postalCode: (row.postal_code as string) ?? null,
    marketingConsent: row.marketing_consent === true,
    sharePurchaseActivity: row.share_purchase_activity === true,
    purchaseActivityNameMode: row.purchase_activity_name_mode === "full_name" ? "full_name" : "first_name",
    profileCompletedAt: (row.profile_completed_at as string) ?? null,
    username: String(row.username ?? deriveUsername((row.email as string) ?? null, (row.name as string) ?? null)),
    totalPoints: Number(row.total_points ?? 0),
    lifetimePoints: Number(row.lifetime_points ?? 0),
    totalOrders: Number(row.total_orders ?? 0),
    totalSpent: Number(row.total_spent ?? 0),
    walletBalance: Number(row.wallet_balance ?? 0),
    walletHeldBalance: Number(row.wallet_held_balance ?? 0),
    walletTotalCredited: Number(row.wallet_total_credited ?? 0),
    walletTotalDebited: Number(row.wallet_total_debited ?? 0),
    walletStatus: row.wallet_status === "blocked" ? "blocked" : "active",
    lastOrderAt: (row.last_order_at as string) ?? null,
    createdAt: (row.created_at as string) ?? null,
  };
}

const CUSTOMER_API_BASE = CUSTOMER_PROFILE_BASE_URL;

async function fetchCustomer(
  sourceId: string,
  _email?: string | null,
): Promise<CustomerUser | null> {
  const response = await fetch(`${CUSTOMER_API_BASE}/profile`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Customer profile HTTP ${response.status}`);

  const payload = await response.json() as {
    success?: boolean;
    customer?: Record<string, unknown> | null;
  };
  const row = payload.success ? payload.customer : null;
  if (!row || String(row.source_id ?? "") !== sourceId) return null;
  return mapCustomerRow(row);
}

function buildFallbackCustomer(
  userId: string,
  email: string | null,
  name: string | null,
): CustomerUser {
  return {
    sourceId: userId,
    email,
    name: name ?? email?.split("@")[0] ?? "User",
    phone: null,
    customerDescription: null,
    photoUrl: null,
    nickname: null,
    birthDate: null,
    gender: null,
    address: null,
    city: null,
    province: null,
    postalCode: null,
    marketingConsent: false,
    sharePurchaseActivity: false,
    purchaseActivityNameMode: "first_name",
    profileCompletedAt: null,
    username: deriveUsername(email, name),
    totalPoints: 0,
    lifetimePoints: 0,
    totalOrders: 0,
    totalSpent: 0,
    walletBalance: 0,
    walletHeldBalance: 0,
    walletTotalCredited: 0,
    walletTotalDebited: 0,
    walletStatus: "active",
    lastOrderAt: null,
    createdAt: null,
  };
}

async function verifyCustomerSession(userId: string) {
  const { data, error } = await authClient.getSession({ query: { disableCookieCache: true } });
  if (error || data?.user?.id !== userId) {
    throw new Error("Sesi belum tersimpan di browser. Izinkan cookies lalu coba masuk kembali.");
  }
}

// ── Context ────────────────────────────────────────────────────

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(
  undefined,
);

// ── Provider ───────────────────────────────────────────────────

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const { data: betterSession, isPending } = authClient.useSession();
  const [customer, setCustomer] = useState<CustomerUser | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [registrationNeedsEmailConfirm, setRegistrationNeedsEmailConfirm] =
    useState(false);
  const visitRecordedRef = useRef(false);
  const registrationInProgressRef = useRef(false);

  // ── Sync Better Auth session → customer data ─────────────────
  useEffect(() => {
    if (isPending) return;
    if (!betterSession?.user) {
      setCustomer(undefined);
      setIsLoading(false);
      return;
    }
    let active = true;
    setIsLoading(true);
    const user = betterSession.user;
    fetchCustomer(user.id, user.email)
      .then(async (cust) => {
        let resolvedCustomer = cust;
        if ((!cust || !cust.email) && user.email && !registrationInProgressRef.current) {
          try {
            await invokeEdgeFunction("customer-sync", { action: "sync", userId: user.id, email: user.email, name: user.name ?? cust?.name ?? "" });
            resolvedCustomer = await fetchCustomer(user.id, user.email);
          } catch (syncError) {
            console.warn("[customer-auth] email sync skipped:", syncError);
          }
        }
        if (!active) return;
        setCustomer(resolvedCustomer ?? buildFallbackCustomer(user.id, user.email, user.name));
      })
      .catch((err) => {
        // jangan biarkan fetch gagal → customer undefined → gak redirect
        console.error("[customer-auth] fetchCustomer failed, using fallback:", err);
        if (active) setCustomer(buildFallbackCustomer(user.id, user.email, user.name));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [betterSession, isPending]);

  useEffect(() => {
    const sourceId = customer?.sourceId;
    const email = customer?.email;
    if (!betterSession?.user || !sourceId || !email) return;
    let active = true;
    visitRecordedRef.current = false;
    const sendPresence = () => {
      if (!active || document.visibilityState === "hidden") return;
      const recordVisit = !visitRecordedRef.current;
      void invokeEdgeFunction("customer-sync", { action: "presence", sourceId, email, recordVisit })
        .then(() => { if (recordVisit) visitRecordedRef.current = true; })
        .catch((error) => console.warn("[customer-auth] presence update skipped:", error));
    };
    sendPresence();
    const interval = window.setInterval(sendPresence, 60_000);
    const handleVisibility = () => { if (document.visibilityState === "visible") sendPresence(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [betterSession?.user?.id, betterSession?.user?.email, customer?.email, customer?.sourceId]);

  const session: CustomerSession | null =
    betterSession?.user && customer?.sourceId === betterSession.user.id
      ? { user: customer }
      : null;
  const isAuthenticated = !!session;

  // ── login ────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    const validationError = validateCredentials(email, password);
    if (validationError) throw new Error(validationError);
    setIsLoading(true);
    setRegistrationNeedsEmailConfirm(false);
    try {
      const { data, error } = await authClient.signIn.email({ email, password });
      if (error) {
        toast.error(error.message || "Gagal masuk.");
        throw new Error(error.message || "Gagal masuk.");
      }
      if (!data?.user) throw new Error("Sesi login tidak diterima server.");
      await verifyCustomerSession(data.user.id);
      toast.success("Berhasil masuk!");
      // Better Auth has set the session cookie; reload lets useSession recover
      // it deterministically instead of depending on an in-memory hook update.
      window.location.assign(customerAuthCallback(window.location.origin, window.location.search));
    } catch (error) {
      console.error("[customer-auth] Login error:", error);
      setIsLoading(false);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── register ─────────────────────────────────────────────────
  const register = useCallback(
    async (email: string, password: string, name: string, sharePurchaseActivity = false) => {
      const validationError = validateCredentials(email, password, name, sharePurchaseActivity);
      if (validationError) throw new Error(validationError);
      setRegistrationNeedsEmailConfirm(false);
      registrationInProgressRef.current = true;
      setIsLoading(true);
      try {
        const { data, error } = await authClient.signUp.email({
          email,
          password,
          name,
        });
        if (error) {
          toast.error(error.message || "Gagal mendaftar.");
          throw new Error(error.message || "Gagal mendaftar.");
        }
        if (!data?.user?.id) throw new Error("Data akun tidak diterima server.");
        if (data?.token) {
          try {
            await verifyCustomerSession(data.user.id);
          } catch {
            throw new Error("Akun berhasil dibuat, tetapi sesi belum tersimpan. Izinkan cookies lalu masuk dengan email dan password yang sama.");
          }
          try {
            await invokeEdgeFunction("customer-sync", {
              action: "sync",
              userId: data.user.id,
              email,
              name,
              sharePurchaseActivity,
              purchaseActivityNameMode: "first_name",
            });
          } catch {
            toast.warning("Akun berhasil dibuat, tetapi pilihan Komunitas belum tersimpan. Atur kembali di Profil.");
          }
        }
        const requiresEmailConfirm = !data?.token;
        setRegistrationNeedsEmailConfirm(requiresEmailConfirm);
        toast.success("Akun berhasil dibuat!");
        if (!requiresEmailConfirm) {
          // Auto-confirm registration has a session cookie; recover it from a
          // clean app boot just like password login.
          window.location.assign(customerAuthCallback(window.location.origin, window.location.search));
        }
      } catch (error) {
        console.error("[customer-auth] Register error:", error);
        throw error;
      } finally {
        registrationInProgressRef.current = false;
        setIsLoading(false);
      }
    },
    [],
  );

  // ── logout ───────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch (_error) {
      // swallow — clear local regardless
    } finally {
      setCustomer(undefined);
      toast.success("Berhasil keluar");
    }
  }, []);

  // ── signInWithGoogle ────────────────────────────────────────
  const signInWithGoogle = useCallback(async () => {
    setIsLoading(true);
    try {
      const callbackURL = customerAuthCallback(window.location.origin, window.location.search);
      const errorCallback = new URL(callbackURL);
      errorCallback.searchParams.set("error", "google");
      const { data, error } = await authClient.signIn.social({
        provider: "google",
        callbackURL,
        errorCallbackURL: errorCallback.toString(),
        disableRedirect: true,
      });
      if (error) {
        throw new Error(error.message || "Gagal masuk dengan Google");
      }
      if (!data?.url) {
        throw new Error("URL login Google tidak diterima server.");
      }
      window.location.assign(data.url);
    } finally { setIsLoading(false); }
  }, []);

  // ── refreshCustomer ─────────────────────────────────────────
  // Re-fetch customer dari pos_customers_view setelah update profil
  const refreshCustomer = useCallback(async () => {
    const user = betterSession?.user;
    if (!user) return;
    try {
      const fresh = await fetchCustomer(user.id, user.email);
      setCustomer(fresh ?? buildFallbackCustomer(user.id, user.email, user.name));
    } catch (err) {
      console.error("[customer-auth] refreshCustomer failed:", err);
    }
  }, [betterSession?.user]);

  // ── resetPassword ────────────────────────────────────────────
  const resetPassword = useCallback(async (email: string) => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error("Masukkan email yang valid.");
    // The auth server has no sendResetPassword transport configured.
    throw new Error("Reset password belum tersedia. Hubungi layanan pelanggan atau gunakan Google dengan email yang sama.");
  }, []);

  // ── Render ───────────────────────────────────────────────────
  return (
    <CustomerAuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        session,
        customer,
        registrationNeedsEmailConfirm,
        login,
        register,
        logout,
        resetPassword,
        signInWithGoogle,
        refreshCustomer,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext);
  if (context === undefined) {
    throw new Error(
      "useCustomerAuth must be used within a CustomerAuthProvider",
    );
  }
  return context;
}
