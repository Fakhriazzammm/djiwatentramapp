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
