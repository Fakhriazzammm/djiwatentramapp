"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  type DialogContentProps,
} from "./dialog";

const Sheet = Dialog;
const SheetTrigger = DialogTrigger;
const SheetClose = DialogClose;
const SheetPortal = DialogPortal;

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof DialogOverlay>) {
  return <DialogOverlay data-slot="sheet-overlay" className={className} {...props} />;
}

type SheetSide = "top" | "right" | "bottom" | "left";
interface SheetContentProps extends Omit<DialogContentProps, "__variant" | "__overlay"> {
  side?: SheetSide;
}

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(function SheetContent(
  { className, children, side = "right", ...props },
  ref,
) {
  return (
    <DialogContent
      ref={ref}
      __variant={side}
      __overlay={<SheetOverlay />}
      className={cn(
        "flex flex-col gap-4 overflow-y-auto bg-background p-6",
        side === "right" || side === "left" ? "w-3/4 sm:max-w-sm" : "max-h-[90dvh]",
        className,
      )}
      {...props}
    >
      {children}
    </DialogContent>
  );
});

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <DialogHeader data-slot="sheet-header" className={cn("gap-1.5", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <DialogFooter data-slot="sheet-footer" className={cn("mt-auto", className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogTitle>) {
  return <DialogTitle data-slot="sheet-title" className={cn("font-display text-base font-bold", className)} {...props} />;
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof DialogDescription>) {
  return <DialogDescription data-slot="sheet-description" className={className} {...props} />;
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
