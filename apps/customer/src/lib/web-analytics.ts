import { createClient } from "@/lib/client";

// Pelacak kunjungan web ringan untuk dashboard admin (tabel public.web_page_views).
// Prinsip privasi:
// - Tidak menyimpan IP, cookie pihak ketiga, atau identitas akun. Hanya id acak per browser
//   yang di-hash di server (md5).
// - Path dipersingkat ke segmen pertama (mis. /karyawan/rina -> /karyawan/detail) agar
//   username atau id di URL tidak ikut tersimpan.
// - Menghormati Do Not Track / Global Privacy Control, dan mengabaikan browser otomatis.
// - Tidak pernah memblokir UI: semua error diabaikan.

const VISITOR_KEY = "djiwa_web_visitor";
const SESSION_KEY = "djiwa_web_session_started";

export function normalizeTrackedPath(pathname: string): string {
	const parts = pathname.split("/").filter(Boolean);
	if (parts.length === 0) return "/";
	return parts.length > 1 ? `/${parts[0]}/detail` : `/${parts[0]}`;
}

function shouldSkip(): boolean {
	if (typeof window === "undefined" || typeof navigator === "undefined") return true;
	if (navigator.webdriver) return true;
	if (navigator.doNotTrack === "1") return true;
	return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

function getVisitorId(): string | null {
	try {
		let id = window.localStorage.getItem(VISITOR_KEY);
		if (!id) {
			id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
			window.localStorage.setItem(VISITOR_KEY, id);
		}
		return id;
	} catch {
		return null;
	}
}

/** true hanya untuk halaman pertama dalam satu sesi tab. */
function takeEntryFlag(): boolean {
	try {
		if (window.sessionStorage.getItem(SESSION_KEY)) return false;
		window.sessionStorage.setItem(SESSION_KEY, "1");
		return true;
	} catch {
		return false;
	}
}

function deviceKind(): "mobile" | "tablet" | "desktop" | "unknown" {
	if (typeof window.matchMedia !== "function") return "unknown";
	if (window.matchMedia("(max-width: 767px)").matches) return "mobile";
	if (window.matchMedia("(max-width: 1023px)").matches) return "tablet";
	return "desktop";
}

export function trackPageView(pathname: string): void {
	if (shouldSkip()) return;
	const visitor = getVisitorId();
	if (!visitor) return;
	const entry = takeEntryFlag();
	const referrer = entry && document.referrer ? document.referrer : null;
	try {
		void createClient()
			.rpc("record_web_page_view", {
				p_path: normalizeTrackedPath(pathname),
				p_referrer: referrer,
				p_device: deviceKind(),
				p_visitor: visitor,
				p_entry: entry,
			})
			.then(
				() => undefined,
				() => undefined,
			);
	} catch {
		// Analitik tidak boleh mengganggu navigasi.
	}
}
