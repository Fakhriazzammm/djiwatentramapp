/**
 * Generator jadwal otomatis.
 *
 * Aturan:
 * 1. Setiap orang punya jatah libur per minggu (1 atau 2 hari).
 * 2. Hari libur berjejer (satu blok), sehingga hari masuk juga berjejer.
 *    Contoh: masuk Senin–Jumat, libur Sabtu–Minggu. Pola dihitung melingkar
 *    pada pekan (Sabtu-Minggu-Senin juga satu blok) dan diulang tiap pekan.
 * 3. Blok libur dipilih agar jumlah orang yang masuk per hari seimbang.
 * 4. Dalam satu pekan, shift setiap orang tetap (tidak berganti di tengah blok
 *    masuk). Opsi rotasi menggeser shift tiap pekan.
 */

export type GeneratorStaff = {
	id: string;
	name: string;
	roleName?: string;
	/** Jatah libur per pekan: 1 atau 2 hari. */
	daysOff: 1 | 2;
	/** Hari yang tidak boleh libur (0=Senin ... 6=Minggu). */
	noOffDays?: number[];
	/** Hari libur yang diinginkan (blok mulai dari hari ini), bila memungkinkan. */
	preferredOffStart?: number;
	/** Shift tetap; bila kosong, dibagi otomatis. */
	fixedShift?: string;
};

export type GeneratorShift = {
	name: string;
	start: string | null;
	end: string | null;
	/** Jumlah minimal orang yang masuk pada shift ini per hari. */
	minStaff: number;
};

export type GeneratorOptions = {
	/** Tanggal awal. Pola mingguan dihitung dari Senin pada pekan tanggal ini. Format yyyy-MM-dd. */
	startDate: string;
	/** Jumlah pekan penuh sejak Senin pekan startDate. Diabaikan bila endDate diisi. */
	weeks?: number;
	/** Tanggal akhir (inklusif). Bila diisi, baris hanya dibuat untuk startDate..endDate (mis. satu atau beberapa bulan). */
	endDate?: string;
	staff: GeneratorStaff[];
	shifts: GeneratorShift[];
	rotateWeekly?: boolean;
	/** Bila true, libur cenderung jatuh di akhir pekan bila memungkinkan. */
	preferWeekend?: boolean;
};

export type GeneratedRow = {
	userId: string;
	date: string;
	shiftName: string;
	startTime: string | null;
	endTime: string | null;
	status: "scheduled" | "off";
};

export type GeneratorWarning = { date: string; shiftName: string; needed: number; actual: number };

export type GeneratorResult = {
	rows: GeneratedRow[];
	/** Awal blok libur (0=Senin) per orang. */
	offStart: Record<string, number>;
	warnings: GeneratorWarning[];
	/** Jumlah orang masuk per hari dalam satu pekan (Senin..Minggu). */
	workingPerWeekday: number[];
};

export const WEEKDAY_NAMES = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"] as const;

export function pad(n: number): string {
	return String(n).padStart(2, "0");
}

