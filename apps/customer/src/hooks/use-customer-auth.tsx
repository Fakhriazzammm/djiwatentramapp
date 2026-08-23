import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/client";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────

export type CustomerUser = {
  sourceId: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  photoUrl: string | null;
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
    photoUrl: (row.photo_url as string) ?? null,
    username: deriveUsername((row.email as string) ?? null, (row.name as string) ?? null),
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

async function fetchCustomer(
  sourceId: string,
  email?: string | null,
): Promise<CustomerUser | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pos_customers_view")
    .select("*")
    .eq("source_id", sourceId)
    .maybeSingle();

  if (error) {
    console.warn("[customer-auth] fetchCustomer error:", error);
    return null;
  }
  if (data) return mapCustomerRow(data as Record<string, unknown>);

  // ponytail: relink-by-email — existing customers keyed to the OLD auth id
  // (UUID) won't match the new Better Auth id. Re-point source_id to the new
  // id on first login so their points/orders history is preserved.
  if (!email) return null;

  const { data: relinked, error: relinkErr } = await supabase
    .schema("pos")
    .from("customers")
    .update({ source_id: sourceId, updated_at: new Date().toISOString() })
    .eq("email", email)
    .select("*")
    .maybeSingle();
  if (relinkErr || !relinked) {
    console.warn("[customer-auth] relink failed:", relinkErr);
    return null;
  }
  return mapCustomerRow(relinked as Record<string, unknown>);
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
    photoUrl: null,
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

  // ── Sync Better Auth session → customer data ─────────────────
  useEffect(() => {
    if (isPending) return;
    if (!betterSession?.user) {
      setCustomer(undefined);
      setIsLoading(false);
      return;
    }
    const user = betterSession.user;
    fetchCustomer(user.id, user.email)
      .then(async (cust) => {
        let resolvedCustomer = cust;
        if (cust && !cust.email && user.email) {
          try {
            await invokeEdgeFunction("customer-sync", { action: "sync", userId: user.id, email: user.email, name: user.name ?? cust.name ?? "" });
            resolvedCustomer = await fetchCustomer(user.id, user.email);
          } catch (syncError) {
            console.warn("[customer-auth] email sync skipped:", syncError);
          }
        }
        setCustomer(resolvedCustomer ?? buildFallbackCustomer(user.id, user.email, user.name));
      })
      .catch((err) => {
        // jangan biarkan fetch gagal → customer undefined → gak redirect
        console.error("[customer-auth] fetchCustomer failed, using fallback:", err);
        setCustomer(buildFallbackCustomer(user.id, user.email, user.name));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [betterSession, isPending]);

  const session: CustomerSession | null =
    betterSession?.user && customer
      ? { user: customer }
      : null;
  const isAuthenticated = !!session;

  // ── login ────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) {
        toast.error(error.message || "Gagal masuk.");
        throw new Error(error.message || "Gagal masuk.");
      }
      toast.success("Berhasil masuk!");
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
    async (email: string, password: string, name: string) => {
      setIsLoading(true);
      try {
        const { error } = await authClient.signUp.email({
          email,
          password,
          name,
        });
        if (error) {
          toast.error(error.message || "Gagal mendaftar.");
          throw new Error(error.message || "Gagal mendaftar.");
        }
        // better-auth signs in auto after signup — session will sync via useEffect
        toast.success("Akun berhasil dibuat!");
      } catch (error) {
        console.error("[customer-auth] Register error:", error);
        throw error;
      } finally {
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
    await authClient.signIn.social({
      provider: "google",
      callbackURL: window.location.origin + "/",
    });
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
    const { error } = await (authClient as any).forgetPassword({ email });
    if (error) {
      toast.error(error.message || "Gagal mengirim link reset.");
      throw new Error(error.message || "Gagal mengirim link reset.");
    }
    toast.success("Link reset password sudah dikirim ke email.");
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
