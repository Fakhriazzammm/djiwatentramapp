import { useEffect, useMemo, useState } from "react";
import { analyzeAttendance } from "@/lib/karyawan-analytics";
import { createClient } from "@/lib/client";
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";
import type { UseSupabaseLiveValueOptions } from "@/hooks/use-supabase-live-value";

function safeNum(value: unknown) {
	const n = Number(value ?? 0);
	return Number.isFinite(n) ? n : 0;
}

const REALTIME_TABLES = ["documents", "yumi_users", "attendance_schedules", "attendance_logs"];

function useSupabaseValue<T>(
	key: string,
	load: () => Promise<T | null>,
	deps: readonly unknown[],
	options?: UseSupabaseLiveValueOptions
) {
	return useSupabaseLiveValue(key, load, deps, { tables: REALTIME_TABLES, ...options });
}

async function fetchPublicUsers() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_users_public")
		.select("*")
		.eq("isActive", true)
		.order("name", { ascending: true });

	if (error) throw error;

	return (data ?? []).map((row: any) => ({
		_id: row._id,
		name: row.name,
		slug: row.slug || String(row.username || "").split("@")[0] || "",
		username: row.username || "",
		initial: row.initial || String(row.name || "").charAt(0).toUpperCase(),
		hasFace: Boolean(row.hasFace),
		roleId: row.roleId ?? null,
		roleName: row.roleName ?? "Team",
		isActive: row.isActive !== false,
		photoUrl: row.photoUrl ?? null,
		raw: (row as any).raw ?? null,
	}));
}

async function fetchCurrentlyInStore() {
	const supabase = createClient();
	const { data, error } = await supabase.rpc("get_currently_in_store");

	if (error) throw error;

	return (data ?? []).map((row: any) => ({
		_id: row.user_id,
		name: row.user_name,
		roleId: row.role_id,
		checkInTime: Number(row.check_in_time ?? 0),
	}));
}

async function fetchUserBySlug(slug: string) {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_users_public")
		.select("*")
		.eq("slug", slug)
		.eq("isActive", true)
		.maybeSingle();

	if (error) throw error;
	if (!data) return null;

	return {
		_id: data._id,
		name: data.name,
		slug: data.slug,
		roleName: data.roleName || "Team",
		roleId: data.roleId ?? null,
		hasFace: Boolean(data.hasFace),
		photoUrl: (data as any).photoUrl ?? null,
		raw: (data as any).raw ?? null,
	};
}

async function fetchStaffLogs(args: { userId: string; month: number; year: number }) {
	const startOfMonth = new Date(args.year, args.month - 1, 1).getTime();
	const endOfMonth = new Date(args.year, args.month, 1).getTime();

	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_attendance_logs")
		.select("*")
		.eq("userId", args.userId)
		.gte("timestamp", startOfMonth)
		.lt("timestamp", endOfMonth)
		.order("timestamp", { ascending: false });

	if (error) throw error;
	return data ?? [];
}

async function fetchStaffStats(args: { userId: string; month: number; year: number }) {
	const logs = await fetchStaffLogs(args);
	const asc = [...logs].sort(
		(left: any, right: any) =>
			Number(left.timestamp ?? 0) - Number(right.timestamp ?? 0)
	);

	// Calculate month boundaries for cross-month shift handling
	const monthStart = new Date(args.year, args.month - 1, 1).getTime();
	const nextY = args.month === 12 ? args.year + 1 : args.year;
	const nextM = args.month === 12 ? 1 : args.month + 1;
	const monthEnd = new Date(`${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+07:00`).getTime();

	const uniqueDays = new Set<string>();
	let totalMs = 0;
	let sessions = 0;

	for (let i = 0; i < asc.length; i++) {
		const entry = asc[i] as any;

		// Bug #8: Only count check_in timestamps for daysWorked
		// (overnight shifts: check_in 22:00 Mon + check_out 02:00 Tue = 1 hari kerja)
		if (entry.type === "check_in") {
			const dateStr = new Date(Number(entry.timestamp ?? 0)).toDateString();
			uniqueDays.add(dateStr);
		}

		if (entry.type === "check_in") {
			sessions++;
			const checkInTime = Number(entry.timestamp ?? 0);
			if (i + 1 < asc.length) {
				const next = asc[i + 1] as any;
				if (next.type === "check_out") {
					totalMs += Number(next.timestamp ?? 0) - checkInTime;
					i += 1;
				} else {
					// Bug #10: Next entry is not check_out (e.g., another check_in or
					// check_out is in next month) — count hours to end of month
					totalMs += Math.max(0, monthEnd - checkInTime);
				}
			} else {
				// Last entry in month is a check_in — count hours to end of month
				totalMs += Math.max(0, monthEnd - checkInTime);
			}
		}
	}

	const totalHours = Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10;

	// Bug #9: Dynamic working days based on actual calendar days in the month
	const daysInMonth = new Date(args.year, args.month, 0).getDate();
	const attendanceRate = Math.min(100, Math.round((uniqueDays.size / daysInMonth) * 100));

	return {
		totalHours,
		attendanceRate,
		daysWorked: uniqueDays.size,
		sessionCount: sessions,
	};
}

