"use client";

import * as React from "react";

import { cn } from "../../lib/utils";

type CollapsibleContextValue = {
	contentId: string;
	disabled: boolean;
	onOpenToggle: () => void;
	open: boolean;
	triggerId: string;
};

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null);

function useCollapsibleContext(component: string) {
	const context = React.useContext(CollapsibleContext);

	if (!context) {
		throw new Error(`${component} must be used within Collapsible`);
	}

	return context;
}

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
	if (typeof ref === "function") {
		ref(value);
	} else if (ref) {
		ref.current = value;
	}
}

type SlotProps = React.HTMLAttributes<HTMLElement> & {
	children?: React.ReactNode;
};

const Slot = React.forwardRef<HTMLElement, SlotProps>(function Slot(
	{ children, ...slotProps },
	forwardedRef
) {
	if (!React.isValidElement<Record<string, unknown>>(children)) {
		throw new Error("Collapsible asChild requires exactly one React element");
	}

	const childProps = children.props;
	const mergedProps: Record<string, unknown> = {
		...childProps,
		...slotProps,
		className: cn(slotProps.className, childProps.className as string | undefined),
		style: {
			...(slotProps.style ?? {}),
			...((childProps.style as React.CSSProperties | undefined) ?? {}),
		},
	};

	for (const [name, handler] of Object.entries(slotProps)) {
		const childHandler = childProps[name];
		if (/^on[A-Z]/.test(name) && typeof handler === "function" && typeof childHandler === "function") {
			mergedProps[name] = (...args: unknown[]) => {
				childHandler(...args);
				const event = args[0] as { defaultPrevented?: boolean } | undefined;
				if (!event?.defaultPrevented) {
					handler(...args);
				}
			};
		}
	}

	const childRef = childProps.ref as React.Ref<HTMLElement> | undefined;
	mergedProps.ref = (node: HTMLElement | null) => {
		setRef(childRef, node);
		setRef(forwardedRef, node);
	};

	return React.cloneElement(children, mergedProps);
});

type CollapsibleProps = Omit<React.ComponentPropsWithoutRef<"div">, "defaultValue"> & {
	asChild?: boolean;
	defaultOpen?: boolean;
	disabled?: boolean;
	onOpenChange?: (open: boolean) => void;
	open?: boolean;
};

const Collapsible = React.forwardRef<HTMLDivElement, CollapsibleProps>(function Collapsible(
	{
		asChild = false,
		defaultOpen = false,
		disabled = false,
		onOpenChange,
		open: controlledOpen,
		...props
	},
	forwardedRef
) {
	const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
	const open = controlledOpen ?? uncontrolledOpen;
	const generatedId = React.useId();
	const triggerId = `collapsible-trigger-${generatedId}`;
	const contentId = `collapsible-content-${generatedId}`;

	const onOpenToggle = React.useCallback(() => {
		if (disabled) return;

		const nextOpen = !open;
		if (controlledOpen === undefined) {
			setUncontrolledOpen(nextOpen);
		}
		onOpenChange?.(nextOpen);
	}, [controlledOpen, disabled, onOpenChange, open]);

	const context = React.useMemo(
		() => ({ contentId, disabled, onOpenToggle, open, triggerId }),
		[contentId, disabled, onOpenToggle, open, triggerId]
	);
	const Component = asChild ? Slot : "div";

	return (
		<CollapsibleContext.Provider value={context}>
			<Component
				data-disabled={disabled ? "" : undefined}
				data-slot="collapsible"
				data-state={open ? "open" : "closed"}
				ref={forwardedRef}
				{...props}
			/>
		</CollapsibleContext.Provider>
	);
});

type CollapsibleTriggerProps = React.ComponentPropsWithoutRef<"button"> & {
	asChild?: boolean;
};

const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
	function CollapsibleTrigger(
		{ asChild = false, disabled, onClick, type, ...props },
		forwardedRef
	) {
		const context = useCollapsibleContext("CollapsibleTrigger");
		const isDisabled = context.disabled || Boolean(disabled);
		const Component = asChild ? Slot : "button";

		return (
			<Component
				{...props}
				aria-controls={context.contentId}
				aria-disabled={asChild && isDisabled ? true : undefined}
				aria-expanded={context.open}
				data-disabled={isDisabled ? "" : undefined}
				data-slot="collapsible-trigger"
				data-state={context.open ? "open" : "closed"}
				disabled={asChild ? undefined : isDisabled}
				id={context.triggerId}
				onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
					onClick?.(event);
					if (!event.defaultPrevented && !isDisabled) {
						context.onOpenToggle();
					}
				}}
				ref={forwardedRef}
				type={asChild ? undefined : (type ?? "button")}
			/>
		);
	}
);

type CollapsibleContentProps = React.ComponentPropsWithoutRef<"div"> & {
	asChild?: boolean;
	forceMount?: true;
};

const CollapsibleContent = React.forwardRef<HTMLDivElement, CollapsibleContentProps>(
	function CollapsibleContent(
		{ asChild = false, className, forceMount: _forceMount, hidden, ...props },
		forwardedRef
	) {
		const context = useCollapsibleContext("CollapsibleContent");
		const Component = asChild ? Slot : "div";

		return (
			<Component
				{...props}
				aria-labelledby={context.triggerId}
				className={cn(
					"data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-[320ms] data-[state=open]:ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:animate-none",
					className
				)}
				data-slot="collapsible-content"
				data-state={context.open ? "open" : "closed"}
				hidden={hidden || !context.open}
				id={context.contentId}
				ref={forwardedRef}
			/>
		);
	}
);

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
export type { CollapsibleContentProps, CollapsibleProps, CollapsibleTriggerProps };
