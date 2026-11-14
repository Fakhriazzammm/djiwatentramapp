import { cn } from "../../lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

interface CardV2Props extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  children: ReactNode;
}

function CardV2({ className, elevated = false, children, ...props }: CardV2Props) {
  return (
    <div
      className={cn(
        elevated ? "card-elevated" : "app-card",
        "p-5 sm:p-6",
        className
      )}
      data-slot="card-v2"
      {...props}
    >
      {children}
    </div>
  );
}

export { CardV2 };