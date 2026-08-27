import type { ReactNode } from "react";

type OwnerFooterProps = {
  className?: string;
  children?: ReactNode;
  compact?: boolean;
};

/** Compact, mobile-safe attribution footer shared by every Djiwa Tentram app shell. */
export function OwnerFooter({ className = "", children, compact = false }: OwnerFooterProps) {
  return (
    <footer
      className={`owner-footer mx-auto mt-4 w-[calc(100%-2rem)] max-w-5xl rounded-${compact ? "xl" : "2xl"} border border-border/70 bg-background/85 px-${compact ? "3" : "4"} py-${compact ? "2" : "4"} text-center text-[10px] leading-${compact ? "4" : "5"} text-muted-foreground shadow-sm ${className}`}
      style={compact ? undefined : { paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div className={compact ? "flex items-center justify-center gap-2 overflow-x-auto whitespace-nowrap text-[10px]" : "flex items-center justify-center gap-2 text-[11px] font-extrabold text-foreground"}>
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/.12)]" />
        <span className="font-extrabold text-foreground">Djiwa Tentram</span>
        <span>· Dibuat oleh <a className="font-bold text-primary underline-offset-2 hover:underline" href="https://instagram.com/fakhriazzamm" target="_blank" rel="noreferrer">@fakhriazzamm</a> · Yumme Group</span>
        <span>· Dikembangkan oleh <a className="font-bold underline underline-offset-2 hover:text-foreground" href="https://zantaratechnology.com" target="_blank" rel="noreferrer">Zantara Technology</a></span>
      </div>
      {children}
    </footer>
  );
}
