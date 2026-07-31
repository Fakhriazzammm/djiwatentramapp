"use client";

import { XIcon } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "../../lib/utils";

const TRANSITION_MS = 320;
const FOCUSABLE_SELECTOR = [
	"a[href]",
	"area[href]",
	"button:not([disabled])",
	"input:not([disabled]):not([type='hidden'])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"iframe",
	"audio[controls]",
	"video[controls]",
	"[contenteditable='true']",
	"[tabindex]:not([tabindex='-1'])",
].join(",");

let bodyLockCount = 0;
let originalBodyOverflow = "";
const openLayerStack: string[] = [];

function lockBodyScroll() {
	if (typeof document === "undefined") return () => undefined;
	if (bodyLockCount === 0) {
		originalBodyOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
	}
	bodyLockCount += 1;

	let released = false;
	return () => {
		if (released) return;
		released = true;
		bodyLockCount = Math.max(0, bodyLockCount - 1);
		if (bodyLockCount === 0) document.body.style.overflow = originalBodyOverflow;
	};
}

function inertDialogBackground(panel: HTMLElement) {
	const changed: Array<{ element: HTMLElement; inert: boolean; ariaHidden: string | null }> = [];
	for (const element of Array.from(document.body.children) as HTMLElement[]) {
		if (element === panel || element.contains(panel) || element.dataset.slot === "dialog-overlay") continue;
		changed.push({ element, inert: element.inert, ariaHidden: element.getAttribute("aria-hidden") });
		element.inert = true;
		element.setAttribute("aria-hidden", "true");
	}
	return () => {
		for (const { element, inert, ariaHidden } of changed) {
			element.inert = inert;
			if (ariaHidden === null) element.removeAttribute("aria-hidden");
			else element.setAttribute("aria-hidden", ariaHidden);
		}
	};
}

function addOpenLayer(id: string) {
	openLayerStack.push(id);
	return () => {
		const index = openLayerStack.lastIndexOf(id);
		if (index >= 0) openLayerStack.splice(index, 1);
	};
}

function isTopLayer(id: string) {
	return openLayerStack[openLayerStack.length - 1] === id;
}

function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
	return (node: T | null) => {
		for (const ref of refs) {
			if (typeof ref === "function") ref(node);
			else if (ref) ref.current = node;
		}
	};
}

function usePresence(open: boolean) {
	const [present, setPresent] = React.useState(open);

	React.useEffect(() => {
		if (open) {
			setPresent(true);
			return;
		}
		const timeout = window.setTimeout(() => setPresent(false), TRANSITION_MS);
		return () => window.clearTimeout(timeout);
	}, [open]);

	return present;
}

interface DialogContextValue {
	open: boolean;
	setOpen: (open: boolean) => void;
	triggerRef: React.MutableRefObject<HTMLElement | null>;
	titleId?: string;
	descriptionId?: string;
	setTitleId: React.Dispatch<React.SetStateAction<string | undefined>>;
	setDescriptionId: React.Dispatch<React.SetStateAction<string | undefined>>;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext(component: string) {
	const context = React.useContext(DialogContext);
	if (!context) throw new Error(`${component} must be used inside Dialog`);
	return context;
}

export interface DialogProps {
	children?: React.ReactNode;
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
}

function Dialog({ children, open: controlledOpen, defaultOpen = false, onOpenChange }: DialogProps) {
	const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
	const [titleId, setTitleId] = React.useState<string>();
	const [descriptionId, setDescriptionId] = React.useState<string>();
	const triggerRef = React.useRef<HTMLElement | null>(null);
	const controlledOpenRef = React.useRef(controlledOpen);
	const onOpenChangeRef = React.useRef(onOpenChange);
	controlledOpenRef.current = controlledOpen;
	onOpenChangeRef.current = onOpenChange;
	const open = controlledOpen ?? uncontrolledOpen;
	const setOpen = React.useCallback((nextOpen: boolean) => {
		if (controlledOpenRef.current === undefined) setUncontrolledOpen(nextOpen);
		onOpenChangeRef.current?.(nextOpen);
	}, []);
	const value = React.useMemo(
		() => ({ open, setOpen, triggerRef, titleId, descriptionId, setTitleId, setDescriptionId }),
		[open, setOpen, titleId, descriptionId]
	);

	return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

type RenderProp = React.ReactElement | ((props: Record<string, unknown>) => React.ReactElement);

interface SlottableButtonProps extends Omit<React.ComponentPropsWithoutRef<"button">, "children"> {
	children?: React.ReactNode;
	asChild?: boolean;
	render?: RenderProp;
}

function renderButtonSlot(
	props: SlottableButtonProps,
	forwardedRef: React.Ref<HTMLElement>,
	injectedProps: Record<string, unknown>
) {
	const { asChild, render, children, ...buttonProps } = props;
	const candidate = typeof render === "function" ? render(injectedProps) : render;
	const child = candidate ?? (asChild ? React.Children.only(children) : null);

	if (React.isValidElement(child)) {
		const childProps = child.props as Record<string, unknown>;
		const childRef = childProps.ref as React.Ref<HTMLElement> | undefined;
		const childOnClick = childProps.onClick as ((event: React.MouseEvent<HTMLElement>) => void) | undefined;
		const injectedOnClick = injectedProps.onClick as ((event: React.MouseEvent<HTMLElement>) => void) | undefined;
		const mergedProps = {
			...buttonProps,
			...childProps,
			...injectedProps,
			className: cn(buttonProps.className, childProps.className as string | undefined),
			ref: composeRefs(childRef, forwardedRef),
			onClick:
				childOnClick && childOnClick !== injectedOnClick
					? (event: React.MouseEvent<HTMLElement>) => {
						childOnClick(event);
						if (!event.defaultPrevented) injectedOnClick?.(event);
					}
					: injectedOnClick,
		};
		return React.cloneElement(
			child as React.ReactElement<Record<string, unknown>>,
			mergedProps,
			(children ?? childProps.children) as React.ReactNode
		);
	}

	return (
		<button {...buttonProps} {...injectedProps} ref={forwardedRef as React.Ref<HTMLButtonElement>}>
			{children}
		</button>
	);
}

const DialogTrigger = React.forwardRef<HTMLElement, SlottableButtonProps>(function DialogTrigger(
	{ onClick, ...props },
	forwardedRef
) {
	const context = useDialogContext("DialogTrigger");
	return renderButtonSlot(props, composeRefs(forwardedRef, context.triggerRef), {
		"aria-expanded": context.open,
		"aria-haspopup": "dialog",
		"data-slot": "dialog-trigger",
		"data-state": context.open ? "open" : "closed",
		type: "button",
		onClick: (event: React.MouseEvent<HTMLElement>) => {
			onClick?.(event as React.MouseEvent<HTMLButtonElement>);
			if (!event.defaultPrevented) context.setOpen(true);
		},
	});
});

const DialogClose = React.forwardRef<HTMLElement, SlottableButtonProps>(function DialogClose(
	{ onClick, ...props },
	forwardedRef
) {
	const context = useDialogContext("DialogClose");
	return renderButtonSlot(props, forwardedRef, {
		"data-slot": "dialog-close",
		type: "button",
		onClick: (event: React.MouseEvent<HTMLElement>) => {
			onClick?.(event as React.MouseEvent<HTMLButtonElement>);
			if (!event.defaultPrevented) context.setOpen(false);
		},
	});
});

export interface DialogPortalProps {
	children?: React.ReactNode;
	container?: Element | DocumentFragment | null;
}

function DialogPortal({ children, container }: DialogPortalProps) {
	const { open } = useDialogContext("DialogPortal");
	const present = usePresence(open);
	if (!present || typeof document === "undefined") return null;
	return createPortal(children, container ?? document.body);
}

const DialogOverlay = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
	function DialogOverlay({ className, onClick, ...props }, forwardedRef) {
		const context = useDialogContext("DialogOverlay");
		return (
			<div
				{...props}
				ref={forwardedRef}
				aria-hidden="true"
				data-slot="dialog-overlay"
				data-state={context.open ? "open" : "closed"}
				className={cn(
					"fixed inset-0 isolate z-[1000] bg-foreground/45 backdrop-blur-md transition-opacity duration-[320ms] ease-[cubic-bezier(.32,.72,0,1)] data-[state=closed]:opacity-0 data-[state=open]:opacity-100 motion-reduce:transition-none supports-[backdrop-filter]:bg-foreground/30",
					className
				)}
				onClick={(event) => {
					onClick?.(event);
					if (!event.defaultPrevented && event.target === event.currentTarget) context.setOpen(false);
				}}
			/>
		);
	}
);

type ContentVariant = "dialog" | "top" | "right" | "bottom" | "left";

export interface DialogContentProps extends React.ComponentPropsWithoutRef<"div"> {
	showCloseButton?: boolean;
	/** @internal Used by the shared Sheet compatibility primitive. */
	__variant?: ContentVariant;
	/** @internal Used by the shared Sheet compatibility primitive. */
	__overlay?: React.ReactNode;
}

function variantClasses(variant: ContentVariant) {
	if (variant === "dialog") {
		return "top-1/2 left-1/2 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-[24px] p-6 data-[state=closed]:scale-95 data-[state=open]:scale-100 sm:max-w-sm";
	}
	return cn(
		"flex flex-col",
		variant === "right" &&
			"inset-y-0 right-0 h-full w-full border-l data-[state=closed]:translate-x-full data-[state=open]:translate-x-0 sm:max-w-sm",
		variant === "left" &&
			"inset-y-0 left-0 h-full w-full border-r data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0 sm:max-w-sm",
		variant === "top" &&
			"inset-x-0 top-0 h-auto max-h-[90vh] border-b rounded-b-[24px] data-[state=closed]:-translate-y-full data-[state=open]:translate-y-0",
		variant === "bottom" &&
			"inset-x-0 bottom-0 h-auto max-h-[90dvh] rounded-t-[24px] border-t data-[state=closed]:translate-y-full data-[state=open]:translate-y-0"
	);
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(function DialogContent(
	{
		className,
		children,
		showCloseButton = true,
		__variant = "dialog",
		__overlay,
		"aria-labelledby": ariaLabelledBy,
		"aria-describedby": ariaDescribedBy,
		"aria-label": ariaLabel,
		...props
	},
	forwardedRef
) {
	const context = useDialogContext("DialogContent");
	const contentRef = React.useRef<HTMLDivElement | null>(null);
	const layerId = React.useId();

	React.useEffect(() => {
		if (!context.open) return;
		const releaseBodyLock = lockBodyScroll();
		const removeLayer = addOpenLayer(layerId);
		const restoreBackground = contentRef.current ? inertDialogBackground(contentRef.current) : () => undefined;
		const previouslyFocused = document.activeElement as HTMLElement | null;
		const frame = window.requestAnimationFrame(() => {
			const panel = contentRef.current;
			if (!panel || !isTopLayer(layerId)) return;
			const initial = panel.querySelector<HTMLElement>("[autofocus]") ?? panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
			(initial ?? panel).focus({ preventScroll: true });
		});

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented || !isTopLayer(layerId)) return;
			if (event.key === "Escape") {
				event.preventDefault();
				context.setOpen(false);
				return;
			}
			if (event.key !== "Tab") return;
			const panel = contentRef.current;
			if (!panel) return;
			const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
				(element) => !element.hidden && element.getAttribute("aria-hidden") !== "true"
			);
			if (focusable.length === 0) {
				event.preventDefault();
				panel.focus();
				return;
			}
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (!panel.contains(document.activeElement)) {
				event.preventDefault();
				(event.shiftKey ? last : first).focus();
			} else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		};
		document.addEventListener("keydown", onKeyDown);

		return () => {
			window.cancelAnimationFrame(frame);
			document.removeEventListener("keydown", onKeyDown);
			removeLayer();
			restoreBackground();
			releaseBodyLock();
			const focusTarget = context.triggerRef.current ?? previouslyFocused;
			if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
		};
	}, [context.open, context.setOpen, context.triggerRef, layerId]);

