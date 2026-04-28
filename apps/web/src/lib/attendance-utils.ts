export type AttendanceLogLike = {
	_id?: string;
	userId?: string | null;
	type?: string | null;
	timestamp?: number | string | null;
	[key: string]: unknown;
};

type NormalizedAttendanceLog<T extends AttendanceLogLike> = T & { timestamp: number };

export type ShiftScheduleLike = {
	name?: string;
	openTime?: string | null;
	closeTime?: string | null;
	[key: string]: unknown;
};

export type AttendanceSession<T extends AttendanceLogLike = AttendanceLogLike> = {
	checkIn: T;
	checkOut: T | null;
	startTime: number;
	endTime: number | null;
	durationMs: number;
	isOpen: boolean;
};

function toFiniteNumber(value: unknown, fallback = 0) {
	const n = Number(value ?? fallback);
	return Number.isFinite(n) ? n : fallback;
}

function normalizeAttendanceLog<T extends AttendanceLogLike>(log: T): NormalizedAttendanceLog<T> | null {
	if (log.timestamp === null || log.timestamp === undefined) return null;
	if (typeof log.timestamp === "string" && log.timestamp.trim() === "") return null;
	const timestamp = Number(log.timestamp);
	return Number.isFinite(timestamp) ? ({ ...log, timestamp } as NormalizedAttendanceLog<T>) : null;
}

function toMinutes(time?: string | null) {
	const value = String(time ?? "").trim();
	const match = /^(\d{2}):(\d{2})$/.exec(value);
	if (!match) return null;
	const h = Number(match[1]);
	const m = Number(match[2]);
	if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
	if (h < 0 || h > 23 || m < 0 || m > 59) return null;
	return h * 60 + m;
}

export function euclideanDistance(left: readonly number[], right: readonly number[]) {
	if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || left.length === 0) {
		return Number.POSITIVE_INFINITY;
	}
	let sum = 0;
	for (let i = 0; i < left.length; i++) {
		const delta = Number(left[i]) - Number(right[i]);
		if (!Number.isFinite(delta)) return Number.POSITIVE_INFINITY;
		sum += delta * delta;
	}
	return Math.sqrt(sum);
}

export function isFaceDescriptorMatch(
	candidate: readonly number[] | undefined | null,
	target: readonly number[] | undefined | null,
	threshold = 0.6
) {
	if (!candidate || !target) return false;
	return euclideanDistance(candidate, target) < threshold;
}

export function getActiveShiftSchedule<T extends ShiftScheduleLike>(
	schedules: readonly T[] | undefined | null,
	date = new Date()
): T | null {
	if (!Array.isArray(schedules) || schedules.length === 0) return null;
	const currentMinutes = date.getHours() * 60 + date.getMinutes();

	for (const schedule of schedules) {
		const openMin = toMinutes(schedule.openTime);
		const closeMin = toMinutes(schedule.closeTime);
		if (openMin === null || closeMin === null) continue;

		if (openMin <= closeMin) {
			if (currentMinutes >= openMin && currentMinutes < closeMin) return schedule;
		} else if (currentMinutes >= openMin || currentMinutes < closeMin) {
			return schedule;
		}
	}

	return null;
}

export function getUpcomingShiftSchedule<T extends ShiftScheduleLike>(
	schedules: readonly T[] | undefined | null,
	date = new Date()
): (T & { upcoming: true }) | null {
	if (!Array.isArray(schedules) || schedules.length === 0) return null;
	const currentMinutes = date.getHours() * 60 + date.getMinutes();
	let nearest: T | null = null;
	let minDiff = Number.POSITIVE_INFINITY;

	for (const schedule of schedules) {
		const openMin = toMinutes(schedule.openTime);
		const closeMin = toMinutes(schedule.closeTime);
		if (openMin === null) continue;
		if (closeMin === null || openMin === closeMin) continue;
		let diff = openMin - currentMinutes;
		if (diff < 0) diff += 24 * 60;
		if (diff < minDiff) {
			minDiff = diff;
			nearest = schedule;
		}
	}

	return nearest ? ({ ...nearest, upcoming: true } as T & { upcoming: true }) : null;
}

export type DetectedShiftOptions = {
	includeUpcoming?: boolean;
};

export function getDetectedShiftSchedule<T extends ShiftScheduleLike>(
	schedules: readonly T[] | undefined | null,
	date = new Date(),
	options: DetectedShiftOptions = {}
): T | (T & { upcoming: true }) | null {
	const active = getActiveShiftSchedule(schedules, date);
	if (active) return active;
	return options.includeUpcoming === false ? null : getUpcomingShiftSchedule(schedules, date);
}

export function buildAttendanceSessions<T extends AttendanceLogLike>(
	logs: readonly T[] | undefined | null,
	now = Date.now()
): AttendanceSession<NormalizedAttendanceLog<T>>[] {
	const sorted = [...(logs ?? [])]
		.filter((log) => log?.type === "check_in" || log?.type === "check_out")
		.map(normalizeAttendanceLog)
		.filter((log): log is NormalizedAttendanceLog<T> => Boolean(log))
		.sort((left, right) => toFiniteNumber(left.timestamp) - toFiniteNumber(right.timestamp));

	const sessions: AttendanceSession<NormalizedAttendanceLog<T>>[] = [];
	let openCheckIn: NormalizedAttendanceLog<T> | null = null;

	for (const log of sorted) {
		if (log.type === "check_in") {
			if (openCheckIn) {
				const startTime = toFiniteNumber(openCheckIn.timestamp);
				const endTime = toFiniteNumber(log.timestamp, startTime);
				sessions.push({
					checkIn: openCheckIn,
					checkOut: null,
					startTime,
					endTime,
					durationMs: Math.max(0, endTime - startTime),
					isOpen: false,
				});
			}
			openCheckIn = log;
			continue;
		}

		if (log.type === "check_out" && openCheckIn) {
			const startTime = toFiniteNumber(openCheckIn.timestamp);
			const endTime = toFiniteNumber(log.timestamp);
			sessions.push({
				checkIn: openCheckIn,
				checkOut: log,
				startTime,
				endTime,
				durationMs: Math.max(0, endTime - startTime),
				isOpen: false,
			});
			openCheckIn = null;
		}
	}

	if (openCheckIn) {
		const startTime = toFiniteNumber(openCheckIn.timestamp);
		sessions.push({
			checkIn: openCheckIn,
			checkOut: null,
			startTime,
			endTime: null,
			durationMs: Math.max(0, now - startTime),
			isOpen: true,
		});
	}

	return sessions;
}

export function getLatestAttendanceState<T extends AttendanceLogLike>(
	logs: readonly T[] | undefined | null
): NormalizedAttendanceLog<T> | null {
	return [...(logs ?? [])]
		.filter((log) => log?.type === "check_in" || log?.type === "check_out")
		.map(normalizeAttendanceLog)
		.filter((log): log is NormalizedAttendanceLog<T> => Boolean(log))
		.sort((left, right) => toFiniteNumber(right.timestamp) - toFiniteNumber(left.timestamp))[0] ?? null;
}

export function isCurrentlyWorking(logs: readonly AttendanceLogLike[] | undefined | null) {
	return getLatestAttendanceState(logs)?.type === "check_in";
}
