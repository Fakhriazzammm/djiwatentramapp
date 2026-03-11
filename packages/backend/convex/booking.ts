import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// ─── Settings ────────────────────────────────────────────────────────────────

export const getSettings = query({
	args: { slug: v.string() },
	handler: async (ctx, args) => {
		const settings = await ctx.db
			.query("bookingSettings")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		if (!settings) return null;

		let logoUrl = settings.logoUrl;
		if (logoUrl && !logoUrl.startsWith("http")) {
			const url = await ctx.storage.getUrl(logoUrl);
			if (url) logoUrl = url;
		}

		let bannerUrl = settings.bannerUrl;
		if (bannerUrl && !bannerUrl.startsWith("http")) {
			const url = await ctx.storage.getUrl(bannerUrl);
			if (url) bannerUrl = url;
		}

		return { ...settings, logoUrl, bannerUrl };
	},
});

export const updateSettings = mutation({
	args: {
		slug: v.string(),
		title: v.string(),
		description: v.optional(v.string()),
		logoUrl: v.optional(v.string()),
		bannerUrl: v.optional(v.string()),
		themeColor: v.optional(v.string()),
		socialLinks: v.optional(
			v.array(
				v.object({ platform: v.string(), url: v.string(), label: v.string() })
			)
		),
		featuredProductIds: v.optional(v.array(v.string())),
		paymentMethods: v.optional(v.array(v.string())),
		bankDetails: v.optional(v.string()),
		isActive: v.boolean(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("bookingSettings")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, args);
			return existing._id;
		}
		return await ctx.db.insert("bookingSettings", args);
	},
});

// ─── Products ─────────────────────────────────────────────────────────────────

export const getBookingProducts = query({
	args: { slug: v.string() },
	handler: async (ctx, args) => {
		const settings = await ctx.db
			.query("bookingSettings")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		if (!settings?.featuredProductIds || settings.featuredProductIds.length === 0) {
			return await ctx.db
				.query("products")
				.filter((q) => q.eq(q.field("isAvailable"), true))
				.collect();
		}

		const products: Doc<"products">[] = [];
		for (const idString of settings.featuredProductIds) {
			try {
				const product = await ctx.db.get(idString as Id<"products">);
				if (product?.isAvailable) products.push(product);
			} catch (_e) {
				// ignore invalid IDs
			}
		}
		return products;
	},
});

// ─── Date Capacity ────────────────────────────────────────────────────────────

export const setDateCapacity = mutation({
	args: {
		slug: v.string(),
		date: v.string(),
		maxCapacity: v.number(),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("bookingDateCapacity")
			.withIndex("by_slug_date", (q) => q.eq("slug", args.slug).eq("date", args.date))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				maxCapacity: args.maxCapacity,
				notes: args.notes,
			});
		} else {
			await ctx.db.insert("bookingDateCapacity", args);
		}
	},
});

export const getDateCapacities = query({
	args: { slug: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("bookingDateCapacity")
			.withIndex("by_slug_date", (q) => q.eq("slug", args.slug))
			.collect();
	},
});

export const getDateAvailability = query({
	args: { slug: v.string(), date: v.string() },
	handler: async (ctx, args) => {
		const capacity = await ctx.db
			.query("bookingDateCapacity")
			.withIndex("by_slug_date", (q) =>
				q.eq("slug", args.slug).eq("date", args.date)
			)
			.first();

		const orders = await ctx.db
			.query("bookingOrders")
			.withIndex("by_slug_date", (q) =>
				q.eq("slug", args.slug).eq("bookingDate", args.date)
			)
			.collect();

		const bookedCount = orders.filter((o) => o.bookingStatus !== "cancelled").length;
		const maxCapacity = capacity?.maxCapacity ?? 0; // 0 = no limit set

		return {
			bookedCount,
			maxCapacity,
			isAvailable: maxCapacity === 0 || bookedCount < maxCapacity,
			remaining: maxCapacity === 0 ? null : Math.max(0, maxCapacity - bookedCount),
		};
	},
});

// ─── Booking Orders ───────────────────────────────────────────────────────────

