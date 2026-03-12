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

		let qrisImage = settings.qrisImage;
		if (qrisImage && !qrisImage.startsWith("http")) {
			const url = await ctx.storage.getUrl(qrisImage);
			if (url) qrisImage = url;
		}

		return { ...settings, logoUrl, bannerUrl, qrisImage };
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
		qrisImage: v.optional(v.string()),
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

export const generateUploadUrl = mutation(async (ctx) => {
	return await ctx.storage.generateUploadUrl();
});

// ─── Products ─────────────────────────────────────────────────────────────────

export const getBookingProducts = query({
	args: { slug: v.string() },
	handler: async (ctx, args) => {
		const settings = await ctx.db
			.query("bookingSettings")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.first();

		const products: Doc<"products">[] = [];
		if (!settings?.featuredProductIds || settings.featuredProductIds.length === 0) {
			const allAvailable = await ctx.db
				.query("products")
				.filter((q) => q.eq(q.field("isAvailable"), true))
				.collect();
			products.push(...allAvailable);
		} else {
			for (const idString of settings.featuredProductIds) {
				try {
					const product = await ctx.db.get(idString as Id<"products">);
					if (product?.isAvailable) products.push(product);
				} catch (_e) {
					// ignore invalid IDs
				}
			}
		}

		return await Promise.all(
			products.map(async (p) => {
				if (p.image && !p.image.startsWith("http")) {
					const url = await ctx.storage.getUrl(p.image);
					if (url) return { ...p, image: url };
				}
				return p;
			})
		);
	},
});

// ─── Date Capacity ────────────────────────────────────────────────────────────

export const setDateCapacity = mutation({
	args: {
		slug: v.string(),
		date: v.string(),
		maxPeople: v.number(),
		maxTables: v.number(),
		peoplePerTable: v.number(),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("bookingDateCapacity")
			.withIndex("by_slug_date", (q) => q.eq("slug", args.slug).eq("date", args.date))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				maxPeople: args.maxPeople,
				maxTables: args.maxTables,
				peoplePerTable: args.peoplePerTable,
				notes: args.notes,
			});
		} else {
			await ctx.db.insert("bookingDateCapacity", args);
		}
	},
});

