import { cn } from "../../lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
	width?: string | number;
	height?: string | number;
	shape?: "rounded" | "circle" | "square";
}

function Skeleton({
	className,
	width,
	height,
	shape = "rounded",
	...props
}: SkeletonProps) {
	return (
		<div
			className={cn(
				"animate-shimmer bg-muted",
				shape === "circle" && "rounded-full",
				shape === "square" && "rounded-none",
				shape === "rounded" && "rounded-md",
				className
			)}
			data-slot="skeleton"
			style={{ width, height, ...props.style }}
			{...props}
		/>
	);
}

export { Skeleton };
