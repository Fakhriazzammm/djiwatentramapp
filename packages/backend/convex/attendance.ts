import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const FACE_MATCH_THRESHOLD = 0.6;
const DEFAULT_BONUS_THRESHOLDS = [100, 150, 200] as const;

type BonusTier = {
	thresholdPct: number;
	bonusAmount: number;
};

type RoleBonusConfig = {
	basis: "shift" | "daily" | "monthly";
	tiers: BonusTier[];
};

function euclideanDistance(a: number[], b: number[]) {
	if (a.length !== b.length) return Number.POSITIVE_INFINITY;
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const delta = a[i] - b[i];
		sum += delta * delta;
	}
	return Math.sqrt(sum);
}

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
	const earthRadius = 6371e3;
	const phi1 = (lat1 * Math.PI) / 180;
	const phi2 = (lat2 * Math.PI) / 180;
	const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
	const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

	const a =
		Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
		Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return earthRadius * c;
}

function toDateKey(timestamp: number) {
	const date = new Date(timestamp);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function resolveRoleBonusConfig(rawRole: any): RoleBonusConfig | null {
	const config = rawRole?.bonusTargetConfig;
	if (!config || !config.basis) {
		return null;
	}

	const tiersInput = Array.isArray(config.tiers) ? config.tiers : [];
	const normalizedTiers = tiersInput
		.map((tier: any) => ({
			thresholdPct: Number(tier?.thresholdPct ?? 0),
			bonusAmount: Number(tier?.bonusAmount ?? 0),
		}))
		.filter((tier: BonusTier) => Number.isFinite(tier.thresholdPct) && tier.thresholdPct > 0)
		.sort((a: BonusTier, b: BonusTier) => a.thresholdPct - b.thresholdPct);

	const tiers = (normalizedTiers.length > 0
		? normalizedTiers
		: DEFAULT_BONUS_THRESHOLDS.map((thresholdPct) => ({
				thresholdPct,
				bonusAmount: 0,
			}))) as BonusTier[];

	return {
		basis: config.basis,
		tiers,
	};
}

function calculateTierBonus(achievementPct: number, tiers: BonusTier[]) {
	let totalBonus = 0;
	const reachedThresholds: number[] = [];

	for (const tier of tiers) {
		if (achievementPct >= tier.thresholdPct) {
			totalBonus += tier.bonusAmount;
			reachedThresholds.push(tier.thresholdPct);
		}
	}

	return { totalBonus, reachedThresholds };
}

async function assertVerification(
	user: { faceDescriptor?: number[]; homePin?: string },
	args: { faceDescriptor?: number[]; pinCode?: string }
) {
	const hasFaceInput = Array.isArray(args.faceDescriptor) && args.faceDescriptor.length > 0;
	const hasPinInput = typeof args.pinCode === "string" && args.pinCode.trim().length > 0;

	if (hasFaceInput) {
		if (!user.faceDescriptor || user.faceDescriptor.length === 0) {
			throw new Error("Wajah belum terdaftar. Gunakan PIN.");
		}
		const distance = euclideanDistance(user.faceDescriptor, args.faceDescriptor!);
		if (distance >= FACE_MATCH_THRESHOLD) {
			throw new Error("Verifikasi wajah gagal");
		}
		return;
	}

	if (hasPinInput) {
		if (!user.homePin || user.homePin !== args.pinCode) {
			throw new Error("PIN tidak valid");
		}
		return;
	}

	throw new Error("Verifikasi wajib (wajah atau PIN)");
}

async function assertInsideAttendanceRadius(
	ctx: any,
	location?: { lat: number; lng: number; address?: string }
) {
	const settings = await ctx.db.query("siteSettings").first();
	if (
		settings?.attendanceLat === undefined ||
		settings?.attendanceLng === undefined
	) {
		return;
	}
	if (!location) {
		throw new Error("Lokasi wajib untuk absensi");
	}
	const radius = settings.attendanceRadius ?? 50;
	const distance = calculateDistanceMeters(
		location.lat,
		location.lng,
		settings.attendanceLat,
		settings.attendanceLng
	);
	if (distance > radius) {
		throw new Error("Di luar radius absensi");
	}
}

export const getAttendance = query({
	args: {
		userId: v.optional(v.id("users")),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const q = args.userId
			? ctx.db
					.query("attendance")
					.withIndex("by_user", (q) => q.eq("userId", args.userId!))
			: ctx.db.query("attendance");
		return await q.order("desc").take(args.limit ?? 50);
	},
});

export const clockIn = mutation({
	args: {
		userId: v.id("users"),
		faceDescriptor: v.optional(v.array(v.number())),
		pinCode: v.optional(v.string()),
		photoUrl: v.optional(v.string()),
		location: v.optional(
			v.object({
				lat: v.number(),
				lng: v.number(),
				address: v.optional(v.string()),
			})
		),
		notes: v.optional(v.string()),
		shiftName: v.optional(v.string()),
		shiftOpenTimeSnapshot: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// Verify user exists and is active
		const user = await ctx.db.get(args.userId);
		if (!user || !user.isActive) {
			throw new Error("User not found or inactive");
		}
		await assertVerification(user, {
			faceDescriptor: args.faceDescriptor,
			pinCode: args.pinCode,
		});
		await assertInsideAttendanceRadius(ctx, args.location);

		const latestStatus = await ctx.db
			.query("attendance")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.order("desc")
			.first();
		if (latestStatus?.type === "check_in") {
			throw new Error("User is already clocked in");
		}
		
		const attendanceId = await ctx.db.insert("attendance", {
			userId: args.userId,
			type: "check_in",
			timestamp: Date.now(),
			photoUrl: args.photoUrl,
			location: args.location,
			notes: args.notes,
			shiftName: args.shiftName,
			shiftOpenTimeSnapshot: args.shiftOpenTimeSnapshot,
		});

		return attendanceId;
	},
});

export const clockOut = mutation({
	args: {
		userId: v.id("users"),
		faceDescriptor: v.optional(v.array(v.number())),
		pinCode: v.optional(v.string()),
		location: v.optional(
			v.object({
				lat: v.number(),
				lng: v.number(),
				address: v.optional(v.string()),
			})
		),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await ctx.db.get(args.userId);
		if (!user || !user.isActive) {
			throw new Error("User not found or inactive");
		}
		await assertVerification(user, {
			faceDescriptor: args.faceDescriptor,
			pinCode: args.pinCode,
		});
		await assertInsideAttendanceRadius(ctx, args.location);

		const latestStatus = await ctx.db
			.query("attendance")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.order("desc")
			.first();
		if (!latestStatus || latestStatus.type !== "check_in") {
			throw new Error("User is not currently clocked in");
		}

		const attendanceId = await ctx.db.insert("attendance", {
			userId: args.userId,
			type: "check_out",
			timestamp: Date.now(),
			location: args.location,
			notes: args.notes,
		});

		return attendanceId;
	},
});

export const getLatestStatus = query({
	args: { userId: v.id("users") },
	handler: async (ctx, args) => {
		const latest = await ctx.db
			.query("attendance")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.order("desc")
			.first();

		if (!latest) return { type: "none" };
		
		// If last action was more than 24h ago, consider it reset
		if (Date.now() - latest.timestamp > 24 * 60 * 60 * 1000) {
			return { type: "none" };
		}

		return {
			type: latest.type,
			timestamp: latest.timestamp,
		};
	},
});

export const getStaffStats = query({
	args: { 
		userId: v.id("users"),
		month: v.number(),
		year: v.number(),
	},
	handler: async (ctx, args) => {
		const startOfMonth = new Date(args.year, args.month - 1, 1).getTime();
		const endOfMonth = new Date(args.year, args.month, 1).getTime();

		const entries = await ctx.db
			.query("attendance")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.filter((q) => q.and(
				q.gte(q.field("timestamp"), startOfMonth),
				q.lt(q.field("timestamp"), endOfMonth)
			))
			.collect();

		// Calculate stats
		// We group by day to get unique days worked
		const uniqueDays = new Set();
		let totalMs = 0;

		// Sort by timestamp to pair check-in and check-out
		const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
		
		for (let i = 0; i < sorted.length; i++) {
			const entry = sorted[i];
			const dateStr = new Date(entry.timestamp).toDateString();
			uniqueDays.add(dateStr);

			if (entry.type === "check_in" && i + 1 < sorted.length) {
				const nextEntry = sorted[i + 1];
				if (nextEntry.type === "check_out") {
					totalMs += (nextEntry.timestamp - entry.timestamp);
					i++; // Skip the paired check_out
				}
			}
		}

		const totalHours = Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10;
		// Assume 26 working days as 100%
		const attendanceRate = Math.min(100, Math.round((uniqueDays.size / 26) * 100));

		return {
			totalHours,
			attendanceRate,
			daysWorked: uniqueDays.size,
		};
	},
});

export const getStaffLogs = query({
	args: {
		userId: v.id("users"),
		month: v.number(),
		year: v.number(),
	},
	handler: async (ctx, args) => {
		const startOfMonth = new Date(args.year, args.month - 1, 1).getTime();
		const endOfMonth = new Date(args.year, args.month, 1).getTime();

		return await ctx.db
			.query("attendance")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.filter((q) => q.and(
				q.gte(q.field("timestamp"), startOfMonth),
				q.lt(q.field("timestamp"), endOfMonth)
			))
			.order("desc")
			.collect();
	},
});

export const getCurrentlyInStore = query({
	args: {},
	handler: async (ctx) => {
		const activeUsers = await ctx.db.query("users").filter(q => q.eq(q.field("isActive"), true)).collect();
		const results = [];
		for (const user of activeUsers) {
			const latestStatus = await ctx.db.query("attendance")
				.withIndex("by_user", (q) => q.eq("userId", user._id))
				.order("desc")
				.first();
			
			if (latestStatus?.type === "check_in") {
				results.push({
					_id: user._id,
					name: user.name,
					roleId: user.roleId,
					checkInTime: latestStatus.timestamp
				});
			}
		}
		return results;
	}
});

export const getStaffStatsToday = query({
	args: { 
		userId: v.id("users")
	},
	handler: async (ctx, args) => {
		const now = new Date();
		const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		const endOfDay = startOfDay + (24 * 60 * 60 * 1000);

		const entries = await ctx.db
			.query("attendance")
			.withIndex("by_user", (q) => q.eq("userId", args.userId))
			.filter((q) => q.and(
				q.gte(q.field("timestamp"), startOfDay),
				q.lt(q.field("timestamp"), endOfDay)
			))
			.order("asc")
			.collect();

		let totalMs = 0;
		let lastCheckIn: number | null = null;

		for (const entry of entries) {
			if (entry.type === "check_in") {
				lastCheckIn = entry.timestamp;
			} else if (entry.type === "check_out" && lastCheckIn) {
				totalMs += (entry.timestamp - lastCheckIn);
				lastCheckIn = null;
			}
		}

		// If currently checked in, add time until now
		if (lastCheckIn) {
			totalMs += (Date.now() - lastCheckIn);
		}

		const totalHoursFloat = totalMs / (1000 * 60 * 60);
		const totalMinutes = Math.floor((totalMs / (1000 * 60)) % 60);
		const totalHours = Math.floor(totalHoursFloat);

		return {
			totalHours,
			totalMinutes,
			totalMs,
			isWorking: !!lastCheckIn,
			lastCheckIn
		};
	},
});

export const getAdminLogs = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const rawLogs = await ctx.db
			.query("attendance")
			.order("desc")
			.take(args.limit ?? 100);

		const enrichedLogs = await Promise.all(
			rawLogs.map(async (log) => {
				const user = await ctx.db.get(log.userId);
				const role = user ? await ctx.db.get(user.roleId) : null;
				return {
					...log,
					userName: user?.name || "Unknown Staff",
					roleName: role?.name || "N/A",
				};
			})
		);

		return enrichedLogs;
	},
});