export const setBulkDateCapacity = mutation({
	args: {
		slug: v.string(),
		startDate: v.string(),
		endDate: v.string(),
		maxPeople: v.number(),
		maxTables: v.number(),
		peoplePerTable: v.number(),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { slug, startDate, endDate, maxPeople, maxTables, peoplePerTable, notes } = args;

		const start = new Date(startDate);
		const end = new Date(endDate);

		// Basic safety check: max 1 year
		const diffTime = Math.abs(end.getTime() - start.getTime());
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
		if (diffDays > 366) {
			throw new Error("Date range cannot exceed 1 year");
		}

		const currentDate = new Date(start);
		while (currentDate <= end) {
			const dateStr = currentDate.toISOString().split("T")[0];

			const existing = await ctx.db
				.query("bookingDateCapacity")
				.withIndex("by_slug_date", (q) => q.eq("slug", slug).eq("date", dateStr))
				.first();

			if (existing) {
				await ctx.db.patch(existing._id, {
					maxPeople,
					maxTables,
					peoplePerTable,
					notes,
				});
			} else {
				await ctx.db.insert("bookingDateCapacity", {
					slug,
					date: dateStr,
					maxPeople,
					maxTables,
					peoplePerTable,
					notes,
				});
			}

			currentDate.setDate(currentDate.getDate() + 1);
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

		const activeOrders = orders.filter((o) => o.bookingStatus !== "cancelled");
		const totalBookings = activeOrders.length;
		const bookedPeople = activeOrders.reduce((sum, o) => sum + (o.guestCount ?? 0), 0);
		const bookedTables = activeOrders.reduce((sum, o) => sum + (o.tableCount ?? 0), 0);

		const maxPeople = capacity?.maxPeople ?? 0;
		const maxTables = capacity?.maxTables ?? 0;
		const peoplePerTable = capacity?.peoplePerTable ?? 4;

		return {
			totalBookings,
			bookedPeople,
			bookedTables,
			maxPeople,
			maxTables,
			peoplePerTable,
			isAvailable: (maxPeople === 0 || bookedPeople < maxPeople) && (maxTables === 0 || bookedTables < maxTables),
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
		guestCount: v.number(),
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
		const { guestCount } = args;
		const capacity = await ctx.db
			.query("bookingDateCapacity")
			.withIndex("by_slug_date", (q) =>
				q.eq("slug", args.slug).eq("date", args.bookingDate)
			)
			.first();
		const peoplePerTable = capacity?.peoplePerTable ?? 4;
		const tableCount = Math.ceil(guestCount / peoplePerTable);

		if (capacity) {
			const { maxPeople, maxTables } = capacity;

			const existing = await ctx.db
				.query("bookingOrders")
				.withIndex("by_slug_date", (q) =>
					q.eq("slug", args.slug).eq("bookingDate", args.bookingDate)
				)
				.collect();
			
			const activeOrders = existing.filter((o) => o.bookingStatus !== "cancelled");
			const totalBookedPeople = activeOrders.reduce((sum, o) => sum + (o.guestCount ?? 0), 0);
			const totalBookedTables = activeOrders.reduce((sum, o) => sum + (o.tableCount ?? 0), 0);

			if (maxPeople > 0 && totalBookedPeople + guestCount > maxPeople) {
				throw new Error("Kapasitas orang untuk tanggal ini sudah habis");
			}
			if (maxTables > 0 && totalBookedTables + tableCount > maxTables) {
				throw new Error("Kapasitas meja untuk tanggal ini sudah habis");
			}
		}

		// Generate unique booking code
		const timestamp = Date.now();
		const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
		const bookingCode = `BK-${rand}${timestamp.toString(36).toUpperCase().slice(-3)}`;

		return await ctx.db.insert("bookingOrders", {
			...args,
			tableCount,
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
		startDate: v.optional(v.string()),
		endDate: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		let orders;
		if (args.date) {
			orders = await ctx.db
				.query("bookingOrders")
				.withIndex("by_slug_date", (q) =>
					q.eq("slug", args.slug).eq("bookingDate", args.date!)
				)
				.order("desc")
				.collect();
		} else if (args.startDate || args.endDate) {
			let q = ctx.db.query("bookingOrders").withIndex("by_slug_date", (q) => q.eq("slug", args.slug));
			if (args.startDate) q = q.filter((f) => f.gte(f.field("bookingDate"), args.startDate!));
			if (args.endDate) q = q.filter((f) => f.lte(f.field("bookingDate"), args.endDate!));
			orders = await q.order("desc").collect();
		} else {
			orders = await ctx.db
				.query("bookingOrders")
				.withIndex("by_slug", (q) => q.eq("slug", args.slug))
				.order("desc")
				.collect();
		}

		return await Promise.all(
			orders.map(async (order) => {
				if (order.paymentProofImage && !order.paymentProofImage.startsWith("http")) {
					const url = await ctx.storage.getUrl(order.paymentProofImage);
					if (url) {
						return { ...order, paymentProofImage: url };
					}
				}
				return order;
			})
		);
	},
});


export const uploadPaymentProof = mutation({
	args: {
		id: v.id("bookingOrders"),
		storageId: v.string(),
		transferredAmount: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { id, storageId, transferredAmount } = args;
		const booking = await ctx.db.get(id);
		if (!booking) throw new Error("Booking not found");

		// Record financial transaction if not already paid
		if (booking.paymentStatus !== "paid") {
			await ctx.db.insert("financialTransactions", {
				type: "income",
				amount: transferredAmount || booking.totalAmount,
				category: "Booking",
				description: `Booking #${booking.bookingCode} - ${booking.customerName} (QRIS/Transfer)`,
				date: Date.now(),
				paymentMethod: booking.paymentMethod,
				status: "completed",
				bookingOrderId: id,
			});
		}

		await ctx.db.patch(id, {
			paymentProofImage: storageId,
			transferredAmount,
			paymentStatus: "paid",
		});
	},
});

export const getMonthBookingSummary = query({
	args: { slug: v.string(), yearMonth: v.string() }, // "2024-03"
	handler: async (ctx, args) => {
		const start = `${args.yearMonth}-01`;
		const end = `${args.yearMonth}-31`; // Simplified end range

		const monthOrders = await ctx.db
			.query("bookingOrders")
			.withIndex("by_slug_date", (q) =>
				q.eq("slug", args.slug).gte("bookingDate", start).lte("bookingDate", end)
			)
			.collect();

		const monthCapacities = await ctx.db
			.query("bookingDateCapacity")
			.withIndex("by_slug_date", (q) =>
				q.eq("slug", args.slug).gte("date", start).lte("date", end)
			)
			.collect();

		const capMap: Record<string, { people: number; tables: number; perTable: number }> = {};
		monthCapacities.forEach((c) => {
			if (c.date) capMap[c.date] = { people: c.maxPeople, tables: c.maxTables, perTable: c.peoplePerTable };
		});

		const summary: Record<
			string,
			{ 
				count: number; 
				capacity: number; // For compatibility
				maxPeople: number;
				maxTables: number;
				peoplePerTable: number;
				bookedPeople: number;
				bookedTables: number;
				pending: number; 
				confirmed: number 
			}
		> = {};

		monthOrders.forEach((o) => {
			if (!o.bookingDate) return;
			if (!summary[o.bookingDate]) {
				const cap = capMap[o.bookingDate] || { people: 0, tables: 0, perTable: 4 };
				summary[o.bookingDate] = {
					count: 0,
					capacity: cap.people, // Use people as primary capacity for display
					maxPeople: cap.people,
					maxTables: cap.tables,
					peoplePerTable: cap.perTable,
					bookedPeople: 0,
					bookedTables: 0,
					pending: 0,
					confirmed: 0,
				};
			}
			if (o.bookingStatus !== "cancelled") {
				summary[o.bookingDate].count++;
				summary[o.bookingDate].bookedPeople += o.guestCount ?? 0;
				summary[o.bookingDate].bookedTables += o.tableCount ?? 0;
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
					bookingOrderId: id,
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

export const deleteBookingOrder = mutation({
	args: { id: v.id("bookingOrders") },
	handler: async (ctx, args) => {
		// Also delete associated financial transactions
		const transactions = await ctx.db
			.query("financialTransactions")
			.filter((q) => q.eq(q.field("bookingOrderId"), args.id))
			.collect();
		
		for (const tx of transactions) {
			await ctx.db.delete(tx._id);
		}

		await ctx.db.delete(args.id);
	},
});

export const patchBookingOrder = mutation({
	args: {
		id: v.id("bookingOrders"),
		customerName: v.optional(v.string()),
		customerPhone: v.optional(v.string()),
		customerEmail: v.optional(v.string()),
		notes: v.optional(v.string()),
		bookingDate: v.optional(v.string()),
		guestCount: v.optional(v.number()),
		totalAmount: v.optional(v.number()),
		paymentMethod: v.optional(v.string()),
		items: v.optional(v.array(
			v.object({
				productId: v.string(),
				name: v.string(),
				price: v.number(),
				quantity: v.number(),
			})
		)),
	},
	handler: async (ctx, args) => {
		const { id, ...updates } = args;
		const filteredUpdates = Object.fromEntries(
			Object.entries(updates).filter(([, val]) => val !== undefined)
		);
		
		if (updates.guestCount !== undefined) {
			const booking = await ctx.db.get(id);
			if (booking) {
				const capacity = await ctx.db
					.query("bookingDateCapacity")
					.withIndex("by_slug_date", (q) =>
						q.eq("slug", booking.slug).eq("date", updates.bookingDate || booking.bookingDate)
					)
					.first();
				const peoplePerTable = capacity?.peoplePerTable || 4;
				const tableCount = Math.ceil(updates.guestCount / peoplePerTable);
				(filteredUpdates as any).tableCount = tableCount;
			}
		}

		await ctx.db.patch(id, filteredUpdates);

		// If totalAmount or name updated, update financial transaction too
		const transactions = await ctx.db
			.query("financialTransactions")
			.filter((q) => q.eq(q.field("bookingOrderId"), id))
			.collect();
		
		for (const tx of transactions) {
			const txUpdates: any = {};
			if (updates.totalAmount !== undefined) txUpdates.amount = updates.totalAmount;
			if (updates.customerName !== undefined || updates.bookingDate !== undefined) {
				const current = await ctx.db.get(id);
				if (current) {
					txUpdates.description = `Booking #${current.bookingCode} - ${current.customerName} (${current.bookingDate})`;
				}
			}
			if (Object.keys(txUpdates).length > 0) {
				await ctx.db.patch(tx._id, txUpdates);
			}
		}
	},
});
