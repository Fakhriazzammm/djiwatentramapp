import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Inbox, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function CustomerPageSkeleton({ label = "Memuat halaman" }: { label?: string }) {
	return (
		<div className="app-page min-h-app" aria-busy="true" aria-label={label} role="status">
			<div className="app-shell mx-auto min-h-app max-w-md bg-background px-3 py-4">
				<span className="sr-only">{label}</span>
				<div className="app-card space-y-4 p-4">
					<div className="flex items-center gap-3">
						<Skeleton className="h-12 w-12 rounded-[14px]" />
						<div className="flex-1 space-y-2">
							<Skeleton className="h-3 w-24" />
							<Skeleton className="h-5 w-2/3" />
						</div>
					</div>
					<Skeleton className="h-28 w-full rounded-[20px]" />
					<div className="grid grid-cols-2 gap-3">
						<Skeleton className="h-24 rounded-[20px]" />
						<Skeleton className="h-24 rounded-[20px]" />
					</div>
				</div>
			</div>
		</div>
	);
}

export function CustomerSectionSkeleton({ label = "Memuat data" }: { label?: string }) {
	return (
		<div className="space-y-3 py-3" aria-busy="true" aria-label={label} role="status">
			<span className="sr-only">{label}</span>
			{[1, 2, 3].map((item) => (
				<Skeleton key={item} className="h-20 w-full rounded-[20px]" />
			))}
		</div>
	);
}

export function CustomerEmptyState({
	action,
	description,
	title = "Belum ada data",
}: {
	action?: ReactNode;
	description?: string;
	title?: string;
}) {
	return (
		<div className="app-card flex flex-col items-center justify-center px-5 py-10 text-center" role="status">
			<div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<Inbox aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
			</div>
			<h2 className="mt-4 font-display text-base font-extrabold">{title}</h2>
			{description ? <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
			{action ? <div className="mt-5">{action}</div> : null}
		</div>
	);
}

export function CustomerSuccessState({
	description,
	title = "Berhasil",
}: {
	description?: string;
	title?: string;
}) {
	return (
		<div className="app-card flex flex-col items-center justify-center px-5 py-10 text-center" role="status">
			<div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
				<CheckCircle2 aria-hidden="true" className="h-6 w-6" strokeWidth={2} />
			</div>
			<h2 className="mt-4 font-display text-base font-extrabold">{title}</h2>
			{description ? <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
		</div>
	);
}

export function CustomerErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
	return (
		<div className="app-card flex items-start gap-3 p-4 text-destructive" role="alert">
			<AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2} />
			<div className="min-w-0 flex-1">
				<h2 className="font-display text-sm font-bold">Data belum dapat dimuat</h2>
				<p className="mt-1 break-words text-xs text-destructive/80">{message}</p>
				{onRetry ? (
					<button
						type="button"
						className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-destructive/25 px-3 text-xs font-bold text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[.97]"
						onClick={onRetry}
					>
						<RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
						Coba lagi
					</button>
				) : null}
			</div>
		</div>
	);
}
