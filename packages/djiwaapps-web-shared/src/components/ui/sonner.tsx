import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import type { ToasterProps } from "sonner";
import { Toaster as Sonner } from "sonner";
import { cn } from "../../lib/utils";

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			className="toaster group"
			position="bottom-center"
			icons={{
				success: <CircleCheckIcon className="size-4" />,
				info: <InfoIcon className="size-4" />,
				warning: <TriangleAlertIcon className="size-4" />,
				error: <OctagonXIcon className="size-4" />,
				loading: <Loader2Icon className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "14px",
				} as React.CSSProperties
			}
			theme={theme as ToasterProps["theme"]}
			toastOptions={{
				classNames: {
					toast: cn(
						"shadow-soft border border-border/80",
						"data-[type=error]:border-destructive/30 data-[type=error]:shadow-destructive/10",
					),
					title: "text-xs font-semibold",
					description: "text-[11px] text-muted-foreground",
					actionButton: "text-xs font-semibold text-primary",
					cancelButton: "text-xs text-muted-foreground",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };