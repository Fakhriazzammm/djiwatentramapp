import { useEffect, useRef } from "react";
import { setDemoMode } from "../lib/utils/demo-mask";

/**
 * Scan all text nodes in the DOM for digits and add [data-mask] to their parents.
 * Uses requestAnimationFrame to run after React commits DOM updates.
 */
function maskNumbersInDOM() {
	const root = document.body;
	if (!root) return;

	const treeWalker = document.createTreeWalker(
		root,
		NodeFilter.SHOW_TEXT,
		{
			acceptNode(node) {
				if (node.textContent && /\d/.test(node.textContent)) {
					return NodeFilter.FILTER_ACCEPT;
				}
				return NodeFilter.FILTER_SKIP;
			},
		},
	);

	const textNodes: Text[] = [];
	let currentNode: Text | null;
	while ((currentNode = treeWalker.nextNode() as Text | null)) {
		textNodes.push(currentNode);
	}

	let masked = 0;
	for (const node of textNodes) {
		const parent = node.parentNode as HTMLElement | null;
		if (parent && !parent.hasAttribute("data-mask")) {
			parent.setAttribute("data-mask", "true");
			masked++;
		}
	}
}

/**
 * Schedule a DOM scan after React commits (via requestAnimationFrame).
 * This ensures all numbers are caught even after data loads.
 */
function scheduleScan() {
	requestAnimationFrame(() => {
		maskNumbersInDOM();
	});
}

/**
 * Remove all [data-mask] attributes from the DOM.
 */
function unmaskNumbersInDOM() {
	const masked = document.querySelectorAll("[data-mask]");
	for (const el of masked) {
		el.removeAttribute("data-mask");
	}
}

const OBSERVER_CONFIG = {
	childList: true,
	subtree: true,
	characterData: true,
};

/**
 * Hook to activate demo mode (number masking).
 * Uses MutationObserver + requestAnimationFrame to catch ALL numbers
 * even as content loads dynamically via API calls and re-renders.
 *
 * @example
 * const { role } = useYumiAuth();
 * useDemoMode(role?.name === "CLIENT_VIEWER");
 */
export function useDemoMode(isDemoViewer: boolean) {
	const observerRef = useRef<MutationObserver | null>(null);
	const timersRef = useRef<number[]>([]);

	useEffect(() => {
		setDemoMode(isDemoViewer);

		if (isDemoViewer) {
			document.documentElement.classList.add("demo-mode");

			// Initial scan after React commits DOM
			scheduleScan();

			// Backup scans with delays — catches async-loaded data (API calls, re-renders)
			const timers: number[] = [];
			timers.push(window.setTimeout(scheduleScan, 500));
			timers.push(window.setTimeout(scheduleScan, 1500));
			timers.push(window.setTimeout(scheduleScan, 3000));
			timersRef.current = timers;

			// MutationObserver for dynamic content
			const observer = new MutationObserver(() => {
				scheduleScan();
			});
			observer.observe(document.body, OBSERVER_CONFIG);
			observerRef.current = observer;
		} else {
			document.documentElement.classList.remove("demo-mode");
			unmaskNumbersInDOM();

			if (observerRef.current) {
				observerRef.current.disconnect();
				observerRef.current = null;
			}
			// Clear all scheduled scans
			for (const t of timersRef.current) {
				window.clearTimeout(t);
			}
			timersRef.current = [];
		}

		return () => {
			if (observerRef.current) {
				observerRef.current.disconnect();
				observerRef.current = null;
			}
			// Clear all scheduled scans
			for (const t of timersRef.current) {
				window.clearTimeout(t);
			}
			timersRef.current = [];
		};
	}, [isDemoViewer]);
}
