import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
		photoUrl: v.optional(v.string()),
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
		// Verify user exists and is active
		const user = await ctx.db.get(args.userId);
		if (!user || !user.isActive) {
			throw new Error("User not found or inactive");
		}

		// Check if already clocked in today (simple check)
		// Optimal implementation would check for existing check_in without a matching check_out
		
		const attendanceId = await ctx.db.insert("attendance", {
			userId: args.userId,
			type: "check_in",
			timestamp: Date.now(),
			photoUrl: args.photoUrl,
			location: args.location,
			notes: args.notes,
		});

		return attendanceId;
	},
});

export const clockOut = mutation({
	args: {
		userId: v.id("users"),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await ctx.db.get(args.userId);
		if (!user || !user.isActive) {
			throw new Error("User not found or inactive");
		}

		const attendanceId = await ctx.db.insert("attendance", {
			userId: args.userId,
			type: "check_out",
			timestamp: Date.now(),
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
