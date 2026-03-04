/**
 * Scheduled Reports Management
 *
 * Handle automatic report generation and scheduling
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get all scheduled reports
export const getScheduledReports = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("scheduledReports").collect();
	},
});

// Create a scheduled report
export const createScheduledReport = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		reportType: v.union(
			v.literal("daily"),
			v.literal("weekly"),
			v.literal("monthly")
		),
		// Data yang akan di-report
		dataSources: v.array(
			v.object({
				type: v.union(
					v.literal("sales"),
					v.literal("inventory"),
					v.literal("finance"),
					v.literal("orders"),
					v.literal("products")
				),
				includeDetails: v.optional(v.boolean()),
			})
		),
		// Jadwal pengiriman report
		schedule: v.object({
			frequency: v.union(
				v.literal("daily"),
				v.literal("weekly"),
				v.literal("monthly")
			),
			hour: v.optional(v.number()), // Jam kirim (0-23)
			dayOfWeek: v.optional(v.number()), // Hari dalam minggu (0-6, 0=Senin)
			dayOfMonth: v.optional(v.number()), // Tanggal dalam bulan (1-31)
		}),
		// Format report
		format: v.union(v.literal("json"), v.literal("pdf"), v.literal("excel")),
		// Delivery method
		delivery: v.object({
			type: v.union(
				v.literal("email"),
				v.literal("download"),
				v.literal("webhook")
			),
			destination: v.string(), // Email, URL, atau webhook URL
		}),
		isActive: v.boolean(),
		startDate: v.optional(v.number()), // Timestamp mulai
		endDate: v.optional(v.number()), // Timestamp selesai (untuk report sekali jalan)
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("scheduledReports", {
			...args,
			createdAt: Date.now(),
			lastRun: undefined,
		});
	},
});

// Update scheduled report
export const updateScheduledReport = mutation({
	args: {
		id: v.id("scheduledReports"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		isActive: v.optional(v.boolean()),
		nextRunTime: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { id, ...updates } = args;
		await ctx.db.patch(id, updates);
	},
});

// Delete scheduled report
export const deleteScheduledReport = mutation({
	args: { id: v.id("scheduledReports") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});

// Update last run time
export const updateReportLastRun = mutation({
	args: {
		id: v.id("scheduledReports"),
		lastRun: v.number(),
		result: v.optional(v.string()), // Hasil generate report (JSON string)
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.id, {
			lastRun: args.lastRun,
			lastResult: args.result,
		});
	},
});

// Get report templates
export const getReportTemplates = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("reportTemplates").collect();
	},
});

// Save report template
export const saveReportTemplate = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		template: v.string(), // Template prompt untuk AI
		dataSources: v.array(v.string()), // sales, inventory, finance, dll
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert("reportTemplates", {
			...args,
			createdAt: Date.now(),
			isActive: true,
		});
	},
});

// Delete report template
export const deleteReportTemplate = mutation({
	args: { id: v.id("reportTemplates") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});
