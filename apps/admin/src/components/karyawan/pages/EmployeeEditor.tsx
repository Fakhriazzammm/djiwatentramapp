import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/client";
import { useHybridStaffRoles } from "@/hooks/use-hybrid-pos-data";
import { Btn } from "../kit";
import type { DirectoryRow } from "../data";

const TYPES = [
	{ value: "full_time", label: "Penuh waktu" },
	{ value: "part_time", label: "Paruh waktu" },
	{ value: "freelance", label: "Freelance" },
	{ value: "probation", label: "Percobaan" },
];

type StaffRole = { _id: string; name: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="block text-[12px]">
			<span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">{label}</span>
			{children}
		</label>
	);
}

const input = "h-10 w-full border border-[#d8d8de] bg-white px-3 text-[13px] outline-none focus:border-[#111114]";

/** Formulir ubah data karyawan. Menulis langsung ke yumi_users (kolom + raw). */
export default function EmployeeEditor({ row, onClose, onSaved }: { row: DirectoryRow; onClose: () => void; onSaved: () => void }) {
	const roles = ((useHybridStaffRoles() as StaffRole[] | undefined) ?? []).filter((r) => r.name);
	const r = row.raw;
	const [form, setForm] = useState({
		name: row.name,
		roleId: row.roleId ?? "",
		jabatan: r.jabatan ?? "",
		isActive: row.isActive,
		phone: r.phone ?? "",
		identityNumber: r.identityNumber ?? "",
		birthDate: r.birthDate ?? "",
		address: r.address ?? "",
		employmentType: r.employmentType ?? "full_time",
		startDate: (r.startDate ?? "").slice(0, 10),
		contractEndDate: (r.contractEndDate ?? "").slice(0, 10),
		monthlySalary: r.monthlySalary ? String(r.monthlySalary) : "",
		location: r.location ?? "",
		emergencyContactName: r.emergencyContactName ?? "",
		emergencyContactPhone: r.emergencyContactPhone ?? "",
	});
	const [busy, setBusy] = useState(false);
	const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
	const nameOk = form.name.trim().length >= 3;
	const phoneOk = !form.phone || /^\+?\d[\d\s-]{7,}$/.test(form.phone.trim());
	const dateOk = (v: string) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
	const salary = form.monthlySalary.trim() === "" ? null : Number(form.monthlySalary.replace(/[^\d.]/g, ""));
	const valid = nameOk && phoneOk && dateOk(form.startDate) && dateOk(form.contractEndDate) && dateOk(form.birthDate) && (salary === null || Number.isFinite(salary));

	const save = async () => {
		if (!valid || busy) return;
		setBusy(true);
		try {
			const supabase = createClient();
			const { data: existing, error: readErr } = await supabase.from("yumi_users").select("raw").eq("source_id", row._id).maybeSingle();
			if (readErr) throw readErr;
			const clean = (v: string) => (v.trim() === "" ? null : v.trim());
			const raw = {
				...(existing?.raw ?? {}),
				phone: clean(form.phone),
				identityNumber: clean(form.identityNumber),
				birthDate: clean(form.birthDate),
				address: clean(form.address),
				employmentType: form.employmentType,
				startDate: clean(form.startDate),
				contractEndDate: clean(form.contractEndDate),
				monthlySalary: salary,
				location: clean(form.location),
				emergencyContactName: clean(form.emergencyContactName),
				emergencyContactPhone: clean(form.emergencyContactPhone),
				jabatan: clean(form.jabatan),
			};
			const updates: Record<string, unknown> = { name: form.name.trim(), is_active: form.isActive, raw };
			if (form.roleId && form.roleId !== row.roleId) updates.role_source_id = form.roleId;
			const { error } = await supabase.from("yumi_users").update(updates).eq("source_id", row._id);
			if (error) throw error;
			toast.success("Data karyawan disimpan");
			onSaved();
		} catch {
			toast.error("Data belum bisa disimpan. Coba lagi atau masuk ulang.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
			<div className="font-display text-[18px]">Ubah data · {row.name}</div>
			<Field label="Nama lengkap"><input className={input} value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!nameOk} /></Field>
			<div className="grid grid-cols-2 gap-3">
				<Field label="Peran sistem">
					<select className={input} value={form.roleId} onChange={(e) => set("roleId", e.target.value)}>
						{!form.roleId ? <option value="">Pilih peran</option> : null}
						{roles.map((role) => <option key={role._id} value={role._id}>{role.name}</option>)}
					</select>
				</Field>
				<Field label="Jabatan"><input className={input} value={form.jabatan} onChange={(e) => set("jabatan", e.target.value)} placeholder="mis. Helper Dapur" /></Field>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<Field label="No HP"><input className={input} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="08xx xxxx xxxx" aria-invalid={!phoneOk} /></Field>
				<Field label="Tipe kerja"><select className={input} value={form.employmentType} onChange={(e) => set("employmentType", e.target.value)}>{TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<Field label="Mulai kerja"><input type="date" className={input} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
				<Field label="Kontrak berakhir"><input type="date" className={input} value={form.contractEndDate} onChange={(e) => set("contractEndDate", e.target.value)} /></Field>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<Field label="Gaji bulanan (Rp)"><input inputMode="numeric" className={input} value={form.monthlySalary} onChange={(e) => set("monthlySalary", e.target.value)} /></Field>
				<Field label="Lokasi kerja"><input className={input} value={form.location} onChange={(e) => set("location", e.target.value)} /></Field>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<Field label="Nomor identitas"><input className={input} value={form.identityNumber} onChange={(e) => set("identityNumber", e.target.value)} /></Field>
				<Field label="Tanggal lahir"><input type="date" className={input} value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} /></Field>
			</div>
			<Field label="Alamat"><textarea className={`${input} h-20 py-2`} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
			<div className="grid grid-cols-2 gap-3">
				<Field label="Kontak darurat"><input className={input} value={form.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} /></Field>
				<Field label="HP kontak darurat"><input className={input} value={form.emergencyContactPhone} onChange={(e) => set("emergencyContactPhone", e.target.value)} /></Field>
			</div>
			<label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-[#111114]" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />Akun aktif</label>
			{!valid ? <p className="text-[12px] text-[#b42318]">Periksa isian: nama minimal 3 huruf, No HP berupa angka, tanggal berformat benar.</p> : null}
			<div className="flex gap-2 pt-1"><Btn onClick={onClose}>Batal</Btn><div className="flex-1"><Btn primary type="submit" disabled={!valid || busy}>{busy ? "Menyimpan…" : "Simpan"}</Btn></div></div>
		</form>
	);
}
