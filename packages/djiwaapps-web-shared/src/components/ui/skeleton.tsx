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
				"relative overflow-hidden bg-muted before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/55 before:to-transparent motion-reduce:before:animate-none",
				shape === "circle" && "rounded-full",
				shape === "square" && "rounded-none",
				shape === "rounded" && "rounded-xl",
				className
			)}
			data-slot="skeleton"
			style={{ width, height, ...props.style }}
			{...props}
		/>
	);
}

export { Skeleton };
