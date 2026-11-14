import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

const statusToneClasses = {
  neutral: "border-border bg-muted/60 text-muted-foreground",
  info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
  warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
  danger: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300",
} as const;

export type AdminStatusTone = keyof typeof statusToneClasses;

export interface AdminHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  backLabel?: string;
  onBack?: () => void;
  className?: string;
}

/** Compact page context with an optional accessible back action and action slot. */
export function AdminHeader({
  title,
  description,
  eyebrow,
  actions,
  backLabel = "Kembali",
  onBack,
  className,
}: AdminHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)} data-slot="admin-header">
      <div className="flex min-w-0 items-start gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="-ml-2 inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground outline-none transition-[background-color,color,transform] duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 active:scale-[.97] motion-reduce:transition-none"
          >
            <span aria-hidden="true" className="text-xl leading-none">‹</span>
          </button>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</p>}
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          {description && <div className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export interface AdminStatusBadgeProps {
  label: ReactNode;
  tone?: AdminStatusTone;
  icon?: ReactNode;
  className?: string;
}

/** Semantic status pill; tone is never the only source of status information. */
export function AdminStatusBadge({ label, tone = "neutral", icon, className }: AdminStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none",
        statusToneClasses[tone],
        className,
      )}
      data-slot="admin-status-badge"
      data-tone={tone}
    >
      {icon && <span aria-hidden="true" className="shrink-0 [&_svg]:size-3">{icon}</span>}
      <span className="truncate">{label}</span>
    </span>
  );
}

export interface AdminEmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Calm, actionable empty state with an optional route-owned action. */
export function AdminEmptyState({ title, description, icon, action, className }: AdminEmptyStateProps) {
  return (
    <section className={cn("flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/60 px-6 py-10 text-center", className)} data-slot="admin-empty-state" aria-label="Tidak ada data">
      {icon && <div className="mb-3 text-muted-foreground/70 [&_svg]:size-9 [&_svg]:stroke-[1.5]">{icon}</div>}
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      {description && <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}

export interface AdminLoadingStateProps {
  label?: string;
  rows?: number;
  className?: string;
}

/** Shape-matched loading state; animation stops when reduced motion is requested. */
export function AdminLoadingState({ label = "Memuat data", rows = 3, className }: AdminLoadingStateProps) {
  const safeRows = Math.max(1, Math.min(rows, 8));
  return (
    <section className={cn("space-y-3 rounded-2xl border border-border/70 bg-card p-4", className)} data-slot="admin-loading-state" aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="h-4 w-32 animate-pulse rounded-md bg-muted motion-reduce:animate-none" aria-hidden="true" />
      {Array.from({ length: safeRows }, (_, index) => (
        <div key={index} className="flex items-center gap-3" aria-hidden="true">
          <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-2/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-2.5 w-3/5 animate-pulse rounded bg-muted/80 motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </section>
  );
}

export interface AdminSectionHeadingProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Reusable section hierarchy for dashboard and data-heavy admin views. */
export function AdminSectionHeading({ title, description, actions, className }: AdminSectionHeadingProps) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between", className)} data-slot="admin-section-heading">
      <div className="min-w-0">
        <h2 className="text-base font-bold tracking-tight text-foreground">{title}</h2>
        {description && <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
