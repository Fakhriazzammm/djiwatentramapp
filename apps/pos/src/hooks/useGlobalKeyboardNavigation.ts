import { useEffect } from "react";

const FOCUSABLE_SELECTOR =
	'a[href], button, input, textarea, select, summary, [tabindex]:not([tabindex="-1"])';

// Native editors, ARIA composites and modal focus traps own their keyboard behavior.
const LOCAL_KEYBOARD_SELECTOR = [
	"input", "textarea", "select", '[contenteditable]:not([contenteditable="false"])',
	"dialog", '[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]',
	'[role="textbox"]', '[role="combobox"]', '[role="listbox"]', '[role="menu"]',
	'[role="menubar"]', '[role="tablist"]', '[role="tree"]', '[role="treegrid"]',
	'[role="grid"]', '[role="radiogroup"]', '[role="slider"]', '[role="spinbutton"]',
	'[role="toolbar"]', '[role="option"]', '[role="menuitem"]', '[role="tab"]',
	'[role="treeitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]',
	'[role="radio"]', '[role="gridcell"]', '[aria-haspopup]:not([aria-haspopup="false"])',
].join(", ");

export function handleGlobalNavigationKeyDown(e: KeyboardEvent) {
	if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
	if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) return;

	const activeElement = document.activeElement as HTMLElement | null;
	if (activeElement?.closest(LOCAL_KEYBOARD_SELECTOR)) return;
	// Do not move focus behind an open modal, even before its initial focus lands.
	if (document.querySelector('dialog[open], [aria-modal="true"]')) return;

	const focusableElements = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
		.filter((el) => !el.matches(':disabled, [aria-disabled="true"]') &&
			!el.closest('[hidden], [inert], [aria-hidden="true"]') &&
			el.tabIndex >= 0 && el.getClientRects().length > 0 &&
			window.getComputedStyle(el).visibility !== "hidden");
	if (!focusableElements.length) return;

	const offset = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
	let currentIndex = activeElement ? focusableElements.indexOf(activeElement) : -1;
	if (currentIndex === -1) currentIndex = offset > 0 ? -1 : focusableElements.length;
	const nextIndex = (currentIndex + offset + focusableElements.length) % focusableElements.length;
	focusableElements[nextIndex].focus();
	e.preventDefault();
}

export function useGlobalKeyboardNavigation() {
	useEffect(() => {
		window.addEventListener("keydown", handleGlobalNavigationKeyDown);
		return () => window.removeEventListener("keydown", handleGlobalNavigationKeyDown);
	}, []);
}
