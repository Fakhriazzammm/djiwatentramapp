import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * AppCard — Apple Wallet style card (DNA v2.0)
 * Radius 24px, soft shadow, white surface.
 * Use for primary content containers.
 */
function AppCard({
  className,
  strong = false,
  elevated = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { strong?: boolean; elevated?: boolean }) {
  return (
    <div
      className={cn(
        elevated ? "card-elevated" : strong ? "app-card-strong" : "app-card",
        "p-5 sm:p-6 lift-ios",
        className
      )}
      data-slot="app-card"
      {...props}
    >
      {children}
    </div>
  );
}

/** AppCardHeader — title + optional description/action */
function AppCardHeader({
  className,
  title,
  description,
  action,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn("flex items-start justify-between gap-3 mb-4", className)}
      {...props}
    >
      <div>
        <h3 className="app-section-title text-lg sm:text-xl">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export { AppCard, AppCardHeader };
