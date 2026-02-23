/**
 * EMPTY STATE COMPONENTS
 *
 * Reusable empty state components dengan illustration, message, dan action.
 */

import {
	FileText,
	Inbox,
	type LucideIcon,
	Search,
	ShoppingCart,
	WifiOff,
} from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

// ============================================
// EMPTY STATE TYPES
// ============================================

export type EmptyStateVariant =
	| "cart"
	| "search"
	| "orders"
	| "products"
	| "inventory"
	| "offline"
	| "custom";

export type EmptyStateSize = "sm" | "md" | "lg" | "xl";

// ============================================
// ICON MAPPING
// ============================================

const iconMap: Record<EmptyStateVariant, LucideIcon> = {
	cart: ShoppingCart,
	search: Search,
	orders: FileText,
	products: Inbox,
	inventory: Inbox,
	offline: WifiOff,
	custom: Inbox,
};

// ============================================
// DEFAULT CONTENT
// ============================================

const defaultContent: Record<
	EmptyStateVariant,
	{ title: string; description: string }
> = {
	cart: {
		title: "Keranjang Kosong",
		description: "Belum ada item yang ditambahkan. Yuk, pesan menu favoritmu!",
	},
	search: {
		title: "Tidak Ditemukan",
		description: "Cari dengan kata kunci lain atau cek kategori lain.",
	},
	orders: {
		title: "Belum Ada Pesanan",
		description: "Pesanan yang dibuat akan muncul di sini.",
	},
	products: {
		title: "Belum Ada Produk",
		description: "Tambahkan produk untuk memulai penjualan.",
	},
	inventory: {
		title: "Stok Aman",
		description: "Semua item dalam level stok yang aman.",
	},
	offline: {
		title: "Mode Offline",
		description:
			"Tidak ada koneksi internet. Beberapa fitur mungkin tidak tersedia.",
	},
	custom: {
		title: "Tidak Ada Data",
		description: "Data akan muncul di sini saat tersedia.",
	},
};

// ============================================
// EMPTY STATE COMPONENT
// ============================================

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
	/**
	 * Variant of empty state (pre-defined content)
	 * @default "custom"
	 */
	variant?: EmptyStateVariant;

	/**
	 * Size of the empty state
	 * @default "md"
	 */
	size?: EmptyStateSize;

	/**
	 * Custom icon component
	 */
	icon?: ReactNode;

	/**
	 * Custom title
	 */
	title?: string;

	/**
	 * Custom description
	 */
	description?: string;

	/**
	 * Optional action button
	 */
	action?: ReactNode;

	/**
	 * Custom illustration (image)
	 */
	illustration?: string;

	/**
	 * Whether to show icon
	 * @default true
	 */
	showIcon?: boolean;

	/**
	 * Whether content is centered
	 * @default true
	 */
	centered?: boolean;
}

const sizeStyles = {
	sm: "p-4 text-sm",
	md: "p-6 text-sm",
	lg: "p-8 text-base",
	xl: "p-12 text-lg",
} as const;

const iconSizes: Record<EmptyStateSize, string> = {
	sm: "h-8 w-8",
	md: "h-12 w-12",
	lg: "h-16 w-16",
	xl: "h-20 w-20",
};

export function EmptyState({
	variant = "custom",
	size = "md",
	icon,
	title,
	description,
	action,
	illustration,
	showIcon = true,
	centered = true,
	className,
	...props
}: EmptyStateProps) {
	const content = defaultContent[variant];
	const Icon = iconMap[variant];

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center",
				centered && "text-center",
				sizeStyles[size],
				className
			)}
			{...props}
		>
			{/* Illustration or Icon */}
			{illustration ? (
				<img
					alt={title ?? content.title}
					className="mb-4 max-h-32 w-auto opacity-50"
					height={128}
					src={illustration}
					width={128}
				/>
			) : showIcon && (icon || Icon) ? (
				<div className="mb-4 text-muted-foreground/30">
					{icon ?? <Icon className={iconSizes[size]} />}
				</div>
			) : null}

			{/* Title */}
			<h3 className="mb-2 font-bold text-foreground">
				{title ?? content.title}
			</h3>

			{/* Description */}
			<p className="mb-4 max-w-sm text-muted-foreground">
				{description ?? content.description}
			</p>

			{/* Action */}
			{action && <div className="mt-2">{action}</div>}
		</div>
	);
}

