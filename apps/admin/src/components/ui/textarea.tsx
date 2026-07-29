import type * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({
	className,
	state = "default",
	...props
}: React.ComponentProps<"textarea"> & {
	state?: "default" | "error" | "success";
}) {
	return (
		<textarea
			className={cn(
				"field-sizing-content flex min-h-24 w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:disabled:bg-input/80",
				state === "error" &&
					"border-destructive ring-1 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40",
				state === "success" &&
					"border-emerald-500/50 ring-1 ring-emerald-500/20 dark:border-emerald-400/50 dark:ring-emerald-400/30",
				className
			)}
			data-slot="textarea"
			{...props}
		/>
	);
}

export { Textarea };
