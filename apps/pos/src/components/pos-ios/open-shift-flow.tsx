import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCircle2, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRp, IOS_SPRING, IOS_SPRING_SOFT, IosChip } from "./ios-kit";

type OnlineStatus = string;
export interface OpenShiftController {
	step: 1 | 2 | 3 | 4;
	setStep: (step: 1 | 2 | 3 | 4) => void;
	success: { cashierName: string; shiftName: string; amount: number } | null;
	onFinish: () => void;
	currentUserName?: string;
	cashierName: string;
	setCashierName: (value: string) => void;
	staff: Array<{ _id: string; name: string }>;
	shiftName: string;
	setShiftName: (value: string) => void;
	predefinedShifts?: string[];
	isCustom: boolean;
	setIsCustom: (value: boolean) => void;
	schedule?: { openTime?: string; closeTime?: string };
	teamSections: Array<{ role: string; users: Array<{ _id: string; name: string }> }> | null;
	teamMembers: string[];
	setTeamMembers: (updater: (prev: string[]) => string[]) => void;
	teamSearch: string;
	setTeamSearch: (value: string) => void;
	toggleVisibleTeam: () => void;
	amount: string;
	setAmount: (value: string) => void;
	submitting: boolean;
	error: string | null;
	onNext: () => void;
	onConfirm: () => void;
	operational: Record<string, boolean>;
	setOperational: (value: Record<string, boolean>) => void;
	operationalChecks: ReadonlyArray<{ key: string; label: string }>;
	online: Record<string, { status: OnlineStatus; note: string }>;
	setOnline: (updater: (prev: any) => any) => void;
	onlinePlatforms: ReadonlyArray<{ key: string; label: string }>;
	onlineStatusOptions: ReadonlyArray<{ value: string; label: string }>;
}

const STEPS = ["Data", "Review", "Checklist"];
const QUICK = [50000, 100000, 200000, 500000];

function Label({ children }: { children: React.ReactNode }) {
	return <p className="mb-1.5 text-[11px] font-bold tracking-wider text-muted-foreground">{children}</p>;
}
const fieldClass = "h-11 w-full rounded-[13px] bg-muted px-3.5 text-[15px] outline-none placeholder:text-muted-foreground focus:bg-background focus:shadow-[0_0_0_1px_var(--border)]";

