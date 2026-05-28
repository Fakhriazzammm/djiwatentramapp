/**
 * LOADING STATE COMPONENTS
 *
 * Reusable loading states untuk skeleton screens, spinners, dll.
 */

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// ============================================
// SKELETON VARIANTS
// ============================================

interface BaseSkeletonProps extends HTMLAttributes<HTMLDivElement> {
	/**
	 * Width of the skeleton
	 */
	width?: string | number;

	/**
	 * Height of the skeleton
	 */
	height?: string | number;

	/**
	 * Whether to apply shimmer effect
	 * @default true
	 */
	shimmer?: boolean;

	/**
	 * Shape of the skeleton
	 * @default "rounded"
	 */
	shape?: "rounded" | "circle" | "square";
}

export function Skeleton({
	className,
	width,
	height,
	shimmer = true,
	shape = "rounded",
	...props
}: BaseSkeletonProps) {
	return (
		<div
			className={cn(
				"bg-muted",
				shimmer && "animate-pulse",
				shape === "circle" && "rounded-full",
				shape === "square" && "rounded-none",
				shape === "rounded" && "rounded-md",
				className
			)}
			style={{ width: width ?? "100%", height: height ?? "1em" }}
			{...props}
		/>
	);
}

Skeleton.displayName = "Skeleton";

// ============================================
// SHIMMER SKELETON (Enhanced version with gradient)
// ============================================

export function ShimmerSkeleton({
	className,
	width,
	height,
	shape = "rounded",
	...props
}: Omit<BaseSkeletonProps, "shimmer">) {
	return (
		<div
			className={cn(
				"relative overflow-hidden bg-muted",
				shape === "circle" && "rounded-full",
				shape === "square" && "rounded-none",
				shape === "rounded" && "rounded-md",
				className
			)}
			style={{ width: width ?? "100%", height: height ?? "1em" }}
			{...props}
		>
			<div className="absolute inset-0 -translate-x-full animate-shimmer">
				<div className="h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
			</div>
		</div>
	);
}

ShimmerSkeleton.displayName = "ShimmerSkeleton";

// ============================================
// SPINNER COMPONENT
// ============================================

export interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
	/**
	 * Size of the spinner
	 * @default "md"
	 */
	size?: "xs" | "sm" | "md" | "lg" | "xl";

	/**
	 * Color variant
	 * @default "primary"
	 */
	variant?: "primary" | "foreground" | "muted";

	/**
	 * Optional label to show next to spinner
	 */
	label?: string;

	/**
	 * Position of label relative to spinner
	 * @default "right"
	 */
	labelPosition?: "top" | "right" | "bottom" | "left";
}

const spinnerSizes = {
	xs: "h-3 w-3 border",
	sm: "h-4 w-4 border",
	md: "h-6 w-6 border-2",
	lg: "h-8 w-8 border-2",
	xl: "h-10 w-10 border-3",
} as const;

const spinnerColors = {
	primary: "border-primary border-t-transparent",
	foreground: "border-foreground border-t-transparent",
	muted: "border-muted-foreground border-t-transparent",
} as const;

export function Spinner({
	className,
	size = "md",
	variant = "primary",
	label,
	labelPosition = "right",
	...props
}: SpinnerProps) {
	const isVertical = labelPosition === "top" || labelPosition === "bottom";

	return (
		<div
			className={cn(
				"flex items-center gap-2",
				isVertical && "flex-col",
				labelPosition === "top" && "flex-col-reverse",
				className
			)}
			{...props}
		>
			<div
				className={cn(
					"animate-spin rounded-full",
					spinnerSizes[size],
					spinnerColors[variant]
				)}
			/>
			{label && <span className="text-muted-foreground text-sm">{label}</span>}
		</div>
	);
}

Spinner.displayName = "Spinner";

// ============================================
// SKELETON CARD (Product Card Skeleton)
// ============================================

export interface ProductCardSkeletonProps
	extends HTMLAttributes<HTMLDivElement> {
	/**
	 * Whether to show image placeholder
	 * @default true
	 */
	showImage?: boolean;

	/**
	 * Whether to show description
	 * @default true
	 */
	showDescription?: boolean;

	/**
	 * Whether to show price tag
	 * @default true
	 */
	showPrice?: boolean;
}

export function ProductCardSkeleton({
	className,
	showImage = true,
	showDescription = true,
	showPrice = true,
	...props
}: ProductCardSkeletonProps) {
	return (
		<div
			className={cn(
				"flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm",
				className
			)}
			{...props}
		>
			{showImage && (
				<div className="relative aspect-[4/3] bg-muted">
					<ShimmerSkeleton className="h-full w-full" shape="square" />
				</div>
			)}
			<div className="flex flex-1 flex-col space-y-2 p-2">
				<div className="space-y-1">
					<ShimmerSkeleton height="14px" width="80%" />
					{showDescription && (
						<>
							<ShimmerSkeleton height="12px" width="60%" />
							<ShimmerSkeleton height="12px" width="40%" />
						</>
					)}
				</div>
				{showPrice && (
					<ShimmerSkeleton className="mt-auto" height="16px" width="40%" />
				)}
			</div>
		</div>
	);
}

ProductCardSkeleton.displayName = "ProductCardSkeleton";

// ============================================
// SKELETON TABLE
// ============================================

export interface TableSkeletonProps extends HTMLAttributes<HTMLDivElement> {
	/**
	 * Number of rows to show
	 * @default 5
	 */
	rows?: number;

