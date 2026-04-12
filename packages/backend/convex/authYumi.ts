import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * List all active users for the unified login selection screen.
 * Returns public info only.
 */
export const getPublicUsers = query({
	args: {},
	handler: async (ctx) => {
		const users = await ctx.db
			.query("users")
			.filter((q) => q.eq(q.field("isActive"), true))
			.collect();

		// Map to public info
		return users.map((u) => ({
			_id: u._id,
			name: u.name,
			slug: u.slug || u.username.split("@")[0],
			initial: u.name.charAt(0).toUpperCase(),
		})).sort((a, b) => a.name.localeCompare(b.name));
	},
});

/**
 * Verify PIN and create a 24-hour Yumi Session.
 */
export const loginWithPin = mutation({
	args: {
		userId: v.id("users"),
		pin: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await ctx.db.get(args.userId);
		if (!user || !user.isActive) {
			throw new Error("User tidak ditemukan atau nonaktif");
		}

		if (!user.homePin || user.homePin !== args.pin) {
			throw new Error("PIN yang Anda masukkan salah");
		}

		// Generate a random token
		// In a real env, use a more secure cryptographically random string if available, 
		// but since we are in Convex environment, we can use a combination of random and timestamp.
		const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
		
		const sessionExpiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

		const sessionId = await ctx.db.insert("yumiSessions", {
			userId: args.userId,
			token,
			expiresAt: sessionExpiresAt,
		});

		return {
			token,
			expiresAt: sessionExpiresAt,
			user: {
				_id: user._id,
				name: user.name,
				slug: user.slug,
			}
		};
	},
});

/**
 * Validate an existing session token.
 */
export const validateSession = query({
	args: { token: v.optional(v.string()) },
	handler: async (ctx, args) => {
		if (!args.token) return null;

		const session = await ctx.db
			.query("yumiSessions")
			.withIndex("by_token", (q) => q.eq("token", args.token!))
			.unique();

		if (!session) return null;

		if (Date.now() > session.expiresAt) {
			// Session expired
			return null;
		}

		const user = await ctx.db.get(session.userId);
		if (!user || !user.isActive) return null;

		const role = await ctx.db.get(user.roleId);

		return {
			user: {
				_id: user._id,
				name: user.name,
				username: user.username,
				slug: user.slug,
				roleId: user.roleId,
			},
			role: {
				name: role?.name || "staff",
				permissions: role?.permissions || [],
			},
			expiresAt: session.expiresAt,
		};
	},
});

/**
 * Logout and invalidate the session.
 */
export const logoutSession = mutation({
	args: { token: v.string() },
	handler: async (ctx, args) => {
		const session = await ctx.db
			.query("yumiSessions")
			.withIndex("by_token", (q) => q.eq("token", args.token))
			.unique();

		if (session) {
			await ctx.db.delete(session._id);
		}
		
		return true;
	},
});
