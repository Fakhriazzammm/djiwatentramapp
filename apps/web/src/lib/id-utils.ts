/**
 * Utility to create deterministic-ish source IDs for offline-first writes.
 */
export function makeSourceId(prefix: string) {
	const random =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID().replace(/-/g, "")
			: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
	return `${prefix}_${random.slice(0, 24)}`;
}
