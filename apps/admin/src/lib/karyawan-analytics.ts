import { DAY_MS, WIB_OFFSET_MS } from "./wib-utils";

/** Analisis kehadiran karyawan dari log check-in/out dan jadwal. Semua waktu dalam WIB. */

export type AttendanceLog = { userId: string; type: string; timestamp: number; userName?: string | null; location?: { lat?: number; lng?: number } | null; penalty?: number | null };
export type ScheduleLite = { userId: string; date: string; shiftName: string; startTime: string | null; endTime?: string | null; status?: string | null };
export type Geofence = { lat: number; lng: number; radius: number };

export type Session = {
	userId: string;
	date: string;
	inTs: number;
	outTs: number | null;
	lateMin: number;
	closed: boolean;
	/** Jam kerja yang dikreditkan, disesuaikan dengan jadwal shift. */
	hours: number;
	overtimeHours: number;
	shiftName: string | null;
	/** Check-out tidak ada; jam dihitung sampai akhir shift di jadwal. */
	estimated: boolean;
	distanceM: number | null;
	outsideRadius: boolean;
	penalty: number;
};

export type UserStat = { userId: string; days: number; hours: number; overtimeHours: number; late: number; lateMinutes: number; sessions: number; unclosed: number; onTimePct: number; outside: number; penalty: number };

export type AttendanceAnalysis = {
	sessions: Session[];
	presence: number;
	lateCount: number;
	lateAvgMin: number;
	unclosed: number;
	outside: number;
	byUser: Record<string, UserStat>;
	labels: string[];
	seriesPresent: number[];
	seriesLate: number[];
	/** Senin..Minggu x slot jam masuk */
	heat: number[][];
	heatCols: string[];
	lateByWeekday: number[];
	workingNow: string[];
	onTimePct: number;
};

