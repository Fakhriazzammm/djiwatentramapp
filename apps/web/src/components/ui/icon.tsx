import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// ============================================
// ICON SIZES (Design System compliant)
// ============================================
export const iconSizes = {
	xs: "12px",
	sm: "14px",
	base: "16px",
	md: "18px",
	lg: "20px",
	xl: "24px",
	"2xl": "32px",
	"3xl": "40px",
	"4xl": "48px",
} as const;

export type IconSize = keyof typeof iconSizes;

// ============================================
// ICON WRAPPER COMPONENT
// ============================================
export interface IconWrapperProps extends HTMLAttributes<HTMLSpanElement> {
	/**
	 * Size of the icon wrapper (affects padding & layout)
	 * @default "md"
	 */
	size?: "xs" | "sm" | "md" | "lg" | "xl";

	/**
	 * Size of the icon itself
	 * @default "base"
	 */
	iconSize?: IconSize;

	/**
	 * Whether the wrapper should be circular
	 * @default false
	 */
	circular?: boolean;

	/**
	 * Variant of the wrapper
	 * @default "default"
	 */
	variant?:
		| "default"
		| "primary"
		| "secondary"
		| "ghost"
		| "danger"
		| "warning"
		| "success";
}

const variantStyles = {
	default: "bg-muted/10 text-foreground hover:bg-muted/20",
	primary: "bg-primary/10 text-primary hover:bg-primary/20",
	secondary: "bg-secondary/10 text-secondary-foreground hover:bg-secondary/20",
	ghost: "bg-transparent text-muted-foreground hover:bg-muted/10",
	danger: "bg-destructive/10 text-destructive hover:bg-destructive/20",
	warning: "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20",
	success: "bg-green-500/10 text-green-500 hover:bg-green-500/20",
} as const;

const sizeStyles = {
	xs: "p-1",
	sm: "p-1.5",
	md: "p-2",
	lg: "p-2.5",
	xl: "p-3",
} as const;

export const IconWrapper = forwardRef<HTMLSpanElement, IconWrapperProps>(
	(
		{
			className,
			size = "md",
			iconSize = "base",
			circular = false,
			variant = "default",
			children,
			...props
		},
		ref
	) => {
		return (
			<span
				className={cn(
					"inline-flex items-center justify-center transition-colors",
					sizeStyles[size],
					variantStyles[variant],
					circular && "rounded-full",
					!circular && "rounded-md",
					className
				)}
				ref={ref}
				style={{ fontSize: iconSizes[iconSize] }}
				{...props}
			>
				{children}
			</span>
		);
	}
);

IconWrapper.displayName = "IconWrapper";

// ============================================
// ACCESSIBLE ICON COMPONENT
// ============================================
export interface AccessibleIconProps extends HTMLAttributes<SVGElement> {
	/**
	 * Alt text for screen readers
	 */
	label: string;

	/**
	 * Size of the icon
	 * @default "base"
	 */
	size?: IconSize;

	/**
	 * Whether the icon is decorative only (hidden from screen readers)
	 * Note: If true, label is not used. Prefer using aria-label on parent.
	 * @default false
	 */
	decorative?: boolean;
}

export const AccessibleIcon = forwardRef<SVGSVGElement, AccessibleIconProps>(
	(
		{ className, label, size = "base", decorative = false, children, ...props },
		ref
	) => {
		return (
			<svg
				aria-hidden={decorative}
				aria-label={decorative ? undefined : label}
				className={cn("shrink-0", className)}
				fill="none"
				height={iconSizes[size]}
				ref={ref}
				role="img"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2"
				viewBox="0 0 24 24"
				width={iconSizes[size]}
				{...props}
			>
				{children}
			</svg>
		);
	}
);

AccessibleIcon.displayName = "AccessibleIcon";

// ============================================
// ICON BUTTON COMPONENT
// ============================================
export interface IconButtonProps extends HTMLAttributes<HTMLButtonElement> {
	/**
	 * Size of the button
	 * @default "md"
	 */
	size?: "xs" | "sm" | "md" | "lg" | "xl";

	/**
	 * Icon size
	 * @default "base"
	 */
	iconSize?: IconSize;

	/**
	 * Variant of the button
	 * @default "ghost"
	 */
	variant?:
		| "default"
		| "primary"
		| "secondary"
		| "ghost"
		| "danger"
		| "warning"
		| "success";

	/**
	 * Whether button is circular
	 * @default true
	 */
	circular?: boolean;

	/**
	 * Label for screen readers
	 */
	"aria-label": string;

	/**
	 * Loading state
	 */
	loading?: boolean;

	/**
	 * Disabled state
	 */
	disabled?: boolean;
}

const buttonVariantStyles = {
	default: "bg-muted/10 text-foreground hover:bg-muted/20 active:bg-muted/30",
	primary:
		"bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
	secondary:
		"bg-secondary text-secondary-foreground hover:bg-secondary/90 active:bg-secondary/80",
	ghost:
		"bg-transparent text-muted-foreground hover:bg-muted/10 active:bg-muted/20",
	danger:
		"bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
	warning: "bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700",
	success: "bg-green-500 text-white hover:bg-green-600 active:bg-green-700",
} as const;

const _buttonSizeStyles = {
	xs: "p-1.5",
	sm: "p-2",
	md: "p-2.5",
	lg: "p-3",
	xl: "p-3.5",
} as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
	(
		{
			className,
			size = "md",
			iconSize = "base",
			variant = "ghost",
			circular = true,
			children,
			loading = false,
			disabled,
			...props
		},
		ref
	) => {
		return (
			<button
				className={cn(
					"inline-flex items-center justify-center transition-all duration-150",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
					"disabled:pointer-events-none disabled:opacity-50",
					"active:scale-95",
					sizeStyles[size],
					buttonVariantStyles[variant],
					circular && "rounded-full",
					!circular && "rounded-md",
					loading && "animate-pulse",
					className
				)}
				disabled={disabled || loading}
				ref={ref}
				{...props}
			>
				<span className="shrink-0" style={{ fontSize: iconSizes[iconSize] }}>
					{loading ? <LoadingIcon /> : children}
				</span>
			</button>
		);
	}
);

IconButton.displayName = "IconButton";

// ============================================
// LOADING ICON
// ============================================
export const LoadingIcon = () => (
	<svg
		aria-label="Loading"
		className="animate-spin"
		fill="none"
		height="1em"
		role="img"
		stroke="currentColor"
		strokeLinecap="round"
		strokeLinejoin="round"
		strokeWidth="2"
		viewBox="0 0 24 24"
		width="1em"
		xmlns="http://www.w3.org/2000/svg"
	>
		<title>Loading</title>
		<path d="M21 12a9 9 0 1 1-6.219-8.56" />
	</svg>
);
