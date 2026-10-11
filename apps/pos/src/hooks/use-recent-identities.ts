import { useCallback, useEffect, useState } from "react";

/* Per-terminal memory of who logged in last, so a shift change is one tap
   instead of the same name typed again. The names here are already on the
   login screen (the roster is public to those screens) and nothing else is
   stored — no PIN, no token, no session. */
const PREFIX = "yumi.recentIdentities:";
const MAX = 3;

export type RecentIdentity = {
	id: string;
	name: string;
	slug?: string;
	initial: string;
};

function readStored(key: string): RecentIdentity[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(PREFIX + key);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter(
				(item): item is RecentIdentity =>
					Boolean(
						item &&
							typeof (item as RecentIdentity).id === "string" &&
							typeof (item as RecentIdentity).name === "string",
					),
			)
			.slice(0, MAX);
	} catch {
		return [];
	}
}

function writeStored(key: string, items: RecentIdentity[]) {
	try {
		window.localStorage.setItem(PREFIX + key, JSON.stringify(items));
	} catch {
		/* storage blocked or full — the chip row is a convenience, not a requirement */
	}
}

export function useRecentIdentities(key: string) {
	const [recent, setRecent] = useState<RecentIdentity[]>([]);

	useEffect(() => {
		setRecent(readStored(key));
	}, [key]);

	const remember = useCallback(
		(identity: RecentIdentity) => {
			setRecent((prev) => {
				const next = [identity, ...prev.filter((item) => item.id !== identity.id)].slice(0, MAX);
				writeStored(key, next);
				return next;
			});
		},
		[key],
	);

	return { recent, remember };
}
