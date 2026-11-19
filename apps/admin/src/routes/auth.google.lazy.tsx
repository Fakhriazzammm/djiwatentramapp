import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { clearGoogleIntent, getGoogleSession } from "@djiwaapps/web-shared/lib/staff-google";

export const Route = createLazyFileRoute("/auth/google")({ component: GoogleCallbackPage });

/** Setelah login Google: akun yang sudah terhubung (atau emailnya sama dengan email karyawan) langsung masuk. */
function GoogleCallbackPage() {
	const navigate = useNavigate();
	const { login } = useYumiAuth();
	const [state, setState] = useState<"checking" | "unlinked" | "error">("checking");
	const [email, setEmail] = useState("");
	const [message, setMessage] = useState("");
	const ran = useRef(false);

	useEffect(() => {
		if (ran.current) return;
		ran.current = true;
		(async () => {
			try {
				const s = await getGoogleSession();
				clearGoogleIntent();
				if (!s.authenticated) { setMessage("Sesi Google tidak ditemukan. Coba masuk lagi."); setState("error"); return; }
				if (s.linked) {
					login(s.token);
					if (s.autoLinked) toast.success("Akun Google terhubung otomatis lewat emailmu.");
					navigate({ to: "/admin" as any, replace: true });
					return;
				}
				setEmail(s.profile.email);
				setState("unlinked");
			} catch (e) {
				setMessage(e instanceof Error ? e.message : "Gagal memproses login Google");
				setState("error");
			}
		})();
	}, []);

	return (
		<main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
			{state === "checking" && <p role="status" className="text-sm text-muted-foreground">Memeriksa akun Google…</p>}
			{state === "unlinked" && (
				<>
					<h1 className="text-xl font-bold">Akun Google belum terhubung</h1>
					<p className="text-sm text-muted-foreground">{email} belum terhubung ke akun karyawan. Hubungkan sekali dari aplikasi Karyawan (Profil → Akun Google), lalu masuk lagi di sini.</p>
					<a href="https://karyawan.djiwatentram.web.id/login" className="h-11 w-full rounded-xl bg-primary px-5 text-sm font-bold leading-[2.75rem] text-primary-foreground">Buka aplikasi Karyawan</a>
					<button type="button" onClick={() => navigate({ to: "/admin/login" as any })} className="text-sm text-muted-foreground underline">Masuk dengan PIN</button>
				</>
			)}
			{state === "error" && (
				<>
					<h1 className="text-xl font-bold">Tidak bisa masuk dengan Google</h1>
					<p className="text-sm text-muted-foreground">{message}</p>
					<button type="button" onClick={() => navigate({ to: "/admin/login" as any })} className="h-11 w-full rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">Kembali ke login</button>
				</>
			)}
		</main>
	);
}
