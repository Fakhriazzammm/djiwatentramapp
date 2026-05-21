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
import {
	logoutYumiSession,
	type YumiSessionRole,
	type YumiSessionUser,
	type YumiValidatedSession,
	validateYumiSession,
} from "@/lib/yumi-auth-client";

const SESSION_KEY = "yumi_session_token";

export type YumiUser = YumiSessionUser;
export type YumiRole = YumiSessionRole;

interface YumiAuthContextType {
	isLoading: boolean;
	isAuthenticated: boolean;
	user: YumiUser | undefined;
	role: YumiRole | undefined;
	isAdmin: boolean;
	isStaff: boolean;
	login: (newToken: string) => void;
	logout: () => Promise<void>;
	token: string | null;
}

const YumiAuthContext = createContext<YumiAuthContextType | undefined>(undefined);

export function YumiAuthProvider({ children }: { children: ReactNode }) {
	const [token, setToken] = useState<string | null>(() => {
		if (typeof window !== "undefined") {
			return localStorage.getItem(SESSION_KEY);
		}
		return null;
	});
	const [session, setSession] = useState<YumiValidatedSession | null>(null);
	const [isLoading, setIsLoading] = useState(Boolean(token));

	const clearSession = useCallback(() => {
		if (typeof window !== "undefined") {
			localStorage.removeItem(SESSION_KEY);
		}
		setToken(null);
		setSession(null);
		setIsLoading(false);
	}, []);

	const refreshSession = useCallback(
		async (sessionToken: string | null) => {
			if (!sessionToken) {
				setSession(null);
				setIsLoading(false);
				return;
			}

			setIsLoading(true);
			try {
				const nextSession = await validateYumiSession(sessionToken);
				if (!nextSession) {
					clearSession();
					return;
				}
				setSession(nextSession);
			} catch (error) {
				console.error("Session validation error:", error);
				clearSession();
			} finally {
				setIsLoading(false);
			}
		},
		[clearSession]
	);

	// Try Supabase session recovery when no custom token exists
	const recoverFromSupabaseSession = useCallback(async () => {
		try {
			const supabase = createClient();
			const { data: { session: sbSession } } = await supabase.auth.getSession();
			if (!sbSession?.user) return;

			const { data: claims, error: claimsError } = await supabase.rpc("get_yumi_user_claims");
			if (claimsError || !claims?.role_name) return;

			const userMeta = sbSession.user.user_metadata || {};
			if (userMeta.is_active === false) return;

			const recoveredSession = {
				user: {
					_id: claims.source_id || userMeta.source_id || "",
					name: claims.name || userMeta.name || "",
					username: (sbSession.user.email?.split("@")[0] ?? "") || "",
					slug: userMeta.slug || "",
					roleId: userMeta.role_source_id || "",
					hasFace: false,
					requiresPinChange: false,
				},
				role: {
					_id: userMeta.role_source_id || "",
					name: claims.role_name || "staff",
					permissions: Array.isArray(claims.permissions) ? claims.permissions : [],
				},
				expiresAt: new Date(sbSession.expires_at!).getTime(),
			} as YumiValidatedSession;

			setSession(recoveredSession);
			setIsLoading(false);
		} catch {
			// Silent — no session to recover
		}
	}, []);

	useEffect(() => {
		if (token) {
			void refreshSession(token);
		} else {
			// No custom token — try Supabase session recovery
			void recoverFromSupabaseSession();
		}
	}, [refreshSession, recoverFromSupabaseSession, token]);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const onStorage = (event: StorageEvent) => {
			if (event.key === SESSION_KEY) {
				setToken(event.newValue);
			}
		};

		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);

	const isAuthenticated = !!session;
	const user = session?.user;
	const role = session?.role;
	const isAdmin = role?.name?.trim().toLowerCase() === "admin";
	const isStaff = role?.name?.toLowerCase() === "staff" || (!isAdmin && !!role);

	const login = useCallback((newToken: string) => {
		if (typeof window !== "undefined") {
			localStorage.setItem(SESSION_KEY, newToken);
		}
		setToken(newToken);
	}, []);

	const logout = useCallback(async () => {
		const currentToken = token;
		clearSession();

		if (currentToken) {
			try {
				await logoutYumiSession(currentToken);
			} catch (error) {
				console.error("Logout error:", error);
			}
		}
		toast.success("Berhasil keluar");
	}, [clearSession, token]);

	return (
		<YumiAuthContext.Provider
			value={{
				isLoading,
				isAuthenticated,
				user,
				role,
				isAdmin,
				isStaff,
				login,
				logout,
				token,
			}}
		>
			{children}
		</YumiAuthContext.Provider>
	);
}

export function useYumiAuth() {
	const context = useContext(YumiAuthContext);
	if (context === undefined) {
		throw new Error("useYumiAuth must be used within a YumiAuthProvider");
	}
	return context;
}
