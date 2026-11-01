import { useEffect } from "react";

const FOCUSABLE_SELECTOR =
	'a[href], button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])';

export function useGlobalKeyboardNavigation() {
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Ignore if modifier keys are pressed (except Shift which we handle implicitly)
			if (e.ctrlKey || e.altKey || e.metaKey) return;

			// Don't interfere with existing specific hotkeys for the app, though we might need to be careful
			// If the active element is part of a custom component that handles its own keys, it might call stopPropagation.
			// Event listener is on window, so if stopPropagation is used by child, this won't fire. This is desired.

			const activeElement = document.activeElement as HTMLElement | null;

			const focusableElements = Array.from(
				document.querySelectorAll(FOCUSABLE_SELECTOR)
			).filter((el) => {
				const htmlEl = el as HTMLElement;
				// Filter out disabled, hidden, or non-visible elements
				return (
					!htmlEl.hasAttribute("disabled") &&
					htmlEl.getAttribute("aria-hidden") !== "true" &&
					htmlEl.offsetParent !== null &&
					window.getComputedStyle(htmlEl).visibility !== "hidden"
				);
			}) as HTMLElement[];

			if (focusableElements.length === 0) return;

			let currentIndex = activeElement
				? focusableElements.indexOf(activeElement)
				: -1;

			const moveFocus = (offset: number) => {
				if (currentIndex === -1) {
					// If nothing is focused, focus the first element on Down/Right, or last on Up/Left
					currentIndex = offset > 0 ? -1 : focusableElements.length;
				}
				let nextIndex = currentIndex + offset;
				if (nextIndex >= focusableElements.length) nextIndex = 0;
				if (nextIndex < 0) nextIndex = focusableElements.length - 1;

				const nextEl = focusableElements[nextIndex];
				if (nextEl) {
					nextEl.focus();
					e.preventDefault();
				}
			};

			const isInput =
				activeElement?.tagName === "INPUT" ||
				activeElement?.tagName === "TEXTAREA";
			const inputType = activeElement?.getAttribute("type");
			// Some inputs don't support selection properties
			const isTextBasedInput =
				isInput &&
				activeElement?.tagName === "INPUT" &&
				!["checkbox", "radio", "range", "button", "submit", "reset", "file"].includes(
					inputType || "text"
				);
			const isTextarea = activeElement?.tagName === "TEXTAREA";

			switch (e.key) {
				case "ArrowDown":
				case "ArrowRight":
					if ((isTextBasedInput || isTextarea) && e.key === "ArrowRight") {
						const input = activeElement as HTMLInputElement | HTMLTextAreaElement;
						// If user is editing text and not at the end, let normal right arrow work
						try {
							if (
								input.selectionEnd !== null &&
								input.value !== undefined &&
								input.selectionEnd !== input.value.length
							) {
								return; // allow normal behavior
							}
						} catch (err) {
							// fallback if selectionEnd throws on certain types (like number depending on browser)
						}
					}
					// Move to next focusable element
					moveFocus(1);
					break;

				case "ArrowUp":
				case "ArrowLeft":
					if ((isTextBasedInput || isTextarea) && e.key === "ArrowLeft") {
						const input = activeElement as HTMLInputElement | HTMLTextAreaElement;
						// If user is editing text and not at the beginning, let normal left arrow work
						try {
							if (input.selectionStart !== null && input.selectionStart !== 0) {
								return; // allow normal behavior
							}
						} catch (err) {
							// fallback
						}
					}
					// Move to previous focusable element
					moveFocus(-1);
					break;

				case "Enter":
					// Normal behavior for Enter on buttons and forms is good.
					// If we are focused on a custom div with tabindex (which isn't a button or link), we can trigger click
					if (
						activeElement &&
						!isInput &&
						activeElement.tagName !== "BUTTON" &&
						activeElement.tagName !== "A"
					) {
						activeElement.click();
					}
					break;

				case "Backspace":
					// If not in an input, prevent default so we don't accidentally navigate back in history if browsers still do that
					if (!isInput) {
						// Normally we don't want backspace to do anything weird if focus is on a button
					}
					break;

				default:
					break;
			}
		};

		// Use capture or bubble? Bubble is better so if a specific input prevents propagation, it doesn't trigger global navigation
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);
}
