import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
	return EMAIL_REGEX.test(email);
}

function normalizeHomePin(pin?: string) {
	const trimmed = pin?.trim();
	return trimmed ? trimmed : undefined;
}

function isValidHomePin(pin: string) {
	return /^\d{6}$/.test(pin);
}

function normalizeSlug(text: string) {
	return text
		.toLowerCase()
		.trim()
		.replace(/[\s_]+/g, "-") // Space/underscore to dash
		.replace(/[^\w-]+/g, "") // Remove non-word except dash
		.replace(/--+/g, "-") // Multiple dashes to single
		.replace(/^-+/, "") // Trim leading dashes
		.replace(/-+$/, ""); // Trim trailing dashes
}

// Simple password hashing (MVP: In production use bcrypt/argon2 via external action)
// For now we store as plain text or simple hash to avoid heavy dependencies on Convex runtime without Actions
// IMPORTANT: For a real app, use an Action to hash passwords safely.
// Since this is a specialized requested feature, we will follow the prompt's simplicity but acknowledge the security trade-off.
// Internal helper for session validation
async function validateSessionInternal(ctx: any, token: string) {
	const session = await ctx.db
		.query("yumiSessions")
		.withIndex("by_token", (q: any) => q.eq("token", token))
		.unique();

	if (!session) return null;
	if (Date.now() > session.expiresAt) return null;

	const user = await ctx.db.get(session.userId);
	if (!user || !user.isActive) return null;

	return { user, session };
}