export const getPayrollReport = query({
	args: {
		month: v.number(), // 1-12
		year: v.number(),
	},
	handler: async (ctx, args) => {
		const startOfMonth = new Date(args.year, args.month - 1, 1).getTime();
		const endOfMonth = new Date(args.year, args.month, 1).getTime();

		const logs = await ctx.db
			.query("attendance")
			.filter((q) =>
				q.and(
					q.gte(q.field("timestamp"), startOfMonth),
					q.lt(q.field("timestamp"), endOfMonth)
				)
			)
			.collect();

		const users = await ctx.db.query("users").collect();
		const roles = await ctx.db.query("roles").collect();
		const siteSettings = await ctx.db.query("siteSettings").first();
		const monthKey = `${args.year}-${String(args.month).padStart(2, "0")}`;

		const [financialTarget, incomeTransactionsRaw] = await Promise.all([
			ctx.db
				.query("financialTargets")
				.withIndex("by_month", (q) => q.eq("month", monthKey))
				.first(),
			ctx.db
				.query("financialTransactions")
				.withIndex("by_type_and_date", (q) =>
					q.eq("type", "income").gte("date", startOfMonth).lt("date", endOfMonth)
				)
				.collect(),
		]);

		const incomeTransactions = incomeTransactionsRaw.filter(
			(tx) =>
				tx.status === "completed" &&
				tx.category !== "Modal Awal" &&
				tx.category !== "Setoran Akhir"
		);

		const monthTargetRevenue = financialTarget?.targetRevenue ?? 0;
		const daysInMonth = new Date(args.year, args.month, 0).getDate();
		const shiftCountPerDay = Math.max(
			1,
			siteSettings?.shiftSettings?.predefinedShifts?.length ?? 2
		);
		const dailyTargetRevenue =
			monthTargetRevenue > 0 ? monthTargetRevenue / daysInMonth : 0;
		const shiftTargetRevenue =
			dailyTargetRevenue > 0 ? dailyTargetRevenue / shiftCountPerDay : 0;

		const revenueByDay = new Map<string, number>();
		let monthlyRevenue = 0;
		for (const tx of incomeTransactions) {
			const dayKey = toDateKey(tx.date);
			revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + tx.amount);
			monthlyRevenue += tx.amount;
		}

		const getRevenueInRange = (startTs: number, endTs: number) => {
			let total = 0;
			for (const tx of incomeTransactions) {
				if (tx.date >= startTs && tx.date <= endTs) {
					total += tx.amount;
				}
			}
			return total;
		};

		const payrollConfig = siteSettings?.payrollGlobalConfig ?? {
			lateToleranceMinutes: 0,
			latePenaltyPerMinute: 0,
			overtimeBonusPerHour: 0,
		};

		const userMap = new Map(users.map((u) => [u._id, u]));
		const roleMap = new Map(roles.map((r) => [r._id, r]));

		// Group logs by user
		const userLogs = new Map<string, any[]>();
		logs.forEach((log) => {
			const list = userLogs.get(log.userId) || [];
			list.push(log);
			userLogs.set(log.userId, list);
		});

		const reportRows: any[] = [];

		for (const user of users) {
			if (!user.isActive) continue;

			const role = roleMap.get(user.roleId);
			const shiftRate = (role as any)?.baseShiftRate ?? 0;
			const monthlySalary = (role as any)?.monthlyFixedSalary ?? 0;
			const allowance = (role as any)?.dailyAllowance ?? 0;

			// Get logs for this user
			const userLogsForPeriod = userLogs.get(user._id) || [];
			
			// Sort logs by time
			const sortedLogs = [...userLogsForPeriod].sort((a, b) => a.timestamp - b.timestamp);
			
			const daysWorked = new Set<string>();
			let totalWorkingMs = 0;
			let totalPenalty = 0;
			let totalLateMinutes = 0;
			let totalOvertimeBonus = 0;
			let totalTargetBonus = 0;
			let sessionCount = 0;

			const sessions: any[] = [];

			for (let i = 0; i < sortedLogs.length; i++) {
				const entry = sortedLogs[i];
				if (entry.type === "check_in") {
					const dateStr = toDateKey(entry.timestamp);
					daysWorked.add(dateStr);

					const nextEntry = sortedLogs[i + 1];
					const checkOut = nextEntry?.type === "check_out" ? nextEntry : null;
					
					const durationMs = checkOut ? (checkOut.timestamp - entry.timestamp) : 0;
					totalWorkingMs += durationMs;
					const shiftRevenue =
						checkOut && shiftTargetRevenue > 0
							? getRevenueInRange(entry.timestamp, checkOut.timestamp)
							: 0;
					const shiftAchievementPct =
						shiftTargetRevenue > 0 ? (shiftRevenue / shiftTargetRevenue) * 100 : 0;

					if (checkOut) {
						sessionCount++;
					}

					const hours = durationMs / (1000 * 60 * 60);
					if (hours > 8) {
						totalOvertimeBonus += (hours - 8) * (payrollConfig.overtimeBonusPerHour ?? 0);
					}

					let lateMinutes = 0;
					if (entry.shiftOpenTimeSnapshot) {
						const [openH, openM] = entry.shiftOpenTimeSnapshot.split(':').map(Number);
						const checkInDate = new Date(entry.timestamp);
						const shiftOpenTime = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate(), openH, openM).getTime();
						
						const diffMs = entry.timestamp - shiftOpenTime;
						const diffMin = Math.floor(diffMs / (1000 * 60));
						
						if (diffMin > payrollConfig.lateToleranceMinutes) {
							lateMinutes = diffMin;
							totalPenalty += lateMinutes * payrollConfig.latePenaltyPerMinute;
							totalLateMinutes += lateMinutes;
						}
					}

					sessions.push({
						date: new Date(entry.timestamp).toLocaleDateString('id-ID'),
						shiftName: entry.shiftName || "N/A",
						checkIn: entry.timestamp,
						checkOut: checkOut?.timestamp ?? null,
						lateMinutes,
						durationHours: hours,
						shiftRevenue,
						shiftAchievementPct,
					});

					if (checkOut) i++;
				}
			}

			const roleBonusConfig = resolveRoleBonusConfig(role);
			let bonusTargetBasis: "shift" | "daily" | "monthly" | null = null;
			let bonusAchievementsCount = 0;

			if (roleBonusConfig && monthTargetRevenue > 0) {
				bonusTargetBasis = roleBonusConfig.basis;

				if (roleBonusConfig.basis === "shift" && shiftTargetRevenue > 0) {
					for (const session of sessions) {
						if (!session.checkOut) continue;
						const sessionBonus = calculateTierBonus(
							session.shiftAchievementPct,
							roleBonusConfig.tiers
						);
						totalTargetBonus += sessionBonus.totalBonus;
						bonusAchievementsCount += sessionBonus.reachedThresholds.length;
					}
				} else if (roleBonusConfig.basis === "daily" && dailyTargetRevenue > 0) {
					for (const dayKey of daysWorked) {
						const dayRevenue = revenueByDay.get(dayKey) ?? 0;
						const dayAchievementPct = (dayRevenue / dailyTargetRevenue) * 100;
						const dayBonus = calculateTierBonus(
							dayAchievementPct,
							roleBonusConfig.tiers
						);
						totalTargetBonus += dayBonus.totalBonus;
						bonusAchievementsCount += dayBonus.reachedThresholds.length;
					}
				} else if (roleBonusConfig.basis === "monthly") {
					const monthAchievementPct = (monthlyRevenue / monthTargetRevenue) * 100;
					const monthBonus = calculateTierBonus(
						monthAchievementPct,
						roleBonusConfig.tiers
					);
					totalTargetBonus += monthBonus.totalBonus;
					bonusAchievementsCount += monthBonus.reachedThresholds.length;
				}
			}

			const totalShiftSalary = sessionCount * shiftRate;
			const totalAllowance = daysWorked.size * allowance;
			const netSalary =
				monthlySalary +
				totalShiftSalary +
				totalAllowance +
				totalOvertimeBonus +
				totalTargetBonus -
				totalPenalty;

			reportRows.push({
				userId: user._id,
				name: user.name,
				roleName: role?.name || "N/A",
				daysWorked: daysWorked.size,
				sessionCount,
				totalHours: totalWorkingMs / (1000 * 60 * 60),
				totalLateMinutes,
				monthlyFixedSalary: monthlySalary,
				totalShiftSalary,
				totalPenalty,
				totalAllowance,
				totalOvertimeBonus,
				totalTargetBonus,
				bonusTargetBasis,
				bonusAchievementsCount,
				netSalary,
				sessions
			});
		}

		return {
			period: `${args.month}/${args.year}`,
			rows: reportRows,
			config: payrollConfig,
			targets: {
				monthTargetRevenue,
				dailyTargetRevenue,
				shiftTargetRevenue,
				monthRevenue: monthlyRevenue,
			},
		};
	},
});

