import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { DsAvatar, DsButton, DsGroup, DsGroupLabel, DsNote, DsRoot } from "@djiwaapps/web-shared/components/ds";
import { listPublicYumiUsers, useYumiAuth, type YumiPublicUser } from "@djiwaapps/web-shared";
import { clearGoogleIntent, getGoogleSession, GoogleAuthError, linkGoogle, readGoogleIntent } from "@djiwaapps/web-shared/lib/staff-google";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/auth/google")({ component: GoogleCallbackPage });

type Phase = "checking" | "choose" | "link" | "error";

/** Tujuan setelah login Google: masuk, hubungkan ke akun karyawan lama, atau daftar baru. */
function GoogleCallbackPage() {
	const navigate = useNavigate();
	const { login, token: yumiToken } = useYumiAuth();
	const [phase, setPhase] = useState<Phase>("checking");
	const [error, setError] = useState<string | null>(null);
	const [profile, setProfile] = useState<{ email: string; name: string } | null>(null);
	const [users, setUsers] = useState<YumiPublicUser[]>([]);
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<YumiPublicUser | null>(null);
	const [pin, setPin] = useState("");
	const [busy, setBusy] = useState(false);
	const ran = useRef(false);

	const enter = (token: string, slug?: string) => {
		login(token);
		clearGoogleIntent();
		navigate({ to: slug ? ("/$username/beranda" as any) : ("/" as any), params: slug ? { username: slug } : undefined, replace: true } as any);
	};

	useEffect(() => {
		if (ran.current) return;
		ran.current = true;
		const intent = readGoogleIntent();
		(async () => {
			try {
				const s = await getGoogleSession();
				if (!s.authenticated) { setError("Sesi Google tidak ditemukan. Coba masuk lagi."); setPhase("error"); return; }
				setProfile({ email: s.profile.email, name: s.profile.name });
				// Dari Profil: hubungkan akun yang sedang masuk (sesi Yumi jadi bukti kepemilikan).
				if (intent === "link" && yumiToken) {
					const r = await linkGoogle({ yumiToken });
					clearGoogleIntent();
					toast.success("Akun Google terhubung. Lain kali bisa masuk dengan Google.");
					enter(r.token, r.user.slug);
					return;
				}
				if (s.linked) {
					if (s.autoLinked) toast.success("Akun Google terhubung otomatis lewat emailmu.");
					enter(s.token, s.user.slug);
					return;
				}
				if (intent === "register") { clearGoogleIntent(); navigate({ to: "/register" as any, search: { google: 1 } as any, replace: true } as any); return; }
				setPhase("choose");
			} catch (e) {
				setError(e instanceof Error ? e.message : "Gagal memproses login Google");
				setPhase("error");
			}
		})();
	}, []);

	useEffect(() => { if (phase === "link" && users.length === 0) void listPublicYumiUsers().then((u) => setUsers(u ?? [])).catch(() => undefined); }, [phase, users.length]);
	const matches = useMemo(() => users.filter((u) => u.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6), [users, query]);

	const submitLink = async () => {
		if (!selected || pin.length !== 6) return;
		setBusy(true); setError(null);
		try {
			const r = await linkGoogle({ userId: selected._id, pin });
			toast.success("Akun Google terhubung.");
			enter(r.token, r.user.slug);
		} catch (e) {
			setError(e instanceof GoogleAuthError || e instanceof Error ? e.message : "Gagal menghubungkan");
			setPin("");
		} finally { setBusy(false); }
	};

	return (
		<DsRoot className="ds-screen">
			<main className="kx-full-in" style={{ minHeight: "100dvh" }}>
				{phase === "checking" && <div className="kx-cen" style={{ paddingTop: 120 }}><span className="kx-spin" style={{ width: 28, height: 28 }} /><p className="ds-sub" style={{ marginTop: 14 }}>Memeriksa akun Google…</p></div>}

				{phase === "error" && (
					<div className="kx-cen" style={{ paddingTop: 80 }}>
						<h1 className="ds-title">Tidak bisa masuk dengan Google</h1>
						<p className="ds-sub">{error}</p>
						<DsButton block onClick={() => navigate({ to: "/login" as any, replace: true })}>Kembali ke login</DsButton>
					</div>
				)}

				{phase === "choose" && profile && (
					<>
						<div className="kx-cen" style={{ paddingTop: 40 }}>
							<DsAvatar name={profile.name || profile.email} size={72} />
							<h1 className="ds-title" style={{ margin: "10px 0 2px" }}>Halo, {(profile.name || "").split(" ")[0] || "kamu"}</h1>
							<p className="ds-sub">{profile.email}</p>
						</div>
						<DsNote tone="info"><b>Akun Google ini belum terhubung</b>Pilih: hubungkan ke akun karyawanmu yang sudah ada, atau daftar baru.</DsNote>
						<DsButton block onClick={() => setPhase("link")}>Saya sudah punya akun karyawan</DsButton>
						<DsButton block variant="ghost" onClick={() => { clearGoogleIntent(); navigate({ to: "/register" as any, search: { google: 1 } as any } as any); }}>Daftar karyawan baru</DsButton>
						<DsButton block variant="ghost" onClick={() => navigate({ to: "/login" as any })}>Batal</DsButton>
					</>
				)}

				{phase === "link" && (
					<>
						<h1 className="ds-page" style={{ fontSize: 26, margin: "10px 0 4px" }}>Hubungkan akun</h1>
						<p className="ds-sub" style={{ margin: "0 4px 8px" }}>Pilih namamu dan masukkan PIN untuk membuktikan ini akunmu. Cukup sekali.</p>
						<DsGroup>
							<div className="kx-field" style={{ marginTop: 0 }}><label htmlFor="g-name"><span>Nama karyawan</span></label><input id="g-name" className="kx-input" value={selected ? selected.name : query} onChange={(e) => { setSelected(null); setQuery(e.target.value); }} placeholder="Ketik nama…" autoComplete="off" /></div>
							{!selected && query.trim() && matches.length > 0 && (
								<div style={{ marginTop: 6 }}>{matches.map((u) => <button key={u._id} type="button" className="kx-pickrow" onClick={() => { setSelected(u); setQuery(""); }}><DsAvatar name={u.name} size={32} />{u.name}</button>)}</div>
							)}
							<div className="kx-field"><label htmlFor="g-pin"><span>PIN 6 digit</span></label><input id="g-pin" className="kx-input" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" /></div>
						</DsGroup>
						{error && <div className="kx-err" role="alert">{error}</div>}
						<DsButton block disabled={!selected || pin.length !== 6 || busy} onClick={submitLink}>{busy ? "Menghubungkan…" : "Hubungkan & masuk"}</DsButton>
						<DsButton block variant="ghost" onClick={() => setPhase("choose")}>Kembali</DsButton>
					</>
				)}
			</main>
		</DsRoot>
	);
}
