"use client";

import { CheckIcon } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

type MenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
};

const MenuContext = React.createContext<MenuContextValue | null>(null);
function useMenu(component: string) {
  const value = React.useContext(MenuContext);
  if (!value) throw new Error(`${component} must be used inside DropdownMenu`);
  return value;
}

function mergeHandlers<E>(first: ((event: E) => void) | undefined, second: (event: E) => void) {
  return (event: E) => {
    first?.(event);
    if (!(event as { defaultPrevented?: boolean }).defaultPrevented) second(event);
  };
}

function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    }
  };
}

function DropdownMenu({ children, open: controlledOpen, defaultOpen = false, onOpenChange }: {
  children?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
}) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const triggerRef = React.useRef<HTMLElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const controlledOpenRef = React.useRef(controlledOpen);
  const onOpenChangeRef = React.useRef(onOpenChange);
  controlledOpenRef.current = controlledOpen;
  onOpenChangeRef.current = onOpenChange;
  const open = controlledOpen ?? internalOpen;
  const setOpen = React.useCallback((next: boolean) => {
    if (controlledOpenRef.current === undefined) setInternalOpen(next);
    onOpenChangeRef.current?.(next);
  }, []);
  const value = React.useMemo(() => ({ open, setOpen, triggerRef, contentRef }), [open, setOpen]);
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

function DropdownMenuPortal({ children }: { children?: React.ReactNode; container?: HTMLElement | null }) {
  return <>{children}</>;
}

type DropdownMenuTriggerProps = React.HTMLAttributes<HTMLElement> & {
  asChild?: boolean;
  disabled?: boolean;
  render?: React.ReactElement | ((props: TriggerInjectedProps) => React.ReactElement);
};

type TriggerInjectedProps = React.HTMLAttributes<HTMLElement> & {
  ref: (node: HTMLElement | null) => void;
  "data-slot"?: string;
  "data-state"?: string;
};

const DropdownMenuTrigger = React.forwardRef<HTMLElement, DropdownMenuTriggerProps>(
  function DropdownMenuTrigger({ children, asChild = false, disabled = false, render, onClick, onKeyDown, ...props }, forwardedRef) {
    const menu = useMenu("DropdownMenuTrigger");
    const setRefs = (node: HTMLElement | null) => {
      menu.triggerRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    };
    const shared: TriggerInjectedProps = {
      ...props,
      ref: setRefs,
      "data-slot": "dropdown-menu-trigger",
      "data-state": menu.open ? "open" : "closed",
      "aria-haspopup": "menu",
      "aria-expanded": menu.open,
      onClick: mergeHandlers(onClick, () => { if (!disabled) menu.setOpen(!menu.open); }),
      onKeyDown: mergeHandlers(onKeyDown, (event: React.KeyboardEvent<HTMLElement>) => {
        if (!disabled && ["Enter", " ", "ArrowDown"].includes(event.key)) {
          event.preventDefault();
          menu.setOpen(true);
        }
      }),
    };
    const rendered = typeof render === "function" ? render(shared) : render;
    const candidate = rendered ?? (asChild && React.isValidElement(children) ? children : null);
    if (React.isValidElement(candidate)) {
      const child = candidate as React.ReactElement<Record<string, unknown>>;
      const childProps = child.props;
      const childOnClick = childProps.onClick as ((event: React.MouseEvent<HTMLElement>) => void) | undefined;
      const childOnKeyDown = childProps.onKeyDown as ((event: React.KeyboardEvent<HTMLElement>) => void) | undefined;
      const childRef = childProps.ref as React.Ref<HTMLElement> | undefined;
      const sharedOnClick = shared.onClick as (event: React.MouseEvent<HTMLElement>) => void;
      const sharedOnKeyDown = shared.onKeyDown as (event: React.KeyboardEvent<HTMLElement>) => void;
      return React.cloneElement(child, {
        ...childProps,
        ...shared,
        className: cn(childProps.className as string | undefined, props.className),
        ref: childRef && childRef !== shared.ref ? composeRefs(childRef, shared.ref) : shared.ref,
        onClick: childOnClick && childOnClick !== sharedOnClick ? mergeHandlers(childOnClick, sharedOnClick) : sharedOnClick,
        onKeyDown: childOnKeyDown && childOnKeyDown !== sharedOnKeyDown ? mergeHandlers(childOnKeyDown, sharedOnKeyDown) : sharedOnKeyDown,
      }, children ?? (childProps.children as React.ReactNode));
    }
    return <button type="button" disabled={disabled} {...(shared as React.ButtonHTMLAttributes<HTMLButtonElement>)}>{children}</button>;
  },
);

