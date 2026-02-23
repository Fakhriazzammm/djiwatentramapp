"use client";

import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Label component
 * Biome ignore added to allow generic label without explicit internal control association.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: Reusable primitive
		<label
			className={cn(
				"flex select-none items-center gap-2 text-xs leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
				className
			)}
			{...props}
		/>
	);
}

export { Label };
