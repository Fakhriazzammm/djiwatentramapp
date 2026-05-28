import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { withSaveToast } from "@/lib/with-save-toast";
import {
	Clock,
	MapPin,
	Save,
	Plus,
	Trash2,
	Layers,
	X,
	Users,
	Search,
	Check,
	Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogClose,
} from "@/components/ui/dialog";
import {
	useHybridSiteSettings,
	useHybridStaffUsers,
} from "@/hooks/use-hybrid-pos-data";
import {
	useHybridUpdateSiteSettings,
} from "@/hooks/use-hybrid-write-actions";

type ShiftSchedule = {
	name: string;
	openTime?: string;
	closeTime?: string;
};

type PengaturanTab = "shift" | "geofencing" | "template";

const pengaturanTabs: { id: PengaturanTab; label: string; icon: typeof Clock }[] = [
	{ id: "shift", label: "Manajemen Shift", icon: Clock },
	{ id: "geofencing", label: "Pengaturan Absensi & Geofencing", icon: MapPin },
	{ id: "template", label: "Template Export", icon: Layers },
];

function buildShiftSchedules(
	predefinedShifts: string[],
	existingSchedules: ShiftSchedule[] = []
): ShiftSchedule[] {
	return predefinedShifts.map((name, index) => {
		const existing = existingSchedules.find((schedule) => schedule.name === name);
		return {
			name,
			openTime: existing?.openTime ?? (index === 0 ? "07:00" : ""),
			closeTime: existing?.closeTime ?? (index === 0 ? "15:00" : ""),
		};
	});
}

