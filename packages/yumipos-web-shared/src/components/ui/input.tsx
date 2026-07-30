"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  state?: "default" | "error" | "success";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({ className, type, state = "default", "aria-invalid": ariaInvalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      {...props}
      aria-invalid={state === "error" ? true : ariaInvalid || undefined}
      className={cn(
        "h-10 w-full min-w-0 rounded-[14px] border border-input bg-background px-3.5 py-2 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] file:inline-flex file:h-6 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 motion-reduce:transition-none",
        state === "error" && "border-destructive ring-1 ring-destructive/20",
        state === "success" && "border-emerald-500/50 ring-1 ring-emerald-500/20",
        className,
      )}
    />
  );
});

export { Input };