// === Admin CRUD for attendance logs ===

export const adminCreateLog = mutation({
	args: {
		userId: v.id("users"),
		type: v.union(v.literal("check_in"), v.literal("check_out")),
		timestamp: v.number(),
		notes: v.optional(v.string()),
		shiftName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("attendance", {
			userId: args.userId,
			type: args.type,
			timestamp: args.timestamp,
			notes: args.notes,
			shiftName: args.shiftName,
		});
	},
});

export const adminUpdateLog = mutation({
	args: {
		id: v.id("attendance"),
		type: v.optional(v.union(v.literal("check_in"), v.literal("check_out"))),
		timestamp: v.optional(v.number()),
		notes: v.optional(v.string()),
		shiftName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { id, ...updates } = args;
		const cleaned: Record<string, any> = {};
		for (const [k, val] of Object.entries(updates)) {
			if (val !== undefined) cleaned[k] = val;
		}
		return await ctx.db.patch(id, cleaned);
	},
});

export const adminDeleteLog = mutation({
	args: { id: v.id("attendance") },
	handler: async (ctx, args) => {
		return await ctx.db.delete(args.id);
	},
});

export const adminBulkDeleteLogs = mutation({
	args: { ids: v.array(v.id("attendance")) },
	handler: async (ctx, args) => {
		for (const id of args.ids) {
			await ctx.db.delete(id);
		}
		return { deleted: args.ids.length };
	},
});