export const HEAT_COLS = ["<07", "07", "08", "09-10", "11-13", "14+"] as const;
export const WEEKDAY_SHORT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function wibParts(ts: number) {
	const d = new Date(ts + WIB_OFFSET_MS);
	const isoDow = ((d.getUTCDay() + 6) % 7); // 0=Senin
	const pad = (n: number) => String(n).padStart(2, "0");
	return {
		date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
		minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
		hour: d.getUTCHours(),
		weekday: isoDow,
		month: d.getUTCMonth(),
		year: d.getUTCFullYear(),
		day: d.getUTCDate(),
	};
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
	const R = 6_371_000;
	const rad = (d: number) => (d * Math.PI) / 180;
	const dLat = rad(b.lat - a.lat);
	const dLng = rad(b.lng - a.lng);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

function parseMinutes(value: string | null | undefined): number | null {
	if (!value) return null;
	const match = /^(\d{1,2}):(\d{2})/.exec(value);
	return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function heatSlot(hour: number): number {
	if (hour < 7) return 0;
	if (hour === 7) return 1;
	if (hour === 8) return 2;
	if (hour <= 10) return 3;
	if (hour <= 13) return 4;
	return 5;
}

export function analyzeAttendance(
	logs: AttendanceLog[],
	schedules: ScheduleLite[],
	options: { start: number; end: number; bucket: "hour" | "day" | "month"; now?: number; toleranceMin?: number; maxSessionHours?: number; geofence?: Geofence | null },
): AttendanceAnalysis {
	const tolerance = options.toleranceMin ?? 10;
	const maxMs = (options.maxSessionHours ?? 16) * 3_600_000;
	const now = options.now ?? Date.now();
	const schedByKey = new Map<string, ScheduleLite[]>();
	for (const s of schedules) {
		if (s.status === "off" || s.status === "cancelled") continue;
		const key = `${s.userId}|${s.date}`;
		schedByKey.set(key, [...(schedByKey.get(key) ?? []), s]);
	}

	const byUserLogs = new Map<string, AttendanceLog[]>();
	for (const log of logs) {
		if (log.type !== "check_in" && log.type !== "check_out") continue;
		byUserLogs.set(log.userId, [...(byUserLogs.get(log.userId) ?? []), log]);
	}

	const sessions: Session[] = [];
	const workingNow: string[] = [];
	for (const [userId, list] of byUserLogs) {
		list.sort((a, b) => a.timestamp - b.timestamp);
		let open: AttendanceLog | null = null;
		const close = (inLog: AttendanceLog, outLog: AttendanceLog | null) => {
			const inP = wibParts(inLog.timestamp);
			const candidates = schedByKey.get(`${userId}|${inP.date}`) ?? [];
			let lateMin = 0;
			let shiftName: string | null = null;
			let chosen: ScheduleLite | null = null;
			let bestGap = Number.POSITIVE_INFINITY;
			for (const sch of candidates) {
				const startMin = parseMinutes(sch.startTime);
				if (startMin === null) continue;
				const gap = Math.abs(inP.minutes - startMin);
				if (gap < bestGap) {
					bestGap = gap;
					chosen = sch;
					shiftName = sch.shiftName;
					lateMin = Math.max(0, inP.minutes - startMin);
				}
			}
			if (lateMin <= tolerance) lateMin = 0;
			// Jam kerja mengikuti jadwal: mulai dihitung dari jam shift (bila masuk lebih awal),
			// berakhir di check-out; tanpa check-out dihitung sampai akhir shift.
			const dayStart = inLog.timestamp - inP.minutes * 60_000 - (inLog.timestamp % 60_000);
			const startMin = chosen ? parseMinutes(chosen.startTime) : null;
			const endMinRaw = chosen ? parseMinutes(chosen.endTime) : null;
			const shiftStartTs = startMin === null ? null : dayStart + startMin * 60_000;
			const shiftEndTs = endMinRaw === null || startMin === null ? null : dayStart + (endMinRaw <= startMin ? endMinRaw + 1440 : endMinRaw) * 60_000;
			const shiftLenH = shiftStartTs !== null && shiftEndTs !== null ? (shiftEndTs - shiftStartTs) / 3_600_000 : null;
			const rawDuration = outLog ? outLog.timestamp - inLog.timestamp : null;
			let closed = rawDuration !== null && rawDuration >= 0 && rawDuration <= maxMs;
			if (closed && shiftLenH !== null && rawDuration !== null && rawDuration / 3_600_000 > shiftLenH + 4) closed = false; // jauh melebihi shift: kemungkinan lupa check-out
			let outEff: number | null = closed && outLog ? outLog.timestamp : null;
			let estimated = false;
			if (outEff === null && shiftEndTs !== null && shiftEndTs > inLog.timestamp && shiftEndTs <= now) {
				outEff = shiftEndTs;
				estimated = true;
			}
			const creditFrom = shiftStartTs !== null ? Math.max(inLog.timestamp, shiftStartTs) : inLog.timestamp;
			const hours = outEff !== null ? Math.max(0, (outEff - creditFrom) / 3_600_000) : 0;
			const overtimeHours = closed && outLog && shiftEndTs !== null ? Math.max(0, (outLog.timestamp - shiftEndTs) / 3_600_000) : 0;
			let distanceM: number | null = null;
			let outsideRadius = false;
			const loc = inLog.location;
			if (options.geofence && loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
				distanceM = Math.round(distanceMeters(options.geofence, { lat: loc.lat, lng: loc.lng }));
				outsideRadius = distanceM > options.geofence.radius;
			}
			sessions.push({ userId, date: inP.date, inTs: inLog.timestamp, outTs: outLog?.timestamp ?? null, lateMin, closed, hours, overtimeHours, shiftName, estimated, distanceM, outsideRadius, penalty: Number(inLog.penalty ?? 0) || 0 });
		};
		for (const log of list) {
			if (log.type === "check_in") {
				if (open) close(open, null);
				open = log;
			} else if (open) {
				close(open, log);
				open = null;
			}
		}
		if (open) {
			close(open, null);
			if (now - open.timestamp <= maxMs) workingNow.push(userId);
		}
	}

	const inRange = sessions.filter((s) => s.inTs >= options.start && s.inTs < options.end);
	const presenceKeys = new Set(inRange.map((s) => `${s.userId}|${s.date}`));
	const lateSessions = inRange.filter((s) => s.lateMin > 0);
	const unclosedSessions = inRange.filter((s) => !s.closed && now - s.inTs > maxMs);

	const byUser: Record<string, UserStat> = {};
	for (const s of inRange) {
		const stat = (byUser[s.userId] ??= { userId: s.userId, days: 0, hours: 0, overtimeHours: 0, late: 0, lateMinutes: 0, sessions: 0, unclosed: 0, onTimePct: 100, outside: 0, penalty: 0 });
		stat.sessions += 1;
		stat.hours += s.hours;
		stat.overtimeHours += s.overtimeHours;
		stat.penalty += s.penalty;
		if (s.outsideRadius) stat.outside += 1;
		if (s.lateMin > 0) {
			stat.late += 1;
			stat.lateMinutes += s.lateMin;
		}
		if (!s.closed && now - s.inTs > maxMs) stat.unclosed += 1;
	}
	for (const stat of Object.values(byUser)) {
		stat.days = new Set(inRange.filter((s) => s.userId === stat.userId).map((s) => s.date)).size;
		stat.onTimePct = stat.sessions ? Math.round(((stat.sessions - stat.late) / stat.sessions) * 100) : 100;
	}

	// Seri tren
	const labels: string[] = [];
	const seriesPresent: number[] = [];
	const seriesLate: number[] = [];
	const bucketIndex = new Map<string, number>();
	const push = (key: string, label: string) => {
		bucketIndex.set(key, labels.length);
		labels.push(label);
		seriesPresent.push(0);
		seriesLate.push(0);
	};
	const pad = (n: number) => String(n).padStart(2, "0");
	if (options.bucket === "hour") {
		for (let h = 6; h <= 22; h += 2) push(String(h), pad(h));
	} else if (options.bucket === "day") {
		const first = options.start;
		const last = Math.min(options.end, now + DAY_MS);
		for (let t = first; t < last; t += DAY_MS) {
			const p = wibParts(t);
			push(p.date, `${pad(p.day)}/${pad(p.month + 1)}`);
		}
	} else {
		const firstLog = inRange.length ? Math.min(...inRange.map((s) => s.inTs)) : now;
		const start = Math.max(options.start, firstLog);
		const s = wibParts(start);
		const e = wibParts(Math.min(options.end - 1, now));
		let y = s.year;
		let m = s.month;
		while (y < e.year || (y === e.year && m <= e.month)) {
			push(`${y}-${m}`, MONTH_SHORT[m].toUpperCase());
			m += 1;
			if (m > 11) {
				m = 0;
				y += 1;
			}
		}
	}
	const heat = Array.from({ length: 7 }, () => Array<number>(HEAT_COLS.length).fill(0));
	const lateByWeekday = Array<number>(7).fill(0);
	for (const s of inRange) {
		const p = wibParts(s.inTs);
		const key = options.bucket === "hour" ? String(Math.min(22, Math.max(6, p.hour - (p.hour % 2)))) : options.bucket === "day" ? p.date : `${p.year}-${p.month}`;
		const idx = bucketIndex.get(key);
		if (idx !== undefined) {
			seriesPresent[idx] += 1;
			if (s.lateMin > 0) seriesLate[idx] += 1;
		}
		heat[p.weekday][heatSlot(p.hour)] += 1;
		if (s.lateMin > 0) lateByWeekday[p.weekday] += 1;
	}

	return {
		sessions: inRange,
		presence: presenceKeys.size,
		lateCount: lateSessions.length,
		lateAvgMin: lateSessions.length ? Math.round(lateSessions.reduce((a, s) => a + s.lateMin, 0) / lateSessions.length) : 0,
		unclosed: unclosedSessions.length,
		outside: inRange.filter((s) => s.outsideRadius).length,
		byUser,
		labels,
		seriesPresent,
		seriesLate,
		heat,
		heatCols: [...HEAT_COLS],
		lateByWeekday,
		workingNow,
		onTimePct: inRange.length ? Math.round(((inRange.length - lateSessions.length) / inRange.length) * 100) : 100,
	};
}

/** Kelengkapan data profil karyawan (0-100) dari field direktori. */
export function profileCompleteness(row: { raw?: Record<string, unknown> | null; photoUrl?: string | null }): { percent: number; missing: string[] } {
	const raw = (row.raw ?? {}) as Record<string, unknown>;
	const checks: [string, boolean][] = [
		["No HP", Boolean(raw.phone)],
		["Nomor identitas", Boolean(raw.identityNumber)],
		["Tanggal lahir", Boolean(raw.birthDate)],
		["Alamat", Boolean(raw.address)],
		["Tipe kerja", Boolean(raw.employmentType)],
		["Tanggal mulai", Boolean(raw.startDate)],
		["Gaji bulanan", Number(raw.monthlySalary ?? 0) > 0],
		["Kontak darurat", Boolean(raw.emergencyContactPhone)],
		["Kontrak PDF", Array.isArray(raw.contracts) && (raw.contracts as { pdfUrl?: string | null }[]).some((c) => Boolean(c.pdfUrl))],
	];
	const done = checks.filter(([, ok]) => ok).length;
	return { percent: Math.round((done / checks.length) * 100), missing: checks.filter(([, ok]) => !ok).map(([label]) => label) };
}

/** Jumlah bulan sejak tanggal (untuk masa kerja). */
export function monthsSince(date: string | null | undefined, now = Date.now()): number | null {
	if (!date) return null;
	const t = new Date(date).getTime();
	if (Number.isNaN(t)) return null;
	return Math.max(0, Math.round(((now - t) / DAY_MS / 30.44) * 10) / 10);
}