EmptyState.displayName = "EmptyState";

// ============================================
// EMPTY STATE CARD (Bordered variant)
// ============================================

export interface EmptyStateCardProps extends EmptyStateProps {
	/**
	 * Whether to show border
	 * @default true
	 */
	bordered?: boolean;

	/**
	 * Background color
	 * @default "muted"
	 */
	background?: "transparent" | "muted" | "card";
}

const bgStyles = {
	transparent: "bg-transparent",
	muted: "bg-muted/30",
	card: "bg-card/50",
} as const;

export function EmptyStateCard({
	bordered = true,
	background = "muted",
	className,
	...props
}: EmptyStateCardProps) {
	return (
		<div
			className={cn(
				"rounded-xl",
				bordered && "border border-border border-dashed",
				bgStyles[background],
				className
			)}
		>
			<EmptyState centered {...props} />
		</div>
	);
}

EmptyStateCard.displayName = "EmptyStateCard";

// ============================================
// EMPTY LIST ITEM (Inline empty state)
// ============================================

export interface EmptyListItemProps extends HTMLAttributes<HTMLDivElement> {
	/**
	 * Icon to show
	 */
	icon?: ReactNode;

	/**
	 * Message
	 */
	message: string;

	/**
	 * Column span for table usage
	 */
	colSpan?: number;
}

export function EmptyListItem({
	icon,
	message,
	colSpan,
	className,
	...props
}: EmptyListItemProps) {
	return (
		<tr>
			<td
				className={cn(
					"py-8 text-center text-muted-foreground text-sm",
					className
				)}
				colSpan={colSpan}
				{...props}
			>
				<div className="flex items-center justify-center gap-2">
					{icon && <span className="text-muted-foreground/50">{icon}</span>}
					<span>{message}</span>
				</div>
			</td>
		</tr>
	);
}

EmptyListItem.displayName = "EmptyListItem";

// ============================================
// EMPTY STATE WITH ACTION BUTTON
// ============================================

export interface EmptyStateWithActionProps extends EmptyStateProps {
	/**
	 * Action button label
	 */
	actionLabel: string;

	/**
	 * Action button click handler
	 */
	onAction: () => void;

	/**
	 * Action button variant
	 * @default "primary"
	 */
	actionVariant?: "primary" | "secondary" | "outline" | "ghost";
}

export function EmptyStateWithAction({
	actionLabel,
	onAction,
	actionVariant = "primary",
	className,
	...props
}: EmptyStateWithActionProps) {
	const buttonStyles = {
		primary: "bg-primary text-primary-foreground hover:bg-primary/90",
		secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90",
		outline: "border border-border bg-background hover:bg-muted",
		ghost: "hover:bg-muted hover:text-foreground",
	};

	return (
		<EmptyState
			action={
				<button
					className={cn(
						"rounded-md px-4 py-2 font-medium text-sm transition-colors",
						buttonStyles[actionVariant]
					)}
					onClick={onAction}
					type="button"
				>
					{actionLabel}
				</button>
			}
			className={className}
			{...props}
		/>
	);
}

EmptyStateWithAction.displayName = "EmptyStateWithAction";

// ============================================
// PRE-CONFIGURED EMPTY STATES
// ============================================

export const EmptyCart = (props: Omit<EmptyStateProps, "variant">) => (
	<EmptyState variant="cart" {...props} />
);

export const EmptySearch = (props: Omit<EmptyStateProps, "variant">) => (
	<EmptyState variant="search" {...props} />
);

export const EmptyOrders = (props: Omit<EmptyStateProps, "variant">) => (
	<EmptyState variant="orders" {...props} />
);

export const EmptyProducts = (props: Omit<EmptyStateProps, "variant">) => (
	<EmptyState variant="products" {...props} />
);

export const EmptyInventory = (props: Omit<EmptyStateProps, "variant">) => (
	<EmptyState variant="inventory" {...props} />
);

export const OfflineState = (props: Omit<EmptyStateProps, "variant">) => (
	<EmptyState variant="offline" {...props} />
);

// ============================================
// EXPORT ALL
// ============================================

export { type EmptyStateVariant, type EmptyStateSize, defaultContent };
