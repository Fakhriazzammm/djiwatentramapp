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
			className={`owner-footer-attribution flex flex-col items-center justify-center text-center ${
				compact ? "gap-0.5 text-[10px] leading-4 sm:text-[11px]" : "gap-1 text-[11px] leading-5"
			}`}
		>
			<span className="font-semibold tracking-[-0.01em] text-foreground/75">Djiwa Tentram</span>
			<span className="text-muted-foreground/80">
				Dibuat oleh{" "}
				<a className="font-medium text-primary underline-offset-2 hover:underline" href="https://instagram.com/fakhriazzamm" target="_blank" rel="noreferrer">
					@fakhriazzamm
				</a>
				<span aria-hidden="true" className="px-1.5 text-border">·</span>
				Yumme Group
			</span>
			<span className="text-muted-foreground/80">
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
		        ? `owner-footer mx-auto mt-3 w-[calc(100%-1.5rem)] max-w-5xl border-t border-border/50 px-3 py-3 text-center text-muted-foreground ${className}`
		        : `owner-footer mx-auto mt-4 w-[calc(100%-1.5rem)] max-w-5xl border-t border-border/60 px-4 py-4 text-center text-[10px] leading-5 text-muted-foreground ${className}`}
      style={compact ? undefined : { paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
	      {attribution}
      {children}
    </footer>
  );
}
