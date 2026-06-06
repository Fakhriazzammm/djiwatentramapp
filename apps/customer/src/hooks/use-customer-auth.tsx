import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from "react";
import { createClient } from "@/lib/client";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────

export type CustomerUser = {
	sourceId: string;
	email: string | null;
	name: string | null;
	phone: string | null;
	photoUrl: string | null;
	totalPoints: number;
	lifetimePoints: number;
	totalOrders: number;
	totalSpent: number;
	lastOrderAt: string | null;
	createdAt: string | null;
};

type CustomerSession = {
	accessToken: string;
	refreshToken: string;
	user: CustomerUser;
};

interface CustomerAuthContextType {
	isLoading: boolean;
	isAuthenticated: boolean;
	session: CustomerSession | null;
	customer: CustomerUser | undefined;
	login: (email: string, password: string) => Promise<void>;
	register: (
		email: string,
		password: string,
		name: string,
	) => Promise<void>;
	logout: () => Promise<void>;
}

// ── Helpers ────────────────────────────────────────────────────

function mapCustomerRow(row: Record<string, unknown>): CustomerUser {
	return {
		sourceId: String(row.source_id ?? ""),
		email: (row.email as string) ?? null,
		name: (row.name as string) ?? null,
		phone: (row.phone as string) ?? null,
		photoUrl: (row.photo_url as string) ?? null,
		totalPoints: Number(row.total_points ?? 0),
		lifetimePoints: Number(row.lifetime_points ?? 0),
		totalOrders: Number(row.total_orders ?? 0),
		totalSpent: Number(row.total_spent ?? 0),
		lastOrderAt: (row.last_order_at as string) ?? null,
		createdAt: (row.created_at as string) ?? null,
	};
}

async function fetchCustomer(sourceId: string): Promise<CustomerUser | null> {
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
	if (!data) return null;

	return mapCustomerRow(data as Record<string, unknown>);
}

// ── Context ────────────────────────────────────────────────────

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(
	undefined,
);

// ── Provider ───────────────────────────────────────────────────

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
	const [isLoading, setIsLoading] = useState(true);
	const [session, setSession] = useState<CustomerSession | null>(null);
	const [customer, setCustomer] = useState<CustomerUser | undefined>(
		undefined,
	);
	const isAuthenticated = !!session;

	// ── Session recovery on mount ──────────────────────────────
	useEffect(() => {
		let cancelled = false;

		async function recover() {
			setIsLoading(true);
			try {
				const supabase = createClient();
				const {
					data: { session: sbSession },
				} = await supabase.auth.getSession();

				if (cancelled) return;

				if (!sbSession?.user) {
					setIsLoading(false);
					return;
				}

				const cust = await fetchCustomer(sbSession.user.id);
				if (cancelled) return;

				if (cust) {
					setCustomer(cust);
					setSession({
						accessToken: sbSession.access_token,
						refreshToken: sbSession.refresh_token,
						user: cust,
					});
				}
			} catch (error) {
				console.error("[customer-auth] Session recovery error:", error);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}

		void recover();

		return () => {
			cancelled = true;
		};
	}, []);

	// ── Listen for auth state changes ──────────────────────────
	useEffect(() => {
		const supabase = createClient();

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange(async (_event, sbSession) => {
			if (sbSession?.user) {
				const cust = await fetchCustomer(sbSession.user.id);
				if (cust) {
					setCustomer(cust);
					setSession({
						accessToken: sbSession.access_token,
						refreshToken: sbSession.refresh_token,
						user: cust,
					});
				}
			} else {
				setSession(null);
				setCustomer(undefined);
			}
			setIsLoading(false);
		});

		return () => {
			subscription.unsubscribe();
		};
	}, []);

	// ── login ──────────────────────────────────────────────────
	const login = useCallback(async (email: string, password: string) => {
		setIsLoading(true);
		try {
			const supabase = createClient();
			const { data, error } =
				await supabase.auth.signInWithPassword({ email, password });

			if (error) {
				const message =
					error.message === "Invalid login credentials"
						? "Email atau password salah."
						: error.message;
				toast.error(message);
				throw error;
			}

			if (!data.session?.user) {
				toast.error("Gagal mendapatkan sesi.");
				throw new Error("No session after login");
			}

			const cust = await fetchCustomer(data.session.user.id);
			if (cust) {
				setCustomer(cust);
				setSession({
					accessToken: data.session.access_token,
					refreshToken: data.session.refresh_token,
					user: cust,
				});
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

	// ── register ───────────────────────────────────────────────
	const register = useCallback(
		async (email: string, password: string, name: string) => {
			setIsLoading(true);
			try {
				const supabase = createClient();
				const { data, error } = await supabase.auth.signUp({
					email,
					password,
					options: { data: { name } },
				});

				if (error) {
					toast.error(error.message);
					throw error;
				}

				// If identity already exists, Supabase returns the existing user
				// without creating a new one — check for that.
				if (!data.user) {
					toast.error("Gagal mendaftar. Coba lagi.");
					throw new Error("No user returned from signUp");
				}

				// Sync customer record via Edge Function
				try {
					const { error: fnError } = await supabase.functions.invoke(
						"customer-sync",
						{
							body: {
								action: "create",
								sourceId: data.user.id,
								email,
								name,
							},
						},
					);

					if (fnError) {
						console.warn(
							"[customer-auth] customer-sync error:",
							fnError,
						);
					}
				} catch (syncError) {
					// Non-blocking — the customer record may already exist
					console.warn(
						"[customer-auth] customer-sync invocation failed:",
						syncError,
					);
				}

				// If session is returned immediately (auto-confirm), set state
				if (data.session) {
					const cust = await fetchCustomer(data.user.id);
					if (cust) {
						setCustomer(cust);
						setSession({
							accessToken: data.session.access_token,
							refreshToken: data.session.refresh_token,
							user: cust,
						});
					}
					toast.success("Akun berhasil dibuat!");
				} else {
					// Email confirmation required
					toast.success(
						"Pendaftaran berhasil! Cek email untuk konfirmasi.",
					);
				}
			} catch (error) {
				console.error("[customer-auth] Register error:", error);
				throw error;
			} finally {
				setIsLoading(false);
			}
		},
		[],
	);

	// ── logout ─────────────────────────────────────────────────
	const logout = useCallback(async () => {
		try {
			const supabase = createClient();
			const { error } = await supabase.auth.signOut();
			if (error) {
				console.error("[customer-auth] Logout error:", error);
			}
		} catch (error) {
			console.error("[customer-auth] Logout error:", error);
		} finally {
			setSession(null);
			setCustomer(undefined);
			toast.success("Berhasil keluar");
		}
	}, []);

	// ── Render ─────────────────────────────────────────────────
	return (
		<CustomerAuthContext.Provider
			value={{
				isLoading,
				isAuthenticated,
				session,
				customer,
				login,
				register,
				logout,
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
