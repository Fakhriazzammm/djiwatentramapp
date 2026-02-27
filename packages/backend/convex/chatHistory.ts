/**
 * AI Chat History - Persistent conversation storage per browser session
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Save a single chat message to history
 */
export const saveChatMessage = mutation({
	args: {
		sessionId: v.string(),
		role: v.union(v.literal("user"), v.literal("assistant")),
		content: v.string(),
		currentPage: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await ctx.db.insert("aiChatHistory", {
			sessionId: args.sessionId,
			role: args.role,
			content: args.content,
			createdAt: Date.now(),
			currentPage: args.currentPage,
		});
	},
});

/**
 * Get chat history for a session (most recent 50 messages)
 */
export const getChatHistory = query({
	args: {
		sessionId: v.string(),
	},
	handler: async (ctx, args) => {
		const messages = await ctx.db
			.query("aiChatHistory")
			.withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
			.order("asc")
			.take(50);
		return messages;
	},
});

/**
 * Clear all chat history for a session
 */
export const clearChatHistory = mutation({
	args: {
		sessionId: v.string(),
	},
	handler: async (ctx, args) => {
		const messages = await ctx.db
			.query("aiChatHistory")
			.withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
			.collect();
		for (const msg of messages) {
			await ctx.db.delete(msg._id);
		}
		return { deleted: messages.length };
	},
});