	/**
	 * Number of columns to show
	 * @default 4
	 */
	columns?: number;

	/**
	 * Whether to show header
	 * @default true
	 */
	showHeader?: boolean;
}

export function TableSkeleton({
	className,
	rows = 5,
	columns = 4,
	showHeader = true,
	...props
}: TableSkeletonProps) {
	return (
		<div className={cn("w-full", className)} {...props}>
			{showHeader && (
				<div className="flex gap-4 border-border border-b pb-2">
					{Array.from({ length: columns }).map((_, i) => (
						<ShimmerSkeleton
							className="text-xs uppercase tracking-wider"
							height="12px"
							key={`header-${i}`}
							width={i === 0 ? "60px" : "80px"}
						/>
					))}
				</div>
			)}
			<div className="space-y-2 pt-2">
				{Array.from({ length: rows }).map((_, rowIndex) => (
					<div className="flex gap-4" key={`row-${rowIndex}`}>
						{Array.from({ length: columns }).map((_, colIndex) => {
							let width: string;
							if (colIndex === 0) {
								width = "48px";
							} else if (colIndex === columns - 1) {
								width = "60px";
							} else {
								width = "100%";
							}
							return (
								<ShimmerSkeleton
									height="16px"
									key={`cell-${rowIndex}-${colIndex}`}
									width={width}
								/>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
}

TableSkeleton.displayName = "TableSkeleton";

// ============================================
// SKELETON STAT CARD
// ============================================

export interface StatCardSkeletonProps extends HTMLAttributes<HTMLDivElement> {}

export function StatCardSkeleton({
	className,
	...props
}: StatCardSkeletonProps) {
	return (
		<div
			className={cn(
				"flex flex-col justify-between rounded-xl border border-border bg-card/50 p-4",
				className
			)}
			{...props}
		>
			<div className="mb-2 flex items-start justify-between">
				<ShimmerSkeleton height="12px" width="80px" />
				<div className="rounded-full bg-muted p-1.5">
					<ShimmerSkeleton height="16px" shape="circle" width="16px" />
				</div>
			</div>
			<div>
				<ShimmerSkeleton height="32px" width="100px" />
				<ShimmerSkeleton className="mt-1" height="12px" width="60px" />
			</div>
		</div>
	);
}

StatCardSkeleton.displayName = "StatCardSkeleton";

// ============================================
// LOADING OVERLAY
// ============================================

export interface LoadingOverlayProps extends HTMLAttributes<HTMLDivElement> {
	/**
	 * Whether overlay is visible
	 * @default true
	 */
	visible?: boolean;

	/**
	 * Label to show
	 */
	label?: string;

	/**
	 * Size of spinner
	 * @default "lg"
	 */
	size?: SpinnerProps["size"];
}

export function LoadingOverlay({
	className,
	visible = true,
	label = "Memuat...",
	size = "lg",
	...props
}: LoadingOverlayProps) {
	if (!visible) {
		return null;
	}

	return (
		<div
			className={cn(
				"fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm",
				className
			)}
			{...props}
		>
			<Spinner label={label} size={size} />
		</div>
	);
}

LoadingOverlay.displayName = "LoadingOverlay";

// ============================================
// DOT LOADING INDICATOR
// ============================================

export interface DotLoaderProps extends HTMLAttributes<HTMLDivElement> {
	/**
	 * Number of dots
	 * @default 3
	 */
	dots?: number;

	/**
	 * Size of each dot
	 * @default "md"
	 */
	size?: "sm" | "md" | "lg";
}

const dotSizes = {
	sm: "h-1.5 w-1.5",
	md: "h-2 w-2",
	lg: "h-3 w-3",
} as const;

export function DotLoader({
	className,
	dots = 3,
	size = "md",
	...props
}: DotLoaderProps) {
	return (
		<div className={cn("flex items-center gap-1", className)} {...props}>
			{Array.from({ length: dots }).map((_, i) => (
				<div
					className={cn(
						"animate-bounce rounded-full bg-primary",
						dotSizes[size]
					)}
					key={i}
					style={{
						animationDelay: `${i * 0.15}s`,
						animationDuration: "0.6s",
					}}
				/>
			))}
		</div>
	);
}

DotLoader.displayName = "DotLoader";

// ============================================
// PROGRESS SKELETON (Linear progress)
// ============================================

export interface ProgressSkeletonProps extends HTMLAttributes<HTMLDivElement> {
	/**
	 * Progress percentage (0-100)
	 * @default 50
	 */
	value?: number;

	/**
	 * Whether to show label
	 * @default true
	 */
	showLabel?: boolean;

	/**
	 * Optional custom label
	 */
	label?: string;
}

export function ProgressSkeleton({
	className,
	value = 50,
	showLabel = true,
	label,
	...props
}: ProgressSkeletonProps) {
	return (
		<div className={cn("space-y-2", className)} {...props}>
			{showLabel && (
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">{label ?? "Memuat..."}</span>
					<span className="font-medium">{value}%</span>
				</div>
			)}
			<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="h-full animate-pulse rounded-full bg-primary transition-all duration-300"
					style={{ width: `${value}%` }}
				/>
			</div>
		</div>
	);
}

ProgressSkeleton.displayName = "ProgressSkeleton";

// ============================================
// EXPORT ALL
// ============================================

export { Skeleton as default, type BaseSkeletonProps };
