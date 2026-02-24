/**
 * ACCESSIBILITY UTILITIES & COMPONENTS
 *
 * Components dan utilities untuk meningkatkan accessibility (a11y).
 * Sesuai WCAG 2.1 AA standards.
 */

import { type HTMLAttributes, type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// ============================================
// SKIP LINKS
// ============================================

export interface SkipLinkProps extends HTMLAttributes<HTMLAnchorElement> {
	/**
	 * Target element ID to skip to
	 */
	target: string;

	/**
	 * Label for the skip link
	 * @default "Lanjut ke konten utama"
	 */
	label?: string;
}

export function SkipLink({
	target,
	label = "Lanjut ke konten utama",
	className,
	...props
}: SkipLinkProps) {
	return (
		<a
			className={cn(
				"sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4",
				"focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2",
				"focus:text-primary-foreground focus:shadow-lg",
				"focus:outline-none focus:ring-2 focus:ring-ring",
				className
			)}
			href={`#${target}`}
			{...props}
		>
			{label}
		</a>
	);
}

SkipLink.displayName = "SkipLink";

// ============================================
// VISUALLY HIDDEN (Screen Reader Only)
// ============================================

export interface VisuallyHiddenProps extends HTMLAttributes<HTMLSpanElement> {
	/**
	 * Content to be read by screen readers
	 */
	children: ReactNode;

	/**
	 * Whether to show on focus
	 * @default false
	 */
	focusable?: boolean;
}

export function VisuallyHidden({
	children,
	focusable = false,
	className,
	...props
}: VisuallyHiddenProps) {
	return (
		<span
			className={cn("sr-only", focusable && "focus:not-sr-ever", className)}
			{...props}
		>
			{children}
		</span>
	);
}

VisuallyHidden.displayName = "VisuallyHidden";

// ============================================
// LIVE REGION (ARIA Live)
// ============================================

export type LiveRegionPoliteness = "polite" | "assertive" | "off";

export interface LiveRegionProps extends HTMLAttributes<HTMLDivElement> {
	/**
	 * Politeness setting
	 * @default "polite"
	 */
	politeness?: LiveRegionPoliteness;

	/**
	 * Whether this is a live region for status updates
	 */
	role?: "status" | "alert";

	/**
	 * Content to announce
	 */
	children: ReactNode;
}

export function LiveRegion({
	politeness = "polite",
	role = "status",
	children,
	...props
}: LiveRegionProps) {
	return (
		<div aria-live={politeness} role={role} {...props}>
			{children}
		</div>
	);
}

LiveRegion.displayName = "LiveRegion";

// ============================================
// FOCUS TRAP (For Modals)
// ============================================

export interface FocusTrapProps {
	/**
	 * Whether trap is active
	 */
	active: boolean;

	/**
	 * Content to trap focus within
	 */
	children: ReactNode;
}

export function FocusTrap({ active, children }: FocusTrapProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const previousActiveElement = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!active) {
			return;
		}

		// Store previously focused element
		previousActiveElement.current = document.activeElement as HTMLElement;

		// Focus first focusable element
		const focusableElements =
			containerRef.current?.querySelectorAll<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);

		const firstElement = focusableElements?.[0];
		if (firstElement) {
			firstElement.focus();
		}

		// Handle tab key
		const handleTabKey = (e: KeyboardEvent) => {
			if (e.key !== "Tab") {
				return;
			}

			if (!focusableElements || focusableElements.length === 0) {
				return;
			}

			const elements = Array.from(focusableElements);
			const first = elements[0];
			const last = elements.at(-1);

			if (e.shiftKey) {
				if (document.activeElement === first) {
					e.preventDefault();
					last.focus();
				}
			} else if (document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		};

		document.addEventListener("keydown", handleTabKey);

		return () => {
			document.removeEventListener("keydown", handleTabKey);
			// Restore focus when trap is deactivated
			previousActiveElement.current?.focus();
		};
	}, [active]);

	return <div ref={containerRef}>{children}</div>;
}

FocusTrap.displayName = "FocusTrap";

// ============================================
// KEYBOARD NAVIGABLE CONTAINER
// ============================================

export interface KeyboardNavigableProps
	extends HTMLAttributes<HTMLFieldSetElement> {
	/**
	 * Orientation of navigation
	 * @default "both"
	 */
	orientation?: "horizontal" | "vertical" | "both";

	/**
	 * Navigation callback
	 */
	onNavigate?: (direction: "up" | "down" | "left" | "right") => void;

	/**
	 * Children to navigate
	 */
	children: ReactNode;
}

