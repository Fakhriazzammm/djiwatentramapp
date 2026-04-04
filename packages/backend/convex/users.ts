import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
	return EMAIL_REGEX.test(email);
}

// Simple password hashing (MVP: In production use bcrypt/argon2 via external action)
// For now we store as plain text or simple hash to avoid heavy dependencies on Convex runtime without Actions
// IMPORTANT: For a real app, use an Action to hash passwords safely.
// Since this is a specialized requested feature, we will follow the prompt's simplicity but acknowledge the security trade-off.

export const getUsers = query({
	args: {},
	handler: async (ctx) => {
		const users = await ctx.db.query("users").collect();
		// Join with roles
		const usersWithRoles = await Promise.all(
			users.map(async (user) => {
				const role = await ctx.db.get(user.roleId);
				return {
					...user,
					roleName: role?.name || "Unknown",
					email: user.username,
				};
			})
		);
		return usersWithRoles;
	},
});

export const getReportRecipientEmails = query({
	args: {},
	handler: async (ctx) => {
		const [users, roles] = await Promise.all([
			ctx.db.query("users").collect(),
			ctx.db.query("roles").collect(),
		]);

		const roleMap = new Map(roles.map((role) => [role._id, role]));
		const adminUsers = users.filter((user) => {
			const role = roleMap.get(user.roleId);
			if (!role) return false;
			const roleName = (role.name || "").toLowerCase();
			const isAdminRole =
				roleName.includes("admin") || role.permissions.includes("all");
			return isAdminRole && user.isActive;
		});

		const recipients = Array.from(
			new Set(
				users
					.filter(
						(user) =>
							user.isActive &&
							user.receiveReportEmails === true &&
							isValidEmail(normalizeEmail(user.username))
					)
					.map((user) => normalizeEmail(user.username))
			)
		);

		if (recipients.length > 0) {
			return recipients;
		}

		const fallbackRecipients = Array.from(
			new Set(
				adminUsers
					.map((user) => normalizeEmail(user.username))
					.filter((email) => isValidEmail(email))
			)
		);

		return fallbackRecipients;
	},
});

export const createDefaultAdmin = mutation({
	args: {},
	handler: async (ctx) => {
		// Check if admin role exists
		const adminRole = await ctx.db
			.query("roles")
			.withIndex("by_name", (q) => q.eq("name", "admin"))
			.first();

		let roleId = adminRole?._id;

		if (!roleId) {
			roleId = await createRoleInternal(ctx, "admin", ["all"]);
		}

		// Check if admin user exists
		const adminUser = await ctx.db
			.query("users")
			.withIndex("by_username", (q) => q.eq("username", "admin"))
			.first();

		if (!adminUser && roleId) {
			await ctx.db.insert("users", {
				username: "admin",
				password: "password123", // Default password
				name: "Super Admin",
				roleId,
				isActive: true,
				receiveReportEmails: true,
			});
			return "Admin created (admin/password123)";
		}
		return "Admin already exists";
	},
});

export const login = mutation({
	args: {
		username: v.string(),
		password: v.string(),
	},
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("by_username", (q) => q.eq("username", args.username))
			.first();

		if (!user || user.password !== args.password) {
			throw new Error("Invalid credentials");
		}

		if (!user.isActive) {
			throw new Error("User account is inactive");
		}

		// Update last login
		await ctx.db.patch(user._id, {
			lastLogin: Date.now(),
		});

		const role = await ctx.db.get(user.roleId);

		return {
			userId: user._id,
			name: user.name,
			role: role?.name || "user",
			permissions: role?.permissions || [],
		};
	},
});

export const createUser = mutation({
	args: {
		username: v.string(),
		password: v.optional(v.string()), // Optional for Better Auth
		name: v.string(),
		roleId: v.id("roles"),
		authUserId: v.optional(v.string()), // Optional bind immediately
		receiveReportEmails: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const username = normalizeEmail(args.username);
		if (!isValidEmail(username)) {
			throw new Error("Username harus berupa email yang valid");
		}

		const existing = await ctx.db
			.query("users")
			.withIndex("by_username", (q) => q.eq("username", username))
			.first();
		if (existing) {
			throw new Error("Username already taken");
		}
		return await ctx.db.insert("users", {
			...args,
			username,
			password: args.password || "", // Default empty if not provided
			isActive: true, // Default active
			receiveReportEmails: args.receiveReportEmails ?? false,
		});
	},
});