async function fetchStaffStatsToday(userId: string) {
	const now = new Date();
	const startOfDay = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate()
	).getTime();
	const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_attendance_logs")
		.select("*")
		.eq("userId", userId)
		.gte("timestamp", startOfDay)
		.lt("timestamp", endOfDay)
		.order("timestamp", { ascending: true });

	if (error) throw error;
	const entries = data ?? [];

	let totalMs = 0;
	let lastCheckIn: number | null = null;

	for (const entry of entries as any[]) {
		if (entry.type === "check_in") {
			lastCheckIn = Number(entry.timestamp ?? 0);
		} else if (entry.type === "check_out" && lastCheckIn) {
			totalMs += Number(entry.timestamp ?? 0) - lastCheckIn;
			lastCheckIn = null;
		}
	}

	if (lastCheckIn) {
		totalMs += Date.now() - lastCheckIn;
	}

	const totalHours = Math.floor(totalMs / (1000 * 60 * 60));
	const totalMinutes = Math.floor((totalMs / (1000 * 60)) % 60);

	return {
		totalHours,
		totalMinutes,
		totalMs,
		isWorking: Boolean(lastCheckIn),
		lastCheckIn,
	};
}

async function fetchAdminLogs(limit = 500, startDate?: string, endDate?: string) {
	const supabase = createClient();
	let query = supabase
		.from("pos_attendance_logs")
		.select("*")
		.order("timestamp", { ascending: false })
		.limit(limit);

	if (startDate) {
		const startTs = new Date(startDate).getTime();
		query = query.gte("timestamp", startTs);
	}
	if (endDate) {
		const endTs = new Date(endDate + "T23:59:59").getTime();
		query = query.lte("timestamp", endTs);
	}

	const { data, error } = await query;
	if (error) throw error;
	return data ?? [];
}

export function useHybridAdminAttendanceLogs(limit = 500, month?: number, year?: number) {
	const now = new Date();
	const m = month ?? now.getMonth() + 1;
	const y = year ?? now.getFullYear();
	const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
	const endDate = new Date(y, m, 0).toISOString().split("T")[0];

	const supabaseData = useSupabaseValue(
		`attendance-admin-logs:${m}:${y}:${limit}`,
		() => fetchAdminLogs(limit, startDate, endDate),
		[limit, m, y],
		{ refreshMs: 30000, realtimeSchemas: ["public", "pos", "legacy_mirror"] }
	);
	return supabaseData as any;
}

export function useHybridPublicUsers() {
	const supabaseData = useSupabaseValue("attendance-public-users", fetchPublicUsers, []);
	return supabaseData as any;
}

async function fetchAllPublicUsers() {
	const supabase = createClient();
	const { data, error } = await supabase.from("pos_users_public").select("*").order("name", { ascending: true });
	if (error) throw error;
	return (data ?? []).map((row: any) => ({ _id: row._id, name: row.name, slug: row.slug || String(row.username || "").split("@")[0] || "", username: row.username || "", initial: row.initial || String(row.name || "").charAt(0).toUpperCase(), hasFace: Boolean(row.hasFace), roleId: row.roleId ?? null, roleName: row.roleName ?? "Team", isActive: row.isActive !== false, photoUrl: row.photoUrl ?? null, raw: row.raw ?? null }));
}

export function useHybridAllPublicUsers(refreshTrigger?: number) {
	const supabaseData = useSupabaseValue("attendance-all-public-users", fetchAllPublicUsers, [], {
		refreshTrigger,
		tables: ["yumi_users", "yumi_roles"],
	});
	return supabaseData as any;
}


export function useHybridCurrentlyInStore(refreshTrigger?: number) {
	const supabaseData = useSupabaseValue(
		"attendance-currently-in-store",
		fetchCurrentlyInStore,
		[refreshTrigger],
		{ refreshMs: 30000, realtimeSchemas: ["public", "pos", "legacy_mirror"] }
	);
	return supabaseData as any;
}

export function useHybridStaffBySlug(slug: string) {
	const supabaseData = useSupabaseValue(
		`attendance-staff:${slug}`,
		() => fetchUserBySlug(slug),
		[slug]
	);
	return supabaseData as any;
}

