import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { cn } from "../../lib/utils";

export type ScrollAreaProps = ComponentPropsWithoutRef<"div">;

const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
	{ className, children, tabIndex, ...props },
	ref
) {
	return (
		<div
			{...props}
			className={cn(
				"relative overflow-auto rounded-[inherit] outline-none transition-[color,box-shadow] duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] focus-visible:ring-2 focus-visible:ring-ring/30",
				className
			)}
			data-slot="scroll-area"
			ref={ref}
			tabIndex={tabIndex}
		>
			{children}
		</div>
	);
});

export type ScrollBarProps = ComponentPropsWithoutRef<"div"> & {
	orientation?: "horizontal" | "vertical";
};

const ScrollBar = forwardRef<HTMLDivElement, ScrollBarProps>(function ScrollBar(
	{ className, orientation = "vertical", ...props },
	ref
) {
	return (
		<div
			{...props}
			aria-hidden="true"
			className={cn("hidden", className)}
			data-orientation={orientation}
			data-slot="scroll-area-scrollbar"
			ref={ref}
		/>
	);
});

export { ScrollArea, ScrollBar };
