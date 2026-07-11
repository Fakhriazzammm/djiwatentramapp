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
	username: string;
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
	registrationNeedsEmailConfirm: boolean;
	login: (email: string, password: string) => Promise<void>;
	register: (
		email: string,
		password: string,
		name: string,
	) => Promise<void>;
	logout: () => Promise<void>;
	resetPassword: (email: string) => Promise<void>;
}

// ── Helpers ────────────────────────────────────────────────────

function emailToUsername(email: string | null): string {
	if (!email) return "user";
	return email
		.split("@")[0]
		.replace(/[^a-zA-Z0-9._-]/g, "")
		.toLowerCase()
		.slice(0, 32);
}

function mapCustomerRow(row: Record<string, unknown>): CustomerUser {
	return {
		sourceId: String(row.source_id ?? ""),
		email: (row.email as string) ?? null,
		name: (row.name as string) ?? null,
		phone: (row.phone as string) ?? null,
		photoUrl: (row.photo_url as string) ?? null,
		username: emailToUsername((row.email as string) ?? null),
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

/** Build a minimal CustomerUser from Supabase Auth user (fallback when DB record missing) */
function fallbackCustomer(user: { id: string; email?: string | null; user_metadata?: { name?: string } }): CustomerUser {
	const email = user.email ?? null;
	return {
		sourceId: user.id,
		email,
		name: user.user_metadata?.name ?? email?.split("@")[0] ?? "User",
		phone: null,
		photoUrl: null,
		username: emailToUsername(email),
		totalPoints: 0,
		lifetimePoints: 0,
		totalOrders: 0,
		totalSpent: 0,
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
	const [isLoading, setIsLoading] = useState(true);
	const [session, setSession] = useState<CustomerSession | null>(null);
	const [customer, setCustomer] = useState<CustomerUser | undefined>(
		undefined,
	);
	const [registrationNeedsEmailConfirm, setRegistrationNeedsEmailConfirm] =
		useState(false);
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

				const cust = await fetchCustomer(sbSession.user.id) ?? fallbackCustomer(sbSession.user);
				if (cancelled) return;

				setCustomer(cust);
				setSession({
					accessToken: sbSession.access_token,
					refreshToken: sbSession.refresh_token,
					user: cust,
				});
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
		} = supabase.auth.onAuthStateChange(async (event, sbSession) => {
			if (sbSession?.user) {
				const cust = await fetchCustomer(sbSession.user.id) ?? fallbackCustomer(sbSession.user);
				setCustomer(cust);
				setSession({
					accessToken: sbSession.access_token,
					refreshToken: sbSession.refresh_token,
					user: cust,
				});

					// Show welcome-back toast after email confirmation redirect
					if (event === "SIGNED_IN") {
						setRegistrationNeedsEmailConfirm(false);
						toast.success("Email terkonfirmasi! Selamat datang kembali.");
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
			const { data, error } = await supabase.functions.invoke("customer-auth", {
				body: { action: "login", email, password },
			});

			if (error || data?.error) {
				const message = data?.error || error?.message || "Gagal masuk.";
				toast.error(message);
				throw new Error(message);
			}

			if (!data.accessToken || !data.refreshToken) {
				toast.error("Gagal mendapatkan sesi.");
				throw new Error("No session after login");
			}

			// Set session from Edge Function response
			await supabase.auth.setSession({
				access_token: data.accessToken,
				refresh_token: data.refreshToken,
			});

			const cust = await fetchCustomer(data.user?.id ?? "") ?? {
				sourceId: data.user?.id ?? "",
				email: data.user?.email ?? null,
				name: null,
				phone: null,
				photoUrl: null,
				username: emailToUsername(data.user?.email ?? null),
				totalPoints: 0,
				lifetimePoints: 0,
				totalOrders: 0,
				totalSpent: 0,
				lastOrderAt: null,
				createdAt: null,
			};
			setCustomer(cust);

			setRegistrationNeedsEmailConfirm(false);
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
				const { data, error } = await supabase.functions.invoke("customer-auth", {
					body: { action: "register", email, password, name },
				});

				if (error || data?.error) {
					const message = data?.error || error?.message || "Gagal mendaftar.";
					toast.error(message);
					throw new Error(message);
				}

				if (!data.user) {
					toast.error("Gagal mendaftar. Coba lagi.");
					throw new Error("No user returned from register");
				}

				if (data.accessToken && data.refreshToken) {
					// Auto-confirm — set session immediately
					await supabase.auth.setSession({
						access_token: data.accessToken,
						refresh_token: data.refreshToken,
					});

					const cust = await fetchCustomer(data.user.id) ?? {
						sourceId: data.user.id,
						email: data.user.email ?? null,
						name: name,
						phone: null,
						photoUrl: null,
						username: emailToUsername(data.user.email ?? null),
						totalPoints: 0,
						lifetimePoints: 0,
						totalOrders: 0,
						totalSpent: 0,
						lastOrderAt: null,
						createdAt: null,
					};
					setCustomer(cust);
					setSession({
						accessToken: data.accessToken,
						refreshToken: data.refreshToken,
						user: cust,
					});
					setRegistrationNeedsEmailConfirm(false);
					toast.success("Akun berhasil dibuat!");
				} else {
					// Email confirmation required
					setRegistrationNeedsEmailConfirm(true);
					toast.success("Pendaftaran berhasil! Cek email untuk konfirmasi.");
				}

				// Sync customer record via existing Edge Function
				try {
					const { error: fnError } = await supabase.functions.invoke(
						"customer-sync",
						{
							body: {
								action: "sync",
								userId: data.user.id,
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
					console.warn(
						"[customer-auth] customer-sync invocation failed:",
						syncError,
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

	// ── resetPassword ─────────────────────────────────────────
	const resetPassword = useCallback(async (email: string) => {
		const supabase = createClient();
		const { data, error } = await supabase.functions.invoke("customer-auth", {
			body: { action: "resetPassword", email },
		});

		if (error || data?.error) {
			toast.error(data?.error || error?.message || "Gagal mengirim link reset.");
			throw new Error(data?.error || error?.message);
		}

		toast.success("Link reset password sudah dikirim ke email.");
	}, []);

	// ── Render ─────────────────────────────────────────────────
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
