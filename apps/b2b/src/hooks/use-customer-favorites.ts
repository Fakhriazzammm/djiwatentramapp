import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/client";
import { useCustomerAuth } from "@/hooks/use-customer-auth";

const LOCAL_KEY = "djiwa-customer-favorites";

function loadLocal(): string[] {
	try {
		const raw = localStorage.getItem(LOCAL_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.map(String) : [];
	} catch {
		return [];
	}
}

function saveLocal(ids: string[]) {
	try {
		localStorage.setItem(LOCAL_KEY, JSON.stringify(ids));
	} catch {
		/* ignore */
	}
}

async function persistRemote(sourceId: string, ids: string[]) {
	try {
		const supabase = createClient();
		const doc = { sourceId, favoriteIds: ids, updatedAt: new Date().toISOString() };
		const { data: existing } = await supabase
			.schema("legacy_mirror")
			.from("documents")
			.select("document_id")
			.eq("table_name", "customerFavorites")
			.eq("document_id", sourceId)
			.maybeSingle();

		if (existing) {
			await supabase
				.schema("legacy_mirror")
				.from("documents")
				.update({ document: doc })
				.eq("table_name", "customerFavorites")
				.eq("document_id", sourceId);
		} else {
			await supabase
				.schema("legacy_mirror")
				.from("documents")
				.insert({
					table_name: "customerFavorites",
					document_id: sourceId,
					creation_time: Date.now(),
					document: doc,
				});
		}
	} catch (err) {
		console.warn("[customer-favorites] persist remote failed:", err);
	}
}

/**
 * Favorit menu:
 * - Guest  → localStorage per device (perilaku lama)
 * - Member → disinkronkan via legacy_mirror (customerFavorites per sourceId)
 *            sehingga sama di semua device member.
 */
export function useCustomerFavorites() {
	const { customer, isAuthenticated } = useCustomerAuth();
	const [favorites, setFavorites] = useState<string[]>([]);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		let active = true;
		async function load() {
			if (isAuthenticated && customer?.sourceId) {
				try {
					const supabase = createClient();
					const { data } = await supabase
						.schema("legacy_mirror")
						.from("documents")
						.select("document")
						.eq("table_name", "customerFavorites")
						.eq("document_id", customer.sourceId)
						.maybeSingle();
					const ids = Array.isArray(data?.document?.favoriteIds)
						? (data?.document?.favoriteIds as unknown[]).map(String)
						: [];
					if (active) setFavorites(ids);
				} catch {
					if (active) setFavorites(loadLocal());
				}
			} else {
				if (active) setFavorites(loadLocal());
			}
			if (active) setReady(true);
		}
		void load();
		return () => {
			active = false;
		};
	}, [isAuthenticated, customer?.sourceId]);

	const toggle = useCallback(
		(productId: string) => {
			setFavorites((prev) => {
				const next = prev.includes(productId)
					? prev.filter((id) => id !== productId)
					: [...prev, productId];
				if (isAuthenticated && customer?.sourceId) {
					void persistRemote(customer.sourceId, next);
				} else {
					saveLocal(next);
				}
				return next;
			});
		},
		[isAuthenticated, customer?.sourceId],
	);

	return { favorites, toggle, ready };
}
