import * as React from "react";

interface DropdownMenuProps {
	children: React.ReactNode;
}

interface DropdownMenuTriggerProps {
	children?: React.ReactNode;
	render?: (props: { ref?: React.Ref<HTMLButtonElement> }) => React.ReactNode;
}

export function DropdownMenu({ children }: DropdownMenuProps) {
	return <div className="relative inline-block">{children}</div>;
}

export function DropdownMenuTrigger({ children, render }: DropdownMenuTriggerProps) {
	if (render) {
		return <>{render({})}</>;
	}
	return <>{children}</>;
}

export function DropdownMenuContent({ 
	children, 
	align = "start",
	className = ""
}: { 
	children: React.ReactNode; 
	align?: "start" | "end" | "center";
	className?: string;
}) {
	return (
		<div className={`absolute ${align === 'end' ? 'right-0' : 'left-0'} top-full mt-1 z-50 ${className}`}>
			{children}
		</div>
	);
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
	return <div className="px-2 py-1.5 font-medium text-sm">{children}</div>;
}

export function DropdownMenuSeparator() {
	return <div className="h-px bg-border my-1" />;
}

export function DropdownMenuItem({ 
	children, 
	onClick,
	className = ""
}: { 
	children: React.ReactNode; 
	onClick?: () => void;
	className?: string;
}) {
	return (
		<button
			className={`w-full px-2 py-1.5 text-left text-sm hover:bg-muted rounded ${className}`}
			onClick={onClick}
			type="button"
		>
			{children}
		</button>
	);
}
