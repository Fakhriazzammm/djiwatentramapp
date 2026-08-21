import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/client";

export type UseSupabaseLiveValueOptions = {
	realtimeSchemas?: string[];
	refreshMs?: number;
	refreshTrigger?: number;
	/** If provided, only listen to changes on these specific tables instead of all tables in the schema. */
	tables?: string[];
};

const hasSupabaseConfig = Boolean(
	import.meta.env.VITE_SUPABASE_URL &&
		import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

export function useSupabaseLiveValue<T>(
	key: string,
	load: () => Promise<T | null>,
	deps: readonly unknown[],
	options?: UseSupabaseLiveValueOptions
) {
	const [data, setData] = useState<T | null | undefined>(undefined);
	const reloadFnRef = useRef<() => Promise<void>>(async () => {});

	useEffect(() => {
		if (!hasSupabaseConfig) {
			setData(null);
			return;
		}

		const supabase = createClient();
		const schemas = options?.realtimeSchemas?.length
			? options.realtimeSchemas
			: ["public", "pos"];
		const refreshMs = Math.max(5000, options?.refreshMs ?? 30000);
		const channelName = `hybrid-live:${key}:${Math.random().toString(36).slice(2)}`;

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
				if (active) setData(next);
			} catch (error) {
				console.warn(`[supabase-hybrid:${key}]`, error);
				if (active) setData(null);
			} finally {
				inFlight = false;
				if (pendingReload && active) void reload();
			}
		};

		reloadFnRef.current = reload;
		void reload();

		let channel = supabase.channel(channelName);
		const tables = options?.tables;

		for (const schema of schemas) {
			if (tables?.length) {
				// Listen only to specific tables — prevents cascade reloads from unrelated table changes
				for (const table of tables) {
					channel = channel.on(
						"postgres_changes",
						{ event: "*", schema, table },
						() => { void reload(); }
					);
				}
			} else {
				channel = channel.on(
					"postgres_changes",
					{ event: "*", schema },
					() => { void reload(); }
				);
			}
		}
		channel.subscribe((status: string) => {
			if (status === "CHANNEL_ERROR") {
				console.warn(`[supabase-hybrid:${key}] realtime channel error`);
			}
		});

		const timer = window.setInterval(() => {
			void reload();
		}, refreshMs);

		return () => {
			active = false;
			window.clearInterval(timer);
			void supabase.removeChannel(channel);
		};
	}, [key, ...deps, options?.refreshTrigger]);
	return data;
}

export type LiveValueState<T> = {
	data: T | null;
	status: "loading" | "ready" | "error";
	error: Error | null;
	reload: () => Promise<void>;
};

export function useSupabaseLiveValueState<T>(
	key: string,
	load: () => Promise<T | null>,
	deps: readonly unknown[],
	options?: UseSupabaseLiveValueOptions
): LiveValueState<T> {
	const [data, setData] = useState<T | null>(null);
	const [status, setStatus] = useState<LiveValueState<T>["status"]>("loading");
	const [error, setError] = useState<Error | null>(null);
	const reloadRef = useRef<() => Promise<void>>(async () => {});
	const refreshTrigger = options?.refreshTrigger;

	useEffect(() => {
		let active = true;
		let inFlight = false;
		const reload = async () => {
			if (!active || inFlight) return;
			inFlight = true;
			setStatus((current) => (current === "ready" ? current : "loading"));
			try {
				const next = await load();
				if (!active) return;
				setData(next);
				setError(null);
				setStatus("ready");
			} catch (cause) {
				if (!active) return;
				const nextError = cause instanceof Error ? cause : new Error("Gagal memuat data");
				setError(nextError);
				setStatus("error");
			} finally {
				inFlight = false;
			}
		};
		reloadRef.current = reload;
		void reload();
		const timer = window.setInterval(() => void reload(), Math.max(5000, options?.refreshMs ?? 30000));
		return () => {
			active = false;
			window.clearInterval(timer);
		};
	}, [key, ...deps, refreshTrigger]);

	return { data, status, error, reload: () => reloadRef.current() };
}
