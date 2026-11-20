import { createLazyFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useHybridPublicUsers } from "@djiwaapps/web-shared";
import { DsButton, DsEmpty, DsGroup, DsGroupLabel, DsIcon, DsIconButton, DsNote, DsPageTitle, DsRow, DsSheet, DsTag, DsTiles, ds3d } from "@djiwaapps/web-shared/components/ds";
import { createClient } from "@djiwaapps/web-shared/lib/client";
import { toast } from "sonner";
import { useStaffProfile } from "../$username.lazy";
import { hhmm, isOffShift, todayWib, type Schedule } from "@/components/karyawan/use-staff-data";
import { cancelSwap, coverOptions, requestCover, requestSwap, respondSwap, type CoverCandidate } from "@/lib/schedule-api";

export const Route = createLazyFileRoute("/$username/izin")({ component: IzinPage });

type Req = { id: string; leave_type: string; start_date: string; end_date: string; reason: string; status: "pending" | "approved" | "rejected" | "cancelled"; review_notes: string | null; metadata: Record<string, any> | null; created_at: string };
const TYPES: [string, string][] = [["cuti", "Cuti"], ["sakit", "Sakit"], ["izin", "Izin"], ["tukar_shift", "Tukar shift"]];
const LABEL: Record<string, string> = { cuti: "Cuti", sakit: "Sakit", izin: "Izin", other: "Lainnya", koreksi_absen: "Koreksi absen", tukar_shift: "Tukar shift", pengganti_shift: "Pengganti shift" };
const STATUS: Record<Req["status"], { label: string; tone?: "ok" | "warn" | "danger" }> = {
	pending: { label: "Menunggu", tone: "warn" }, approved: { label: "Disetujui", tone: "ok" }, rejected: { label: "Ditolak", tone: "danger" }, cancelled: { label: "Dibatalkan" },
};
const fmt = (d: string) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const days = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1);

