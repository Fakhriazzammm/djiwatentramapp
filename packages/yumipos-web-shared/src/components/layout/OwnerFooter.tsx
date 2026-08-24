import type { ReactNode } from "react";

type OwnerFooterProps = {
  className?: string;
  children?: ReactNode;
};

/** Compact, mobile-safe attribution footer shared by every Djiwa Tentram app shell. */
export function OwnerFooter({ className = "", children }: OwnerFooterProps) {
  return (
    <footer
      className={`owner-footer mx-auto mt-4 w-[calc(100%-2rem)] max-w-5xl rounded-2xl border border-border/70 bg-background/85 px-4 py-4 text-center text-[10px] leading-5 text-muted-foreground shadow-sm ${className}`}
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center justify-center gap-2 text-[11px] font-extrabold text-foreground">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/.12)]" />
        Djiwa Tentram
      </div>
      <p className="mt-1.5">Dibuat oleh <a className="font-bold text-primary underline-offset-2 hover:underline" href="https://instagram.com/fakhriazzamm" target="_blank" rel="noreferrer">@fakhriazzamm</a> · Yumme Group</p>
      <p className="text-[9px] leading-4 text-muted-foreground/75">Dikembangkan oleh <a className="font-bold underline underline-offset-2 hover:text-foreground" href="https://zantaratechnology.com" target="_blank" rel="noreferrer">Zantara Technology</a></p>
      {children}
    </footer>
  );
}
