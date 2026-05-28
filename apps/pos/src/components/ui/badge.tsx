import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-semibold text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
	{
		variants: {
			variant: {
				default:
					"border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
				secondary:
					"border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
				destructive:
					"border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
				warning:
					"border-transparent bg-amber-100 text-amber-700 hover:bg-amber-200",
				success:
					"border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
				info: "border-transparent bg-blue-100 text-blue-700 hover:bg-blue-200",
				promo:
					"border-transparent bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-200",
				outline: "border text-foreground",
			},
			size: {
				sm: "px-2 py-0 text-[10px]",
				default: "px-2.5 py-0.5 text-xs",
				lg: "px-3 py-1 text-sm",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	}
);

export interface BadgeProps
	extends React.HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
	return (
		<div
			className={cn(badgeVariants({ variant, size }), className)}
			{...props}
		/>
	);
}

export { Badge, badgeVariants };
