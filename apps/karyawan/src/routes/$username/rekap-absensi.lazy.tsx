import { createLazyFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Skeleton, useHybridStaffLogs } from "@djiwaapps/web-shared";
import { DsButton, DsEmpty, DsGroup, DsGroupLabel, DsIcon, DsIconButton, DsNote, DsPageTitle, DsPills, DsRow, DsSheet, DsTag, DsTiles, ds3d } from "@djiwaapps/web-shared/components/ds";
import { useStaffProfile } from "../$username.lazy";

export const Route = createLazyFileRoute("/$username/rekap-absensi")({ component: RekapAbsensiPage });

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const SOURCE: Record<string, string> = { karyawan_app: "App Karyawan", telegram: "Bot Telegram", correction: "Koreksi disetujui", karyawan_web: "Web" };

const wib = (ts: number) => new Date(ts + 7 * 3600_000);
const hhmm = (ts: number) => `${String(wib(ts).getUTCHours()).padStart(2, "0")}:${String(wib(ts).getUTCMinutes()).padStart(2, "0")}`;
const dateKey = (ts: number) => wib(ts).toISOString().slice(0, 10);
const dayLabel = (ts: number) => `${DAYS[wib(ts).getUTCDay()]} ${wib(ts).getUTCDate()}`;

interface Session {
	checkIn: number;
	checkOut: number | null;
	shiftName: string;
	penalty: number;
	notes: string;
	source: string;
}

function buildSessions(logs: any[] | null): Session[] {
	if (!logs?.length) return [];
	const asc = [...logs].sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0));
	const out: Session[] = [];
	for (let i = 0; i < asc.length; i++) {
		const e = asc[i];
		if (e.type !== "check_in") continue;
		const next = asc[i + 1];
		const co = next?.type === "check_out" ? Number(next.timestamp ?? 0) : null;
		out.push({
			checkIn: Number(e.timestamp ?? 0), checkOut: co, shiftName: e.shiftName || e.shift_name || "—",
			penalty: Number(e.penaltyAmount ?? e.penalty_amount ?? 0), notes: String(e.notes ?? ""), source: String(e.source ?? e.raw?.source ?? ""),
		});
		if (co !== null) i++;
	}
	return out.reverse();
}

const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const duration = (a: number, b: number) => { const m = Math.max(0, Math.round((b - a) / 60000)); return `${Math.floor(m / 60)}j ${m % 60}m`; };
const fromNotes = (n: string, key: string) => n.split("|").map((x) => x.trim()).find((x) => x.startsWith(`${key}:`))?.slice(key.length + 1).trim();

function RekapAbsensiPage() {
	const { staff, isUnlocked, navigate, username } = useStaffProfile();
	const now = new Date();
	const [month, setMonth] = useState(now.getMonth() + 1);
	const [year, setYear] = useState(now.getFullYear());
	const [detail, setDetail] = useState<Session | null>(null);

	const logs = useHybridStaffLogs(isUnlocked && staff ? { userId: staff._id, month, year } : (undefined as any));
	const sessions = useMemo(() => buildSessions(logs), [logs]);
	const late = sessions.filter((s) => s.penalty > 0 || /terlambat \d+m/.test(s.notes)).length;
	const open = sessions.filter((s) => s.checkOut === null).length;

	const periods = useMemo(() => {
		const list: [string, string][] = [];
		for (let i = 0; i < 4; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); list.push([`${d.getFullYear()}-${d.getMonth() + 1}`, `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`]); }
		return list;
	}, []);

	const correct = (s: Session, type: "check_in" | "check_out") => {
		setDetail(null);
		navigate({ to: "/$username/koreksi-absen" as any, params: { username }, search: { date: dateKey(s.checkIn), type } } as any);
	};

	return (
		<>
			<DsPageTitle left={<DsIconButton aria-label="Kembali" onClick={() => window.history.back()}>‹</DsIconButton>}>Rekap kehadiran</DsPageTitle>
			<DsPills items={periods} value={`${year}-${month}`} onChange={(v) => { const [y, m] = v.split("-").map(Number); setYear(y); setMonth(m); }} />
			<DsGroup>
				<DsTiles items={[{ value: sessions.length, label: "Hadir" }, { value: late, label: "Terlambat" }, { value: open, label: "Belum keluar" }]} />
			</DsGroup>
			<DsGroupLabel>Riwayat</DsGroupLabel>
			{!logs ? (
				<div className="space-y-2" role="status" aria-label="Memuat rekap"><Skeleton className="h-14 rounded-3xl" /><Skeleton className="h-14 rounded-3xl" /></div>
			) : sessions.length === 0 ? (
				<DsEmpty icon={ds3d("employee-recap")}>Belum ada data kehadiran untuk {MONTHS[month - 1]}.</DsEmpty>
			) : (
				<DsGroup>
					{sessions.map((s) => {
						const isLate = s.penalty > 0 || /terlambat \d+m/.test(s.notes);
						return (
							<DsRow key={s.checkIn} icon={<DsIcon name="employee-recap" />} title={dayLabel(s.checkIn)}
								sub={`${hhmm(s.checkIn)} – ${s.checkOut ? hhmm(s.checkOut) : "belum keluar"} · ${s.shiftName}`}
								trail={s.checkOut === null ? <DsTag tone="warn">Belum keluar</DsTag> : <DsTag tone={isLate ? "warn" : "ok"}>{isLate ? "Telat" : "Tepat"}</DsTag>}
								chevron onClick={() => setDetail(s)} />
						);
					})}
				</DsGroup>
			)}
			<DsNote tone="info" icon={<DsIcon name="notifications-alerts" />}><b>Ada yang keliru?</b>Ketuk harinya lalu pilih “Ajukan koreksi”.</DsNote>

			{detail && (
				<DsSheet title={`${DAYS[wib(detail.checkIn).getUTCDay()]}, ${wib(detail.checkIn).getUTCDate()} ${MONTHS[wib(detail.checkIn).getUTCMonth()]}`} onClose={() => setDetail(null)}>
					<DsGroup>
						<div className="kx-kv"><span>Masuk</span><b>{hhmm(detail.checkIn)}{detail.notes.match(/terlambat (\d+)m/) ? ` · telat ${detail.notes.match(/terlambat (\d+)m/)![1]}m` : ""}</b></div>
						<div className="kx-kv"><span>Keluar</span><b>{detail.checkOut ? hhmm(detail.checkOut) : "Belum"}</b></div>
						{detail.checkOut && <div className="kx-kv"><span>Jam kerja</span><b>{duration(detail.checkIn, detail.checkOut)}</b></div>}
						<div className="kx-kv"><span>Shift</span><b>{detail.shiftName}</b></div>
						{detail.source && <div className="kx-kv"><span>Dicatat lewat</span><b>{SOURCE[detail.source] ?? detail.source}</b></div>}
						{fromNotes(detail.notes, "metode") && <div className="kx-kv"><span>Verifikasi</span><b>{fromNotes(detail.notes, "metode") === "face" ? "Wajah" : "PIN"}</b></div>}
						{fromNotes(detail.notes, "lokasi") && <div className="kx-kv"><span>Lokasi</span><b>{fromNotes(detail.notes, "lokasi")}</b></div>}
						{detail.penalty > 0 && <div className="kx-kv"><span>Denda</span><b>{rupiah(detail.penalty)}</b></div>}
					</DsGroup>
					<DsButton block variant="ghost" onClick={() => correct(detail, detail.checkOut ? "check_in" : "check_out")}>Ajukan koreksi</DsButton>
				</DsSheet>
			)}
		</>
	);
}
