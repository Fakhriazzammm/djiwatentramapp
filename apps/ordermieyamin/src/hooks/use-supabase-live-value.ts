import { useEffect, useRef, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/client";

export type UseSupabaseLiveValueOptions = {
	realtimeSchemas?: string[];
	refreshMs?: number;
	refreshTrigger?: number;
	/** Cache key for localStorage. When set, data is cached and rendered instantly on next load */
	cacheKey?: string;
	/** Cache TTL in ms (default: 5 minutes). Only used when cacheKey is set */
	cacheTtlMs?: number;
};


/** Shared channel registry — dedup WebSocket connections per schema set */
const sharedChannels = new Map<string, { refCount: number; unsubscribe: () => void }>();

function loadCache<T>(key: string, ttlMs: number): T | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const entry = JSON.parse(raw);
		if (Date.now() - entry.ts > ttlMs) {
			localStorage.removeItem(key);
			return null;
		}
		return entry.data as T;
	} catch {
		return null;
	}
}

function saveCache<T>(key: string, data: T) {
	try {
		localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
	} catch {
		// Silently ignore quota errors
	}
}

export function useSupabaseLiveValue<T>(
	key: string,
	load: () => Promise<T | null>,
	deps: readonly unknown[],
	options?: UseSupabaseLiveValueOptions
) {
	const [data, setData] = useState<T | null | undefined>(
		options?.cacheKey
			? loadCache<T>(options.cacheKey, options.cacheTtlMs ?? 300_000)
			: undefined
	);
	const reloadFnRef = useRef<() => Promise<void>>(async () => {});

	useEffect(() => {
		if (!isSupabaseConfigured()) {
			setData(null);
			return;
		}

		const supabase = createClient();
		const schemas = options?.realtimeSchemas?.length
			? options.realtimeSchemas
			: ["public", "pos"];
		// Increase polling interval for cached data — 5 minutes instead of 30s
		const refreshMs = options?.cacheKey
			? Math.max(300_000, options?.refreshMs ?? 300_000)
			: Math.max(5000, options?.refreshMs ?? 30000);
		const channelKey = schemas.sort().join(",");

		let active = true;
		let inFlight = false;
		let pendingReload = false;

		const reload = async () => {
			if (!active) return;
			if (inFlight) {
				pendingReload = true;
				return;
			}
			inFlight = true;
			pendingReload = false;
			try {
				const next = await load();
				if (active) {
					setData(next);
					if (options?.cacheKey && next !== null) {
						saveCache(options.cacheKey, next);
					}
				}
			} catch (error) {
				console.warn(`[supabase-hybrid:${key}]`, error);
				if (active) setData(null);
			} finally {
				inFlight = false;
				if (pendingReload && active) void reload();
			}
		};

		reloadFnRef.current = reload;

		// Only load from server if cache didn't provide data
		if (data === undefined) {
			void reload();
		} else {
			// Background refresh — don't block UI
			setTimeout(() => void reload(), 100);
		}

		// Share Realtime channels across hooks with same schema set
		let channelEntry = sharedChannels.get(channelKey);
		if (!channelEntry) {
			let channel = supabase.channel(`hybrid-shared:${channelKey}:${Math.random().toString(36).slice(2)}`);
			for (const schema of schemas) {
				channel = channel.on(
					"postgres_changes",
					{ event: "*", schema },
					() => {
						void reload();
					}
				);
			}
			channel.subscribe((status: string) => {
				if (status === "CHANNEL_ERROR") {
					console.warn(`[supabase-hybrid:${channelKey}] realtime channel error`);
				}
			});
			channelEntry = {
				refCount: 1,
				unsubscribe: () => {
					void supabase.removeChannel(channel);
				},
			};
			sharedChannels.set(channelKey, channelEntry);
		} else {
			channelEntry.refCount++;
		}

		const registeredChannel = channelEntry;
		if (!registeredChannel) return;

		// Only poll for non-cached data (cached data uses 5 min interval above)
		const timer = !options?.cacheKey
			? window.setInterval(() => void reload(), refreshMs)
			: undefined;

		return () => {
			active = false;
			if (timer) window.clearInterval(timer);

			registeredChannel.refCount--;
			if (registeredChannel.refCount <= 0) {
				registeredChannel.unsubscribe();
				sharedChannels.delete(channelKey);
			}
		};
	}, [key, ...deps, options?.refreshTrigger]);

	return data;
}

/** Alias for backward compatibility */
export { useSupabaseLiveValue as useSupabaseValue };