export const bindProfile = mutation({
	args: {
		authUserId: v.string(),
		name: v.string(),
		email: v.string(), // Used as username
		roleId: v.optional(v.id("roles")), // Optional default role
	},
	handler: async (ctx, args) => {
		const email = normalizeEmail(args.email);
		if (!isValidEmail(email)) {
			throw new Error("Email tidak valid");
		}

		// Owner email for auto-admin assignment
		const OWNER_EMAIL = "fakhriazzamm@gmail.com";

		// Check if profile exists
		const existing = await ctx.db
			.query("users")
			.withIndex("by_auth_user_id", (q) => q.eq("authUserId", args.authUserId))
			.first();

		if (existing) {
			return existing._id;
		}

		// Check if username (email) exists to link
		const existingByEmail = await ctx.db
			.query("users")
			.withIndex("by_username", (q) => q.eq("username", email))
			.first();

		if (existingByEmail) {
			// Link existing (Legacy migration)
			await ctx.db.patch(existingByEmail._id, {
				authUserId: args.authUserId,
			});
			return existingByEmail._id;
		}

		// Create new profile
		// Determine role - auto-assign admin for owner email
		let roleId = args.roleId;

		// Auto-assign admin role for owner email
		if (email === OWNER_EMAIL) {
			const adminRole = await ctx.db
				.query("roles")
				.withIndex("by_name", (q) => q.eq("name", "admin"))
				.first();
			if (adminRole) {
				roleId = adminRole._id;
			}
		}

		// Fallback to default role if not owner
		if (!roleId) {
			const defaultRole = await ctx.db
				.query("roles")
				.withIndex("by_name", (q) => q.eq("name", "staff"))
				.first();
			if (defaultRole) {
				roleId = defaultRole._id;
			} else {
				// Fallback to any role or error? For now create a default "user" role if missing
				const userRole = await ctx.db
					.query("roles")
					.withIndex("by_name", (q) => q.eq("name", "user"))
					.first();
				roleId = userRole?._id;
			}
		}

		if (!roleId) {
			throw new Error("No default role found");
		}

		return await ctx.db.insert("users", {
			username: email,
			name: args.name,
			roleId,
			authUserId: args.authUserId,
			isActive: true,
			receiveReportEmails: false,
		});
	},
});

export const updateUser = mutation({
	args: {
		id: v.id("users"),
		username: v.optional(v.string()),
		name: v.optional(v.string()),
		roleId: v.optional(v.id("roles")),
		isActive: v.optional(v.boolean()),
		receiveReportEmails: v.optional(v.boolean()),
		password: v.optional(v.string()),
		authUserId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { id, username, ...updates } = args;
		const nextUpdates: Record<string, unknown> = { ...updates };

		if (username !== undefined) {
			const normalizedUsername = normalizeEmail(username);
			if (!isValidEmail(normalizedUsername)) {
				throw new Error("Username harus berupa email yang valid");
			}

			const existing = await ctx.db
				.query("users")
				.withIndex("by_username", (q) => q.eq("username", normalizedUsername))
				.first();

			if (existing && existing._id !== id) {
				throw new Error("Username already taken");
			}

			nextUpdates.username = normalizedUsername;
		}

		return await ctx.db.patch(id, nextUpdates);
	},
});

export const deleteUser = mutation({
	args: {
		id: v.id("users"),
	},
	handler: async (ctx, args) => {
		return await ctx.db.delete(args.id);
	},
});

// Helper to create role internally
async function createRoleInternal(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ctx: any,
	name: string,
	permissions: string[]
) {
	const id = await ctx.db.insert("roles", { name, permissions });
	return id;
}
