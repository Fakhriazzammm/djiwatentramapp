import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Footer } from "@/components/layout/Footer";
import { LoginBrandMark, useLoginBrand } from "./login-brand";

export type LoginAccent = "amber" | "blue";

/* One accent per surface: amber belongs to the till, blue to the back office.
   Everything else on these screens is neutral, so the role chip and the focus
   ring are the only coloured things a cashier has to read. */
const ACCENT_CHIP: Record<LoginAccent, string> = {
	amber: "bg-amber-500/10 text-amber-600",
	blue: "bg-primary/10 text-primary",
};

/* Read once when the screen opens and refreshed on the minute; a clock is
   orientation, not a live feed. */
function useClock() {
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const id = window.setInterval(() => setNow(new Date()), 30_000);
		return () => window.clearInterval(id);
	}, []);

	return now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function LoginShell({
	title,
	subtitle,
	roleLabel,
	accent = "blue",
	hero,
	onBack,
	children,
}: {
	title: string;
	subtitle?: string;
	roleLabel?: string;
	accent?: LoginAccent;
	hero?: ReactNode;
	onBack?: () => void;
	children?: ReactNode;
}) {
	const { appName } = useLoginBrand();
	const clock = useClock();

	return (
		<div className="fixed inset-0 z-50 flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
			<header className="flex shrink-0 items-center justify-between gap-3 px-6 pt-5">
				<div className="flex min-w-0 items-center gap-2.5">
					<LoginBrandMark />
					<span className="truncate text-sm font-extrabold tracking-tight">{appName}</span>
				</div>
				<span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{clock}</span>
			</header>

			<main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
				{onBack ? (
					<button
						type="button"
						onClick={onBack}
						className="mb-5 inline-flex w-fit items-center gap-1 rounded-full border border-border bg-card py-1.5 pl-2 pr-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-[0.98]"
					>
						<ChevronLeft className="h-3.5 w-3.5" />
						Kembali
					</button>
				) : null}

				{hero}

				<h1 className="mt-6 text-[30px] font-black leading-[1.08] tracking-tight">{title}</h1>
				{subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}
				{roleLabel ? (
					<span
						className={`mt-4 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ${ACCENT_CHIP[accent]}`}
					>
						{roleLabel}
					</span>
				) : null}

				{children}
			</main>

			<Footer />
		</div>
	);
}