	return (
		<DialogPortal>
			{__overlay ?? <DialogOverlay />}
			<div
				{...props}
				ref={composeRefs(contentRef, forwardedRef)}
				role="dialog"
				aria-modal="true"
				aria-label={ariaLabel ?? (ariaLabelledBy || context.titleId ? undefined : (__variant === "dialog" ? "Dialog" : "Panel"))}
				aria-labelledby={ariaLabelledBy ?? context.titleId}
				aria-describedby={ariaDescribedBy ?? context.descriptionId}
				data-slot={__variant === "dialog" ? "dialog-content" : "sheet-content"}
				data-side={__variant === "dialog" ? undefined : __variant}
				data-state={context.open ? "open" : "closed"}
				tabIndex={-1}
				className={cn(
					"fixed z-[1001] border border-border/70 bg-background bg-clip-padding text-xs/relaxed opacity-100 shadow-[0_24px_60px_rgba(9,9,11,0.12)] outline-none transition-[opacity,transform] duration-[320ms] ease-[cubic-bezier(.32,.72,0,1)] data-[state=closed]:opacity-0 data-[state=open]:opacity-100 motion-reduce:transition-none",
					variantClasses(__variant),
					className
				)}
			>
				{children}
				{showCloseButton && (
					<DialogClose
						aria-label="Tutup dialog"
						className="absolute top-3 right-3 inline-flex h-11 w-11 items-center justify-center rounded-[14px] text-muted-foreground transition-[color,background-color,transform] duration-180 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[.97] motion-reduce:transition-none"
					>
						<XIcon aria-hidden="true" className="size-4" />
						<span className="sr-only">Tutup dialog</span>
					</DialogClose>
				)}
			</div>
		</DialogPortal>
	);
});

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="dialog-header" className={cn("flex flex-col gap-1 text-left", className)} {...props} />;
}