export const updateProfile = mutation({
	args: {
		token: v.string(),
		name: v.optional(v.string()),
		username: v.optional(v.string()),
		password: v.optional(v.string()),
		slug: v.optional(v.string()),
		oldPassword: v.optional(v.string()), // Required for password change
	},
	handler: async (ctx, args) => {
		const sessionResult = await validateSessionInternal(ctx, args.token);
		if (!sessionResult) throw new Error("Sesi tidak valid atau telah berakhir");
		
		const { user } = sessionResult;
		const updates: Record<string, any> = {};

		if (args.name !== undefined) {
			updates.name = args.name.trim();
		}

		if (args.username !== undefined) {
			const normalizedUsername = normalizeEmail(args.username);
			if (!isValidEmail(normalizedUsername)) {
				throw new Error("Email tidak valid");
			}

			// Check uniqueness
			const existing = await ctx.db
				.query("users")
				.withIndex("by_username", (q) => q.eq("username", normalizedUsername))
				.first();

			if (existing && existing._id !== user._id) {
				throw new Error("Email sudah digunakan oleh pengguna lain");
			}
			updates.username = normalizedUsername;
		}

		if (args.slug !== undefined) {
			const normalizedSlugStr = normalizeSlug(args.slug);
			if (!normalizedSlugStr) throw new Error("Slug profil tidak boleh kosong");

			const existingSlug = await ctx.db
				.query("users")
				.withIndex("by_slug", (q) => q.eq("slug", normalizedSlugStr))
				.first();

			if (existingSlug && existingSlug._id !== user._id) {
				throw new Error("Username profil sudah used");
			}
			updates.slug = normalizedSlugStr;
		}

		if (args.password !== undefined) {
			if (!args.oldPassword || user.password !== args.oldPassword) {
				throw new Error("Password lama salah. Verifikasi diperlukan untuk mengubah password.");
			}
			if (args.password.length < 6) {
				throw new Error("Password baru minimal 6 karakter");
			}
			updates.password = args.password;
		}

		if (Object.keys(updates).length > 0) {
			await ctx.db.patch(user._id, updates);
		}

		return { success: true };
	},
});

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
		homePin: v.optional(v.string()),
		name: v.string(),
		roleId: v.id("roles"),
		authUserId: v.optional(v.string()), // Optional bind immediately
		receiveReportEmails: v.optional(v.boolean()),
		slug: v.optional(v.string()), // Unique username for URL profile
	},
	handler: async (ctx, args) => {
		const username = normalizeEmail(args.username);
		const homePin = normalizeHomePin(args.homePin);
		const slug = normalizeSlug(args.slug || username.split("@")[0]);

		if (!isValidEmail(username)) {
			throw new Error("Username harus berupa email yang valid");
		}
		if (homePin && !isValidHomePin(homePin)) {
			throw new Error("PIN akses home harus 6 digit angka");
		}

		// Uniqueness checks
		const existing = await ctx.db
			.query("users")
			.withIndex("by_username", (q) => q.eq("username", username))
			.first();
		if (existing) {
			throw new Error("Username already taken");
		}

		const existingSlug = await ctx.db
			.query("users")
			.withIndex("by_slug", (q) => q.eq("slug", slug))
			.first();
		if (existingSlug) {
			throw new Error("Username profil (slug) sudah dipakai pengguna lain");
		}

		if (homePin) {
			const pinOwner = await ctx.db
				.query("users")
				.withIndex("by_homePin", (q) => q.eq("homePin", homePin))
				.first();
			if (pinOwner) {
				throw new Error("PIN akses home sudah dipakai pengguna lain");
			}
		}

		return await ctx.db.insert("users", {
			...args,
			username,
			homePin,
			slug,
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
		homePin: v.optional(v.string()),
		name: v.optional(v.string()),
		roleId: v.optional(v.id("roles")),
		isActive: v.optional(v.boolean()),
		receiveReportEmails: v.optional(v.boolean()),
		password: v.optional(v.string()),
		authUserId: v.optional(v.string()),
		faceDescriptor: v.optional(v.array(v.number())),
		slug: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { id, username, ...updates } = args;
		const nextUpdates: Record<string, unknown> = { ...updates };
		const homePin =
			typeof updates.homePin === "string"
				? normalizeHomePin(updates.homePin)
				: undefined;

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

		if (args.slug !== undefined) {
			const normalizedSlugStr = normalizeSlug(args.slug);
			const existingSlug = await ctx.db
				.query("users")
				.withIndex("by_slug", (q) => q.eq("slug", normalizedSlugStr))
				.first();

			if (existingSlug && existingSlug._id !== id) {
				throw new Error("Username profil (slug) sudah dipakai pengguna lain");
			}
			nextUpdates.slug = normalizedSlugStr;
		}

		if (updates.homePin !== undefined) {
			if (homePin && !isValidHomePin(homePin)) {
				throw new Error("PIN akses home harus 6 digit angka");
			}
			if (homePin) {
				const pinOwner = await ctx.db
					.query("users")
					.withIndex("by_homePin", (q) => q.eq("homePin", homePin))
					.first();
				if (pinOwner && pinOwner._id !== id) {
					throw new Error("PIN akses home sudah dipakai pengguna lain");
				}
			}
			nextUpdates.homePin = homePin;
		}

		return await ctx.db.patch(id, nextUpdates);
	},
});

export const verifyHomePin = mutation({
	args: {
		pinCode: v.string(),
	},
	handler: async (ctx, args) => {
		const pinCode = normalizeHomePin(args.pinCode) ?? "";
		if (!isValidHomePin(pinCode)) {
			throw new Error("PIN harus terdiri dari 6 digit angka");
		}

		const user = await ctx.db
			.query("users")
			.withIndex("by_homePin", (q) => q.eq("homePin", pinCode))
			.first();

		if (!user || !user.isActive) {
			throw new Error("PIN tidak valid atau pengguna tidak aktif");
		}

		const role = await ctx.db.get(user.roleId);

		return {
			userId: user._id,
			name: user.name,
			role: role?.name || "user",
			faceDescriptor: user.faceDescriptor,
		};
	},
});

