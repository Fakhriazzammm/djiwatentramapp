import { useEffect, useRef } from "react";
import { setDemoMode } from "../lib/utils/demo-mask";

/**
 * Scan all text nodes in the DOM for digits and add [data-mask] to their parents.
 * The CSS ".demo-mode [data-mask]" then blurs them via filter: blur(6px).
 */
function maskNumbersInDOM(root: HTMLElement) {
	const treeWalker = document.createTreeWalker(
		root,
		NodeFilter.SHOW_TEXT,
		{
			acceptNode(node) {
				// Only process text nodes that contain digits
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

	for (const node of textNodes) {
		const parent = node.parentElement;
		if (parent && !parent.hasAttribute("data-mask")) {
			parent.setAttribute("data-mask", "true");
		}
	}
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
};

/**
 * Hook to activate demo mode (number masking).
 * Uses a MutationObserver to automatically mask ALL numbers in the DOM
 * as they appear — no need to add data-mask to individual components.
 *
 * @example
 * const { role } = useYumiAuth();
 * useDemoMode(role?.name === "CLIENT_VIEWER");
 */
export function useDemoMode(isDemoViewer: boolean) {
	const observerRef = useRef<MutationObserver | null>(null);

	useEffect(() => {
		setDemoMode(isDemoViewer);

		if (isDemoViewer) {
			document.documentElement.classList.add("demo-mode");

			// Initial scan — mask all existing numbers
			maskNumbersInDOM(document.body);

			// Set up mutation observer for dynamic content (navigation, re-renders)
			const observer = new MutationObserver(() => {
				maskNumbersInDOM(document.body);
			});
			observer.observe(document.body, OBSERVER_CONFIG);
			observerRef.current = observer;
		} else {
			document.documentElement.classList.remove("demo-mode");

			// Remove all masks
			unmaskNumbersInDOM();

			// Disconnect observer
			if (observerRef.current) {
				observerRef.current.disconnect();
				observerRef.current = null;
			}
		}

		// Cleanup on unmount
		return () => {
			if (observerRef.current) {
				observerRef.current.disconnect();
				observerRef.current = null;
			}
		};
	}, [isDemoViewer]);
}
