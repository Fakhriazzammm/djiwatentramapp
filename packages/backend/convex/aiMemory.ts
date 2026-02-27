/**
 * AI Context & Memory System
 * Stores conversation context, user preferences, and follow-up tasks
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// CONVERSATION MEMORY
// ============================================

/**
 * Store conversation context for AI memory
 */
export const saveConversationContext = mutation({
	args: {
		sessionId: v.string(),
		role: v.union(v.literal("user"), v.literal("assistant")),
		content: v.string(),
		metadata: v.optional(
			v.object({
				imageAttached: v.optional(v.boolean()),
				actionTaken: v.optional(v.string()),
				entities: v.optional(v.array(v.string())), // Mentioned products, categories, etc.
			})
		),
	},
	handler: async (ctx, args) => {
		const timestamp = Date.now();
		await ctx.db.insert("conversationMemory", {
			sessionId: args.sessionId,
			role: args.role,
			content: args.content,
			metadata: args.metadata || {},
			timestamp,
		});
		return timestamp;
	},
});

/**
 * Get recent conversation context for a session
 */
export const getConversationContext = query({
	args: {
		sessionId: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const sessionId = args.sessionId || "default";
		const limit = args.limit || 20;

		const memories = await ctx.db
			.query("conversationMemory")
			.withIndex("by_session", (q) => q.eq("sessionId", sessionId))
			.order("desc")
			.take(limit);

		return memories.reverse(); // Return in chronological order
	},
});

/**
 * Create a new chat session
 */
export const createChatSession = mutation({
	args: {
		title: v.string(), // Initial title (usually first message or date)
	},
	handler: async (ctx, args) => {
		const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const now = Date.now();

		// Return session info without storing - session is created implicitly when first message is sent
		return {
			sessionId,
			title: args.title,
			createdAt: now,
		};
	},
});

/**
 * Get all chat sessions
 */
export const getChatSessions = query({
	args: {},
	handler: async (ctx) => {
		// Get all conversation memories
		const memories = await ctx.db
			.query("conversationMemory")
			.order("desc")
			.take(1000); // Get recent 1000 messages

		// Group by session and extract session info
		const sessionMap = new Map<string, any>();

		for (const memory of memories) {
			const sid = memory.sessionId;
			if (!sessionMap.has(sid)) {
				// Create session from first message
				sessionMap.set(sid, {
					sessionId: sid,
					title:
						memory.role === "user"
							? memory.content.slice(0, 30) + (memory.content.length > 30 ? "..." : "")
							: "Chat",
					createdAt: memory.timestamp,
					messageCount: 0,
				});
			}
			// Count all messages
			const session = sessionMap.get(sid);
			if (session) {
				session.messageCount = (session.messageCount || 0) + 1;
			}
		}

		// Convert to array and sort by createdAt desc
		const sessions = Array.from(sessionMap.values()).sort(
			(a, b) => b.createdAt - a.createdAt
		);

		// Only return sessions with messages
		return sessions.filter((s) => s.messageCount > 0);
	},
});

/**
 * Delete a chat session
 */
export const deleteChatSession = mutation({
	args: {
		sessionId: v.string(),
	},
	handler: async (ctx, args) => {
		// Delete all memories for this session
		const memories = await ctx.db
			.query("conversationMemory")
			.withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
			.collect();

		for (const memory of memories) {
			await ctx.db.delete(memory._id);
		}

		return { success: true, deletedCount: memories.length };
	},
});

/**
 * Get user preferences learned from conversations
 */
export const getUserPreferences = query({
	args: {},
	handler: async (ctx) => {
		const preferences = await ctx.db.query("userPreferences").unique();

		if (!preferences) {
			// Return default preferences
			return {
				reportFrequency: "weekly",
				notifyLowStock: true,
				notifyPendingOrders: true,
				suggestedCategories: ["makanan", "minuman", "operasional"],
				preferredCurrency: "IDR",
				businessHours: { start: 8, end: 22 },
			};
		}

		return preferences;
	},
});

/**
 * Update user preferences based on interactions
 */
export const updateUserPreference = mutation({
	args: {
		key: v.string(),
		value: v.any(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.query("userPreferences").unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				[args.key]: args.value,
				updatedAt: Date.now(),
			});
		} else {
			await ctx.db.insert("userPreferences", {
				[args.key]: args.value,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		}

		return { success: true };
	},
});

// ============================================
// FOLLOW-UP TASKS
// ============================================

/**
 * Create a follow-up task
 */