export function OpenShiftFlow({ c }: { c: OpenShiftController }) {
	if (c.success) {
		return (
			<motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={IOS_SPRING_SOFT} className="flex flex-1 flex-col items-center px-2 pt-8 text-center">
				<motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...IOS_SPRING, delay: 0.1 }} className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"><CheckCircle2 className="h-8 w-8" /></motion.div>
				<h3 className="mt-4 text-[22px] font-extrabold tracking-tight">Shift siap digunakan</h3>
				<p className="mt-1 text-[14px] text-muted-foreground">Kasir sudah boleh mulai menerima transaksi.</p>
				<div className="mt-5 w-full space-y-2 rounded-2xl bg-muted/60 p-4 text-left text-[14px]">
					<div className="flex justify-between"><span className="text-muted-foreground">Kasir</span><b>{c.success.cashierName}</b></div>
					<div className="flex justify-between"><span className="text-muted-foreground">Shift</span><b>{c.success.shiftName}</b></div>
					<div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Modal awal</span><b className="text-primary">{formatRp(c.success.amount)}</b></div>
				</div>
				<motion.button type="button" whileTap={{ scale: 0.97 }} onClick={c.onFinish} className="mt-6 h-[52px] w-full rounded-2xl bg-primary text-[16px] font-bold text-primary-foreground">Masuk ke kasir</motion.button>
			</motion.div>
		);
	}

	const allOnlineSet = c.onlinePlatforms.every(({ key }) => c.online[key]?.status !== "pending");
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="px-0.5 pb-3">
				<h3 className="text-[22px] font-extrabold tracking-tight">Buka shift</h3>
				<p className="text-[13px] text-muted-foreground">Siapkan kasir kurang dari satu menit</p>
			</div>
			<div className="mb-4 flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={Math.min(3, c.step)}>
				{STEPS.map((label, index) => (
					<div key={label} className="flex-1">
						<div className="h-1.5 overflow-hidden rounded-full bg-border"><motion.div className="h-full rounded-full bg-primary" initial={false} animate={{ width: c.step >= index + 1 ? "100%" : "0%" }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} /></div>
						<p className={cn("mt-1 text-[11px] font-bold", c.step === index + 1 ? "text-primary" : "text-muted-foreground")}>{index + 1}. {label}</p>
					</div>
				))}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto pb-4">
				<AnimatePresence mode="wait" initial={false}>
					{c.step === 1 ? (
						<motion.div key="s1" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
							<Label>KASIR</Label>
							{c.cashierName && c.cashierName === c.currentUserName ? (
								<div className="mb-4 flex h-11 items-center justify-between rounded-[13px] bg-muted px-3.5"><span className="text-[15px] font-bold">{c.cashierName} <span className="font-normal text-muted-foreground">· diri sendiri</span></span><button type="button" onClick={() => c.setCashierName("")} className="text-[13px] font-bold text-primary">Ganti</button></div>
							) : (
								<select value={c.cashierName} onChange={(event) => c.setCashierName(event.target.value)} aria-label="Pilih kasir" className={cn(fieldClass, "mb-4 appearance-none")}>
									<option value="">Pilih kasir</option>
									{c.staff.map((user) => <option key={user._id} value={user.name}>{user.name}</option>)}
								</select>
							)}
							<Label>SHIFT</Label>
							{c.predefinedShifts?.length ? (
								<div className="mb-2 flex flex-wrap gap-2">
									{c.predefinedShifts.map((name) => <IosChip key={name} active={!c.isCustom && c.shiftName === name} onClick={() => { c.setIsCustom(false); c.setShiftName(name); }}>{name}</IosChip>)}
									<IosChip active={c.isCustom} onClick={() => { c.setIsCustom(true); c.setShiftName(""); }}>Lainnya</IosChip>
								</div>
							) : null}
							{!c.predefinedShifts?.length || c.isCustom ? <input value={c.shiftName} onChange={(event) => c.setShiftName(event.target.value)} placeholder="Nama shift" aria-label="Nama shift" className={cn(fieldClass, "mb-2")} /> : null}
							{c.schedule?.openTime && c.schedule?.closeTime ? <p className="mb-3 text-[12px] font-semibold text-primary">Jadwal {c.schedule.openTime} – {c.schedule.closeTime}</p> : <div className="mb-3" />}
							<Label>MODAL KASIR (RP)</Label>
							<input value={c.amount} onChange={(event) => c.setAmount(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="0" aria-label="Modal kasir" className={cn(fieldClass, "h-14 text-[24px] font-extrabold tracking-tight")} />
							<div className="mt-2 flex flex-wrap gap-2">{QUICK.map((value) => <IosChip key={value} active={c.amount === String(value)} onClick={() => c.setAmount(String(value))} className="h-8 px-3.5 text-[12.5px]">{formatRp(value)}</IosChip>)}</div>
							<Label>{" "}</Label>
							<div className="mt-4" /><Label>TIM BERTUGAS (OPSIONAL)</Label>
							<div className="rounded-2xl bg-muted/50 p-2.5">
								<div className="flex items-center gap-2"><Search className="ml-1 h-4 w-4 text-muted-foreground" /><input value={c.teamSearch} onChange={(event) => c.setTeamSearch(event.target.value)} placeholder="Cari anggota tim" aria-label="Cari anggota tim" className="h-10 min-w-0 flex-1 bg-transparent text-[14px] outline-none" /><button type="button" onClick={c.toggleVisibleTeam} className="shrink-0 px-2 text-[12.5px] font-bold text-primary">Pilih semua</button></div>
								<div className="mt-1 max-h-44 overflow-y-auto">
									{!c.teamSections ? <p className="px-1 py-2 text-[13px] italic text-muted-foreground">Memuat anggota tim…</p> : c.teamSections.length === 0 ? <p className="px-1 py-2 text-[13px] text-muted-foreground">Tidak ada anggota yang cocok.</p> : c.teamSections.map(({ role, users }) => (
										<div key={role}>
											<p className="px-1 pb-0.5 pt-2 text-[10.5px] font-bold tracking-widest text-muted-foreground/80">{role.toUpperCase()}</p>
											{users.map((user) => {
												const on = c.teamMembers.includes(user.name);
												return (
													<button key={user._id} type="button" onClick={() => c.setTeamMembers((prev) => (on ? prev.filter((n) => n !== user.name) : [...new Set([...prev, user.name])]))} aria-pressed={on} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-1.5 text-left text-[14px]">
														<span className={cn("flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{on ? <Check className="h-3 w-3" /> : null}</span>{user.name}
													</button>
												);
											})}
										</div>
									))}
								</div>
							</div>
							{c.teamMembers.length > 0 ? <p className="mt-1.5 text-[12px] text-muted-foreground">{c.teamMembers.length} anggota dipilih</p> : null}
						</motion.div>
					) : c.step === 2 ? (
						<motion.div key="s2" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
							<div className="space-y-2.5 rounded-2xl bg-muted/60 p-4 text-[14px]">
								<div className="flex justify-between gap-3"><span className="text-muted-foreground">Kasir</span><b>{c.cashierName || "-"}</b></div>
								<div className="flex justify-between gap-3"><span className="text-muted-foreground">Shift</span><b>{c.shiftName || "-"}</b></div>
								{c.schedule?.openTime && c.schedule?.closeTime ? <div className="flex justify-between gap-3"><span className="text-muted-foreground">Jadwal</span><b>{c.schedule.openTime} – {c.schedule.closeTime}</b></div> : null}
								<div className="flex justify-between gap-3"><span className="text-muted-foreground">Tim</span><b>{c.teamMembers.length ? `${c.teamMembers.length} anggota` : "—"}</b></div>
								<div className="flex justify-between gap-3 border-t border-border pt-2.5"><span className="text-muted-foreground">Modal awal</span><b className="text-[16px] text-primary">{formatRp(Number(c.amount) || 0)}</b></div>
							</div>
							<button type="button" onClick={() => c.setStep(1)} className="mt-2 h-10 w-full text-[14px] font-bold text-primary">Ubah data</button>
							<p className="mt-2 rounded-xl bg-primary/5 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">Shift dan transaksi <b className="text-foreground">Modal Awal</b> disimpan bersamaan. Checklist online food wajib diselesaikan sebelum shift dibuka.</p>
						</motion.div>
					) : (
						<motion.div key="s3" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
							<p className="mb-3 rounded-xl bg-primary/5 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">Pastikan area kasir siap. Untuk online food, buka aplikasi merchant lalu pilih statusnya. Jangan masukkan password di sini.</p>
							<div className="mb-4 rounded-2xl border border-border p-3">
								<div className="flex items-center justify-between pb-1"><p className="text-[14px] font-bold">Kesiapan operasional</p><button type="button" onClick={() => c.setOperational(Object.fromEntries(c.operationalChecks.map(({ key }) => [key, true])))} className="text-[12.5px] font-bold text-primary">Centang semua</button></div>
								{c.operationalChecks.map(({ key, label }) => {
									const on = Boolean(c.operational[key]);
									return (
										<button key={key} type="button" aria-pressed={on} onClick={() => c.setOperational({ ...c.operational, [key]: !on })} className="flex min-h-10 w-full items-center gap-3 text-left text-[14px]">
											<span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{on ? <Check className="h-3 w-3" /> : null}</span>{label}
										</button>
									);
								})}
							</div>
							<div className="flex items-center justify-between pb-2"><p className="text-[14px] font-bold">Status online food</p><span className="text-[12px] font-semibold text-muted-foreground">Wajib diberi status</span></div>
							{c.onlinePlatforms.map(({ key, label }) => {
								const item = c.online[key];
								return (
									<div key={key} className={cn("mb-2 rounded-2xl border p-3", item?.status === "active" ? "border-emerald-200 bg-emerald-50/60" : item?.status === "problem" ? "border-amber-200 bg-amber-50/60" : "border-border")}>
										<p className="mb-2 text-[14px] font-bold">{label}</p>
										<div className="flex flex-wrap gap-1.5">{c.onlineStatusOptions.map((option) => <IosChip key={option.value} active={item?.status === option.value} onClick={() => c.setOnline((cur: any) => ({ ...cur, [key]: { ...cur[key], status: option.value } }))} className="h-8 px-3 text-[12.5px]">{option.label}</IosChip>)}</div>
										{item?.status === "problem" ? <input value={item.note} onChange={(event) => c.setOnline((cur: any) => ({ ...cur, [key]: { ...cur[key], note: event.target.value } }))} placeholder="Contoh: aplikasi logout / printer offline" aria-label={`Catatan ${label}`} className="mt-2 h-10 w-full rounded-xl bg-background px-3 text-[14px] outline-none" /> : null}
									</div>
								);
							})}
							{!allOnlineSet ? <p className="text-[12px] font-semibold text-amber-700">Semua platform wajib diberi status sebelum shift dibuka.</p> : null}
						</motion.div>
					)}
				</AnimatePresence>
				{c.error ? <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[12.5px] font-semibold text-rose-700">{c.error}</p> : null}
			</div>

			<div className="shrink-0 border-t border-border bg-background pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2.5">
				<div className="flex gap-2.5">
					{c.step > 1 ? <button type="button" disabled={c.submitting} onClick={() => c.setStep((c.step - 1) as 1 | 2 | 3)} className="h-[52px] w-24 rounded-2xl bg-muted text-[15px] font-bold disabled:opacity-60">Kembali</button> : null}
					<motion.button type="button" whileTap={{ scale: 0.97 }} transition={IOS_SPRING} disabled={c.submitting} onClick={() => (c.step === 1 ? c.onNext() : c.step === 2 ? c.setStep(3) : c.onConfirm())} className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-[16px] font-bold text-primary-foreground disabled:opacity-60">
						{c.submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
						{c.step === 1 ? "Lanjut ke review" : c.step === 2 ? "Lanjut checklist" : c.submitting ? "Menyimpan…" : "Buka shift"}
					</motion.button>
				</div>
			</div>
		</div>
	);
}