export function KeyboardNavigable({
	orientation = "both",
	onNavigate,
	children,
	className,
	...props
}: KeyboardNavigableProps) {
	const handleKeyDown = (e: React.KeyboardEvent<HTMLFieldSetElement>) => {
		const keyMap: Record<string, "up" | "down" | "left" | "right" | null> = {
			ArrowUp: orientation !== "horizontal" ? "up" : null,
			ArrowDown: orientation !== "horizontal" ? "down" : null,
			ArrowLeft: orientation !== "vertical" ? "left" : null,
			ArrowRight: orientation !== "vertical" ? "right" : null,
		};

		const direction = keyMap[e.key];
		if (direction) {
			e.preventDefault();
			onNavigate?.(direction);
		}
	};

	return (
		// biome-ignore lint/a11y/noNoninteractiveElementInteractions: fieldset needs keyboard navigation for accessibility
		<fieldset
			className={cn("outline-none", className)}
			onKeyDown={handleKeyDown}
			{...props}
		>
			{children}
		</fieldset>
	);
}

KeyboardNavigable.displayName = "KeyboardNavigable";

// ============================================
// ANNOUNCER (Toast-like announcements for screen readers)
// ============================================

export interface AnnouncerProps {
	/**
	 * Message to announce
	 */
	message: string;

	/**
	 * Politeness level
	 * @default "polite"
	 */
	politeness?: LiveRegionPoliteness;
}

export function Announcer({ message, politeness = "polite" }: AnnouncerProps) {
	return (
		<output aria-atomic="true" aria-live={politeness} className="sr-only">
			{message}
		</output>
	);
}

Announcer.displayName = "Announcer";

// ============================================
// ACCESSIBLE BUTTON WRAPPER
// ============================================

export interface AccessibleButtonProps
	extends HTMLAttributes<HTMLButtonElement> {
	/**
	 * Icon or content
	 */
	children: ReactNode;

	/**
	 * ARIA label (required if children is icon-only)
	 */
	"aria-label": string;

	/**
	 * Whether button is icon-only
	 */
	iconOnly?: boolean;
}

export function AccessibleButton({
	children,
	"aria-label": ariaLabel,
	iconOnly = false,
	className,
	...props
}: AccessibleButtonProps) {
	return (
		<button
			aria-label={ariaLabel}
			className={cn(
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				className
			)}
			{...props}
		>
			{iconOnly ? <span aria-hidden="true">{children}</span> : children}
		</button>
	);
}

AccessibleButton.displayName = "AccessibleButton";

// ============================================
// FOCUS MANAGEMENT HOOKS (Simple versions)
// ============================================

export function useFocusManagement() {
	const lastFocusedRef = useRef<HTMLElement | null>(null);

	const saveFocus = () => {
		lastFocusedRef.current = document.activeElement as HTMLElement;
	};

	const restoreFocus = () => {
		lastFocusedRef.current?.focus();
	};

	const focusFirst = (selector?: string) => {
		const element = selector
			? document.querySelector<HTMLElement>(selector)
			: document.querySelector<HTMLElement>(
					"button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
				);
		element?.focus();
	};

	return { saveFocus, restoreFocus, focusFirst };
}

// ============================================
// HEADING LEVEL INDICATOR
// ============================================

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
	/**
	 * Heading level
	 * @default 2
	 */
	level?: 1 | 2 | 3 | 4 | 5 | 6;

	/**
	 * Visual level (different from semantic level)
	 */
	visualLevel?: 1 | 2 | 3 | 4 | 5 | 6;

	/**
	 * Heading content
	 */
	children: ReactNode;
}

const visualStyles: Record<number, string> = {
	1: "text-4xl font-bold",
	2: "text-3xl font-bold",
	3: "text-2xl font-bold",
	4: "text-xl font-bold",
	5: "text-lg font-bold",
	6: "text-base font-bold",
};

export function Heading({
	level = 2,
	visualLevel,
	children,
	className,
	...props
}: HeadingProps) {
	const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
	const visualClass = visualStyles[visualLevel ?? level];

	return (
		<Tag className={cn(visualClass, className)} {...props}>
			{children}
		</Tag>
	);
}

Heading.displayName = "Heading";

// ============================================
// LANDMARK REGIONS
// ============================================

export interface MainProps extends HTMLAttributes<HTMLElement> {
	children: ReactNode;
}

export function Main({ children, ...props }: MainProps) {
	return <main {...props}>{children}</main>;
}

export interface NavigationProps extends HTMLAttributes<HTMLElement> {
	/**
	 * Label for navigation region
	 */
	label?: string;
	children: ReactNode;
}

export function Navigation({ label, children, ...props }: NavigationProps) {
	return (
		<nav aria-label={label} {...props}>
			{children}
		</nav>
	);
}

export interface AsideProps extends HTMLAttributes<HTMLElement> {
	/**
	 * Label for complementary content
	 */
	label?: string;
	children: ReactNode;
}

export function Aside({ label, children, ...props }: AsideProps) {
	return (
		<aside aria-label={label} {...props}>
			{children}
		</aside>
	);
}
