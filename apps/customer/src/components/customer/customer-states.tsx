import { AlertCircle } from "lucide-react";
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

export function CustomerErrorState({ message }: { message: string }) {
	return (
		<div className="app-card flex items-start gap-3 p-4 text-destructive" role="alert">
			<AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2} />
			<div className="min-w-0">
				<h2 className="font-display text-sm font-bold">Data belum dapat dimuat</h2>
				<p className="mt-1 break-words text-xs text-destructive/80">{message}</p>
			</div>
		</div>
	);
}
