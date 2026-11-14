import { cn } from "../../lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonV2Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
}

const sizeClasses = {
  sm: "h-9 gap-1.5 px-3.5 text-xs rounded-[12px]",
  md: "h-11 gap-2 px-5 text-sm rounded-[14px]",
  lg: "h-12 gap-2.5 px-6 text-base rounded-[16px]",
};

const variantClasses = {
  default: "bg-primary text-primary-foreground font-bold shadow-sm hover:bg-primary/90",
  outline: "border border-border bg-background font-semibold text-foreground hover:bg-muted",
  ghost: "font-semibold text-foreground hover:bg-muted",
};

function ButtonV2({ className, variant = "default", size = "md", loading = false, disabled, children, ...props }: ButtonV2Props) {
  return (
    <button
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap transition-all duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)]",
        "active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-foreground focus-visible:shadow-[0_0_0_5px_color-mix(in_srgb,var(--primary)_35%,transparent_65%)]",
        "disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled || loading}
      data-slot="button-v2"
      {...props}
    >
      {loading ? (
        <>
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export { ButtonV2 };