function DialogFooter({ className, showCloseButton = false, children, ...props }: React.ComponentProps<"div"> & { showCloseButton?: boolean }) {
	return (
		<div data-slot="dialog-footer" className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props}>
			{children}
			{showCloseButton && (
				<DialogClose className="inline-flex min-h-11 items-center justify-center rounded-[14px] border border-border bg-background px-4 font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
					Close
				</DialogClose>
			)}
		</div>
	);
}

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<"h2">>(
	function DialogTitle({ className, id: providedId, ...props }, forwardedRef) {
		const context = useDialogContext("DialogTitle");
		const generatedId = React.useId();
		const id = providedId ?? generatedId;
		React.useEffect(() => {
			context.setTitleId(id);
			return () => context.setTitleId((current) => (current === id ? undefined : current));
		}, [context.setTitleId, id]);
		return <h2 ref={forwardedRef} id={id} data-slot="dialog-title" className={cn("text-sm font-medium", className)} {...props} />;
	}
);

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<"p">>(
	function DialogDescription({ className, id: providedId, ...props }, forwardedRef) {
		const context = useDialogContext("DialogDescription");
		const generatedId = React.useId();
		const id = providedId ?? generatedId;
		React.useEffect(() => {
			context.setDescriptionId(id);
			return () => context.setDescriptionId((current) => (current === id ? undefined : current));
		}, [context.setDescriptionId, id]);
		return (
			<p
				ref={forwardedRef}
				id={id}
				data-slot="dialog-description"
				className={cn("text-xs/relaxed text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground", className)}
				{...props}
			/>
		);
	}
);

export {
	Dialog,
	DialogTrigger,
	DialogPortal,
	DialogClose,
	DialogOverlay,
	DialogContent,
	DialogHeader,
	DialogFooter,
	DialogTitle,
	DialogDescription,
};