function IzinPage() {
	const { staff, username, navigate, token } = useStaffProfile();
	const [rows, setRows] = useState<Req[] | null>(null);
	const [incoming, setIncoming] = useState<(Req & { user_name?: string })[]>([]);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [open, setOpen] = useState(false);

	const load = useCallback(async () => {
		if (!staff?._id) return;
		const { data } = await createClient().from("attendance_leave_requests")
			.select("id,leave_type,start_date,end_date,reason,status,review_notes,metadata,created_at")
			.eq("user_id", staff._id).order("created_at", { ascending: false }).limit(50);
		setRows((data as Req[]) ?? []);
		// Permintaan tukar shift dari rekan yang menunggu jawabanku.
		const { data: inc } = await createClient().from("attendance_leave_requests")
			.select("id,user_name,leave_type,start_date,end_date,reason,status,review_notes,metadata,created_at")
			.in("leave_type", ["tukar_shift", "pengganti_shift"]).eq("status", "pending").contains("metadata", { partner_id: staff._id }).order("created_at", { ascending: false });
		setIncoming((inc as any[]) ?? []);
	}, [staff?._id]);

	const answer = async (id: string, accept: boolean) => {
		setBusyId(id);
		try {
			const r = await respondSwap(token, id, accept);
			toast.success(accept ? `Jadwal diperbarui otomatis. Shiftmu sekarang: ${r.yourNewShift ?? "diperbarui"}` : "Permintaan ditolak");
			void load();
		} catch (e: any) { toast.error(e?.message || "Gagal"); } finally { setBusyId(null); }
	};
	const cancel = async (id: string) => {
		setBusyId(id);
		try { await cancelSwap(token, id); toast.success("Permintaan dibatalkan"); void load(); } catch (e: any) { toast.error(e?.message || "Gagal"); } finally { setBusyId(null); }
	};
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
			{incoming.length > 0 && (
				<>
					<DsGroupLabel>Menunggu jawabanmu</DsGroupLabel>
					{incoming.map((r) => (
						<DsGroup key={r.id}>
							<DsRow icon={<DsIcon name="employee-schedule" />} title={r.leave_type === "pengganti_shift" ? `${r.user_name ?? "Rekan"} minta kamu menggantikan` : `${r.user_name ?? "Rekan"} ingin tukar shift`} sub={r.leave_type === "pengganti_shift" ? `${fmt(r.start_date)} · shift ${r.metadata?.my_shift ?? ""} (kamu libur)` : `${fmt(r.start_date)} · ${r.metadata?.partner_shift ?? ""} → jadi ${r.metadata?.my_shift ?? ""}`} />
							<p className="ds-sub" style={{ margin: "0 2px 8px" }}>“{r.reason}” · {r.leave_type === "pengganti_shift" ? "Bila diterima, jadwalmu di tanggal itu otomatis berisi shift ini." : "Bila diterima, jadwal kalian langsung bertukar otomatis."}</p>
							<div style={{ display: "flex", gap: 8 }}>
								<DsButton block disabled={busyId === r.id} onClick={() => answer(r.id, true)}>Terima</DsButton>
								<DsButton block variant="ghost" disabled={busyId === r.id} onClick={() => answer(r.id, false)}>Tolak</DsButton>
							</div>
						</DsGroup>
					))}
				</>
			)}
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
							sub={r.leave_type === "koreksi_absen" ? `${fmt(r.start_date)} · ${r.metadata?.type === "check_in" ? "masuk" : "keluar"} ${r.metadata?.time ?? ""}` : r.leave_type === "tukar_shift" || r.leave_type === "pengganti_shift" ? `${fmt(r.start_date)} · ${r.leave_type === "pengganti_shift" ? "digantikan" : "dengan"} ${r.metadata?.partner_name ?? "rekan"}` : `${fmt(r.start_date)}${r.end_date !== r.start_date ? ` – ${fmt(r.end_date)}` : ""} · ${days(r.start_date, r.end_date)} hari`}
							trail={(r.leave_type === "tukar_shift" || r.leave_type === "pengganti_shift") && r.status === "pending" ? <DsButton size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => cancel(r.id)}>Batalkan</DsButton> : <DsTag tone={STATUS[r.status].tone}>{r.leave_type === "pengganti_shift" && r.status === "approved" ? "Sudah diganti" : r.leave_type === "tukar_shift" && r.status === "approved" ? "Sudah bertukar" : r.leave_type === "tukar_shift" && r.status === "pending" ? "Menunggu rekan" : STATUS[r.status].label}</DsTag>} />
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
	const { staff, token } = useStaffProfile();
	const users = useHybridPublicUsers();
	const [type, setType] = useState("cuti");
	const [start, setStart] = useState(todayWib());
	const [end, setEnd] = useState(todayWib());
	const [reason, setReason] = useState("");
	const [partner, setPartner] = useState<string>("");
	const [day, setDay] = useState<Schedule[] | null>(null);
	const [busy, setBusy] = useState(false);
	const isSwap = type === "tukar_shift";
	const canCover = type === "sakit" || type === "izin" || type === "cuti";
	const [workDays, setWorkDays] = useState<{ date: string; label: string }[]>([]);
	const [options, setOptions] = useState<Record<string, CoverCandidate[]>>({});
	const [covers, setCovers] = useState<Record<string, string>>({});

	// Hari kerjaku dalam rentang izin (maks. 7 hari) + rekan yang libur dan bisa menggantikan.
	useEffect(() => {
		if (!canCover || !staff?._id || end < start || days(start, end) > 7) { setWorkDays([]); setOptions({}); setCovers({}); return; }
		let off = false;
		void (async () => {
			const { data } = await createClient().schema("pos").from("attendance_schedules").select("date,shift_name,start_time,end_time,status").eq("user_id", staff._id).gte("date", start).lte("date", end).gte("date", todayWib());
			const list = ((data as Schedule[]) ?? []).filter((r) => !isOffShift(r)).map((r) => ({ date: String(r.date), label: `${r.shift_name} ${hhmm(r.start_time)}–${hhmm(r.end_time)}` }));
			if (off) return;
			setWorkDays(list);
			const next: Record<string, CoverCandidate[]> = {};
			await Promise.all(list.map(async (d) => { try { next[d.date] = (await coverOptions(token, d.date)).candidates; } catch { next[d.date] = []; } }));
			if (!off) { setOptions(next); setCovers((prev) => Object.fromEntries(Object.entries(prev).filter(([d]) => list.some((x) => x.date === d)))); }
		})();
		return () => { off = true; };
	}, [canCover, staff?._id, start, end, token]);

	useEffect(() => {
		if (!isSwap) return;
		let off = false;
		setDay(null);
		createClient().schema("pos").from("attendance_schedules").select("user_id,date,shift_name,start_time,end_time,status").eq("date", start)
			.then(({ data }) => { if (!off) setDay((data as Schedule[]) ?? []); }, () => { if (!off) setDay([]); });
		return () => { off = true; };
	}, [isSwap, start]);

	const mine = day?.find((s) => s.user_id === staff?._id) ?? null;
	const activeIds = useMemo(() => new Set((Array.isArray(users) ? users : []).filter((u: any) => u.isActive !== false).map((u: any) => String(u._id))), [users]);
	// Rekan yang bisa ditukar: aktif, punya jadwal di tanggal itu (libur pun boleh), shift berbeda, dan bukan sama-sama libur.
	const candidates = useMemo(() => (day ?? []).filter((c) => c.user_id !== staff?._id && (activeIds.size === 0 || activeIds.has(String(c.user_id)))
		&& (!mine || c.shift_name !== mine.shift_name || c.start_time !== mine.start_time) && !(mine && isOffShift(mine) && isOffShift(c))), [day, staff?._id, mine, activeIds]);
	const nameOf = (id?: string) => (Array.isArray(users) ? users.find((u: any) => String(u._id) === String(id))?.name : undefined) ?? "Rekan";
	const valid = !!reason.trim() && start && end >= start && (!isSwap || (!!partner && !!mine));

	const send = async () => {
		if (!valid || !staff?._id) return;
		setBusy(true);
		try {
			if (isSwap) {
				await requestSwap(token, { date: start, partnerId: partner, reason: reason.trim() });
				toast.success(`Permintaan dikirim ke ${nameOf(partner).split(" ")[0]}. Bila diterima, jadwal bertukar otomatis.`);
				onDone();
				return;
			}
			const { data: created, error } = await createClient().from("attendance_leave_requests").insert({
				user_id: staff._id, user_name: staff.name, leave_type: type,
				start_date: start, end_date: end, reason: reason.trim(), status: "pending", metadata: {},
			}).select("id").single();
			if (error) throw error;
			const picks = Object.entries(covers).filter(([, partnerId]) => partnerId);
			let failed = 0;
			for (const [date, partnerId] of picks) {
				try { await requestCover(token, { date, partnerId, reason: `${LABEL[type]}: ${reason.trim()}`.slice(0, 400), leaveRequestId: (created as { id: string } | null)?.id }); } catch { failed += 1; }
			}
			toast.success(picks.length ? (failed ? `Pengajuan terkirim. ${failed} permintaan pengganti gagal, supervisor akan membantu mencarikan.` : `Pengajuan terkirim. Permintaan pengganti dikirim ke ${picks.length} rekan.`) : "Pengajuan terkirim");
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
				<div className="kx-field"><span>Tukar dengan{mine ? ` · shiftmu: ${isOffShift(mine) ? "Libur" : `${mine.shift_name} ${hhmm(mine.start_time)}–${hhmm(mine.end_time)}`}` : ""}</span>
					{day === null ? <p className="ds-sub">Memuat jadwal…</p> : !mine ? <p className="ds-sub">Kamu belum punya jadwal di tanggal ini.</p> : candidates.length === 0 ? <p className="ds-sub">Belum ada rekan dengan shift berbeda di tanggal ini.</p> : (
						<DsGroup>{candidates.map((c) => <DsRow key={c.user_id} title={nameOf(c.user_id)} sub={isOffShift(c) ? "Libur" : `${c.shift_name} ${hhmm(c.start_time)} – ${hhmm(c.end_time)}`} trail={partner === c.user_id ? <DsTag tone="ok">Dipilih</DsTag> : undefined} onClick={() => setPartner(c.user_id!)} />)}</DsGroup>
					)}
				</div>
			)}
			{canCover && workDays.length > 0 && (
				<div className="kx-field"><span>Cari pengganti shift (opsional)</span>
					<p className="ds-sub" style={{ margin: "0 0 6px" }}>Pilih rekan yang sedang libur untuk menggantikanmu. Bila ia menerima, jadwalnya otomatis berisi shift ini dan kamu libur. Tanpa pilihan, supervisor yang akan mencarikan.</p>
					{workDays.map((d) => (
						<label key={d.date} className="kx-field" style={{ marginBottom: 8 }}><span>{fmt(d.date)} · {d.label}</span>
							<select className="kx-input" value={covers[d.date] ?? ""} onChange={(e) => setCovers((prev) => ({ ...prev, [d.date]: e.target.value }))} aria-label={`Pengganti ${fmt(d.date)}`}>
								<option value="">Tanpa pengganti</option>
								{(options[d.date] ?? []).map((c) => <option key={c.userId} value={c.userId}>{c.name}{c.sameRole ? " · sejabatan" : ""} · {c.weekShifts} shift minggu ini</option>)}
							</select>
							{options[d.date] && options[d.date].length === 0 && <p className="ds-sub" style={{ margin: "4px 0 0" }}>Belum ada rekan yang libur di tanggal ini.</p>}
						</label>
					))}
				</div>
			)}
			<label className="kx-field"><span>Alasan</span><textarea id="izin-reason" className="kx-input" rows={3} value={reason} maxLength={400} onChange={(e) => setReason(e.target.value)} placeholder={isSwap ? "Contoh: ada keperluan keluarga" : "Tulis alasan singkat"} /></label>
			<DsButton block disabled={!valid || busy} onClick={send}>{busy ? "Mengirim…" : "Kirim pengajuan"}</DsButton>
		</DsSheet>
	);
}