export const createBookingOrder = mutation({
	args: {
		slug: v.string(),
		customerName: v.string(),
		customerPhone: v.string(),
		customerEmail: v.string(),
		notes: v.optional(v.string()),
		bookingDate: v.string(),
		items: v.array(
			v.object({
				productId: v.string(),
				name: v.string(),
				price: v.number(),
				quantity: v.number(),
			})
		),
		totalAmount: v.number(),
		paymentMethod: v.string(),
	},
	handler: async (ctx, args) => {
		// Check date capacity
		const capacity = await ctx.db
			.query("bookingDateCapacity")
			.withIndex("by_slug_date", (q) =>
				q.eq("slug", args.slug).eq("date", args.bookingDate)
			)
			.first();

		if (capacity && capacity.maxCapacity > 0) {
			const existing = await ctx.db
				.query("bookingOrders")
				.withIndex("by_slug_date", (q) =>
					q.eq("slug", args.slug).eq("bookingDate", args.bookingDate)
				)
				.collect();
			const activeCount = existing.filter(
				(o) => o.bookingStatus !== "cancelled"
			).length;
			if (activeCount >= capacity.maxCapacity) {
				throw new Error("Tanggal ini sudah penuh");
			}
		}

		// Generate unique booking code
		const timestamp = Date.now();
		const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
		const bookingCode = `BK-${rand}${timestamp.toString(36).toUpperCase().slice(-3)}`;

		return await ctx.db.insert("bookingOrders", {
			...args,
			bookingCode,
			paymentStatus: "pending",
			bookingStatus: "pending",
			createdAt: timestamp,
		});
	},
});

export const getBookingOrders = query({
	args: {
		slug: v.string(),
		date: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const orders = await ctx.db
			.query("bookingOrders")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.order("desc")
			.collect();

		if (args.date) {
			return orders.filter((o) => o.bookingDate === args.date);
		}
		return orders;
	},
});

export const getMonthBookingSummary = query({
	args: { slug: v.string(), yearMonth: v.string() }, // "2024-03"
	handler: async (ctx, args) => {
		const allOrders = await ctx.db
			.query("bookingOrders")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.collect();

		const allCapacities = await ctx.db
			.query("bookingDateCapacity")
			.withIndex("by_slug_date", (q) => q.eq("slug", args.slug))
			.collect();

		const monthOrders = allOrders.filter((o) =>
			o.bookingDate.startsWith(args.yearMonth)
		);
		const monthCapacities = allCapacities.filter((c) =>
			c.date.startsWith(args.yearMonth)
		);

		const capMap: Record<string, number> = {};
		monthCapacities.forEach((c) => {
			capMap[c.date] = c.maxCapacity;
		});

		const summary: Record<
			string,
			{ count: number; capacity: number; pending: number; confirmed: number }
		> = {};

		monthOrders.forEach((o) => {
			if (!summary[o.bookingDate]) {
				summary[o.bookingDate] = {
					count: 0,
					capacity: capMap[o.bookingDate] ?? 0,
					pending: 0,
					confirmed: 0,
				};
			}
			if (o.bookingStatus !== "cancelled") {
				summary[o.bookingDate].count++;
				if (o.bookingStatus === "pending") summary[o.bookingDate].pending++;
				if (o.bookingStatus === "confirmed") summary[o.bookingDate].confirmed++;
			}
		});

		return summary;
	},
});

export const updateBookingStatus = mutation({
	args: {
		id: v.id("bookingOrders"),
		bookingStatus: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("confirmed"),
				v.literal("cancelled"),
				v.literal("completed")
			)
		),
		paymentStatus: v.optional(
			v.union(v.literal("pending"), v.literal("paid"), v.literal("cancelled"))
		),
	},
	handler: async (ctx, args) => {
		const { id, bookingStatus, paymentStatus } = args;

		// Auto-record financial transaction when payment is confirmed as paid
		if (paymentStatus === "paid") {
			const booking = await ctx.db.get(id);
			if (booking && booking.paymentStatus !== "paid") {
				await ctx.db.insert("financialTransactions", {
					type: "income",
					amount: booking.totalAmount,
					category: "Booking",
					description: `Booking #${booking.bookingCode} - ${booking.customerName} (${booking.bookingDate})`,
					date: Date.now(),
					paymentMethod: booking.paymentMethod,
					status: "completed",
				});
			}
		}

		const updates: Record<string, unknown> = {};
		if (bookingStatus !== undefined) updates.bookingStatus = bookingStatus;
		if (paymentStatus !== undefined) updates.paymentStatus = paymentStatus;
		await ctx.db.patch(id, updates);
	},
});

export const getBookingByCode = query({
	args: { bookingCode: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("bookingOrders")
			.withIndex("by_booking_code", (q) =>
				q.eq("bookingCode", args.bookingCode)
			)
			.first();
	},
});
