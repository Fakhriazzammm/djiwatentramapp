import type { ReactNode } from "react";

type OwnerFooterProps = {
  className?: string;
  children?: ReactNode;
  compact?: boolean;
  twoLine?: boolean;
};

/** Compact, mobile-safe attribution footer shared by every Djiwa Tentram app shell. */
export function OwnerFooter({ className = "", children, compact = false }: OwnerFooterProps) {
	const attribution = (
		<div
			className={`owner-footer-attribution flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center ${
				compact ? "text-[10px] leading-4 sm:text-[11px]" : "text-[11px] leading-5"
			}`}
		>
			<span className="whitespace-nowrap font-semibold text-foreground">
				<span aria-hidden="true" className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />
				Djiwa Tentram
			</span>
			<span aria-hidden="true" className="text-border">·</span>
			<span className="whitespace-nowrap">
				Dibuat oleh{" "}
				<a className="font-medium text-primary underline-offset-2 hover:underline" href="https://instagram.com/fakhriazzamm" target="_blank" rel="noreferrer">
					@fakhriazzamm
				</a>
			</span>
			<span aria-hidden="true" className="text-border">·</span>
			<span className="whitespace-nowrap">Yumme Group</span>
			<span aria-hidden="true" className="text-border">·</span>
			<span className="whitespace-nowrap">
				Dikembangkan oleh{" "}
				<a className="font-medium text-foreground underline decoration-border underline-offset-2 hover:text-primary" href="https://zantaratechnology.com" target="_blank" rel="noreferrer">
					Zantara Technology
				</a>
			</span>
		</div>
	);

  return (
    <footer
      className={compact
	        ? `owner-footer mx-auto mt-3 w-[calc(100%-1.5rem)] max-w-5xl overflow-hidden rounded-xl border border-border/60 bg-background/90 px-3 py-2 text-center text-muted-foreground shadow-sm ${className}`
	        : `owner-footer mx-auto mt-4 w-[calc(100%-1.5rem)] max-w-5xl rounded-2xl border border-border/70 bg-background/85 px-4 py-3 text-center text-[10px] leading-5 text-muted-foreground shadow-sm ${className}`}
      style={compact ? undefined : { paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
	      {attribution}
      {children}
    </footer>
  );
}