export function useHybridStaffStats(args?: {
	userId?: string;
	month?: number;
	year?: number;
}) {
	const supabaseData = useSupabaseValue(
		`attendance-staff-stats:${args?.userId ?? "skip"}:${args?.month ?? ""}:${args?.year ?? ""}`,
		() =>
			args?.userId && args?.month && args?.year
				? fetchStaffStats({
						userId: args.userId,
						month: args.month,
						year: args.year,
				  })
				: Promise.resolve(null),
		[args?.userId, args?.month, args?.year]
	);
	return supabaseData as any;
}

export function useHybridStaffLogs(args?: {
	userId?: string;
	month?: number;
	year?: number;
}) {
	const supabaseData = useSupabaseValue(
		`attendance-staff-logs:${args?.userId ?? "skip"}:${args?.month ?? ""}:${args?.year ?? ""}`,
		() =>
			args?.userId && args?.month && args?.year
				? fetchStaffLogs({
						userId: args.userId,
						month: args.month,
						year: args.year,
				  })
				: Promise.resolve(null),
		[args?.userId, args?.month, args?.year]
	);
	return supabaseData as any;
}

export function useHybridStaffStatsToday(userId?: string, refreshTrigger?: number) {
	const supabaseData = useSupabaseValue(
		`attendance-staff-stats-today:${userId ?? "skip"}`,
		() => (userId ? fetchStaffStatsToday(userId) : Promise.resolve(null)),
		[userId, refreshTrigger],
		{ refreshMs: 30000, realtimeSchemas: ["public", "pos", "legacy_mirror"] }
	);
	return supabaseData as any;
}

async function fetchPrivateStaffData(args: {
	slug: string;
	pin?: string;
	token?: string | null;
}) {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_users_public")
		.select("*")
		.eq("slug", args.slug)
		.maybeSingle();
	if (error) throw error;
	if (!data) return null;
	return {
		_id: data._id,
		name: data.name,
		slug: data.slug,
		username: data.username ?? "",
		roleId: data.roleId ?? null,
		roleName: data.roleName ?? "Team",
		hasFace: Boolean(data.hasFace),
		isActive: Boolean(data.isActive),
		raw: (data as any).raw ?? null,
	};
}

