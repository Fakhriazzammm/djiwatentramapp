import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from "react";
import { createClient } from "@/lib/client";
import { isSupabaseConfigured } from "@/lib/client";
import { toast } from "sonner";

// ── Direct fetch helper (bypass supabase.functions.invoke quirks) ──

const AUTH_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/customer-auth`;
const ANON_KEY =
	import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
	import.meta.env.VITE_SUPABASE_ANON_KEY;

type AuthApiResult = {
	data: Record<string, unknown>;
	error: { message: string } | null;
};

async function callAuthApi(body: Record<string, unknown>): Promise<AuthApiResult> {
	try {
		const res = await fetch(AUTH_FN_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				apikey: ANON_KEY,
				Authorization: `Bearer ${ANON_KEY}`,
			},
			body: JSON.stringify(body),
		});

		let parsed: Record<string, unknown>;
		const text = await res.text();
		try {
			parsed = JSON.parse(text);
		} catch {
			return { data: {}, error: { message: "Invalid response from server" } };
		}

		if (parsed.error) {
			return { data: parsed, error: { message: String(parsed.error) } };
		}

		return { data: parsed, error: null };
	} catch (e) {
		return {
			data: {},
			error: { message: e instanceof Error ? e.message : "Network error" },
		};
	}
}

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

const STORAGE_KEY = "yumme-customer-auth";

/** Decode JWT payload to check expiry (no signature verification needed for client-side expiry check) */
function decodeJWT(token: string): Record<string, unknown> | null {
	try {
		return JSON.parse(atob(token.split(".")[1]));
	} catch {
		return null;
	}
}

function isTokenExpired(token: string): boolean {
	const payload = decodeJWT(token);
	if (!payload?.exp) return true;
	return Date.now() / 1000 > (payload.exp as number);
}

function loadSession(): CustomerSession | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

function saveSession(session: CustomerSession) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
	localStorage.removeItem(STORAGE_KEY);
}

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
		username: emailToUsername(email),
		totalPoints: 0,
		lifetimePoints: 0,
		totalOrders: 0,
		totalSpent: 0,
		lastOrderAt: null,
		createdAt: null,
	};
}

/** Call the customer-auth Edge Function and return typed result */
type AuthResult = {
	accessToken: string;
	refreshToken: string;
	user: { id: string; email: string | null };
};

/** Refresh an expired access token via the Edge Function (which uses service_role internally) */
async function refreshTokenViaEdge(
	refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
	try {
		const { data, error } = await callAuthApi({ action: "refreshToken", refreshToken });

		if (error || data?.error) {
			console.warn("[customer-auth] Token refresh failed:", data?.error || error?.message);
			return null;
		}

		if (data.accessToken && data.refreshToken) {
			return { accessToken: data.accessToken as string, refreshToken: data.refreshToken as string };
		}
		return null;
	} catch (e) {
		console.warn("[customer-auth] Token refresh error:", e);
		return null;
	}
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

	// ── Session recovery on mount (via localStorage, NOT supabase.auth.*) ──
	useEffect(() => {
		let cancelled = false;

		async function recover() {
			setIsLoading(true);
			try {
				const saved = loadSession();
				if (!saved) {
					if (!cancelled) setIsLoading(false);
					return;
				}

				// Check if access token is expired — refresh if needed
				let { accessToken, refreshToken, user } = saved;

				if (isTokenExpired(accessToken)) {
					const refreshed = await refreshTokenViaEdge(refreshToken);
					if (!refreshed) {
						// Refresh failed — clear session (forced logout)
						clearSession();
						if (!cancelled) setIsLoading(false);
						return;
					}
					accessToken = refreshed.accessToken;
					refreshToken = refreshed.refreshToken;
				}

				// Re-fetch customer data (points, etc. may have changed)
				const cust = await fetchCustomer(user.sourceId) ?? buildFallbackCustomer(
					user.sourceId,
					user.email,
					user.name,
				);

				if (cancelled) return;

				const recovered: CustomerSession = {
					accessToken,
					refreshToken,
					user: cust,
				};

				saveSession(recovered);
				setCustomer(cust);
				setSession(recovered);
			} catch (error) {
				console.error("[customer-auth] Session recovery error:", error);
				clearSession();
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}

		void recover();

		return () => {
			cancelled = true;
		};
	}, []);

	// ── login ──────────────────────────────────────────────────
	const login = useCallback(async (email: string, password: string) => {
		setIsLoading(true);
		try {
			const { data, error } = await callAuthApi({ action: "login", email, password });

			if (error || data?.error) {
				const message = data?.error || error?.message || "Gagal masuk.";
				toast.error(message);
				throw new Error(message);
			}

			if (!data.accessToken || !data.refreshToken) {
				toast.error("Gagal mendapatkan sesi.");
				throw new Error("No session after login");
			}

			// Save to localStorage directly (bypass supabase.auth.*)
			const userInfo = data.user as { id: string; email: string | null } | null;
			const userId = userInfo?.id ?? "";
			const userEmail = userInfo?.email ?? null;

			const cust = await fetchCustomer(userId) ?? buildFallbackCustomer(
				userId,
				userEmail,
				null,
			);

			const newSession: CustomerSession = {
				accessToken: data.accessToken,
				refreshToken: data.refreshToken,
				user: cust,
			};

			saveSession(newSession);
			setCustomer(cust);
			setSession(newSession);
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
				const { data, error } = await callAuthApi({ action: "register", email, password, name });

				if (error || data?.error) {
					const message = data?.error || error?.message || "Gagal mendaftar.";
					toast.error(message);
					throw new Error(message);
				}

				if (!data.user) {
					toast.error("Gagal mendaftar. Coba lagi.");
					throw new Error("No user returned from register");
				}

				const userInfo = data.user as { id: string; email: string | null };
				const userId = userInfo.id;

				if (data.accessToken && data.refreshToken) {
					// Auto-confirm — save session immediately
					const cust = await fetchCustomer(userId) ?? buildFallbackCustomer(
						userId,
						userInfo.email ?? null,
						name,
					);

					const newSession: CustomerSession = {
						accessToken: data.accessToken,
						refreshToken: data.refreshToken,
						user: cust,
					};

					saveSession(newSession);
					setCustomer(cust);
					setSession(newSession);
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
								userId,
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
			// Try to revoke on server — best-effort (if it fails, still clear local)
			await callAuthApi({ action: "logout", refreshToken: session?.refreshToken ?? "" }).catch(() => {});
		} catch (_error) {
			// swallow — we clear local regardless
		} finally {
			clearSession();
			setSession(null);
			setCustomer(undefined);
			toast.success("Berhasil keluar");
		}
	}, [session]);

	// ── resetPassword ─────────────────────────────────────────
	const resetPassword = useCallback(async (email: string) => {
		const { data, error } = await callAuthApi({ action: "resetPassword", email });

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
