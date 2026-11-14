import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { toast } from "sonner";
import {
	logoutYumiSession,
	type YumiSessionRole,
	type YumiSessionUser,
	type YumiValidatedSession,
	validateYumiSession,
} from "../lib/yumi-auth-client";

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
	// `false` selama sesi awal belum selesai diverifikasi. Route guard wajib
	// menunggu ini sebelum memutuskan redirect ke /login, kalau tidak user yang
	// sudah login akan dilempar keluar setiap kali halaman dimuat ulang.
	const [isResolved, setIsResolved] = useState(false);
	const isLoggingOutRef = useRef(false);

	const clearSession = useCallback(() => {
		if (typeof window !== "undefined") {
			localStorage.removeItem(SESSION_KEY);
		}
		setToken(null);
		setSession(null);
	}, []);

	const refreshSession = useCallback(
		async (sessionToken: string | null) => {
			if (!sessionToken) {
				setSession(null);
				return;
			}

			try {
				const nextSession = await validateYumiSession(sessionToken);
				if (!nextSession) {
					// Server memastikan sesi tidak valid → buang.
					clearSession();
					return;
				}
				setSession(nextSession);
			} catch (error) {
				// Gagal menghubungi server (offline / 5xx). Token JANGAN dihapus —
				// kalau dihapus, gangguan jaringan sesaat memaksa semua karyawan
				// login ulang. Sesi tetap dianggap belum terverifikasi.
				console.error("Session validation error:", error);
			}
		},
		[clearSession]
	);

	useEffect(() => {
		let cancelled = false;

		setIsResolved(false);
		void (async () => {
			try {
				if (token) {
					await refreshSession(token);
				} else {
					// Custom Yumi token adalah source of truth. Jangan memulihkan sesi
					// Supabase secara paralel di halaman login karena dapat race dengan
					// setSession() setelah PIN berhasil diverifikasi.
					setSession(null);
				}
			} finally {
				// Tandai selesai hanya kalau efek ini belum digantikan oleh token baru,
				// supaya hasil validasi lama tidak menutup proses yang masih berjalan.
				if (!cancelled) setIsResolved(true);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [refreshSession, token]);

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
	// Loading selama verifikasi awal custom token belum selesai.
	const isLoading = !isResolved;
	const user = session?.user;
	const role = session?.role;
	const isAdmin = role?.name?.trim().toLowerCase() === "admin";
	const isStaff = role?.name?.toLowerCase() === "staff" || (!isAdmin && !!role);

	const login = useCallback((newToken: string) => {
		isLoggingOutRef.current = false;
		if (typeof window !== "undefined") {
			localStorage.setItem(SESSION_KEY, newToken);
		}
		setToken(newToken);
	}, []);

	const logout = useCallback(async () => {
		const currentToken = token;
		// Menghapus token memicu efek resolusi ulang. Tanpa flag ini, pemulihan
		// sesi Supabase bisa menghidupkan lagi sesi yang baru saja dibuang
		// sebelum signOut selesai — user terlihat "gagal logout".
		isLoggingOutRef.current = true;
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