async function fetchPayrollReport(args: { month: number; year: number }) {
	const supabase = createClient();
	const [{ data: users, error: usersError }, { data: roles, error: rolesError }, { data: siteSettings, error: siteSettingsError }] =
		await Promise.all([
			supabase.from("pos_users_public").select("*"),
			supabase.from("pos_staff_roles").select("*"),
			supabase.from("pos_site_settings")
				.select("raw")
				.not("raw->payrollGlobalConfig", "is", null)
				.order("_id", { ascending: false })
				.limit(1)
				.maybeSingle(),
		]);
	if (usersError) throw usersError;
	if (rolesError) throw rolesError;
	if (siteSettingsError) throw siteSettingsError;

	// Extract global payroll config as fallback
	const siteRaw = (siteSettings?.raw ?? {}) as Record<string, any>;
	const globalPayrollConfig = (siteRaw?.payrollGlobalConfig ?? {}) as Record<string, any>;
	const globalOvertimeBonusPerHour = safeNum(globalPayrollConfig.overtimeBonusPerHour ?? 0);

	const roleMap = new Map<string, any>(
		(roles ?? []).map((role: any) => [String(role._id), role])
	);
	const activeUsers = (users ?? []).filter((user: any) => Boolean(user.isActive));

	// Jam kerja dihitung sesuai jadwal shift (bukan sekadar selisih check-in/out) dan dari
	// satu kali ambil data bulanan, bukan satu permintaan per karyawan.
	const monthStart = new Date(`${args.year}-${String(args.month).padStart(2, "0")}-01T00:00:00+07:00`).getTime();
	const monthEnd = new Date(args.year, args.month, 1).getTime() > monthStart ? new Date(`${args.month === 12 ? args.year + 1 : args.year}-${String(args.month === 12 ? 1 : args.month + 1).padStart(2, "0")}-01T00:00:00+07:00`).getTime() : monthStart;
	const firstDate = `${args.year}-${String(args.month).padStart(2, "0")}-01`;
	const lastDate = new Date(args.year, args.month, 0).toISOString().split("T")[0];
	const [{ data: logRows, error: logErr }, { data: schedRows, error: schedErr }] = await Promise.all([
		supabase.from("pos_attendance_logs").select("userId,type,timestamp,location,penalty:raw->>penaltyAmount").gte("timestamp", monthStart - 86_400_000).lt("timestamp", monthEnd).order("timestamp", { ascending: true }).limit(20000),
		supabase.from("pos_attendance_schedules").select("userId,date,shiftName,startTime,endTime,status").gte("date", firstDate).lte("date", lastDate).limit(20000),
	]);
	if (logErr) throw logErr;
	if (schedErr) throw schedErr;
	const monthAnalysis = analyzeAttendance(
		(logRows ?? []).map((r: any) => ({ userId: String(r.userId), type: String(r.type), timestamp: Number(r.timestamp), location: null, penalty: Number(r.penalty ?? 0) || 0 })),
		(schedRows ?? []).map((r: any) => ({ userId: String(r.userId), date: String(r.date), shiftName: String(r.shiftName ?? ""), startTime: r.startTime ?? null, endTime: r.endTime ?? null, status: r.status ?? null })),
		{ start: monthStart, end: monthEnd, bucket: "day" }
	);

	const rows = await Promise.all(
		activeUsers.map(async (user: any) => {
			const userStat = monthAnalysis.byUser[String(user._id)];
			const stats = { daysWorked: userStat?.days ?? 0, totalHours: userStat?.hours ?? 0 };
			const role = roleMap.get(String(user.roleId ?? ""));
			const raw = (role?.raw ?? {}) as Record<string, any>;
			const sessionCount = userStat?.sessions ?? 0;
			const baseShiftRate = safeNum(raw.baseShiftRate ?? 0);
			const monthlyFixedSalary = safeNum(raw.monthlyFixedSalary ?? 0);
			const dailyAllowance = safeNum(raw.dailyAllowance ?? 0);
			const overtimeBonusPerHour = safeNum(raw.overtimeBonusPerHour ?? raw.overtimeRatePerHour ?? globalOvertimeBonusPerHour ?? 10000);
			const totalShiftSalary = sessionCount * baseShiftRate;
			const totalAllowance = safeNum(stats?.daysWorked ?? 0) * dailyAllowance;
			const overtimeHours = userStat?.overtimeHours ?? 0;
			const totalOvertimeBonus = overtimeHours * overtimeBonusPerHour;
			const totalLateMinutes = userStat?.lateMinutes ?? 0;
			// Denda telat dicatat di log absen masuk (penaltyAmount); jangan menebak dari menit telat.
			const totalPenalty = userStat?.penalty ?? 0;

			// ── Bonus Target ─────────────────────────────────────────
			const bonusTargetConfig = (raw?.bonusTargetConfig ?? {}) as Record<string, any>;
			const bonusBasis = String(bonusTargetConfig?.basis ?? "shift");
			const bonusTiers: { thresholdPct?: number; bonusAmount?: number }[] = Array.isArray(bonusTargetConfig?.tiers)
				? bonusTargetConfig.tiers
				: [];
			const firstTier = bonusTiers[0] ?? {};
			const baseBonusAmount = safeNum((firstTier as any).bonusAmount ?? 0);
			const totalTargetBonus = bonusBasis === "monthly"
				? baseBonusAmount
				: sessionCount * baseBonusAmount;
			const netSalary =
				monthlyFixedSalary +
				totalShiftSalary +
				totalAllowance +
				totalOvertimeBonus +
				totalTargetBonus -
				totalPenalty;

			return {
				_id: user._id,
				name: user.name,
				roleName: user.roleName ?? role?.name ?? "Team",
				isActive: Boolean(user.isActive),
				daysWorked: safeNum(stats?.daysWorked ?? 0),
				totalHours: safeNum(stats?.totalHours ?? 0),
				sessionCount,
				totalLateMinutes,
				monthlyFixedSalary,
				totalShiftSalary,
				totalAllowance,
				overtimeBonusPerHour,
				totalOvertimeBonus,
				baseBonusAmount,
				bonusTargetBasis: bonusBasis,
				totalTargetBonus,
				totalPenalty,
				netSalary,
			};
		})
	);

	return {
		rows: rows.sort((a, b) => String(a.name).localeCompare(String(b.name))),
		targets: {},
	};
}

export function useHybridPayrollReport(args: { month: number; year: number }) {
	return useSupabaseValue(
		`attendance-payroll:${args.month}:${args.year}`,
		() => fetchPayrollReport(args),
		[args.month, args.year]
	) as any;
}

export function useHybridPrivateStaffData(args?: {
	slug?: string;
	pin?: string;
	token?: string | null;
}) {
	return useSupabaseValue(
		`attendance-private-staff:${args?.slug ?? "skip"}`,
		() =>
			args?.slug
				? fetchPrivateStaffData({
						slug: args.slug,
						pin: args.pin,
						token: args.token ?? null,
				  })
				: Promise.resolve(null),
		[args?.slug, args?.pin, args?.token]
	) as any;
}