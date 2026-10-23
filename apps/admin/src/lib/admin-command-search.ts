export interface AdminCommandItem {
	to: string;
	label: string;
	group: string;
	permission?: string;
	keywords?: string[];
}

export function filterCommandItems(
	items: readonly AdminCommandItem[],
	query: string,
	hasPermission: (permission?: string) => boolean,
): AdminCommandItem[] {
	const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	return items.filter((item) => {
		if (!hasPermission(item.permission)) return false;
		if (terms.length === 0) return true;
		const haystack = [item.label, item.group, ...(item.keywords ?? [])].join(" ").toLowerCase();
		return terms.every((term) => haystack.includes(term));
	});
}

export function formatSyncAge(lastSyncedAt: number, now: number): string {
	const seconds = Math.max(0, Math.round((now - lastSyncedAt) / 1000));
	if (seconds < 45) return "baru saja";
	if (seconds < 3600) return `${Math.round(seconds / 60)} menit lalu`;
	return `${Math.round(seconds / 3600)} jam lalu`;
}