export const createFollowUpTask = mutation({
	args: {
		title: v.string(),
		description: v.string(),
		priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
		dueDate: v.optional(v.number()), // Timestamp
		category: v.union(
			v.literal("inventory"),
			v.literal("orders"),
			v.literal("finance"),
			v.literal("marketing"),
			v.literal("other")
		),
		actionType: v.union(
			v.literal("restock"),
			v.literal("follow_up"),
			v.literal("review"),
			v.literal("create"),
			v.literal("analyze")
		),
		actionData: v.optional(v.any()), // Data needed for the action
	},
	handler: async (ctx, args) => {
		const id = await ctx.db.insert("followUpTasks", {
			...args,
			status: "pending",
			createdAt: Date.now(),
		});
		return id;
	},
});

/**
 * Get pending follow-up tasks
 */
export const getPendingTasks = query({
	args: {
		category: v.optional(
			v.union(
				v.literal("inventory"),
				v.literal("orders"),
				v.literal("finance"),
				v.literal("marketing"),
				v.literal("other")
			)
		),
	},
	handler: async (ctx, args) => {
		let q = ctx.db
			.query("followUpTasks")
			.withIndex("by_status", (q) => q.eq("status", "pending"));

		if (args.category) {
			q = q.filter((f) => f.eq(f.field("category"), args.category));
		}

		const tasks = await q.order("asc").take(20);

		return tasks.map((t) => ({
			...t,
			isOverdue: t.dueDate !== undefined && t.dueDate < Date.now(),
		}));
	},
});

/**
 * Complete a follow-up task
 */
export const completeTask = mutation({
	args: {
		taskId: v.id("followUpTasks"),
		completedBy: v.optional(v.string()), // User ID or "ai"
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.taskId, {
			status: "completed",
			completedAt: Date.now(),
			completedBy: args.completedBy,
		});
		return { success: true };
	},
});

/**
 * Dismiss a follow-up task
 */
export const dismissTask = mutation({
	args: {
		taskId: v.id("followUpTasks"),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.taskId, {
			status: "dismissed",
			completedAt: Date.now(),
			dismissalReason: args.reason,
		});
		return { success: true };
	},
});

/**
 * Get AI suggestions based on pending tasks
 */
export const getTaskSuggestions = query({
	args: {},
	handler: async (ctx) => {
		const tasks = await ctx.db
			.query("followUpTasks")
			.withIndex("by_status", (q) => q.eq("status", "pending"))
			.take(10);

		// Group by priority
		const highPriority = tasks.filter((t) => t.priority === "high");
		const mediumPriority = tasks.filter((t) => t.priority === "medium");
		const lowPriority = tasks.filter((t) => t.priority === "low");

		return {
			total: tasks.length,
			high: highPriority.length,
			medium: mediumPriority.length,
			low: lowPriority.length,
			urgent: highPriority.filter((t) => t.dueDate && t.dueDate < Date.now())
				.length,
		};
	},
});

// ============================================
// AI LEARNING & PATTERNS
// ============================================

/**
 * Record user action for learning patterns
 */
export const recordUserAction = mutation({
	args: {
		action: v.string(), // e.g., "created_expense", "checked_stock"
		context: v.optional(
			v.object({
				category: v.optional(v.string()),
				amount: v.optional(v.number()),
				timeOfDay: v.optional(v.number()),
				dayOfWeek: v.optional(v.number()),
			})
		),
	},
	handler: async (ctx, args) => {
		await ctx.db.insert("userActionPatterns", {
			action: args.action,
			context: args.context || {},
			timestamp: Date.now(),
		});
		return { success: true };
	},
});

/**
 * Get action patterns for AI learning
 */
export const getActionPatterns = query({
	args: {
		actionType: v.optional(v.string()),
		days: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const days = args.days || 30;
		const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

		let q = ctx.db
			.query("userActionPatterns")
			.withIndex("by_timestamp", (q) => q.gte("timestamp", cutoff));

		if (args.actionType) {
			q = q.filter((f) => f.eq(f.field("action"), args.actionType));
		}

		const patterns = await q.collect();

		// Analyze patterns
		const byHour: Record<number, number> = {};
		const byDay: Record<number, number> = {};

		for (const p of patterns) {
			const hour = new Date(p.timestamp).getHours();
			const day = new Date(p.timestamp).getDay();

			byHour[hour] = (byHour[hour] || 0) + 1;
			byDay[day] = (byDay[day] || 0) + 1;
		}

		const peakHour = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0]?.[0];
		const peakDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0]?.[0];

		return {
			totalActions: patterns.length,
			peakHour: peakHour ? Number.parseInt(peakHour, 10) : undefined,
			peakDay: peakDay ? Number.parseInt(peakDay, 10) : undefined,
			commonActions: patterns.reduce((acc: any, p) => {
				acc[p.action] = (acc[p.action] || 0) + 1;
				return acc;
			}, {}),
		};
	},
});
