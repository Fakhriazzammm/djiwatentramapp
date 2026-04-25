import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/client";
import { _cacheInvalidationListeners } from "@/hooks/use-hybrid-pos-data";

const hasSupabaseConfig = Boolean(
	import.meta.env.VITE_SUPABASE_URL &&
		import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

function useSupabaseValue<T>(
	key: string,
	load: () => Promise<T | null>,
	deps: readonly unknown[]
) {
	const [data, setData] = useState<T | null>(null);
	const [fetchTrigger, setFetchTrigger] = useState(0);

	useEffect(() => {
		const refetch = () => setFetchTrigger((v) => v + 1);
		_cacheInvalidationListeners.add(refetch);
		return () => {
			_cacheInvalidationListeners.delete(refetch);
		};
	}, []);

	useEffect(() => {
		if (!hasSupabaseConfig) {
			setData(null);
			return;
		}

		let active = true;

		void (async () => {
			try {
				const next = await load();
				if (active) {
					setData(next);
				}
			} catch (error) {
				console.warn(`[supabase-hybrid:${key}] fallback disabled`, error);
				if (active) {
					setData(null);
				}
			}
		})();

		return () => {
			active = false;
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [...deps, fetchTrigger]);

	return data;
}

async function fetchGames(args: {
	brandSlug?: string;
	includeInactive?: boolean;
	limit?: number;
}) {
	const supabase = createClient();
	let query = supabase.from("pos_minigames").select("*");
	if (args.brandSlug) query = query.eq("brandSlug", args.brandSlug);

	const { data, error } = await query
		.order("createdAt", { ascending: false })
		.limit(Math.max(1, Math.min(args.limit ?? 100, 100)));
	if (error) throw error;

	const includeInactive = args.includeInactive ?? true;
	return (data ?? []).filter((game: any) =>
		includeInactive ? true : Boolean(game.isActive)
	);
}

async function fetchEntries(args: {
	gameId?: string;
	status?: "new" | "contacted" | "voucher_sent" | "invalid";
	limit?: number;
}) {
	const supabase = createClient();
	let query = supabase.from("pos_minigame_entries").select("*");
	if (args.gameId) query = query.eq("gameId", args.gameId);
	if (args.status) query = query.eq("contactStatus", args.status);

	const { data, error } = await query
		.order("createdAt", { ascending: false })
		.limit(Math.max(1, Math.min(args.limit ?? 300, 500)));

	if (error) throw error;
	return data ?? [];
}

async function fetchEntryStats(args: { gameId?: string }) {
	const entries = await fetchEntries({ gameId: args.gameId, limit: 500 });
	const stats = {
		total: entries.length,
		new: 0,
		contacted: 0,
		voucher_sent: 0,
		invalid: 0,
	} as Record<string, number>;

	for (const row of entries as any[]) {
		const status = String(row.contactStatus || "new");
		stats[status] = (stats[status] || 0) + 1;
	}

	return stats;
}

function isGameInSchedule(game: any, now: number) {
	if (game.startAt && now < Number(game.startAt)) return false;
	if (game.endAt && now > Number(game.endAt)) return false;
	return true;
}

function getEligiblePrizes(prizes: any[]) {
	return (Array.isArray(prizes) ? prizes : []).filter((prize: any) => {
		if (!prize?.isActive) return false;
		if (prize.stock === undefined || prize.stock === null) return true;
		const stock = Number(prize.stock ?? 0);
		const claimed = Number(prize.claimedCount ?? 0);
		return claimed < stock;
	});
}

async function fetchActiveGameByBrand(brandSlug: string) {
	const games = await fetchGames({
		brandSlug,
		includeInactive: false,
		limit: 20,
	});
	const now = Date.now();
	const activeGame = (games as any[]).find(
		(game: any) => Boolean(game.isActive) && isGameInSchedule(game, now)
	);

	if (!activeGame) return null;

	const prizes = getEligiblePrizes(activeGame.prizes).map((prize: any) => ({
		id: prize.id,
		label: prize.label,
		description: prize.description,
		color: prize.color,
		stock:
			prize.stock === undefined || prize.stock === null
				? undefined
				: Math.max(Number(prize.stock) - Number(prize.claimedCount ?? 0), 0),
	}));

	return {
		_id: activeGame._id,
		name: activeGame.name,
		slug: activeGame.slug,
		description: activeGame.description,
		spinDurationMs: Number(activeGame.spinDurationMs ?? 5200),
		thankYouMessage:
			activeGame.thankYouMessage ??
			"Terima kasih sudah bermain. Tim kami akan menghubungi Anda untuk hadiah/voucher.",
		requireUniqueContact: Boolean(activeGame.requireUniqueContact),
		maxSpinsPerContact: Number(activeGame.maxSpinsPerContact ?? 1),
		prizes,
	};
}

export function useHybridMiniGamesList(args?: {
	brandSlug?: string;
	includeInactive?: boolean;
	limit?: number;
}) {
	const supabaseData = useSupabaseValue(
		`minigames-list:${args?.brandSlug ?? "all"}:${args?.includeInactive ?? true}:${args?.limit ?? 100}`,
		() => fetchGames(args ?? {}),
		[args?.brandSlug, args?.includeInactive, args?.limit]
	);
	return supabaseData as any;
}

export function useHybridMiniGameEntries(args?: {
	gameId?: string;
	status?: "new" | "contacted" | "voucher_sent" | "invalid";
	limit?: number;
}) {
	const supabaseData = useSupabaseValue(
		`minigame-entries:${args?.gameId ?? "all"}:${args?.status ?? "all"}:${args?.limit ?? 300}`,
		() => fetchEntries(args ?? {}),
		[args?.gameId, args?.status, args?.limit]
	);
	return supabaseData as any;
}

export function useHybridMiniGameEntryStats(args?: { gameId?: string }) {
	const supabaseData = useSupabaseValue(
		`minigame-entry-stats:${args?.gameId ?? "all"}`,
		() => fetchEntryStats({ gameId: args?.gameId }),
		[args?.gameId]
	);
	return supabaseData as any;
}

export function useHybridActiveMiniGameByBrand(brandSlug: string) {
	const supabaseData = useSupabaseValue(
		`active-minigame:${brandSlug}`,
		() => fetchActiveGameByBrand(brandSlug),
		[brandSlug]
	);
	return supabaseData as any;
}