export function formatISODate(d: Date): string {
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(iso: string, days: number): string {
	const [y, m, d] = iso.split("-").map(Number);
	return formatISODate(new Date(Date.UTC(y, m - 1, d + days)));
}

/** 0=Senin ... 6=Minggu */
export function weekdayIndex(iso: string): number {
	const [y, m, d] = iso.split("-").map(Number);
	return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function mondayOf(iso: string): string {
	return addDays(iso, -weekdayIndex(iso));
}

export function isOffDay(offStart: number, daysOff: number, weekday: number): boolean {
	return (weekday - offStart + 7) % 7 < daysOff;
}

export function offDaysOf(offStart: number, daysOff: number): number[] {
	return Array.from({ length: daysOff }, (_, i) => (offStart + i) % 7);
}

/** Pilih awal blok libur tiap orang agar jumlah orang masuk per hari seimbang. */
export function planOffBlocks(staff: GeneratorStaff[], preferWeekend = true): Record<string, number> {
	const offCount = Array<number>(7).fill(0);
	const result: Record<string, number> = {};
	const order = [...staff].sort((a, b) => b.daysOff - a.daysOff || (a.preferredOffStart === undefined ? 1 : 0) - (b.preferredOffStart === undefined ? 1 : 0));
	// Orang dengan permintaan eksplisit diproses lebih dulu agar permintaannya terpenuhi.
	order.sort((a, b) => Number(b.preferredOffStart !== undefined) - Number(a.preferredOffStart !== undefined));

	for (const person of order) {
		let best = -1;
		let bestScore = Number.POSITIVE_INFINITY;
		for (let start = 0; start < 7; start += 1) {
			const days = offDaysOf(start, person.daysOff);
			if (person.noOffDays?.some((d) => days.includes(d))) continue;
			const peak = Math.max(...days.map((d) => offCount[d] + 1));
			const squares = days.reduce((sum, d) => sum + (offCount[d] + 1) ** 2, 0);
			let score = peak * 1000 + squares;
			if (person.preferredOffStart === start) score -= 100000;
			if (preferWeekend) {
				const weekendHits = days.filter((d) => d >= 5).length;
				score -= weekendHits * 40;
				// Hindari blok yang membelah akhir pekan di tengah (Min-Sen) bila ada pilihan lain.
				if (person.daysOff === 2 && start === 6) score += 25;
			}
			// Tie-break stabil: blok yang dimulai lebih awal.
			score += start * 0.01;
			if (score < bestScore) {
				bestScore = score;
				best = start;
			}
		}
		if (best < 0) best = 5; // semua hari dilarang libur: pakai akhir pekan
		result[person.id] = best;
		for (const d of offDaysOf(best, person.daysOff)) offCount[d] += 1;
	}
	return result;
}

export function generateSchedule(options: GeneratorOptions): GeneratorResult {
	const { staff, shifts } = options;
	const start = mondayOf(options.startDate);
	const rangeStart = options.endDate ? options.startDate : start;
	const rangeEnd = options.endDate ?? addDays(start, (options.weeks ?? 1) * 7 - 1);
	const weeks = options.endDate ? Math.floor((Date.parse(`${rangeEnd}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 / 7) + 1 : (options.weeks ?? 1);
	const offStart = planOffBlocks(staff, options.preferWeekend ?? true);
	const rows: GeneratedRow[] = [];
	const warnings: GeneratorWarning[] = [];

	const workingPerWeekday = Array<number>(7).fill(0);
	for (const person of staff) {
		for (let wd = 0; wd < 7; wd += 1) {
			if (!isOffDay(offStart[person.id], person.daysOff, wd)) workingPerWeekday[wd] += 1;
		}
	}

	const shiftByName = new Map(shifts.map((s) => [s.name, s]));
	const orderedShifts = shifts.length > 0 ? shifts : [{ name: "General", start: null, end: null, minStaff: 0 }];

	for (let week = 0; week < weeks; week += 1) {
		const weekStart = addDays(start, week * 7);
		// Penugasan shift per orang untuk pekan ini.
		const assigned: Record<string, string> = {};
		const load: number[][] = orderedShifts.map(() => Array<number>(7).fill(0));

		const people = [...staff].sort((a, b) => Number(Boolean(b.fixedShift)) - Number(Boolean(a.fixedShift)));
		people.forEach((person, index) => {
			if (person.fixedShift && shiftByName.has(person.fixedShift)) {
				const si = orderedShifts.findIndex((s) => s.name === person.fixedShift);
				assigned[person.id] = person.fixedShift;
				for (let wd = 0; wd < 7; wd += 1) if (!isOffDay(offStart[person.id], person.daysOff, wd)) load[si][wd] += 1;
				return;
			}
			let bestIdx = 0;
			let bestScore = Number.NEGATIVE_INFINITY;
			orderedShifts.forEach((shift, si) => {
				let deficitGain = 0;
				let crowd = 0;
				for (let wd = 0; wd < 7; wd += 1) {
					if (isOffDay(offStart[person.id], person.daysOff, wd)) continue;
					const lack = shift.minStaff - load[si][wd];
					if (lack > 0) deficitGain += lack;
					crowd += load[si][wd];
				}
				let score = deficitGain * 10 - crowd;
				if (options.rotateWeekly) {
					// Geser preferensi tiap pekan agar shift bergilir.
					const rot = (index + week) % orderedShifts.length;
					if (rot === si) score += 3;
				}
				if (score > bestScore) {
					bestScore = score;
					bestIdx = si;
				}
			});
			assigned[person.id] = orderedShifts[bestIdx].name;
			for (let wd = 0; wd < 7; wd += 1) if (!isOffDay(offStart[person.id], person.daysOff, wd)) load[bestIdx][wd] += 1;
		});

		for (let wd = 0; wd < 7; wd += 1) {
			const date = addDays(weekStart, wd);
			if (date < rangeStart || date > rangeEnd) continue;
			for (const person of staff) {
				if (isOffDay(offStart[person.id], person.daysOff, wd)) {
					rows.push({ userId: person.id, date, shiftName: "OFF", startTime: null, endTime: null, status: "off" });
				} else {
					const shift = orderedShifts.find((s) => s.name === assigned[person.id]) ?? orderedShifts[0];
					rows.push({ userId: person.id, date, shiftName: shift.name, startTime: shift.start, endTime: shift.end, status: "scheduled" });
				}
			}
			orderedShifts.forEach((shift, si) => {
				if (shift.minStaff > 0 && load[si][wd] < shift.minStaff) {
					warnings.push({ date, shiftName: shift.name, needed: shift.minStaff, actual: load[si][wd] });
				}
			});
		}
	}

	return { rows, offStart, warnings, workingPerWeekday };
}

/** Memeriksa aturan berjejer: blok libur satu, blok masuk satu (melingkar pada pekan). */
export function validateConsecutive(rows: GeneratedRow[], userId: string): { ok: boolean; offDays: number[]; message?: string } {
	const mine = rows.filter((r) => r.userId === userId).sort((a, b) => a.date.localeCompare(b.date));
	if (mine.length === 0) return { ok: true, offDays: [] };
	// Gunakan pekan penuh pertama (rentang bulan bisa dimulai di tengah pekan).
	const byWeek = new Map<string, typeof mine>();
	for (const row of mine) byWeek.set(mondayOf(row.date), [...(byWeek.get(mondayOf(row.date)) ?? []), row]);
	const full = [...byWeek.values()].find((rows) => rows.length === 7) ?? [...byWeek.values()][0];
	const flags = Array<boolean | null>(7).fill(null);
	for (const row of full) flags[weekdayIndex(row.date)] = row.status === "off";
	const offDays = flags.flatMap((f, i) => (f ? [i] : []));
	if (offDays.length === 0) return { ok: true, offDays };
	// Hitung perpindahan melingkar; blok tunggal berarti tepat 2 perpindahan (atau 0).
	let transitions = 0;
	for (let i = 0; i < 7; i += 1) if (flags[i] !== null && flags[(i + 1) % 7] !== null && flags[i] !== flags[(i + 1) % 7]) transitions += 1;
	const ok = transitions <= 2;
	return { ok, offDays, message: ok ? undefined : "Hari libur terpisah, tidak berjejer." };
}

/**
 * Generator per jabatan: tiap jabatan dijadwalkan sendiri-sendiri, jadi libur dan
 * shift diseimbangkan di dalam jabatan itu (mis. barista tidak libur serentak).
 * `shiftsFor` memberi daftar shift beserta minimal orang untuk jabatan tertentu.
 */
export function generateScheduleByRole(
	base: Omit<GeneratorOptions, "staff" | "shifts">,
	staff: GeneratorStaff[],
	shiftsFor: (roleName: string) => GeneratorShift[],
): GeneratorResult {
	const roles = [...new Set(staff.map((s) => s.roleName || "Tanpa jabatan"))];
	const merged: GeneratorResult = { rows: [], offStart: {}, warnings: [], workingPerWeekday: Array<number>(7).fill(0) };
	for (const role of roles) {
		const members = staff.filter((s) => (s.roleName || "Tanpa jabatan") === role);
		const shifts = shiftsFor(role);
		if (members.length === 0 || shifts.length === 0) continue;
		const part = generateSchedule({ ...base, staff: members, shifts });
		merged.rows.push(...part.rows);
		Object.assign(merged.offStart, part.offStart);
		merged.warnings.push(...part.warnings.map((w) => ({ ...w, shiftName: `${role} · ${w.shiftName}` })));
		part.workingPerWeekday.forEach((n, i) => { merged.workingPerWeekday[i] += n; });
	}
	return merged;
}
