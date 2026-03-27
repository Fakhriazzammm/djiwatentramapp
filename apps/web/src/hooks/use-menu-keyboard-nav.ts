/**
 * useMenuKeyboardNav - Comprehensive keyboard navigation for POS Menu page
 * 
 * Navigation hierarchy (from top to bottom):
 * 1. Header navigation (logo, back button, menu sidebar trigger)
 * 2. Category tabs (horizontal navigation)
 * 3. Product grid (2D grid navigation)
 * 4. Cart drawer/button (bottom)
 * 
 * Keys supported:
 * - Arrow Up/Down/Left/Right: Navigate between elements
 * - Tab/Shift+Tab: Navigate between sections
 * - Enter: Select/activate
 * - Escape: Go back/close modal
 * - Backspace: Remove item (when in cart context)
 * - Shift + Arrow: Category navigation
 * - /: Focus search
 * - F1: Focus header
 * - F2: Focus categories
 * - F3: Focus products
 * - F4: Open cart
 */

import { useEffect, useCallback, useRef, useState } from "react";

export type FocusZone = "header" | "categories" | "products" | "cart";

export interface MenuKeyboardNavConfig {
	// Product grid
	productCount: number;
	gridColumns: number;
	onProductSelect: (index: number) => void;
	onProductActivate: (index: number) => void;
	
	// Categories
	categoryCount: number;
	onCategorySelect: (index: number) => void;
	onCategoryChange: (direction: "left" | "right") => void;
	
	// Header
	onHeaderAction: (action: "menu" | "back" | "search" | string) => void;
	headerItemCount?: number;
	
	// Cart
	cartItemCount: number;
	onCartOpen: () => void;
	onCartClose: () => void;
	onCartItemRemove: (index: number) => void;
	
	// Focus management
	onFocusZoneChange: (zone: FocusZone) => void;
	
	// Enable/disable
	enabled?: boolean;
}

export interface MenuKeyboardNavReturn {
	focusZone: FocusZone;
	focusedIndex: number;
	focusedHeaderIndex: number;
	setFocusZone: (zone: FocusZone) => void;
	setFocusedIndex: (index: number) => void;
	isZoneFocused: (zone: FocusZone) => boolean;
}

