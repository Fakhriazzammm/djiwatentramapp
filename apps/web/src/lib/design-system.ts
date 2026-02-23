/**
 * TKM POS Design System
 *
 * Single source of truth untuk spacing, typography, colors,
 * dan design tokens lainnya.
 */

// ============================================
// SPACING SCALE (base unit: 4px)
// ============================================
export const spacing = {
	xs: "4px", // 0.25rem
	sm: "8px", // 0.5rem
	md: "16px", // 1rem
	lg: "24px", // 1.5rem
	xl: "32px", // 2rem
	"2xl": "48px", // 3rem
	"3xl": "64px", // 4rem
	"4xl": "96px", // 6rem
} as const;

export type Spacing = keyof typeof spacing;

// ============================================
// TYPOGRAPHY SCALE
// ============================================
export const typography = {
	xs: "0.75rem", // 12px
	sm: "0.875rem", // 14px
	base: "1rem", // 16px
	lg: "1.125rem", // 18px
	xl: "1.25rem", // 20px
	"2xl": "1.5rem", // 24px
	"3xl": "1.875rem", // 30px
	"4xl": "2.25rem", // 36px
	"5xl": "3rem", // 48px
	"6xl": "3.75rem", // 60px
} as const;

export type Typography = keyof typeof typography;

// ============================================
// LINE HEIGHTS
// ============================================
export const lineHeight = {
	none: "1",
	tight: "1.25",
	normal: "1.5",
	relaxed: "1.75",
	loose: "2",
} as const;

// ============================================
// BORDER RADIUS
// ============================================
export const borderRadius = {
	none: "0",
	sm: "0.25rem", // 4px
	base: "0.375rem", // 6px
	md: "0.5rem", // 8px
	lg: "0.75rem", // 12px
	xl: "1rem", // 16px
	"2xl": "1.5rem", // 24px
	full: "9999px",
} as const;

export type BorderRadius = keyof typeof borderRadius;

// ============================================
// SHADOWS
// ============================================
export const shadows = {
	xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
	sm: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
	base: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
	md: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
	lg: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
	xl: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
	inner: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
	none: "0 0 #0000",
} as const;

// ============================================
// Z-INDEX SCALE
// ============================================
export const zIndex = {
	base: "0",
	dropdown: "10",
	sticky: "20",
	fixed: "30",
	drawer: "40",
	modal: "50",
	popover: "60",
	tooltip: "70",
} as const;

// ============================================
// BREAKPOINTS (untuk referensi JS)
// ============================================
export const breakpoints = {
	sm: "640px",
	md: "768px",
	lg: "1024px",
	xl: "1280px",
	"2xl": "1536px",
} as const;

// ============================================
// TRANSITION DURATIONS
// ============================================
export const duration = {
	instant: "100ms",
	fast: "150ms",
	normal: "200ms",
	slow: "300ms",
	slower: "500ms",
} as const;

// ============================================
// EASING FUNCTIONS
// ============================================
export const easing = {
	linear: "linear",
	in: "cubic-bezier(0.4, 0, 1, 1)",
	out: "cubic-bezier(0, 0, 0.2, 1)",
	"in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
	bounce: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
} as const;

// ============================================
// TOUCH TARGET SIZES (Accessibility)
// ============================================
export const touchTarget = {
	min: "44px", // WCAG AA minimum
	comfortable: "48px",
	large: "56px",
} as const;

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get spacing value with optional multiplier
 */
export function space(key: Spacing, multiplier = 1): string {
	const value = Number.parseInt(spacing[key], 10);
	return `${value * multiplier}px`;
}

/**
 * Get typography value in rem
 */
export function type(key: Typography): string {
	return typography[key];
}

/**
 * Get border radius value
 */
export function radius(key: BorderRadius): string {
	return borderRadius[key];
}

/**
 * Get shadow value
 */
export function shadow(key: keyof typeof shadows): string {
	return shadows[key];
}

// ============================================
// DESIGN TOKENS FOR COMPONENTS
// ============================================

export const form = {
	inputHeight: {
		sm: "32px",
		md: "40px",
		lg: "48px",
	},
	inputPadding: {
		sm: "8px 12px",
		md: "10px 14px",
		lg: "12px 16px",
	},
} as const;

export const button = {
	minHeight: {
		xs: "28px",
		sm: "32px",
		md: "40px",
		lg: "48px",
		xl: "56px",
	},
	padding: {
		xs: "6px 12px",
		sm: "8px 16px",
		md: "10px 20px",
		lg: "12px 24px",
		xl: "16px 32px",
	},
} as const;

export const card = {
	padding: {
		sm: "12px",
		md: "16px",
		lg: "24px",
		xl: "32px",
	},
} as const;

// ============================================
// ANIMATION VARIANTS
// ============================================

export const animation = {
	// Fade variants
	fadeIn: {
		initial: { opacity: 0 },
		animate: { opacity: 1 },
		exit: { opacity: 0 },
	},
	// Slide variants
	slideUp: {
		initial: { opacity: 0, y: 20 },
		animate: { opacity: 1, y: 0 },
		exit: { opacity: 0, y: -20 },
	},
	slideDown: {
		initial: { opacity: 0, y: -20 },
		animate: { opacity: 1, y: 0 },
		exit: { opacity: 0, y: 20 },
	},
	slideLeft: {
		initial: { opacity: 0, x: 20 },
		animate: { opacity: 1, x: 0 },
		exit: { opacity: 0, x: -20 },
	},
	slideRight: {
		initial: { opacity: 0, x: -20 },
		animate: { opacity: 1, x: 0 },
		exit: { opacity: 0, x: 20 },
	},
	// Scale variants
	scaleIn: {
		initial: { opacity: 0, scale: 0.9 },
		animate: { opacity: 1, scale: 1 },
		exit: { opacity: 0, scale: 0.9 },
	},
	// Stagger children
	staggerContainer: {
		animate: {
			transition: {
				staggerChildren: 0.1,
			},
		},
	},
	staggerItem: {
		initial: { opacity: 0, y: 10 },
		animate: { opacity: 1, y: 0 },
	},
} as const;

// ============================================
// EXPORT ALL
// ============================================
export const designSystem = {
	spacing,
	typography,
	lineHeight,
	borderRadius,
	shadows,
	zIndex,
	breakpoints,
	duration,
	easing,
	touchTarget,
	form,
	button,
	card,
	animation,
} as const;

export default designSystem;