export const updateFaceDescriptor = mutation({
	args: {
		userId: v.id("users"),
		faceDescriptor: v.array(v.number()),
	},
	handler: async (ctx, args) => {
		const user = await ctx.db.get(args.userId);
		if (!user) throw new Error("User not found");
		
		return await ctx.db.patch(args.userId, {
			faceDescriptor: args.faceDescriptor,
		});
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

// Staff Profile Queries
export const getUserBySlug = query({
	args: { slug: v.string() },
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();
		
		if (!user || !user.isActive) return null;
		
		const role = await ctx.db.get(user.roleId);
		
		return {
			_id: user._id,
			name: user.name,
			slug: user.slug,
			roleName: role?.name || "Team",
			hasFace: !!user.faceDescriptor,
		};
	},
});

export const getPrivateStaffData = query({
	args: { 
		slug: v.string(),
		pin: v.optional(v.string()),
		token: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query("users")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();
		
		if (!user || !user.isActive) throw new Error("Staff tidak ditemukan");
		
		let isAuthorized = false;

		// 1. Check if token is provided and valid
		if (args.token) {
			const session = await validateSessionInternal(ctx, args.token);
			if (session) {
				const sessionRole = (await ctx.db.get(session.user.roleId)) as any;
				const isAdmin = sessionRole?.name?.toLowerCase() === "admin";
				const isOwner = session.user._id === user._id;
				
				if (isAdmin || isOwner) {
					isAuthorized = true;
				}
			}
		}

		// 2. Fallback to PIN if not authorized by token
		if (!isAuthorized) {
			if (!args.pin || user.homePin !== args.pin) {
				throw new Error("PIN salah atau akses tidak diizinkan");
			}
			isAuthorized = true;
		}

		if (!isAuthorized) throw new Error("Akses ditolak");
		
		// Return sensitive data
		return {
			name: user.name,
			username: user.username,
			roleId: user.roleId,
			receiveReportEmails: user.receiveReportEmails,
			lastLogin: user.lastLogin,
			attendanceSummary: {
				totalHoursThisMonth: 0, // Placeholder
				lastAction: "none", // Placeholder
			},
			payslipHistory: [
				{ id: "1", period: "Maret 2026", amount: 0, status: "pending" },
			],
		};
	},
});

// Migration helper
export const backfillSlugs = mutation({
	args: {},
	handler: async (ctx) => {
		const users = await ctx.db.query("users").collect();
		let count = 0;
		for (const user of users) {
			if (!user.slug) {
				const slug = normalizeSlug(user.username.split("@")[0]);
				await ctx.db.patch(user._id, { slug });
				count++;
			}
		}
		return `Backfilled ${count} users with slugs`;
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

/**
 * Unified Yumi Auth Functions
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

		const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
		const sessionExpiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

		await ctx.db.insert("yumiSessions", {
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

export const validateSession = query({
	args: { token: v.optional(v.string()) },
	handler: async (ctx, args) => {
		if (!args.token) return null;
		
		const result = await validateSessionInternal(ctx, args.token);
		if (!result) return null;

		const { user, session } = result;
		const role = (await ctx.db.get(user.roleId)) as any;

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

export const enrollFace = mutation({
	args: { 
		userId: v.id("users"), 
		pin: v.string(), 
		faceDescriptor: v.array(v.number()) 
	},
	handler: async (ctx, args) => {
		const user = await ctx.db.get(args.userId);
		if (!user || !user.isActive) throw new Error("User tidak ditemukan");
		
		if (user.homePin !== args.pin) {
			throw new Error("PIN salah. Pendaftaran wajah dibatalkan.");
		}

		await ctx.db.patch(args.userId, {
			faceDescriptor: args.faceDescriptor,
		});

		return { success: true };
	},
});

export const updatePin = mutation({
	args: { 
		token: v.string(), 
		newPin: v.string(),
		oldPin: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const sessionResult = await validateSessionInternal(ctx, args.token);
		if (!sessionResult) throw new Error("Sesi tidak valid atau telah berakhir");
		
		const { user } = sessionResult;
		
		if (args.oldPin && user.homePin !== args.oldPin) {
			throw new Error("PIN lama salah");
		}

		if (!isValidHomePin(args.newPin)) {
			throw new Error("PIN baru harus 6 digit angka");
		}

		await ctx.db.patch(user._id, {
			homePin: args.newPin,
		});

		return { success: true };
	},
});
