import type { ReactNode } from "react";

type OwnerFooterProps = {
  className?: string;
  children?: ReactNode;
  compact?: boolean;
  twoLine?: boolean;
};

/** Compact, mobile-safe attribution footer shared by every Djiwa Tentram app shell. */
export function OwnerFooter({ className = "", children, compact = false, twoLine = false }: OwnerFooterProps) {
  return (
    <footer
      className={compact
        ? `owner-footer mx-auto mt-3 w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-border/60 bg-background/90 px-3 py-2 text-center text-[10px] leading-4 text-muted-foreground shadow-sm ${className}`
        : `owner-footer mx-auto mt-4 w-[calc(100%-2rem)] max-w-5xl rounded-2xl border border-border/70 bg-background/85 px-4 py-4 text-center text-[10px] leading-5 text-muted-foreground shadow-sm ${className}`}
      style={compact ? undefined : { paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      {compact ? (
        twoLine ? (
          <div className="owner-footer-two-line flex flex-col items-center gap-0.5 text-center">
            <div className="owner-footer-row flex items-center justify-center gap-1 whitespace-nowrap"><span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span className="font-semibold text-foreground">Djiwa Tentram</span><span aria-hidden="true">•</span><span>Dibuat oleh <a className="font-medium text-primary" href="https://instagram.com/fakhriazzamm" target="_blank" rel="noreferrer">@fakhriazzamm</a></span><span aria-hidden="true">•</span><span>Yumme Group</span></div>
            <div className="owner-footer-row flex items-center justify-center gap-1 whitespace-nowrap"><span>Dikembangkan oleh <a className="font-medium text-foreground" href="https://zantaratechnology.com" target="_blank" rel="noreferrer">Zantara Technology</a></span></div>
          </div>
        ) : (
          <div className="flex w-full items-center justify-start gap-2 overflow-x-auto whitespace-nowrap px-1 text-[11px] leading-4">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span className="shrink-0 font-semibold text-foreground">Djiwa Tentram</span>
            <span aria-hidden="true" className="text-border">•</span>
            <span className="shrink-0">Dibuat oleh <a className="font-medium text-primary underline-offset-2 hover:underline" href="https://instagram.com/fakhriazzamm" target="_blank" rel="noreferrer">@fakhriazzamm</a></span>
            <span aria-hidden="true" className="text-border">•</span>
            <span className="shrink-0">Yumme Group</span>
            <span aria-hidden="true" className="text-border">•</span>
            <span className="shrink-0">Dikembangkan oleh <a className="font-medium text-foreground underline decoration-border underline-offset-2 hover:text-primary" href="https://zantaratechnology.com" target="_blank" rel="noreferrer">Zantara Technology</a></span>
          </div>
        )
      ) : (
        <div className="flex items-center justify-center gap-2 text-[11px] font-extrabold text-foreground">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/.12)]" />
          <span className="font-extrabold text-foreground">Djiwa Tentram</span>
          <span>· Dibuat oleh <a className="font-bold text-primary underline-offset-2 hover:underline" href="https://instagram.com/fakhriazzamm" target="_blank" rel="noreferrer">@fakhriazzamm</a> · Yumme Group</span>
          <span>· Dikembangkan oleh <a className="font-bold underline underline-offset-2 hover:text-foreground" href="https://zantaratechnology.com" target="_blank" rel="noreferrer">Zantara Technology</a></span>
        </div>
      )}
      {children}
    </footer>
  );
}
