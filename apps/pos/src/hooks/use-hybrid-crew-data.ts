import { useMemo } from "react";
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";
import { createClient } from "@/lib/client";
import { getWibDayRange } from "@/lib/wib-utils";

async function fetchCrewProductionToday() {
	const supabase = createClient();
	const { start, end } = getWibDayRange(Date.now());
	const { data, error } = await supabase
		.from("pos_order_status")
		.select("dibuat_by,selesai_by,group_type,created_at")
		.gte("created_at", new Date(start).toISOString())
		.lt("created_at", new Date(end).toISOString());
	if (error) throw error;
	return (data ?? []) as any[];
}

export function useHybridCrewProduction() {
	const raw = useSupabaseLiveValue(
		"crew-production:today",
		() => fetchCrewProductionToday(),
		[],
		{ tables: ["pos_order_status"] },
	);

	return useMemo(() => {
		if (raw === undefined) return undefined;
		const stats = new Map<
			string,
			{ name: string; dibuat: number; selesai: number; groupType: string }
		>();
		for (const row of raw ?? []) {
			if (row.dibuat_by) {
				const ex =
					stats.get(row.dibuat_by) ?? {
						name: row.dibuat_by,
						dibuat: 0,
						selesai: 0,
						groupType: row.group_type ?? "",
					};
				ex.dibuat += 1;
				stats.set(row.dibuat_by, ex);
			}
			if (row.selesai_by) {
				const ex =
					stats.get(row.selesai_by) ?? {
						name: row.selesai_by,
						dibuat: 0,
						selesai: 0,
						groupType: row.group_type ?? "",
					};
				ex.selesai += 1;
				stats.set(row.selesai_by, ex);
			}
		}
		return Array.from(stats.values()).sort(
			(a, b) => b.dibuat + b.selesai - (a.dibuat + a.selesai),
		);
	}, [raw]);
}
