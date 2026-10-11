import { Djiwa3DIcon, type Djiwa3DIconName } from "@yumipos/web-shared";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { CustomerSplash } from "@/components/customer/customer-entry";

export function CustomerPageSkeleton({ label = "Memuat halaman" }: { label?: string }) {
	void label;
	return <CustomerSplash />;
}

export function CustomerDiscoverySkeleton({ label = "Memuat katalog" }: { label?: string }) {
	void label;
	return <CustomerSplash />;
}

export function CustomerSectionSkeleton({ label = "Memuat data" }: { label?: string }) {
	void label;
	return <CustomerSplash />;
}

export function CustomerEmptyState({
	action,
	description,
	title = "Belum ada data",
	illustration = "order-receipt",
}: {
	action?: ReactNode;
	description?: string;
	title?: string;
	illustration?: Djiwa3DIconName;
}) {
	return (
		<div className="app-card flex flex-col items-center justify-center px-5 py-10 text-center" role="status">
			<div className="mb-2 flex h-20 w-20 items-center justify-center rounded-[22px] bg-muted/40">
				<Djiwa3DIcon alt={title} className="h-16 w-16" name={illustration} size="lg" />
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
	const [retrying, setRetrying] = useState(false);
	const retry = async () => {
		if (!onRetry || retrying) return;
		setRetrying(true);
		try { await onRetry(); } finally { setRetrying(false); }
	};
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
						onClick={() => void retry()}
						disabled={retrying}
						aria-busy={retrying}
					>
						<motion.span aria-hidden="true" animate={retrying ? { rotate: 360 } : { rotate: 0 }} transition={retrying ? { duration: 0.8, repeat: Infinity, ease: "linear" } : { duration: 0.2 }}><RefreshCw className="h-3.5 w-3.5" /></motion.span>
						{retrying ? "Mencoba lagi..." : "Coba lagi"}
					</button>
				) : null}
			</div>
		</div>
	);
}
