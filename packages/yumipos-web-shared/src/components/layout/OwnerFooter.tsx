import type { ReactNode } from "react";

type OwnerFooterProps = {
  className?: string;
  children?: ReactNode;
};

/** Compact attribution footer shared by every Djiwa Tentram app shell. */
export function OwnerFooter({ className = "", children }: OwnerFooterProps) {
  return (
    <footer className={`border-t border-border/60 bg-background/80 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 text-center text-[10px] leading-5 text-muted-foreground md:pb-4 ${className}`}>
      <p>
        Dibuat Oleh{" "}
        <a className="font-semibold text-foreground underline-offset-2 hover:underline" href="https://instagram.com/fakhriazzamm" target="_blank" rel="noreferrer">
          @fakhriazzamm
        </a>{" "}
        · Owner Yumme Group (Djiwa Tentram dan lainnya) dan Zantara Technology (Software Development)
      </p>
      <p className="text-[9px] opacity-75">
        · Brought to you by{" "}
        <a className="font-semibold underline underline-offset-2 hover:text-foreground" href="https://zantaratechnology.com" target="_blank" rel="noreferrer">
          zantaratechnology.com
        </a>
      </p>
      {children}
    </footer>
  );
}