type MenuSide = "top" | "right" | "bottom" | "left";
type MenuAlign = "start" | "center" | "end";

function getPosition(trigger: DOMRect, side: MenuSide, align: MenuAlign, sideOffset: number, alignOffset: number): React.CSSProperties {
  const style: React.CSSProperties = { position: "fixed", maxHeight: "min(420px, calc(100dvh - 24px))" };
  if (side === "bottom") style.top = trigger.bottom + sideOffset;
  if (side === "top") style.bottom = window.innerHeight - trigger.top + sideOffset;
  if (side === "right") style.left = trigger.right + sideOffset;
  if (side === "left") style.right = window.innerWidth - trigger.left + sideOffset;
  if (side === "top" || side === "bottom") {
    if (align === "start") style.left = trigger.left + alignOffset;
    if (align === "center") { style.left = trigger.left + trigger.width / 2 + alignOffset; style.transform = "translateX(-50%)"; }
    if (align === "end") style.right = window.innerWidth - trigger.right - alignOffset;
    style.minWidth = trigger.width;
  } else {
    if (align === "start") style.top = trigger.top + alignOffset;
    if (align === "center") { style.top = trigger.top + trigger.height / 2 + alignOffset; style.transform = "translateY(-50%)"; }
    if (align === "end") style.bottom = window.innerHeight - trigger.bottom - alignOffset;
  }
  return style;
}

const DropdownMenuContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & {
  align?: MenuAlign;
  alignOffset?: number;
  side?: MenuSide;
  sideOffset?: number;
  container?: HTMLElement | null;
}>(function DropdownMenuContent({ className, children, align = "start", alignOffset = 0, side = "bottom", sideOffset = 6, container, onKeyDown, ...props }, forwardedRef) {
  const menu = useMenu("DropdownMenuContent");
  const [style, setStyle] = React.useState<React.CSSProperties>({ visibility: "hidden" });
  React.useLayoutEffect(() => {
    if (!menu.open || !menu.triggerRef.current) return;
    const update = () => menu.triggerRef.current && setStyle(getPosition(menu.triggerRef.current.getBoundingClientRect(), side, align, sideOffset, alignOffset));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [align, alignOffset, menu.open, menu.triggerRef, side, sideOffset]);
  React.useEffect(() => {
    if (!menu.open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => menu.contentRef.current?.querySelector<HTMLElement>("[role^='menuitem']:not([aria-disabled='true'])")?.focus());
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.contentRef.current?.contains(target) && !menu.triggerRef.current?.contains(target)) menu.setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("pointerdown", outside); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [menu.open, menu.setOpen, menu.contentRef, menu.triggerRef]);
  if (!menu.open || typeof document === "undefined") return null;
  return createPortal(
    <div
      {...props}
      ref={(node) => {
        menu.contentRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      role="menu"
      tabIndex={-1}
      data-slot="dropdown-menu-content"
      data-state="open"
      data-side={side}
      style={{ ...style, ...props.style }}
      className={cn("z-[1010] min-w-40 overflow-y-auto rounded-[20px] border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-[0_18px_48px_rgba(9,9,11,0.12)] outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-[180ms]", className)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        const items = Array.from(menu.contentRef.current?.querySelectorAll("[role^='menuitem']:not([aria-disabled='true'])") ?? []) as HTMLElement[];
        const current = items.indexOf(document.activeElement as HTMLElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const direction = event.key === "ArrowDown" ? 1 : -1;
          items[(current + direction + items.length) % items.length]?.focus();
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault(); (event.key === "Home" ? items[0] : items[items.length - 1])?.focus();
        } else if (event.key === "Escape" || event.key === "Tab") {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
          }
          menu.setOpen(false);
          menu.triggerRef.current?.focus();
        }
      }}
    >{children}</div>,
    container ?? document.body,
  );
});

function DropdownMenuGroup(props: React.HTMLAttributes<HTMLDivElement>) { return <div role="group" data-slot="dropdown-menu-group" {...props} />; }
function DropdownMenuLabel({ className, inset, ...props }: React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }) {
  return <div data-slot="dropdown-menu-label" data-inset={inset || undefined} className={cn("px-3 py-2 text-xs font-semibold text-muted-foreground data-[inset]:pl-8", className)} {...props} />;
}

type ItemProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect"> & {
  inset?: boolean;
  variant?: "default" | "destructive";
  onSelect?: (event: Event) => void;
};
const DropdownMenuItem = React.forwardRef<HTMLButtonElement, ItemProps>(function DropdownMenuItem({ className, inset, variant = "default", disabled, onClick, onSelect, children, ...props }, ref) {
  const menu = useMenu("DropdownMenuItem");
  return <button {...props} ref={ref} type="button" role="menuitem" tabIndex={-1} disabled={disabled} aria-disabled={disabled} data-slot="dropdown-menu-item" data-inset={inset || undefined} data-variant={variant} className={cn("relative flex min-h-11 w-full select-none items-center gap-2 rounded-[14px] px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus:bg-accent disabled:pointer-events-none disabled:opacity-50 data-[inset]:pl-8 data-[variant=destructive]:text-destructive", className)} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || disabled) return;
    const selectEvent = new Event("select", { cancelable: true });
    onSelect?.(selectEvent);
    if (!selectEvent.defaultPrevented) menu.setOpen(false);
  }}>{children}</button>;
});

function DropdownMenuSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div role="separator" data-slot="dropdown-menu-separator" className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />; }
function DropdownMenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) { return <span data-slot="dropdown-menu-shortcut" className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)} {...props} />; }

function DropdownMenuCheckboxItem({ checked = false, onCheckedChange, children, ...props }: ItemProps & { checked?: boolean; onCheckedChange?: (checked: boolean) => void }) {
  return <DropdownMenuItem {...props} role="menuitemcheckbox" aria-checked={checked} onSelect={(event) => { props.onSelect?.(event); if (!event.defaultPrevented) { event.preventDefault(); onCheckedChange?.(!checked); } }}><span className="flex size-4 items-center justify-center">{checked && <CheckIcon className="size-4" />}</span>{children}</DropdownMenuItem>;
}

const RadioContext = React.createContext<{ value?: string; setValue?: (value: string) => void }>({});
function DropdownMenuRadioGroup({ value, onValueChange, ...props }: React.HTMLAttributes<HTMLDivElement> & { value?: string; onValueChange?: (value: string) => void }) { return <RadioContext.Provider value={{ value, setValue: onValueChange }}><div role="group" {...props} /></RadioContext.Provider>; }
function DropdownMenuRadioItem({ value, children, ...props }: ItemProps & { value: string }) {
  const radio = React.useContext(RadioContext); const checked = radio.value === value;
  return <DropdownMenuItem {...props} role="menuitemradio" aria-checked={checked} onSelect={(event) => { props.onSelect?.(event); if (!event.defaultPrevented) radio.setValue?.(value); }}><span className="flex size-4 items-center justify-center">{checked && <CheckIcon className="size-4" />}</span>{children}</DropdownMenuItem>;
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
};
