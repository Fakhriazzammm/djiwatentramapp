import { useEffect, useState } from "react";

interface KeyboardNavigationProps {
	itemCount: number;
	onSelect: (index: number) => void;
	onEnter: (index: number) => void;
	onBackspace: (index: number) => void;
	onShiftArrow: (direction: "left" | "right") => void;
	onSearch: () => void;
	onCheckout: () => void;
	onEscape: () => void;
	gridColumns?: number;
	enabled?: boolean;
}

export function useKeyboardNavigation({
	itemCount,
	onSelect,
	onEnter,
	onBackspace,
	onShiftArrow,
	onSearch,
	onCheckout,
	onEscape,
	gridColumns = 4,
	enabled = true,
}: KeyboardNavigationProps) {
	const [selectedIndex, setSelectedIndex] = useState<number>(-1);

	// Reset index if itemCount changes (e.g. category change)
	useEffect(() => {
		setSelectedIndex(-1);
	}, [itemCount]);

	useEffect(() => {
		if (!enabled) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			// Don't trigger shortcuts if user is typing in an input,
			// except for Escape and Enter in some cases
			const isInput =
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement;
			const isSingleLineInput = e.target instanceof HTMLInputElement && !["textarea", "range"].includes(e.target.type);

			if (isInput) {
				// For single line inputs, allow Up/Down to fall through to navigation
				// (usually used to move between form fields)
				if (isSingleLineInput && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
					// Continue to switch
				} else if (e.key !== "Escape" && e.key !== "Enter" && e.key !== "Tab") {
					return;
				}
			}

			if (itemCount === 0 && !["/", "Escape", "Enter"].includes(e.key)) return;

			switch (e.key) {
				case "ArrowRight":
					e.preventDefault();
					if (e.shiftKey) {
						onShiftArrow("right");
					} else {
						setSelectedIndex((prev) => {
							const next = prev + 1 >= itemCount ? 0 : prev + 1;
							onSelect(next);
							return next;
						});
					}
					break;
				case "ArrowLeft":
					e.preventDefault();
					if (e.shiftKey) {
						onShiftArrow("left");
					} else {
						setSelectedIndex((prev) => {
							const next = prev - 1 < 0 ? itemCount - 1 : prev - 1;
							onSelect(next);
							return next;
						});
					}
					break;
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((prev) => {
						if (prev === -1) {
							onSelect(0);
							return 0;
						}
						let next = prev + gridColumns;
						if (next >= itemCount) {
							// If we can't go down, stay at the current index or wrap to top?
							// Let's wrap to the top same column
							next = prev % gridColumns;
						}
						onSelect(next);
						return next;
					});
					break;
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((prev) => {
						if (prev === -1) {
							onSelect(itemCount - 1);
							return itemCount - 1;
						}
						let next = prev - gridColumns;
						if (next < 0) {
							// Wrap to bottom same column
							const lastRowStart = Math.floor((itemCount - 1) / gridColumns) * gridColumns;
							next = lastRowStart + (prev % gridColumns);
							if (next >= itemCount) {
								next -= gridColumns;
							}
						}
						onSelect(next);
						return next;
					});
					break;
				case "Enter":
					if (e.shiftKey || e.altKey) {
						e.preventDefault();
						onCheckout();
					} else if (selectedIndex >= 0) {
						e.preventDefault();
						onEnter(selectedIndex);
					}
					break;
				case "Backspace":
					if (selectedIndex >= 0 && !isInput) {
						e.preventDefault();
						onBackspace(selectedIndex);
					}
					break;
				case "/":
					if (!isInput) {
						e.preventDefault();
						onSearch();
					}
					break;
				case "Escape":
					e.preventDefault();
					onEscape();
					setSelectedIndex(-1);
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		enabled,
		itemCount,
		selectedIndex,
		gridColumns,
		onSelect,
		onEnter,
		onBackspace,
		onShiftArrow,
		onSearch,
		onCheckout,
		onEscape,
	]);

	return { selectedIndex, setSelectedIndex };
}
