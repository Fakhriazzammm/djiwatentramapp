import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useHybridCurrentlyInStore, useHybridStaffLogs, useHybridStaffStats } from "@djiwaapps/web-shared";
import { DsAsk, DsAvatar, DsButton, DsGroup, DsHeader, DsIcon, DsIconButton, DsNote, DsRow, DsSection, DsTag, ds3d } from "@djiwaapps/web-shared/components/ds";
import { Bell, Eye, EyeOff } from "lucide-react";
import { useStaffProfile } from "../$username.lazy";
import { openGuide } from "@/components/karyawan/OnboardingGuide";
import { createClient } from "@djiwaapps/web-shared/lib/client";
import { fmtClock, hhmm, isOffShift, rupiah, todayWib, useLatestRunItem, useMonthSchedules, useTopAnnouncement } from "@/components/karyawan/use-staff-data";

export const Route = createLazyFileRoute("/$username/beranda")({
	component: BerandaPage,
});

const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function BerandaPage() {
	const { staff, navigate, username, authUser, notifCount, openAbsen, refreshKey, today: att } = useStaffProfile();
	const now = new Date();
	const [secs, setSecs] = useState(() => Math.floor(Date.now() / 1000));
	const [hide, setHide] = useState(() => typeof window !== "undefined" && localStorage.getItem("saldo_visible") === "false");
	const month = now.getMonth() + 1, year = now.getFullYear();
	const prevMonth = month === 1 ? 12 : month - 1, prevYear = month === 1 ? year - 1 : year;

	const stats = useHybridStaffStats(staff ? { userId: staff._id, month, year, refreshTrigger: refreshKey } : undefined);
		const logs = useHybridStaffLogs(staff ? { userId: staff._id, month, year, refreshTrigger: refreshKey } : undefined);
	const currentlyIn = useHybridCurrentlyInStore(refreshKey);
	const run = useLatestRunItem(staff?._id, refreshKey);
	const schedules = useMonthSchedules(year, month, staff?._id);
	const announcement = useTopAnnouncement();

	const isIn = att.loading ? (currentlyIn?.some((s: any) => s._id === staff?._id) ?? false) : att.isIn;
	const today = todayWib();
	const sched = schedules?.find((s) => s.date === today && !isOffShift(s)) ?? null;
	const nextSched = schedules?.filter((s) => s.date > today && !isOffShift(s)).sort((a, b) => a.date.localeCompare(b.date))[0];

	// Status hari ini datang dari konteks (sumber tunggal dengan tombol tengah tab bar).
	const lastIn = att.lastIn ? { timestamp: att.lastIn } : undefined;
	const lastOut = att.lastOut ? { timestamp: att.lastOut } : undefined;
	const finished = att.finished && !!lastIn && !!lastOut;
	const clock = (ts: number) => new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(".", ":");

	useEffect(() => {
		if (!isIn) return;
		const id = setInterval(() => setSecs(Math.floor(Date.now() / 1000)), 1000);
		return () => clearInterval(id);
	}, [isIn]);
	const elapsed = lastIn ? Math.max(0, secs - Math.floor(lastIn.timestamp / 1000)) : 0;

	const greeting = now.getHours() < 11 ? "Selamat pagi" : now.getHours() < 15 ? "Selamat siang" : now.getHours() < 18 ? "Selamat sore" : "Selamat malam";
	const dateStr = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
	const firstName = (staff?.name ?? "").split(" ")[0] || "—";
	const requiresPinChange = Boolean(authUser?.requiresPinChange && authUser.slug === username);
	const [swapIn, setSwapIn] = useState<{ n: number; from?: string }>({ n: 0 });
	useEffect(() => {
		if (!staff?._id) return;
		void createClient().from("attendance_leave_requests").select("user_name").eq("leave_type", "tukar_shift").eq("status", "pending").contains("metadata", { partner_id: staff._id })
			.then(({ data }) => setSwapIn({ n: data?.length ?? 0, from: (data?.[0] as any)?.user_name }), () => undefined);
	}, [staff?._id, refreshKey]);
	const [botNotice, setBotNotice] = useState(() => { try { return localStorage.getItem("kx_bot_notice_v1") !== "1"; } catch { return true; } });
	const mask = (v: string) => (hide ? "••••••" : v);
	const go = (to: string) => navigate({ to: `/$username/${to}` as any, params: { username } });

	const net = run ? run.net_pay || run.gross_pay : 0;
	const lateCount = (Array.isArray(logs) ? logs : []).filter((l: any) => l.type === "check_in" && (Number(l.penaltyAmount ?? 0) > 0 || /terlambat \d+m/.test(String(l.notes ?? "")))).length;
	const dayOf = (offset: number) => new Date(Date.parse(`${today}T00:00:00+07:00`) + offset * 86_400_000 + 7 * 3600_000).toISOString().slice(0, 10);
	const week = [0, 1, 2].map((o) => ({ date: dayOf(o), s: schedules?.find((x) => x.date === dayOf(o)) ?? null }));
	const tomorrow = week[1];

	return (
		<div>
			<DsHeader
				left={<DsAvatar name={staff?.name} src={staff?.photoUrl} />}
				eyebrow={dateStr}
				title={`${greeting}, ${firstName}`}
				right={<DsIconButton aria-label="Notifikasi" badge={notifCount} onClick={() => go("notifikasi")}><Bell size={19} /></DsIconButton>}
			/>

			<div style={{ padding: "10px 4px 14px" }}>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<span className="ds-sub">Gaji berjalan · {MONTHS_ID[month - 1]}</span>
					<DsIconButton aria-label={hide ? "Tampilkan" : "Sembunyikan"} style={{ width: 26, height: 26, minHeight: 26 }} onClick={() => setHide((v) => { localStorage.setItem("saldo_visible", String(v)); return !v; })}>{hide ? <EyeOff size={14} /> : <Eye size={14} />}</DsIconButton>
				</div>
				<div className="ds-display">{run === undefined ? "…" : mask(rupiah(net))}</div>
				<div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
					<span className="kx-pill">{stats?.sessionCount ?? 0} shift · {lateCount} terlambat</span>
				</div>
			</div>

			{/* Shift hari ini */}
			{isIn ? (
				<div className="ds-hero ds-hero-go">
					<small>Sedang shift · masuk {lastIn ? clock(lastIn.timestamp) : "—"}</small>
					<div className="kx-timer">{fmtClock(elapsed)}</div>
					<small>{sched?.end_time ? `Sampai ${hhmm(sched.end_time)} · ${sched.shift_name}` : sched?.shift_name ?? "Shift"}</small>
					<div className="kx-chips"><span className="kx-chip">Closing shift: belum</span></div>
					<DsButton block className="kx-btn-w" onClick={openAbsen}>Closing shift &amp; absen keluar</DsButton>
				</div>
			) : finished ? (
				<div className="ds-hero">
					<img className="ds-hero-art" src={ds3d("shift-closing")} alt="" />
					<small>{sched?.shift_name ?? "Shift"} selesai · {clock(lastIn!.timestamp)} – {clock(lastOut!.timestamp)}</small>
					<h3>Terima kasih, {firstName}</h3>
					<small>Gaji berjalan diperbarui setelah absen keluar.</small>
					<DsButton block variant="ghost" onClick={() => go("rekap-absensi")}>Lihat rekap hari ini</DsButton>
				</div>
			) : sched ? (
				<div className="ds-hero ds-hero-go">
					<small>Shift {sched.shift_name.toLowerCase()}</small>
					<h3>{sched.start_time ? `Mulai pukul ${hhmm(sched.start_time)}` : "Belum absen masuk"}</h3>
					<small>Absen dibuka 30 menit sebelum shift · lokasi toko</small>
					<div className="kx-chips">{sched.start_time && <span className="kx-chip">{hhmm(sched.start_time)} – {hhmm(sched.end_time)}</span>}<span className="kx-chip">Wajah / PIN</span></div>
					<DsButton block className="kx-btn-w" onClick={openAbsen}>Absen masuk</DsButton>
				</div>
			) : (
				<div className="ds-hero">
					<img className="ds-hero-art" src={ds3d("work-schedule")} alt="" />
					<small>Hari ini</small>
					<h3>Tidak ada jadwal</h3>
					<small>{nextSched ? `Shift berikutnya ${new Date(nextSched.date).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" })} · ${nextSched.shift_name}` : "Cek menu Jadwal"}</small>
					<DsButton block variant="ghost" onClick={() => go("jadwal")}>Lihat jadwal</DsButton>
				</div>
			)}

			{swapIn.n > 0 && (
				<DsNote icon={<DsIcon name="employee-schedule" />} action={<DsButton size="sm" onClick={() => go("izin")}>Jawab</DsButton>}>
					<b>Permintaan tukar shift</b>{swapIn.from ?? "Rekan"} ingin bertukar shift denganmu{swapIn.n > 1 ? ` (+${swapIn.n - 1} lagi)` : ""}.
				</DsNote>
			)}
			{botNotice && (
				<DsNote tone="info" icon={<DsIcon name="employee-telegram" />} action={<DsButton size="sm" variant="ghost" onClick={() => { try { localStorage.setItem("kx_bot_notice_v1", "1"); } catch { /* */ } setBotNotice(false); }}>Mengerti</DsButton>}>
					<b>Absen kini lewat aplikasi ini</b>Bot Telegram tidak dipakai lagi untuk absen masuk dan keluar. <button type="button" onClick={openGuide} style={{ background: "none", border: 0, padding: 0, color: "var(--ds-blue)", font: "600 13px var(--ds-font)" }}>Lihat panduan</button>
				</DsNote>
			)}
			{att.forgotOut && (
				<DsNote tone="danger" icon={<DsIcon name="employee-attendance-check-out" />} action={<DsButton size="sm" variant="danger" onClick={() => navigate({ to: "/$username/koreksi-absen" as any, params: { username }, search: { date: att.forgotOut!.date, type: "check_out" } } as any)}>Koreksi</DsButton>}>
					<b>Belum absen keluar</b>Kamu absen masuk {new Date(att.forgotOut.date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} tanpa absen keluar. Ajukan koreksi.
				</DsNote>
			)}
			{!isIn && !finished && tomorrow?.s && (
				<DsNote tone="info" icon={<DsIcon name="employee-schedule" />}>
					<b>{tomorrow.s && !isOffShift(tomorrow.s) ? `Besok ${tomorrow.s.shift_name}` : "Besok libur"}</b>
					{week[2].s ? `${new Date(`${week[2].date}T00:00:00+07:00`).toLocaleDateString("id-ID", { weekday: "long", timeZone: "Asia/Jakarta" })}: ${isOffShift(week[2].s) ? "Off" : `${week[2].s.shift_name} ${hhmm(week[2].s.start_time)}`}` : "Cek menu Jadwal"}
				</DsNote>
			)}
			<DsAsk onClick={() => go("izin")}>Butuh izin, cuti, atau tukar shift?</DsAsk>

			{requiresPinChange && (
				<DsNote icon={<span style={{ fontSize: 20 }}>🔒</span>} action={<DsButton size="sm" onClick={() => go("profil")}>Ganti</DsButton>}>
					<b>PIN default masih aktif</b>Ganti agar tak ada yang absen atas namamu.
				</DsNote>
			)}

			<DsSection title="Akses cepat" />
			<div className="kx-quick">
				{([["employee-leave", "Izin", "izin"], ["employee-recap", "Rekap", "rekap-absensi"], ["employee-payslip", "Slip", "slip-gaji"], ["employee-leaderboard", "Peringkat", "leaderboard"]] as const).map(([ic, l, to]) => (
					<button key={to} type="button" onClick={() => go(to)}><span className="ic"><img src={ds3d(ic)} alt="" /></span>{l}</button>
				))}
			</div>

			<DsSection title="Minggu ini" action={<button type="button" onClick={() => go("jadwal")}>Jadwal</button>} />
			<DsGroup>
				{week.map((d) => (
					<DsRow key={d.date} icon={<DsIcon name="employee-schedule" />}
						title={d.date === today ? `Hari ini${d.s && !isOffShift(d.s) ? ` · ${d.s.shift_name}` : ""}` : `${new Date(`${d.date}T00:00:00+07:00`).toLocaleDateString("id-ID", { weekday: "long", timeZone: "Asia/Jakarta" })}${d.s && !isOffShift(d.s) ? ` · ${d.s.shift_name}` : ""}`}
						sub={d.s && !isOffShift(d.s) ? `${hhmm(d.s.start_time)} – ${hhmm(d.s.end_time)}` : "Off"}
						trail={d.date === today ? (finished ? <DsTag tone="ok">Selesai</DsTag> : isIn ? <DsTag tone="info">Aktif</DsTag> : undefined) : undefined}
						chevron onClick={() => go("jadwal")} />
				))}
			</DsGroup>
			{isIn && (
				<DsGroup>
					<DsRow icon={<DsIcon name="stock-opname" />} title="Closing shift" sub="Opname & kebersihan · wajib sebelum absen keluar" trail={<DsTag tone="warn">Belum</DsTag>} onClick={() => go("absen-keluar")} />
				</DsGroup>
			)}
		</div>
	);
}
