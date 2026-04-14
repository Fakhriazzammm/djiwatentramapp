import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getRoles = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("roles").order("asc").collect();
	},
});

export const createRole = mutation({
	args: {
		name: v.string(),
		permissions: v.array(v.string()),
		baseHourlyRate: v.optional(v.number()),
		baseShiftRate: v.optional(v.number()),
		monthlyFixedSalary: v.optional(v.number()),
		dailyAllowance: v.optional(v.number()),
		bonusTargetConfig: v.optional(
			v.object({
				basis: v.union(
					v.literal("shift"),
					v.literal("daily"),
					v.literal("monthly")
				),
				tiers: v.array(
					v.object({
						thresholdPct: v.number(),
						bonusAmount: v.number(),
					})
				),
			})
		),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("roles")
			.withIndex("by_name", (q) => q.eq("name", args.name))
			.first();

		if (existing) {
			throw new Error("Role already exists");
		}

		return await ctx.db.insert("roles", args);
	},
});

export const updateRole = mutation({
	args: {
		id: v.id("roles"),
		name: v.string(),
		permissions: v.array(v.string()),
		baseHourlyRate: v.optional(v.number()),
		baseShiftRate: v.optional(v.number()),
		monthlyFixedSalary: v.optional(v.number()),
		dailyAllowance: v.optional(v.number()),
		bonusTargetConfig: v.optional(
			v.object({
				basis: v.union(
					v.literal("shift"),
					v.literal("daily"),
					v.literal("monthly")
				),
				tiers: v.array(
					v.object({
						thresholdPct: v.number(),
						bonusAmount: v.number(),
					})
				),
			})
		),
	},
	handler: async (ctx, args) => {
		return await ctx.db.patch(args.id, {
			name: args.name,
			permissions: args.permissions,
			baseHourlyRate: args.baseHourlyRate,
			baseShiftRate: args.baseShiftRate,
			monthlyFixedSalary: args.monthlyFixedSalary,
			dailyAllowance: args.dailyAllowance,
			bonusTargetConfig: args.bonusTargetConfig,
		});
	},
});

export const deleteRole = mutation({
	args: {
		id: v.id("roles"),
	},
	handler: async (ctx, args) => {
		// Check if any user uses this role
		const usersWithRole = await ctx.db
			.query("users")
			.withIndex("by_role", (q) => q.eq("roleId", args.id))
			.first();

		if (usersWithRole) {
			throw new Error("Cannot delete role assigned to users");
		}

		return await ctx.db.delete(args.id);
	},
});
