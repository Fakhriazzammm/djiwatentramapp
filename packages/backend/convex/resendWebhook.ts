import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export const logEvent = internalMutation({
	args: {
		eventType: v.string(),
		emailId: v.optional(v.string()),
		webhookId: v.optional(v.string()),
		createdAt: v.optional(v.number()),
		signatureValid: v.boolean(),
		payload: v.any(),
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("resendWebhookEvents", {
			provider: "resend",
			eventType: args.eventType,
			emailId: args.emailId,
			webhookId: args.webhookId,
			createdAt: args.createdAt,
			receivedAt: Date.now(),
			signatureValid: args.signatureValid,
			payload: args.payload,
		});
	},
});

export const getRecentEvents = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("resendWebhookEvents")
			.withIndex("by_receivedAt")
			.order("desc")
			.take(50);
	},
});
