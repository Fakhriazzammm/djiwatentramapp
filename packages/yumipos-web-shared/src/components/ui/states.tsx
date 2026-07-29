import * as React from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

/**
 * EmptyState — DNA v2.0 §12
 * Illustration + headline + description + CTA.
 * Teaches user what to do next.
 */
function EmptyState({
  className,
  icon,
  title,
  description,
  actionLabel,
  onAction,
  children,
}: {
  className?: string;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-6",
        className
      )}
      data-slot="empty-state"
    >
      {icon && (
        <div className="mb-4 text-muted-foreground/60 [&_svg]:size-12 [&_svg]:stroke-[1.5]">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-muted-foreground max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
      {children}
    </div>
  );
}

/**
 * ErrorState — DNA v2.0 §11
 * Inline error + retry.
 */
function ErrorState({
  className,
  title = "Terjadi kesalahan",
  description,
  retryLabel = "Coba lagi",
  onRetry,
}: {
  className?: string;
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-10 px-6",
        className
      )}
      data-slot="error-state"
      role="alert"
    >
      <div className="size-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-3">
        <svg viewBox="0 0 24 24" fill="none" className="size-5 stroke-2">
          <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground max-w-xs">{description}</p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export { EmptyState, ErrorState };
