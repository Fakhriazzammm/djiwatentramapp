import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { posPanelSearch, readPosPanel, type PosPanel } from "@/lib/pos-panels";

/** A panel is a navigation destination: reload restores it and phone Back closes it. */
export function usePosPanel() {
	const location = useLocation();
	const navigate = useNavigate();
	const panel = readPosPanel(location.searchStr);
	const ownedEntry = useRef<string | null>(null);
	const openPanel = useCallback((next: PosPanel | null) => {
		if (next === panel) return;
		if (!next && ownedEntry.current === location.href && window.history.length > 1) {
			ownedEntry.current = null;
			window.history.back();
			return;
		}
		const search = posPanelSearch(location.searchStr, next);
		// Replace one open panel with another so dismissing never reopens an old modal.
		void navigate({ to: "/menu", search, replace: Boolean(panel), state: { posPanel: true } } as any);
		ownedEntry.current = next && (!panel || ownedEntry.current) ? `/menu?${new URLSearchParams(search).toString()}` : null;
	}, [panel, location.href, location.searchStr, navigate]);
	return { panel, openPanel };
}
