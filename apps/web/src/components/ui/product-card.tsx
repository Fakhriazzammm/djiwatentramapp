/**
 * PRODUCT CARD COMPONENT
 *
 * Enhanced product card dengan proper accessibility, hover effects, dan visual hierarchy.
 */

import type { HTMLAttributes, ReactNode } from "react";
import { ShimmerSkeleton } from "@/components/ui/loading-state";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

export interface Product {
	_id: string;
	name: string;
	price: number;
	originalPrice?: number;
	promoPrice?: number;
	image?: string;
	description?: string;
	category?: string;
	categoryId?: string;
	isActive?: boolean;
	stock?: number;
	lowStockThreshold?: number;
	discountName?: string;
	discountPercentage?: number;
}

export interface ProductCardProps extends HTMLAttributes<HTMLButtonElement> {
	product: Product;
	finalPrice: number;
	isPromo?: boolean;
	badge?: ReactNode;
	showStock?: boolean;
	showDiscount?: boolean;
	size?: "sm" | "md" | "lg";
	variant?: "grid" | "list" | "compact";
	loading?: boolean;
}

// ============================================
// SKELETON VARIANT
// ============================================

export interface ProductCardSkeletonProps
	extends HTMLAttributes<HTMLDivElement> {
	size?: "sm" | "md" | "lg";
	variant?: "grid" | "list" | "compact";
}

const sizeClasses = {
	sm: {
		grid: "aspect-[3/2]",
		list: "h-20 w-20",
		compact: "aspect-square",
	},
	md: {
		grid: "aspect-[4/3]",
		list: "h-24 w-24",
		compact: "aspect-square",
	},
	lg: {
		grid: "aspect-square",
		list: "h-32 w-32",
		compact: "aspect-square",
	},
} as const;

const layoutClasses = {
	grid: "flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:border-primary/20 hover:shadow-lg active:scale-[0.98]",
	list: "flex-row gap-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:border-primary/20 hover:shadow-md active:scale-[0.98]",
	compact:
		"flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all hover:border-primary/20 hover:shadow-md active:scale-[0.98]",
} as const;

export function ProductCardSkeleton({
	size = "md",
	variant = "grid",
	className,
	...props
}: ProductCardSkeletonProps) {
	const layout = layoutClasses[variant];
	const imgSize = sizeClasses[size][variant];

	return (
		<div className={cn(layout, className)} {...props}>
			<div className={cn("relative bg-muted", imgSize)}>
				<ShimmerSkeleton className="h-full w-full" shape="square" />
			</div>
			<div className="flex flex-1 flex-col gap-1.5 p-3">
				<ShimmerSkeleton height="14px" width="80%" />
				<ShimmerSkeleton height="16px" width="50%" />
			</div>
		</div>
	);
}

ProductCardSkeleton.displayName = "ProductCardSkeleton";

// ============================================
// PRODUCT CARD COMPONENT
// ============================================

export function ProductCard({
	product,
	finalPrice,
	size = "md",
	variant = "grid",
	loading = false,
	className,
	onClick,
	...props
}: ProductCardProps) {
	const layout = layoutClasses[variant];
	const imgSize = sizeClasses[size][variant];

	return (
		<button
			className={cn(
				layout,
				"group relative cursor-pointer text-left",
				className
			)}
			disabled={loading}
			onClick={onClick}
			type="button"
			{...props}
		>
			{/* Image */}
			<div className={cn("relative overflow-hidden bg-muted", imgSize)}>
				{product.image ? (
					<img
						alt={product.name}
						className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
						height={150}
						loading="lazy"
						src={product.image}
						width={200}
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center bg-primary/10">
						<span className="font-bold text-2xl text-primary/40">
							{product.name.charAt(0)}
						</span>
					</div>
				)}
			</div>

			{/* Content: Name & Price */}
			<div className="flex flex-col gap-1 p-3">
				<h3 className="line-clamp-2 font-semibold text-foreground text-sm leading-tight">
					{product.name}
				</h3>
				<span className="font-bold text-primary text-sm">
					{new Intl.NumberFormat("id-ID", {
						style: "currency",
						currency: "IDR",
						maximumFractionDigits: 0,
					}).format(finalPrice)}
				</span>
			</div>
		</button>
	);
}

ProductCard.displayName = "ProductCard";

// ============================================
// PRODUCT GRID WRAPPER
// ============================================

export interface ProductGridProps extends HTMLAttributes<HTMLDivElement> {
	/**
	 * Grid columns (responsive)
	 * @default "default"
	 */
	columns?: "sm" | "default" | "lg";
}

const columnClasses = {
	sm: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
	default:
		"grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
	lg: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
} as const;

export function ProductGrid({
	columns = "default",
	className,
	children,
	...props
}: ProductGridProps) {
	return (
		<div
			className={cn(
				"grid gap-2 pb-20 md:pb-0",
				columnClasses[columns],
				className
			)}
			{...props}
		>
			{children}
		</div>
	);
}

ProductGrid.displayName = "ProductGrid";

// ============================================
// EXPORT ALL
// ============================================

export type { ProductCardSkeletonProps, ProductGridProps };
