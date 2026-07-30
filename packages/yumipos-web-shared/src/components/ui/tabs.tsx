import {
	createContext,
	useContext,
	useId,
	useMemo,
	useState,
	type ComponentPropsWithoutRef,
	type KeyboardEvent,
	type ReactNode,
} from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

type TabsOrientation = "horizontal" | "vertical";

type TabsContextValue = {
	activeValue: string | undefined;
	baseId: string;
	orientation: TabsOrientation;
	setActiveValue: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string) {
	const context = useContext(TabsContext);
	if (!context) {
		throw new Error(`${component} must be used inside Tabs`);
	}
	return context;
}

export type TabsProps = Omit<ComponentPropsWithoutRef<"div">, "defaultValue"> & {
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	orientation?: TabsOrientation;
};

function Tabs({
	className,
	value,
	defaultValue,
	onValueChange,
	orientation = "horizontal",
	...props
}: TabsProps) {
	const generatedId = useId();
	const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
	const activeValue = value ?? uncontrolledValue;
	const context = useMemo<TabsContextValue>(
		() => ({
			activeValue,
			baseId: `tabs-${generatedId.replace(/:/g, "")}`,
			orientation,
			setActiveValue: (nextValue) => {
				if (value === undefined) setUncontrolledValue(nextValue);
				if (nextValue !== activeValue) onValueChange?.(nextValue);
			},
		}),
		[activeValue, generatedId, onValueChange, orientation, value]
	);

	return (
		<TabsContext.Provider value={context}>
			<div
				{...props}
				className={cn(
					"group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
					className
				)}
				data-orientation={orientation}
				data-slot="tabs"
			/>
		</TabsContext.Provider>
	);
}

const tabsListVariants = cva(
	"group/tabs-list inline-flex w-fit items-center justify-center rounded-xl p-1 text-muted-foreground data-[variant=line]:rounded-none group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
	{
		variants: {
			variant: {
				default: "bg-muted",
				line: "gap-1 bg-transparent",
			},
		},
		defaultVariants: { variant: "default" },
	}
);

export type TabsListProps = ComponentPropsWithoutRef<"div"> &
	VariantProps<typeof tabsListVariants>;

function TabsList({
	className,
	variant = "default",
	onKeyDown,
	...props
}: TabsListProps) {
	const { orientation } = useTabsContext("TabsList");

	function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		onKeyDown?.(event);
		if (event.defaultPrevented) return;

		const previousKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
		const nextKey = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
		if (![previousKey, nextKey, "Home", "End"].includes(event.key)) return;

		const triggers = Array.from(
			event.currentTarget.querySelectorAll<HTMLButtonElement>(
				'[role="tab"]:not(:disabled):not([aria-disabled="true"])'
			)
		);
		if (triggers.length === 0) return;

		event.preventDefault();
		const currentIndex = triggers.indexOf(document.activeElement as HTMLButtonElement);
		let nextIndex = 0;
		if (event.key === "End") nextIndex = triggers.length - 1;
		else if (event.key === nextKey) nextIndex = (currentIndex + 1 + triggers.length) % triggers.length;
		else if (event.key === previousKey) nextIndex = (currentIndex - 1 + triggers.length) % triggers.length;
		triggers[nextIndex]?.focus();
		triggers[nextIndex]?.click();
	}

	return (
		<div
			{...props}
			aria-orientation={orientation}
			className={cn(tabsListVariants({ variant }), className)}
			data-orientation={orientation}
			data-slot="tabs-list"
			data-variant={variant}
			onKeyDown={handleKeyDown}
			role="tablist"
		/>
	);
}

export type TabsTriggerProps = ComponentPropsWithoutRef<"button"> & {
	value: string;
};

function TabsTrigger({ className, value, onClick, ...props }: TabsTriggerProps) {
	const { activeValue, baseId, orientation, setActiveValue } = useTabsContext("TabsTrigger");
	const active = activeValue === value;
	const safeValue = encodeURIComponent(value);

	return (
		<button
			{...props}
			aria-controls={`${baseId}-panel-${safeValue}`}
			aria-selected={active}
			className={cn(
				"relative inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-transparent px-3 py-2 font-medium text-foreground/60 text-xs outline-none transition-all duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 active:scale-[.97] group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				"group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent",
				"data-active:bg-background data-active:text-foreground data-active:shadow-sm",
				"after:absolute after:bg-foreground after:opacity-0 after:transition-opacity after:duration-[180ms] group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:-bottom-1 group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
				className
			)}
			data-active={active ? "" : undefined}
			data-orientation={orientation}
			data-slot="tabs-trigger"
			id={`${baseId}-tab-${safeValue}`}
			onClick={(event) => {
				onClick?.(event);
				if (!event.defaultPrevented) setActiveValue(value);
			}}
			role="tab"
			tabIndex={active ? 0 : -1}
			type="button"
		/>
	);
}

export type TabsContentProps = ComponentPropsWithoutRef<"div"> & {
	value: string;
	forceMount?: boolean;
	children?: ReactNode;
};

function TabsContent({ className, value, forceMount = false, ...props }: TabsContentProps) {
	const { activeValue, baseId, orientation } = useTabsContext("TabsContent");
	const active = activeValue === value;
	const safeValue = encodeURIComponent(value);
	if (!forceMount && !active) return null;

	return (
		<div
			{...props}
			aria-labelledby={`${baseId}-tab-${safeValue}`}
			className={cn("flex-1 text-xs/relaxed outline-none", className)}
			data-active={active ? "" : undefined}
			data-orientation={orientation}
			data-slot="tabs-content"
			hidden={!active}
			id={`${baseId}-panel-${safeValue}`}
			role="tabpanel"
			tabIndex={0}
		/>
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
