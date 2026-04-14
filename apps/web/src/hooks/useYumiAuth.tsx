import { useQuery, useMutation } from "convex/react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@yumipos/backend/convex/_generated/api";
import { toast } from "sonner";

const SESSION_KEY = "yumi_session_token";

export interface YumiUser {
	_id: string;
	name: string;
	username: string;
	slug?: string;
	roleId: string;
	hasFace?: boolean;
}

export interface YumiRole {
	name: string;
	permissions: string[];
}

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

	const validateSession = useQuery(api.users.validateSession, { token: token ?? undefined });
	const logoutMutation = useMutation(api.users.logoutSession);

	const isLoading = token !== null && validateSession === undefined;
	const isAuthenticated = !!validateSession;
	const user = validateSession?.user;
	const role = validateSession?.role;
	const isAdmin = role?.name?.toLowerCase() === "admin";
	const isStaff = role?.name?.toLowerCase() === "staff" || (!isAdmin && !!role);

	const login = useCallback((newToken: string) => {
		localStorage.setItem(SESSION_KEY, newToken);
		setToken(newToken);
	}, []);

	const logout = useCallback(async () => {
		if (token) {
			try {
				await logoutMutation({ token });
			} catch (err) {
				console.error("Logout error:", err);
			}
		}
		localStorage.removeItem(SESSION_KEY);
		setToken(null);
		toast.success("Berhasil keluar");
	}, [token, logoutMutation]);

	// Auto-cleanup if token is invalid
	useEffect(() => {
		if (token && validateSession === null) {
			localStorage.removeItem(SESSION_KEY);
			setToken(null);
		}
	}, [token, validateSession]);

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