function AttendancePengaturanPage() {
	const [activeTab, setActiveTab] = useState<PengaturanTab>("shift");
	const siteSettings = useHybridSiteSettings();
	const updateSiteSettings = useHybridUpdateSiteSettings();

	const [shiftSettings, setShiftSettings] = useState({
		predefinedShifts: [] as string[],
		defaultStartingCash: 0,
		reminderMinutesBeforeClose: 15,
		autoSendShiftReportEmail: false,
		shiftSchedules: [] as ShiftSchedule[],
	});

	const [attendanceLat, setAttendanceLat] = useState(-6.2);
	const [attendanceLng, setAttendanceLng] = useState(106.816666);
	const [attendanceRadius, setAttendanceRadius] = useState(50);

	type RosterGroupStaff = { rawName: string; userId?: string; displayName?: string };
	type RosterGroup = { label: string; roleLabel?: string; colorKey?: string; staff: RosterGroupStaff[] };
	type RosterTemplate = { groups: RosterGroup[]; updatedAt?: string };
	const [rosterTemplate, setRosterTemplate] = useState<RosterTemplate>({ groups: [] });
	const [showStaffPicker, setShowStaffPicker] = useState(false);
	const [pickerGroupIndex, setPickerGroupIndex] = useState(0);
	const [staffSearchQuery, setStaffSearchQuery] = useState("");
	const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
	const staffUsers = useHybridStaffUsers();

	useEffect(() => {
		if (siteSettings) {
			setShiftSettings({
				predefinedShifts: siteSettings.shiftSettings?.predefinedShifts ?? [],
				defaultStartingCash: siteSettings.shiftSettings?.defaultStartingCash ?? 0,
				reminderMinutesBeforeClose:
					siteSettings.shiftSettings?.reminderMinutesBeforeClose ?? 15,
				autoSendShiftReportEmail:
					siteSettings.shiftSettings?.autoSendShiftReportEmail ?? false,
				shiftSchedules: buildShiftSchedules(
					siteSettings.shiftSettings?.predefinedShifts ?? [],
					siteSettings.shiftSettings?.shiftSchedules ?? []
				),
			});
			setAttendanceLat(siteSettings.attendanceLat ?? -6.2);
			setAttendanceLng(siteSettings.attendanceLng ?? 106.816666);
			setAttendanceRadius(siteSettings.attendanceRadius ?? 50);
			const raw = siteSettings.raw ?? {};
			const saved = (raw as any)?.attendanceRosterTemplate;
			if (saved?.groups) {
				setRosterTemplate(saved as RosterTemplate);
			}
		}
	}, [siteSettings]);

	const syncShiftSettings = (predefinedShifts: string[], schedules?: ShiftSchedule[]) => {
		setShiftSettings((prev) => ({
			...prev,
			predefinedShifts,
			shiftSchedules: buildShiftSchedules(predefinedShifts, schedules ?? prev.shiftSchedules),
		}));
	};

	const teamShiftsGridClass = "grid grid-cols-1 gap-3 xl:grid-cols-2";

	const handleSave = async () => {
		const payload: Record<string, unknown> = {
			shiftSettings: {
				...shiftSettings,
				shiftSchedules: buildShiftSchedules(
					shiftSettings.predefinedShifts,
					shiftSettings.shiftSchedules
				),
			},
			attendanceLat,
			attendanceLng,
			attendanceRadius,
		};

		// Preserve other existing settings
		if (siteSettings) {
			for (const key of Object.keys(siteSettings)) {
				if (!(key in payload)) {
					(payload as any)[key] = (siteSettings as any)[key];
				}
			}
		}

		await withSaveToast(
			() => updateSiteSettings(payload),
			{ success: "Pengaturan berhasil disimpan!" }
		);
	};

	return (
		<div className="mx-auto w-full max-w-7xl space-y-4 md:space-y-8">
			{/* Header */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 className="font-bold text-foreground text-xl tracking-tight md:text-3xl">
						Pengaturan Absensi
					</h2>
					<p className="mt-0.5 text-muted-foreground text-xs md:mt-1 md:text-sm">
						Kelola Shift Kerja & Konfigurasi Lokasi Kehadiran Tim
					</p>
				</div>
				<Button
					className="gap-2 px-6 py-3 md:gap-3 md:px-8 md:py-3.5"
					onClick={handleSave}
					size="lg"
					type="button"
				>
					<Save className="h-4 w-4" /> Simpan
				</Button>
			</div>

			{/* Tab Switcher */}
			<div className="no-scrollbar flex gap-1 overflow-x-auto rounded-lg bg-muted p-1 md:p-1.5">
				{pengaturanTabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => setActiveTab(tab.id)}
						className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
							activeTab === tab.id
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						<tab.icon className="h-4 w-4" />
						{tab.label}
					</button>
				))}
			</div>

			{/* ── TAB: Manajemen Shift ── */}
			{activeTab === "shift" && (
				<section className="space-y-6 rounded-xllll border border-border bg-card p-4 md:p-6">
					<div className="flex items-center gap-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-primary/10 text-primary">
							<Clock className="h-5 w-5" />
						</div>
						<div>
							<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
								Manajemen Shift
							</h3>
							<p className="text-muted-foreground text-sm">
								Atur shift kerja, jam operasional, dan popup pengingat kasir
							</p>
						</div>
					</div>

					<div className="space-y-8">
						{/* Predefined Shifts */}
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<div className="space-y-1">
									<h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
										Daftar Shift
									</h4>
									<p className="text-muted-foreground text-xs">
										Shift yang dapat dipilih oleh kasir saat mulai bertugas.
									</p>
								</div>
								<button
									onClick={() => {
										const rawName = window.prompt("Masukkan nama shift baru:");
										const name = rawName?.trim();
										if (name) {
											const nextShifts = [...shiftSettings.predefinedShifts, name];
											syncShiftSettings(nextShifts, [
												...shiftSettings.shiftSchedules,
												{ name, openTime: "", closeTime: "" },
											]);
										}
									}}
									className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 font-bold text-primary text-xs transition-all hover:bg-primary/20"
									type="button"
								>
									<Plus className="h-3 w-3" /> Tambah Shift
								</button>
							</div>

							<div className={teamShiftsGridClass}>
								{shiftSettings.predefinedShifts.map((shift, index) => {
									const schedule =
										shiftSettings.shiftSchedules.find(
											(item) => item.name === shift
										) ?? {
											name: shift,
											openTime: "",
											closeTime: "",
										};
									return (
										<div
											key={index}
											className="space-y-4 rounded-xllll border border-border bg-muted/30 px-4 py-4"
										>
											<div className="flex items-start justify-between gap-3">
												<div>
													<p className="font-bold text-foreground text-sm">
														{shift}
													</p>
													<p className="text-[11px] text-muted-foreground">
														Pilih jam buka dan tutup shift ini.
													</p>
												</div>
												<button
													onClick={() => {
														const newShifts = [...shiftSettings.predefinedShifts];
														newShifts.splice(index, 1);
														syncShiftSettings(
															newShifts,
															shiftSettings.shiftSchedules.filter(
																(item) => item.name !== shift
															)
														);
													}}
													className="text-muted-foreground hover:text-destructive transition-colors"
													type="button"
												>
													<Trash2 className="h-4 w-4" />
												</button>
											</div>
											<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
												<div className="space-y-1.5">
													<label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
														Jam Buka
													</label>
													<input
														className="w-full rounded-xllll border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
														type="time"
														value={schedule.openTime ?? ""}
														onChange={(e) =>
															setShiftSettings((prev) => ({
																...prev,
																shiftSchedules: buildShiftSchedules(
																	prev.predefinedShifts,
																	prev.shiftSchedules.map((item) =>
																		item.name === shift
																			? { ...item, openTime: e.target.value }
																			: item
																	)
																),
															}))
														}
													/>
												</div>
												<div className="space-y-1.5">
													<label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
														Jam Tutup
													</label>
													<input
														className="w-full rounded-xllll border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
														type="time"
														value={schedule.closeTime ?? ""}
														onChange={(e) =>
															setShiftSettings((prev) => ({
																...prev,
																shiftSchedules: buildShiftSchedules(
																	prev.predefinedShifts,
																	prev.shiftSchedules.map((item) =>
																		item.name === shift
																			? { ...item, closeTime: e.target.value }
																			: item
																	)
																),
															}))
														}
													/>
												</div>
											</div>
										</div>
									);
								})}
								{shiftSettings.predefinedShifts.length === 0 && (
									<div className="col-span-full py-8 text-center border-2 border-dashed border-border rounded-xllll">
										<p className="text-muted-foreground text-sm">
											Belum ada shift yang terdaftar.
										</p>
									</div>
								)}
							</div>
						</div>

						<div className="space-y-4 pt-6 border-t border-border">
							<div className="space-y-1">
								<h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
									Popup Pengingat Tutup Shift
								</h4>
								<p className="text-muted-foreground text-xs">
									Kasir di halaman menu akan mendapat popup beberapa menit sebelum jam tutup.
								</p>
							</div>
							<div className="max-w-xs">
								<div className="relative">
									<input
										className="w-full rounded-xllll bg-muted/50 py-3.5 pl-4 pr-20 font-black text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
										min={1}
										onChange={(e) =>
											setShiftSettings({
												...shiftSettings,
												reminderMinutesBeforeClose: Number(e.target.value),
											})
										}
										type="number"
										value={shiftSettings.reminderMinutesBeforeClose}
									/>
									<span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground text-sm">
										menit
									</span>
								</div>
							</div>
						</div>

						{/* Default Starting Cash */}
						<div className="space-y-4 pt-6 border-t border-border">
							<div className="space-y-1">
								<h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
									Modal Awal Default
								</h4>
								<p className="text-muted-foreground text-xs">
									Jumlah modal awal otomatis yang terisi saat kasir membuka shift baru.
								</p>
							</div>
							<div className="max-w-xs">
								<div className="relative">
									<span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground text-sm">
										Rp
									</span>
									<input
										className="w-full rounded-xllll bg-muted/50 py-3.5 pl-11 pr-4 font-black text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
										onChange={(e) =>
											setShiftSettings({
												...shiftSettings,
												defaultStartingCash: Number(e.target.value),
											})
										}
										type="number"
										value={shiftSettings.defaultStartingCash}
									/>
								</div>
							</div>
						</div>
					</div>
				</section>
			)}

			{/* ── TAB: Pengaturan Absensi & Geofencing ── */}
			{activeTab === "geofencing" && (
				<section className="space-y-6 rounded-xllll border border-border bg-card p-4 md:p-6">
					<div className="flex items-center gap-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-primary/10 text-primary">
							<MapPin className="h-5 w-5" />
						</div>
						<div>
							<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
								Pengaturan Absensi & Geofencing
							</h3>
							<p className="text-muted-foreground text-sm">
								Konfigurasi Lokasi & Radius Kehadiran Tim
							</p>
						</div>
					</div>

					<div className="rounded-xllll border border-amber-200 bg-amber-50 p-4 text-xs text-amber-700 leading-relaxed dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-300">
						<p className="font-bold">Penting:</p>
						<p className="mt-1">
							Sistem absensi akan memvalidasi lokasi GPS staff saat melakukan Absen Masuk/Keluar. 
							Pastikan koordinat di bawah sesuai dengan lokasi fisik kafe Anda.
						</p>
					</div>

					<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
						<div className="space-y-2">
							<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
								Latitude (Garis Lintang)
							</label>
							<Input
								className="h-11 w-full bg-muted/50 font-medium"
								type="number"
								step="any"
								onChange={(e) => setAttendanceLat(Number(e.target.value))}
								placeholder="-6.123456"
								value={attendanceLat}
							/>
						</div>

						<div className="space-y-2">
							<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
								Longitude (Garis Bujur)
							</label>
							<Input
								className="h-11 w-full bg-muted/50 font-medium"
								type="number"
								step="any"
								onChange={(e) => setAttendanceLng(Number(e.target.value))}
								placeholder="106.123456"
								value={attendanceLng}
							/>
						</div>

						<div className="space-y-2 md:col-span-2">
							<label className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
								Radius Toleransi (Meter)
							</label>
							<div className="relative">
								<Input
									className="h-11 w-full bg-muted/50 font-medium"
									type="number"
									onChange={(e) => setAttendanceRadius(Number(e.target.value))}
									placeholder="50"
									value={attendanceRadius}
								/>
								<span className="absolute top-1/2 right-4 -translate-y-1/2 font-bold text-muted-foreground text-sm">
									meter
								</span>
							</div>
							<p className="text-[10px] text-muted-foreground">
								Jarak maksimal staff diperbolehkan absen dari titik koordinat (Rekomendasi: 50-100m).
							</p>
						</div>

						<div className="md:col-span-2 pt-2">
							<Button 
								variant="outline" 
								className="w-full h-11 border-dashed"
								onClick={() => {
									if (navigator.geolocation) {
										toast.loading("Mendapatkan lokasi saat ini...");
										navigator.geolocation.getCurrentPosition(
											(pos) => {
												setAttendanceLat(pos.coords.latitude);
												setAttendanceLng(pos.coords.longitude);
												toast.dismiss();
												toast.success("Lokasi berhasil didapatkan!");
											},
											(err) => {
												toast.dismiss();
												toast.error("Gagal mendapatkan lokasi. Pastikan izin GPS aktif.");
											}
										);
									} else {
										toast.error("Browser tidak mendukung geolokasi.");
									}
								}}
							>
								<MapPin className="mr-2 h-4 w-4" /> Gunakan Lokasi Saya Saat Ini
							</Button>
						</div>
					</div>
				</section>
			)}

			{/* ── TAB: Template Export ── */}
			{activeTab === "template" && (
				<section className="space-y-6 rounded-xllll border border-border bg-card p-4 md:p-6">
					<div className="flex items-center gap-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-xllll bg-primary/10 text-primary">
							<Layers className="h-5 w-5" />
						</div>
						<div>
							<h3 className="font-bold text-base text-foreground tracking-tight md:text-xl">
								Template Export Roster
							</h3>
							<p className="text-muted-foreground text-sm">
								Atur urutan, group, dan warna staff saat export format gambar
							</p>
						</div>
					</div>

					<div className="rounded-xllll border border-blue-200 bg-blue-50 p-4 text-xs text-blue-700 leading-relaxed dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-300">
						Template ini menentukan bagaimana staff dikelompokkan dan diurutkan saat export Excel format gambar / roster matrix. Jika tidak dikonfigurasi, sistem akan mengelompokkan otomatis berdasarkan role.
					</div>

					{/* Existing groups */}
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
								Grup Staff ({rosterTemplate.groups.length})
							</h4>
							<button
								onClick={() => {
									const label = window.prompt("Nama grup (contoh: DJIWA TENTRAM):");
									if (label?.trim()) {
										setRosterTemplate((prev) => ({
											...prev,
											groups: [...prev.groups, { label: label.trim(), roleLabel: "", staff: [] }],
										}));
									}
								}}
								className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 font-bold text-primary text-xs transition-all hover:bg-primary/20"
								type="button"
							>
								<Plus className="h-3 w-3" /> Tambah Grup
							</button>
						</div>

						{rosterTemplate.groups.length === 0 && (
							<div className="col-span-full py-8 text-center border-2 border-dashed border-border rounded-xllll">
								<p className="text-muted-foreground text-sm">
									Belum ada grup. Tambah grup untuk mengatur urutan staff saat export.
								</p>
							</div>
						)}

						<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
							{rosterTemplate.groups.map((group, gi) => (
								<div key={gi} className="space-y-3 rounded-xllll border border-border bg-muted/30 p-4">
									<div className="flex items-start justify-between gap-2">
										<div className="flex-1 space-y-2">
											<input
												className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm font-semibold"
												value={group.label}
												onChange={(e) => {
													const newGroups = [...rosterTemplate.groups];
													newGroups[gi] = { ...newGroups[gi], label: e.target.value };
													setRosterTemplate((prev) => ({ ...prev, groups: newGroups }));
												}}
												placeholder="Nama grup"
											/>
											<input
												className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground"
												value={group.roleLabel ?? ""}
												onChange={(e) => {
													const newGroups = [...rosterTemplate.groups];
													newGroups[gi] = { ...newGroups[gi], roleLabel: e.target.value };
													setRosterTemplate((prev) => ({ ...prev, groups: newGroups }));
												}}
												placeholder="Role label (contoh: BARISTA, CHEF)"
											/>
										</div>
										<button
											onClick={() => {
												const newGroups = rosterTemplate.groups.filter((_, i) => i !== gi);
												setRosterTemplate((prev) => ({ ...prev, groups: newGroups }));
											}}
											className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
											type="button"
										>
											<Trash2 className="h-4 w-4" />
										</button>
									</div>

									{/* Staff in this group */}
									<div className="space-y-1">
										{group.staff.map((member, si) => (
											<div key={si} className="flex items-center gap-2">
												<input
													className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs"
													value={member.displayName || member.rawName}
													onChange={(e) => {
														const newGroups = [...rosterTemplate.groups];
														newGroups[gi] = { ...newGroups[gi] };
														newGroups[gi].staff = [...newGroups[gi].staff];
														newGroups[gi].staff[si] = { ...newGroups[gi].staff[si], displayName: e.target.value };
														setRosterTemplate((prev) => ({ ...prev, groups: newGroups }));
													}}
													placeholder="Nama display"
												/>
												<button
													onClick={() => {
														const newGroups = [...rosterTemplate.groups];
														newGroups[gi] = { ...newGroups[gi] };
														newGroups[gi].staff = newGroups[gi].staff.filter((_, i) => i !== si);
														setRosterTemplate((prev) => ({ ...prev, groups: newGroups }));
													}}
													className="text-muted-foreground hover:text-destructive"
													type="button"
												>
													<X className="h-3 w-3" />
												</button>
											</div>
										))}
									</div>

									<div className="flex gap-2 flex-wrap">
									<button
										onClick={() => {
											setPickerGroupIndex(gi);
											setStaffSearchQuery("");
											setSelectedStaffIds(new Set());
											setShowStaffPicker(true);
										}}
										className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 transition-colors"
										type="button"
									>
										<Users className="h-3 w-3" /> Ambil dari Karyawan
									</button>
								</div>

									{/* Move up/down */}
									<div className="flex gap-1">
										<button
											onClick={() => {
												if (gi === 0) return;
												const newGroups = [...rosterTemplate.groups];
												[newGroups[gi - 1], newGroups[gi]] = [newGroups[gi], newGroups[gi - 1]];
												setRosterTemplate((prev) => ({ ...prev, groups: newGroups }));
											}}
											className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
											disabled={gi === 0}
											type="button"
										>
											↑ Naik
										</button>
										<button
											onClick={() => {
												if (gi === rosterTemplate.groups.length - 1) return;
												const newGroups = [...rosterTemplate.groups];
												[newGroups[gi], newGroups[gi + 1]] = [newGroups[gi + 1], newGroups[gi]];
												setRosterTemplate((prev) => ({ ...prev, groups: newGroups }));
											}}
											className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
											disabled={gi === rosterTemplate.groups.length - 1}
											type="button"
										>
											↓ Turun
										</button>
									</div>

								</div>
							))}
						</div>
					</div>
					{/* ── Staff Picker Modal ── */}
					<Dialog open={showStaffPicker} onOpenChange={setShowStaffPicker}>
						<DialogContent className="sm:max-w-md">
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<h4 className="font-bold text-sm">Pilih Karyawan</h4>
									<DialogClose className="text-muted-foreground hover:text-foreground transition-colors">
										<X className="h-4 w-4" />
									</DialogClose>
								</div>

								<div className="relative">
									<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
									<input
										className="w-full rounded-lg border border-border bg-muted/30 pl-9 pr-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/20"
										placeholder="Cari karyawan..."
										value={staffSearchQuery}
										onChange={(e) => setStaffSearchQuery(e.target.value)}
										autoFocus
									/>
								</div>

								{(() => {
									const filtered = (staffUsers ?? []).filter(
										(u) =>
											u.name.toLowerCase().includes(staffSearchQuery.toLowerCase()) ||
											(u.roleName ?? "").toLowerCase().includes(staffSearchQuery.toLowerCase())
									);

									return (
										<>
											<div className="max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-border">
												{filtered.length === 0 && (
													<p className="py-8 text-center text-xs text-muted-foreground">
														Tidak ada karyawan ditemukan
													</p>
												)}
												{filtered.map((u) => {
													const alreadyInGroup = rosterTemplate.groups[pickerGroupIndex]?.staff.some(
														(s) => s.rawName === u.name
													);
													return (
														<label
															key={u._id}
															className={`flex items-center gap-3 px-3 py-2 text-xs transition-colors cursor-pointer ${
																alreadyInGroup
																	? "bg-muted/50 text-muted-foreground line-through pointer-events-none"
																	: "hover:bg-muted/50"
															}`}
														>
															<input
																type="checkbox"
																className="h-3.5 w-3.5 accent-primary"
																checked={selectedStaffIds.has(u._id)}
																disabled={alreadyInGroup}
																onChange={(e) => {
																	const next = new Set(selectedStaffIds);
																	if (e.target.checked) next.add(u._id);
																	else next.delete(u._id);
																	setSelectedStaffIds(next);
																}}
															/>
															<div className="flex-1 min-w-0">
																<p className="font-medium truncate">{u.name}</p>
																{u.roleName && (
																	<p className="text-[10px] text-muted-foreground truncate">{u.roleName}</p>
																)}
															</div>
														</label>
													);
												})}
											</div>

											<div className="flex justify-end gap-2 pt-1">
												<Button
													variant="outline"
													size="sm"
													className="h-7 text-[10px]"
													onClick={() => setShowStaffPicker(false)}
												>
													Batal
												</Button>
												<Button
													size="sm"
													className="h-7 text-[10px]"
													disabled={selectedStaffIds.size === 0}
													onClick={() => {
														const newGroups = [...rosterTemplate.groups];
														newGroups[pickerGroupIndex] = { ...newGroups[pickerGroupIndex] };
														const existingNames = new Set(
															newGroups[pickerGroupIndex].staff.map((s) => s.rawName)
														);
														for (const u of staffUsers ?? []) {
															if (selectedStaffIds.has(u._id) && !existingNames.has(u.name)) {
																newGroups[pickerGroupIndex].staff = [
																	...newGroups[pickerGroupIndex].staff,
																	{ rawName: u.name, userId: u._id, displayName: u.name },
																];
															}
														}
														setRosterTemplate((prev) => ({ ...prev, groups: newGroups }));
														setShowStaffPicker(false);
													}}
												>
													<Check className="h-3 w-3 mr-1" />
													Tambah {selectedStaffIds.size} staff
												</Button>
											</div>
										</>
									);
								})()}
							</div>
						</DialogContent>
					</Dialog>
				</section>
			)}
		</div>
	);
}

export const Route = createLazyFileRoute("/admin/operational-team/attendance/pengaturan" as any)({
	component: AttendancePengaturanPage,
});