export function useMenuKeyboardNav({
	productCount,
	gridColumns,
	onProductSelect,
	onProductActivate,
	categoryCount,
	onCategorySelect,
	onCategoryChange,
	onHeaderAction,
	cartItemCount,
	onCartOpen,
	onCartClose,
	onCartItemRemove,
	onFocusZoneChange,
	headerItemCount = 3,
	enabled = true,
}: MenuKeyboardNavConfig): MenuKeyboardNavReturn {
	const [focusZone, setFocusZone] = useState<FocusZone>("header");
	const [focusedIndex, setFocusedIndex] = useState(0);
	const [focusedCategoryIndex, setFocusedCategoryIndex] = useState(0);
	const [focusedHeaderIndex, setFocusedHeaderIndex] = useState(0);
	
	const isInputFocused = useRef(false);
	
	// Track if we're in an input
	const checkInputFocus = useCallback(() => {
		const activeElement = document.activeElement;
		return (
			activeElement instanceof HTMLInputElement ||
			activeElement instanceof HTMLTextAreaElement
		);
	}, []);
	
	// Handle zone changes
	const changeZone = useCallback((newZone: FocusZone) => {
		setFocusZone(newZone);
		setFocusedIndex(0);
		onFocusZoneChange(newZone);
	}, [onFocusZoneChange]);
	
	// Main keyboard handler
	useEffect(() => {
		if (!enabled) return;
		
		const handleKeyDown = (e: KeyboardEvent) => {
			// Check if we're in an input
			isInputFocused.current = checkInputFocus();
			
			// Allow certain keys even in input
			const isInput = isInputFocused.current;
			const allowInInput = ["Escape", "F1", "F2", "F3", "F4"];
			
			if (isInput && !allowInInput.includes(e.key)) {
				// In input mode, only handle allowed keys
				return;
			}
			
			switch (e.key) {
				// === FUNCTION KEYS - Zone shortcuts ===
				case "F1":
					e.preventDefault();
					changeZone("header");
					setFocusedHeaderIndex(0);
					break;
					
				case "F2":
					e.preventDefault();
					changeZone("categories");
					setFocusedCategoryIndex(0);
					break;
					
				case "F3":
					e.preventDefault();
					changeZone("products");
					setFocusedIndex(0);
					if (productCount > 0) {
						onProductSelect(0);
					}
					break;
					
				case "F4":
					e.preventDefault();
					onCartOpen();
					break;
				
				// === ARROW KEYS ===
				case "ArrowUp":
					e.preventDefault();
					handleArrowUp();
					break;
					
				case "ArrowDown":
					e.preventDefault();
					handleArrowDown();
					break;
					
				case "ArrowLeft":
					e.preventDefault();
					handleArrowLeft();
					break;
					
				case "ArrowRight":
					e.preventDefault();
					handleArrowRight();
					break;
				
				// === ACTION KEYS ===
				case "Enter":
					handleEnter(e.shiftKey);
					break;
					
				case "Escape":
					handleEscape();
					break;
					
				case "Backspace":
					if (!isInput && focusZone === "products") {
						// Could be used for quick remove from cart
						e.preventDefault();
					}
					break;
				
				// === SEARCH SHORTCUT ===
				case "/":
					if (!isInput) {
						e.preventDefault();
						onHeaderAction("search");
					}
					break;
					
				// === TAB - Zone cycling ===
				case "Tab":
					if (!e.shiftKey) {
						// Tab forward
						e.preventDefault();
						cycleZoneForward();
					} else {
						// Shift+Tab backward
						e.preventDefault();
						cycleZoneBackward();
					}
					break;
			}
		};
		
		// Arrow handlers based on current zone
		const handleArrowUp = () => {
			switch (focusZone) {
				case "header":
					// Already at top, do nothing
					break;
					
				case "categories":
					// Go up to header
					changeZone("header");
					setFocusedHeaderIndex(0);
					break;
					
				case "products":
					if (focusedIndex < gridColumns) {
						// At top row of products, go to categories
						changeZone("categories");
						setFocusedCategoryIndex(Math.min(focusedIndex, categoryCount - 1));
					} else {
						// Move up in grid
						const newIndex = focusedIndex - gridColumns;
						setFocusedIndex(newIndex);
						onProductSelect(newIndex);
					}
					break;
					
				case "cart":
					changeZone("products");
					setFocusedIndex(Math.max(0, productCount - 1));
					if (productCount > 0) {
						onProductSelect(Math.max(0, productCount - 1));
					}
					break;
			}
		};
		
		const handleArrowDown = () => {
			switch (focusZone) {
				case "header":
					// Go down to categories
					changeZone("categories");
					setFocusedCategoryIndex(0);
					break;
					
				case "categories":
					// Go down to products
					changeZone("products");
					setFocusedIndex(0);
					if (productCount > 0) {
						onProductSelect(0);
					}
					break;
					
				case "products":
					const newIndex = focusedIndex + gridColumns;
					if (newIndex >= productCount) {
						// At bottom row, go to cart if has items
						if (cartItemCount > 0) {
							changeZone("cart");
						}
					} else {
						setFocusedIndex(newIndex);
						onProductSelect(newIndex);
					}
					break;
					
				case "cart":
					// Already at bottom
					break;
			}
		};
		
		const handleArrowLeft = () => {
			switch (focusZone) {
				case "header":
					// Navigate header items (back, logo, menu)
					if (focusedHeaderIndex > 0) {
						setFocusedHeaderIndex(focusedHeaderIndex - 1);
					}
					break;
					
				case "categories":
					// Navigate categories left
					if (focusedCategoryIndex > 0) {
						const newIndex = focusedCategoryIndex - 1;
						setFocusedCategoryIndex(newIndex);
						onCategorySelect(newIndex);
						onCategoryChange("left");
					}
					break;
					
				case "products":
					if (focusedIndex > 0) {
						const newIndex = focusedIndex - 1;
						setFocusedIndex(newIndex);
						onProductSelect(newIndex);
					}
					break;
					
				case "cart":
					// No left navigation in cart button
					break;
			}
		};
		
		const handleArrowRight = () => {
			switch (focusZone) {
				case "header":
					// Navigate header items
					if (focusedHeaderIndex < headerItemCount - 1) {
						setFocusedHeaderIndex(focusedHeaderIndex + 1);
					}
					break;
					
				case "categories":
					// Navigate categories right
					if (focusedCategoryIndex < categoryCount - 1) {
						const newIndex = focusedCategoryIndex + 1;
						setFocusedCategoryIndex(newIndex);
						onCategorySelect(newIndex);
						onCategoryChange("right");
					}
					break;
					
				case "products":
					if (focusedIndex < productCount - 1) {
						const newIndex = focusedIndex + 1;
						setFocusedIndex(newIndex);
						onProductSelect(newIndex);
					}
					break;
					
				case "cart":
					// No right navigation in cart button
					break;
			}
		};
		
		// Enter handler
		const handleEnter = (shiftKey: boolean) => {
			switch (focusZone) {
				case "header":
					if (headerItemCount > 3) {
						// Custom header items navigation
						// Assuming 0 is logo (no action) and 1+ are sidebarMenuItems
						if (focusedHeaderIndex >= 1) {
							onHeaderAction(String(focusedHeaderIndex - 1)); // Pass index as string for now
						}
					} else {
						if (focusedHeaderIndex === 0) {
							onHeaderAction("back");
						} else if (focusedHeaderIndex === 1) {
							// Logo/title - no action
						} else if (focusedHeaderIndex === 2) {
							onHeaderAction("menu");
						}
					}
					break;
					
				case "categories":
					// Category already selected via arrows
					break;
					
				case "products":
					if (shiftKey) {
						// Shift+Enter: Open cart
						onCartOpen();
					} else if (focusedIndex >= 0) {
						onProductActivate(focusedIndex);
					}
					break;
					
				case "cart":
					onCartOpen();
					break;
			}
		};
		
		// Escape handler
		const handleEscape = () => {
			// Clear focus from inputs first
			if (document.activeElement instanceof HTMLElement) {
				document.activeElement.blur();
			}
			
			// Navigate up through zones
			switch (focusZone) {
				case "cart":
					changeZone("products");
					break;
				case "products":
					changeZone("categories");
					break;
				case "categories":
					changeZone("header");
					break;
				case "header":
					// Already at top, could close any open modals
					onCartClose();
					break;
			}
		};
		
		// Zone cycling with Tab
		const cycleZoneForward = () => {
			switch (focusZone) {
				case "header":
					changeZone("categories");
					break;
				case "categories":
					changeZone("products");
					if (productCount > 0) {
						onProductSelect(0);
					}
					break;
				case "products":
					if (cartItemCount > 0) {
						changeZone("cart");
					} else {
						changeZone("header");
					}
					break;
				case "cart":
					changeZone("header");
					break;
			}
		};
		
		const cycleZoneBackward = () => {
			switch (focusZone) {
				case "header":
					if (cartItemCount > 0) {
						changeZone("cart");
					} else {
						changeZone("products");
						if (productCount > 0) {
							onProductSelect(Math.max(0, productCount - 1));
						}
					}
					break;
				case "categories":
					changeZone("header");
					break;
				case "products":
					changeZone("categories");
					break;
				case "cart":
					changeZone("products");
					if (productCount > 0) {
						onProductSelect(Math.max(0, productCount - 1));
					}
					break;
			}
		};
		
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		enabled,
		focusZone,
		focusedIndex,
		focusedCategoryIndex,
		focusedHeaderIndex,
		productCount,
		gridColumns,
		categoryCount,
		cartItemCount,
		changeZone,
		checkInputFocus,
		onProductSelect,
		onProductActivate,
		onCategorySelect,
		onCategoryChange,
		onHeaderAction,
		onCartOpen,
		onCartClose,
	]);
	
	// Reset product index when product count changes
	useEffect(() => {
		if (focusedIndex >= productCount && productCount > 0) {
			setFocusedIndex(productCount - 1);
		}
	}, [productCount, focusedIndex]);
	
	const isZoneFocused = useCallback(
		(zone: FocusZone) => focusZone === zone,
		[focusZone]
	);
	
	return {
		focusZone,
		focusedIndex,
		focusedHeaderIndex,
		setFocusZone,
		setFocusedIndex,
		isZoneFocused,
	};
}