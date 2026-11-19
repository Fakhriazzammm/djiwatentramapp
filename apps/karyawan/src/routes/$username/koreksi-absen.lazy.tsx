import { createLazyFileRoute, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { DsButton, DsGroup, DsGroupLabel, DsIcon, DsNote, DsPageTitle } from "@djiwaapps/web-shared/components/ds";
import { createClient } from "@djiwaapps/web-shared/lib/client";
import { toast } from "sonner";
import { useStaffProfile } from "../$username.lazy";
import { todayWib } from "@/components/karyawan/use-staff-data";

export const Route = createLazyFileRoute("/$username/koreksi-absen")({ component: KoreksiAbsenPage });

const REASONS = ["Lupa absen", "HP mati / rusak", "App error", "Lainnya"];

/** Koreksi absen: jam yang benar + alasan → supervisor. Disetujui = log absen koreksi ditulis otomatis. */
function KoreksiAbsenPage() {
	const { staff, username, navigate, today } = useStaffProfile();
	const search = useSearch({ strict: false }) as { date?: string; type?: "check_in" | "check_out" };
	const [type, setType] = useState<"check_in" | "check_out">(search.type ?? "check_out");
	const [date, setDate] = useState(search.date ?? todayWib());
	const [time, setTime] = useState("");
	const [reason, setReason] = useState("Lupa absen");
	const [note, setNote] = useState("");
	const [busy, setBusy] = useState(false);
	const valid = /^\d{2}:\d{2}$/.test(time) && date && date <= todayWib();

	const submit = async () => {
		if (!valid || !staff?._id) return;
		setBusy(true);
		try {
			const { error } = await createClient().from("attendance_leave_requests").insert({
				user_id: staff._id, user_name: staff.name, leave_type: "koreksi_absen",
				start_date: date, end_date: date, reason: `${reason}${note ? ` — ${note}` : ""}`, status: "pending",
				metadata: { type, time },
			});
			if (error) throw error;
			toast.success("Koreksi dikirim ke supervisor");
			today.reload();
			navigate({ to: "/$username/izin" as any, params: { username } } as any);
		} catch (e: any) {
			toast.error(e?.message || "Gagal mengirim koreksi");
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<DsPageTitle left={<button type="button" className="ds-iconbtn" aria-label="Kembali" onClick={() => window.history.back()}>‹</button>}>Koreksi absen</DsPageTitle>
			<DsNote tone="info" icon={<DsIcon name="employee-recap" />}><b>Perbaiki catatan kehadiran</b>Jam yang benar akan tercatat setelah supervisor menyetujui.</DsNote>
			<DsGroupLabel>Yang dikoreksi</DsGroupLabel>
			<DsGroup white>
				<div className="kx-reasons" role="group" aria-label="Jenis koreksi">
					<button type="button" aria-pressed={type === "check_in"} onClick={() => setType("check_in")}>Jam masuk</button>
					<button type="button" aria-pressed={type === "check_out"} onClick={() => setType("check_out")}>Jam keluar</button>
				</div>
				<label className="kx-field"><span>Tanggal</span><input id="koreksi-date" className="kx-input" type="date" max={todayWib()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
				<label className="kx-field"><span>Jam yang benar (WIB)</span><input id="koreksi-time" className="kx-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
				<div className="kx-field"><span>Alasan</span><div className="kx-reasons">{REASONS.map((r) => <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}</div></div>
				<label className="kx-field"><span>Catatan (opsional)</span><textarea id="koreksi-note" className="kx-input" rows={3} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: HP mati saat closing" /></label>
			</DsGroup>
			<DsButton block disabled={!valid || busy} onClick={submit}>{busy ? "Mengirim…" : "Kirim ke supervisor"}</DsButton>
		</>
	);
}
