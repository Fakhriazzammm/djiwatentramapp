import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CustomerHeader({
	backLabel = "Kembali",
	leading,
	onBack,
	right,
	subtitle,
	title,
}: {
	backLabel?: string;
	leading?: ReactNode;
	onBack?: () => void;
	right?: ReactNode;
	subtitle?: string;
	title: string;
}) {
	return (
		<header className="flex min-h-14 items-center gap-2 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
			{onBack ? (
				<button
					type="button"
					className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[.97]"
					aria-label={backLabel}
					onClick={onBack}
				>
					{leading}
				</button>
			) : leading ? <div className="flex h-11 w-11 shrink-0 items-center justify-center">{leading}</div> : null}
			<div className="min-w-0 flex-1">
				<h1 className="font-display truncate text-base font-extrabold leading-tight text-foreground">{title}</h1>
				{subtitle ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p> : null}
			</div>
			{right ? <div className="flex min-h-11 shrink-0 items-center justify-end gap-1">{right}</div> : null}
		</header>
	);
}

export function CustomerSectionHeading({
	action,
	description,
	title,
}: {
	action?: ReactNode;
	description?: string;
	title: string;
}) {
	return (
		<div className="flex items-end justify-between gap-3">
			<div className="min-w-0">
				<h2 className="font-display text-lg font-extrabold leading-tight text-foreground">{title}</h2>
				{description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
			</div>
			{action ? <div className="shrink-0">{action}</div> : null}
		</div>
	);
}

export function CustomerPrimaryCta({
	children,
	className,
	disabled,
	icon,
	onClick,
	type = "button",
}: {
	children: ReactNode;
	className?: string;
	disabled?: boolean;
	icon?: ReactNode;
	onClick?: () => void;
	type?: "button" | "submit" | "reset";
}) {
	return (
		<button
			type={type}
			className={cn(
				"inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-all duration-[180ms] hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[.97] disabled:pointer-events-none disabled:opacity-50",
				className
			)}
			disabled={disabled}
			onClick={onClick}
		>
			{icon}
			{children}
		</button>
	);
}

export function CustomerBottomNav({
	items,
}: {
	items: Array<{
		active?: boolean;
		badge?: ReactNode;
		icon: ReactNode;
		label: string;
		onSelect?: () => void;
	}>;
}) {
	return (
		<nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 px-2 pb-[max(0.5rem,var(--safe-area-bottom))] pt-1.5 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur supports-[backdrop-filter]:bg-background/85" aria-label="Navigasi utama">
			<div className="mx-auto grid max-w-md grid-cols-5 gap-1">
				{items.map((item) => (
					<button
						key={item.label}
						type="button"
						className={cn(
							"relative flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-[14px] px-1 text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[.97]",
							item.active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
						)}
						onClick={item.onSelect}
						aria-current={item.active ? "page" : undefined}
					>
						{item.badge ? <span className="absolute right-1/4 top-0.5">{item.badge}</span> : null}
						<span className="flex h-5 items-center justify-center">{item.icon}</span>
						<span className="max-w-full truncate">{item.label}</span>
					</button>
				))}
			</div>
		</nav>
	);
}
