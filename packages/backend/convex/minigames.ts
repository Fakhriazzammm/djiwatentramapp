import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const entryStatusValidator = v.union(
	v.literal("new"),
	v.literal("contacted"),
	v.literal("voucher_sent"),
	v.literal("invalid")
);

const prizeInputValidator = v.object({
	id: v.optional(v.string()),
	label: v.string(),
	description: v.optional(v.string()),
	color: v.optional(v.string()),
	weight: v.number(),
	stock: v.optional(v.number()),
	voucherCode: v.optional(v.string()),
	isActive: v.boolean(),
});

type PrizeInput = {
	id?: string;
	label: string;
	description?: string;
	color?: string;
	weight: number;
	stock?: number;
	voucherCode?: string;
	isActive: boolean;
};

type GamePrize = Doc<"miniGames">["prizes"][number];

function normalizeText(value: string) {
	return value.trim();
}

function normalizeEmail(value: string) {
	return value.trim().toLowerCase();
}

function sanitizeSlug(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function sanitizePrizes(prizes: PrizeInput[], existing?: GamePrize[]) {
	const existingClaimMap = new Map<string, number>();
	if (existing) {
		for (const prize of existing) {
			existingClaimMap.set(prize.id, prize.claimedCount);
		}
	}

	const sanitized = prizes.map((prize, index) => {
		const normalizedId =
			prize.id && prize.id.trim().length > 0
				? prize.id.trim()
				: `prize-${Date.now()}-${index}`;
		const claimedCount = existingClaimMap.get(normalizedId) ?? 0;
		const stock =
			prize.stock === undefined || prize.stock === null
				? undefined
				: Math.max(0, Math.floor(prize.stock));
		return {
			id: normalizedId,
			label: normalizeText(prize.label),
			description: prize.description ? normalizeText(prize.description) : undefined,
			color: prize.color ? normalizeText(prize.color) : undefined,
			weight: Math.max(1, Math.floor(prize.weight)),
			stock,
			claimedCount: Math.max(0, claimedCount),
			voucherCode: prize.voucherCode ? normalizeText(prize.voucherCode) : undefined,
			isActive: Boolean(prize.isActive),
		};
	});

	if (sanitized.length < 2) {
		throw new Error("Minimal 2 hadiah untuk mini game roulette");
	}

	if (sanitized.some((p) => p.label.length === 0)) {
		throw new Error("Nama hadiah tidak boleh kosong");
	}

	const uniqueIds = new Set(sanitized.map((p) => p.id));
	if (uniqueIds.size !== sanitized.length) {
		throw new Error("ID hadiah harus unik");
	}

	return sanitized;
}

function isGameInSchedule(game: Doc<"miniGames">, now: number) {
	if (game.startAt && now < game.startAt) return false;
	if (game.endAt && now > game.endAt) return false;
	return true;
}

function getEligiblePrizes(prizes: GamePrize[]) {
	return prizes.filter((prize) => {
		if (!prize.isActive) return false;
		if (prize.stock === undefined) return true;
		return prize.claimedCount < prize.stock;
	});
}

function pickWeightedPrize(prizes: GamePrize[]) {
	const total = prizes.reduce((sum, prize) => sum + Math.max(1, prize.weight), 0);
	let randomValue = Math.random() * total;
	for (const prize of prizes) {
		randomValue -= Math.max(1, prize.weight);
		if (randomValue <= 0) {
			return prize;
		}
	}
	return prizes[prizes.length - 1];
}

function buildSpinAngle(winningIndex: number, segmentCount: number) {
	const segmentAngle = 360 / segmentCount;
	const segmentMidpoint = winningIndex * segmentAngle + segmentAngle / 2;
	const pointerOffset = (360 - segmentMidpoint) % 360;
	const extraTurns = 6 + Math.floor(Math.random() * 3);
	return extraTurns * 360 + pointerOffset;
}

export const listGames = query({
	args: {
		brandSlug: v.optional(v.string()),
		includeInactive: v.optional(v.boolean()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
		const includeInactive = args.includeInactive ?? true;

		const rows = args.brandSlug
			? await ctx.db
					.query("miniGames")
					.withIndex("by_brand_slug_and_created_at", (q) =>
						q.eq("brandSlug", normalizeText(args.brandSlug!))
					)
					.order("desc")
					.take(limit * 2)
			: await ctx.db.query("miniGames").withIndex("by_created_at").order("desc").take(limit * 2);

		return rows
			.filter((game) => includeInactive || game.isActive)
			.slice(0, limit);
	},
});

export const getActiveGameByBrand = query({
	args: {
		brandSlug: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const games = await ctx.db
			.query("miniGames")
			.withIndex("by_brand_slug_and_is_active", (q) =>
				q.eq("brandSlug", normalizeText(args.brandSlug)).eq("isActive", true)
			)
			.order("desc")
			.take(20);

		const activeGame = games.find((game) => isGameInSchedule(game, now));
		if (!activeGame) return null;

		const prizes = getEligiblePrizes(activeGame.prizes).map((prize) => ({
			id: prize.id,
			label: prize.label,
			description: prize.description,
			color: prize.color,
			stock:
				prize.stock === undefined
					? undefined
					: Math.max(prize.stock - prize.claimedCount, 0),
		}));

		return {
			_id: activeGame._id,
			name: activeGame.name,
			slug: activeGame.slug,
			description: activeGame.description,
			spinDurationMs: activeGame.spinDurationMs ?? 5200,
			thankYouMessage:
				activeGame.thankYouMessage ??
				"Terima kasih sudah bermain. Tim kami akan menghubungi Anda untuk hadiah/voucher.",
			requireUniqueContact: activeGame.requireUniqueContact,
			maxSpinsPerContact: activeGame.maxSpinsPerContact,
			prizes,
		};
	},
});

export const createGame = mutation({
	args: {
		brandSlug: v.string(),
		name: v.string(),
		slug: v.string(),
		description: v.optional(v.string()),
		isActive: v.boolean(),
		requireUniqueContact: v.boolean(),
		maxSpinsPerContact: v.number(),
		startAt: v.optional(v.number()),
		endAt: v.optional(v.number()),
		spinDurationMs: v.optional(v.number()),
		thankYouMessage: v.optional(v.string()),
		prizes: v.array(prizeInputValidator),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const brandSlug = normalizeText(args.brandSlug);
		const slug = sanitizeSlug(args.slug);
		if (!slug) throw new Error("Slug mini game tidak valid");

		const existing = await ctx.db
			.query("miniGames")
			.withIndex("by_brand_slug_and_slug", (q) =>
				q.eq("brandSlug", brandSlug).eq("slug", slug)
			)
			.take(1);

		if (existing.length > 0) {
			throw new Error("Slug mini game sudah digunakan pada brand ini");
		}

		return await ctx.db.insert("miniGames", {
			brandSlug,
			name: normalizeText(args.name),
			slug,
			description: args.description ? normalizeText(args.description) : undefined,
			isActive: args.isActive,
			requireUniqueContact: args.requireUniqueContact,
			maxSpinsPerContact: Math.max(1, Math.floor(args.maxSpinsPerContact)),
			startAt: args.startAt,
			endAt: args.endAt,
			spinDurationMs: args.spinDurationMs
				? Math.max(2500, Math.floor(args.spinDurationMs))
				: undefined,
			thankYouMessage: args.thankYouMessage
				? normalizeText(args.thankYouMessage)
				: undefined,
			prizes: sanitizePrizes(args.prizes),
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const updateGame = mutation({
	args: {
		id: v.id("miniGames"),
		brandSlug: v.string(),
		name: v.string(),
		slug: v.string(),
		description: v.optional(v.string()),
		isActive: v.boolean(),
		requireUniqueContact: v.boolean(),
		maxSpinsPerContact: v.number(),
		startAt: v.optional(v.number()),
		endAt: v.optional(v.number()),
		spinDurationMs: v.optional(v.number()),
		thankYouMessage: v.optional(v.string()),
		prizes: v.array(prizeInputValidator),
	},
	handler: async (ctx, args) => {
		const existingGame = await ctx.db.get(args.id);
		if (!existingGame) throw new Error("Mini game tidak ditemukan");

		const brandSlug = normalizeText(args.brandSlug);
		const slug = sanitizeSlug(args.slug);
		if (!slug) throw new Error("Slug mini game tidak valid");

		const duplicate = await ctx.db
			.query("miniGames")
			.withIndex("by_brand_slug_and_slug", (q) =>
				q.eq("brandSlug", brandSlug).eq("slug", slug)
			)
			.take(2);

		if (duplicate.some((game) => game._id !== args.id)) {
			throw new Error("Slug mini game sudah digunakan pada brand ini");
		}

		await ctx.db.patch(args.id, {
			brandSlug,
			name: normalizeText(args.name),
			slug,
			description: args.description ? normalizeText(args.description) : undefined,
			isActive: args.isActive,
			requireUniqueContact: args.requireUniqueContact,
			maxSpinsPerContact: Math.max(1, Math.floor(args.maxSpinsPerContact)),
			startAt: args.startAt,
			endAt: args.endAt,
			spinDurationMs: args.spinDurationMs
				? Math.max(2500, Math.floor(args.spinDurationMs))
				: undefined,
			thankYouMessage: args.thankYouMessage
				? normalizeText(args.thankYouMessage)
				: undefined,
			prizes: sanitizePrizes(args.prizes, existingGame.prizes),
			updatedAt: Date.now(),
		});

		return args.id;
	},
});

export const deleteGame = mutation({
	args: {
		id: v.id("miniGames"),
	},
	handler: async (ctx, args) => {
		const game = await ctx.db.get(args.id);
		if (!game) return null;

		let deletedCount = 0;
		while (deletedCount < 500) {
			const batch = await ctx.db
				.query("miniGameEntries")
				.withIndex("by_game_id", (q) => q.eq("gameId", args.id))
				.take(100);
			if (batch.length === 0) break;
			for (const row of batch) {
				await ctx.db.delete(row._id);
				deletedCount += 1;
			}
		}

		const remaining = await ctx.db
			.query("miniGameEntries")
			.withIndex("by_game_id", (q) => q.eq("gameId", args.id))
			.take(1);
		if (remaining.length > 0) {
			throw new Error("Data peserta terlalu banyak. Hapus bertahap sebelum hapus game.");
		}

		await ctx.db.delete(args.id);
		return args.id;
	},
});

export const spin = mutation({
	args: {
		gameId: v.id("miniGames"),
		fullName: v.string(),
		email: v.string(),
		whatsapp: v.string(),
		instagram: v.string(),
	},
	handler: async (ctx, args) => {
		const game = await ctx.db.get(args.gameId);
		if (!game || !game.isActive) {
			throw new Error("Mini game tidak aktif");
		}

		const now = Date.now();
		if (!isGameInSchedule(game, now)) {
			throw new Error("Mini game belum/sudah berakhir");
		}

		const fullName = normalizeText(args.fullName);
		const email = normalizeEmail(args.email);
		const whatsapp = normalizeText(args.whatsapp);
		const instagram = normalizeText(args.instagram).replace(/^@/, "");

		if (!fullName || !email || !whatsapp || !instagram) {
			throw new Error("Nama, email, WhatsApp, dan Instagram wajib diisi");
		}

		const emailEntries = await ctx.db
			.query("miniGameEntries")
			.withIndex("by_game_id_and_email", (q) =>
				q.eq("gameId", args.gameId).eq("email", email)
			)
			.take(50);

		const whatsappEntries = await ctx.db
			.query("miniGameEntries")
			.withIndex("by_game_id_and_whatsapp", (q) =>
				q.eq("gameId", args.gameId).eq("whatsapp", whatsapp)
			)
			.take(50);

		const uniqueEntryIds = new Set<string>();
		for (const row of emailEntries) uniqueEntryIds.add(row._id);
		for (const row of whatsappEntries) uniqueEntryIds.add(row._id);

		const totalSpinsByContact = uniqueEntryIds.size;
		if (
			game.requireUniqueContact &&
			totalSpinsByContact >= Math.max(1, game.maxSpinsPerContact)
		) {
			throw new Error("Kontak ini sudah mencapai batas spin");
		}

		const availablePrizes = getEligiblePrizes(game.prizes);
		if (availablePrizes.length === 0) {
			throw new Error("Hadiah saat ini habis. Coba lagi nanti.");
		}

		const winner = pickWeightedPrize(availablePrizes);
		const winnerIndex = availablePrizes.findIndex((prize) => prize.id === winner.id);
		const spinAngle = buildSpinAngle(
			Math.max(0, winnerIndex),
			Math.max(1, availablePrizes.length)
		);

		const nextPrizes = game.prizes.map((prize) => {
			if (prize.id !== winner.id) return prize;
			if (prize.stock === undefined) return prize;
			return {
				...prize,
				claimedCount: prize.claimedCount + 1,
			};
		});

		await ctx.db.patch(args.gameId, {
			prizes: nextPrizes,
			updatedAt: now,
		});

		const entryId = await ctx.db.insert("miniGameEntries", {
			gameId: args.gameId,
			brandSlug: game.brandSlug,
			fullName,
			email,
			whatsapp,
			instagram,
			prizeId: winner.id,
			prizeLabel: winner.label,
			voucherCode: winner.voucherCode,
			spinAngle,
			contactStatus: "new",
			createdAt: now,
			updatedAt: now,
		});

		return {
			entryId,
			prizeId: winner.id,
			prizeLabel: winner.label,
			prizeDescription: winner.description,
			voucherCode: winner.voucherCode,
			spinAngle,
			thankYouMessage:
				game.thankYouMessage ??
				"Data kamu sudah kami simpan. Tim marketing akan menghubungi lewat kontak yang kamu isi.",
			spinDurationMs: game.spinDurationMs ?? 5200,
		};
	},
});

export const listEntries = query({
	args: {
		gameId: v.optional(v.id("miniGames")),
		status: v.optional(entryStatusValidator),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = Math.min(Math.max(args.limit ?? 200, 1), 500);

		const rows = args.gameId
			? await ctx.db
					.query("miniGameEntries")
					.withIndex("by_game_id_and_created_at", (q) => q.eq("gameId", args.gameId!))
					.order("desc")
					.take(limit * 2)
			: await ctx.db
					.query("miniGameEntries")
					.withIndex("by_created_at")
					.order("desc")
					.take(limit * 2);

		return rows
			.filter((entry) => (args.status ? entry.contactStatus === args.status : true))
			.slice(0, limit);
	},
});

export const createEntryManually = mutation({
	args: {
		gameId: v.id("miniGames"),
		fullName: v.string(),
		email: v.string(),
		whatsapp: v.string(),
		instagram: v.string(),
		prizeLabel: v.string(),
		voucherCode: v.optional(v.string()),
		contactStatus: entryStatusValidator,
		adminNotes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const game = await ctx.db.get(args.gameId);
		if (!game) throw new Error("Mini game tidak ditemukan");

		const now = Date.now();
		return await ctx.db.insert("miniGameEntries", {
			gameId: args.gameId,
			brandSlug: game.brandSlug,
			fullName: normalizeText(args.fullName),
			email: normalizeEmail(args.email),
			whatsapp: normalizeText(args.whatsapp),
			instagram: normalizeText(args.instagram).replace(/^@/, ""),
			prizeId: "manual-entry",
			prizeLabel: normalizeText(args.prizeLabel),
			voucherCode: args.voucherCode ? normalizeText(args.voucherCode) : undefined,
			spinAngle: 0,
			contactStatus: args.contactStatus,
			adminNotes: args.adminNotes ? normalizeText(args.adminNotes) : undefined,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const updateEntry = mutation({
	args: {
		id: v.id("miniGameEntries"),
		fullName: v.optional(v.string()),
		email: v.optional(v.string()),
		whatsapp: v.optional(v.string()),
		instagram: v.optional(v.string()),
		prizeLabel: v.optional(v.string()),
		voucherCode: v.optional(v.string()),
		contactStatus: v.optional(entryStatusValidator),
		adminNotes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const entry = await ctx.db.get(args.id);
		if (!entry) throw new Error("Data peserta tidak ditemukan");

		await ctx.db.patch(args.id, {
			fullName: args.fullName ? normalizeText(args.fullName) : undefined,
			email: args.email ? normalizeEmail(args.email) : undefined,
			whatsapp: args.whatsapp ? normalizeText(args.whatsapp) : undefined,
			instagram: args.instagram
				? normalizeText(args.instagram).replace(/^@/, "")
				: undefined,
			prizeLabel: args.prizeLabel ? normalizeText(args.prizeLabel) : undefined,
			voucherCode: args.voucherCode ? normalizeText(args.voucherCode) : undefined,
			contactStatus: args.contactStatus,
			adminNotes: args.adminNotes ? normalizeText(args.adminNotes) : undefined,
			updatedAt: Date.now(),
		});

		return args.id;
	},
});

export const deleteEntry = mutation({
	args: {
		id: v.id("miniGameEntries"),
	},
	handler: async (ctx, args) => {
		const entry = await ctx.db.get(args.id);
		if (!entry) return null;
		await ctx.db.delete(args.id);
		return args.id;
	},
});

export const getEntryStats = query({
	args: {
		gameId: v.optional(v.id("miniGames")),
	},
	handler: async (ctx, args) => {
		const entries = args.gameId
			? await ctx.db
					.query("miniGameEntries")
					.withIndex("by_game_id_and_created_at", (q) => q.eq("gameId", args.gameId!))
					.order("desc")
					.take(500)
			: await ctx.db.query("miniGameEntries").withIndex("by_created_at").order("desc").take(500);

		const statusCounts: Record<"new" | "contacted" | "voucher_sent" | "invalid", number> = {
			new: 0,
			contacted: 0,
			voucher_sent: 0,
			invalid: 0,
		};

		for (const row of entries) {
			statusCounts[row.contactStatus] += 1;
		}

		return {
			total: entries.length,
			...statusCounts,
		};
	},
});

