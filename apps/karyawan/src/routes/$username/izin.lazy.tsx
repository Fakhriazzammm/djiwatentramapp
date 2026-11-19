import { createLazyFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useHybridPublicUsers } from "@djiwaapps/web-shared";
import { DsButton, DsEmpty, DsGroup, DsGroupLabel, DsIcon, DsIconButton, DsNote, DsPageTitle, DsRow, DsSheet, DsTag, DsTiles, ds3d } from "@djiwaapps/web-shared/components/ds";
import { createClient } from "@djiwaapps/web-shared/lib/client";
import { toast } from "sonner";
import { useStaffProfile } from "../$username.lazy";
import { hhmm, isOffShift, todayWib, type Schedule } from "@/components/karyawan/use-staff-data";

export const Route = createLazyFileRoute("/$username/izin")({ component: IzinPage });

type Req = { id: string; leave_type: string; start_date: string; end_date: string; reason: string; status: "pending" | "approved" | "rejected" | "cancelled"; review_notes: string | null; metadata: Record<string, any> | null; created_at: string };
const TYPES: [string, string][] = [["cuti", "Cuti"], ["sakit", "Sakit"], ["izin", "Izin"], ["tukar_shift", "Tukar shift"]];
const LABEL: Record<string, string> = { cuti: "Cuti", sakit: "Sakit", izin: "Izin", other: "Lainnya", koreksi_absen: "Koreksi absen", tukar_shift: "Tukar shift" };
const STATUS: Record<Req["status"], { label: string; tone?: "ok" | "warn" | "danger" }> = {
	pending: { label: "Menunggu", tone: "warn" }, approved: { label: "Disetujui", tone: "ok" }, rejected: { label: "Ditolak", tone: "danger" }, cancelled: { label: "Dibatalkan" },
};
const fmt = (d: string) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const days = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1);

function IzinPage() {
	const { staff, username, navigate } = useStaffProfile();
	const [rows, setRows] = useState<Req[] | null>(null);
	const [open, setOpen] = useState(false);

	const load = useCallback(async () => {
		if (!staff?._id) return;
		const { data } = await createClient().from("attendance_leave_requests")
			.select("id,leave_type,start_date,end_date,reason,status,review_notes,metadata,created_at")
			.eq("user_id", staff._id).order("created_at", { ascending: false }).limit(50);
		setRows((data as Req[]) ?? []);
	}, [staff?._id]);
	useEffect(() => { void load(); }, [load]);

	const monthKey = todayWib().slice(0, 7);
	const stats = useMemo(() => ({
		pending: rows?.filter((r) => r.status === "pending").length ?? 0,
		approved: rows?.filter((r) => r.status === "approved").length ?? 0,
		month: rows?.filter((r) => r.start_date.startsWith(monthKey)).length ?? 0,
	}), [rows, monthKey]);

	return (
		<>
			<DsPageTitle left={<DsIconButton aria-label="Kembali" onClick={() => navigate({ to: "/$username/beranda" as any, params: { username } } as any)}>‹</DsIconButton>} right={<DsIconButton aria-label="Ajukan baru" style={{ background: "var(--ds-navy)", color: "#fff" }} onClick={() => setOpen(true)}>+</DsIconButton>}>Izin &amp; cuti</DsPageTitle>
			<DsGroup>
				<DsTiles items={[{ value: stats.pending, label: "Menunggu" }, { value: stats.approved, label: "Disetujui" }, { value: stats.month, label: "Bulan ini" }]} />
			</DsGroup>
			<DsGroupLabel>Riwayat</DsGroupLabel>
			{rows === null ? (
				<DsGroup><DsRow title="Memuat…" /></DsGroup>
			) : rows.length === 0 ? (
				<DsEmpty icon={ds3d("employee-leave")}>Belum ada pengajuan. Ketuk + untuk mengajukan.</DsEmpty>
			) : (
				<DsGroup>
					{rows.map((r) => (
						<DsRow key={r.id} icon={<DsIcon name="employee-leave" />} title={LABEL[r.leave_type] ?? r.leave_type}
							sub={r.leave_type === "koreksi_absen" ? `${fmt(r.start_date)} · ${r.metadata?.type === "check_in" ? "masuk" : "keluar"} ${r.metadata?.time ?? ""}` : r.leave_type === "tukar_shift" ? `${fmt(r.start_date)} · dengan ${r.metadata?.partner_name ?? "rekan"}` : `${fmt(r.start_date)}${r.end_date !== r.start_date ? ` – ${fmt(r.end_date)}` : ""} · ${days(r.start_date, r.end_date)} hari`}
							trail={<DsTag tone={STATUS[r.status].tone}>{STATUS[r.status].label}</DsTag>} />
					))}
				</DsGroup>
			)}
			{rows?.some((r) => r.status === "rejected" && r.review_notes) && (
				<DsNote icon={<DsIcon name="notifications-alerts" />}><b>Ada yang ditolak</b>{rows.find((r) => r.status === "rejected" && r.review_notes)?.review_notes}</DsNote>
			)}
			{open && <RequestSheet onClose={() => setOpen(false)} onDone={() => { setOpen(false); void load(); }} />}
		</>
	);
}

function RequestSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
	const { staff } = useStaffProfile();
	const users = useHybridPublicUsers();
	const [type, setType] = useState("cuti");
	const [start, setStart] = useState(todayWib());
	const [end, setEnd] = useState(todayWib());
	const [reason, setReason] = useState("");
	const [partner, setPartner] = useState<string>("");
	const [day, setDay] = useState<Schedule[] | null>(null);
	const [busy, setBusy] = useState(false);
	const isSwap = type === "tukar_shift";

	useEffect(() => {
		if (!isSwap) return;
		let off = false;
		setDay(null);
		createClient().schema("pos").from("attendance_schedules").select("user_id,date,shift_name,start_time,end_time,status").eq("date", start)
			.then(({ data }) => { if (!off) setDay((data as Schedule[]) ?? []); }, () => { if (!off) setDay([]); });
		return () => { off = true; };
	}, [isSwap, start]);

	const mine = day?.find((s) => s.user_id === staff?._id) ?? null;
	const candidates = useMemo(() => (day ?? []).filter((s) => s.user_id !== staff?._id && !isOffShift(s) && (!mine || s.shift_name !== mine.shift_name)), [day, staff?._id, mine]);
	const nameOf = (id?: string) => (Array.isArray(users) ? users.find((u: any) => String(u._id) === String(id))?.name : undefined) ?? "Rekan";
	const valid = !!reason.trim() && start && end >= start && (!isSwap || (!!partner && !!mine && !isOffShift(mine)));

	const send = async () => {
		if (!valid || !staff?._id) return;
		setBusy(true);
		try {
			const p = candidates.find((c) => c.user_id === partner);
			const { error } = await createClient().from("attendance_leave_requests").insert({
				user_id: staff._id, user_name: staff.name, leave_type: type,
				start_date: start, end_date: isSwap ? start : end, reason: reason.trim(), status: "pending",
				metadata: isSwap ? { partner_id: partner, partner_name: nameOf(partner), my_shift: mine?.shift_name, partner_shift: p?.shift_name } : {},
			});
			if (error) throw error;
			toast.success("Pengajuan terkirim");
			onDone();
		} catch (e: any) {
			toast.error(e?.message || "Gagal mengirim pengajuan");
		} finally {
			setBusy(false);
		}
	};

	return (
		<DsSheet title="Ajukan" onClose={onClose}>
			<div className="kx-reasons" role="group" aria-label="Jenis pengajuan">{TYPES.map(([v, l]) => <button key={v} type="button" aria-pressed={type === v} onClick={() => setType(v)}>{l}</button>)}</div>
			<label className="kx-field"><span>{isSwap ? "Tanggal shift" : "Mulai"}</span><input id="izin-start" className="kx-input" type="date" min={todayWib()} value={start} onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); setPartner(""); }} /></label>
			{!isSwap && <label className="kx-field"><span>Sampai</span><input id="izin-end" className="kx-input" type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} /></label>}
			{isSwap && (
				<div className="kx-field"><span>Tukar dengan</span>
					{day === null ? <p className="ds-sub">Memuat jadwal…</p> : !mine || isOffShift(mine) ? <p className="ds-sub">Kamu tidak punya shift di tanggal ini.</p> : candidates.length === 0 ? <p className="ds-sub">Belum ada rekan dengan shift berbeda di tanggal ini.</p> : (
						<DsGroup>{candidates.map((c) => <DsRow key={c.user_id} title={nameOf(c.user_id)} sub={`${c.shift_name} ${hhmm(c.start_time)} – ${hhmm(c.end_time)}`} trail={partner === c.user_id ? <DsTag tone="ok">Dipilih</DsTag> : undefined} onClick={() => setPartner(c.user_id!)} />)}</DsGroup>
					)}
				</div>
			)}
			<label className="kx-field"><span>Alasan</span><textarea id="izin-reason" className="kx-input" rows={3} value={reason} maxLength={400} onChange={(e) => setReason(e.target.value)} placeholder={isSwap ? "Contoh: ada keperluan keluarga" : "Tulis alasan singkat"} /></label>
			<DsButton block disabled={!valid || busy} onClick={send}>{busy ? "Mengirim…" : "Kirim pengajuan"}</DsButton>
		</DsSheet>
	);
}
