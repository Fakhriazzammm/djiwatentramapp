"use client";

import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

type Side = "top" | "right" | "bottom" | "left" | "inline-start" | "inline-end";
type Align = "start" | "center" | "end";
type ItemRecord = { value: string; label: React.ReactNode; text: string; disabled: boolean; node: HTMLElement | null };

type SelectContextValue = {
  value: string;
  open: boolean;
  disabled: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  listboxId: string;
  items: React.MutableRefObject<Map<string, ItemRecord>>;
  selectedLabel: React.ReactNode;
  setOpen: (open: boolean) => void;
  select: (value: string) => void;
  register: (item: ItemRecord) => () => void;
  move: (direction: number | "first" | "last") => void;
  typeahead: (key: string) => void;
};

const SelectContext = React.createContext<SelectContextValue | null>(null);
function useSelect() {
  const context = React.useContext(SelectContext);
  if (!context) throw new Error("Select components must be used inside <Select>");
  return context;
}

function useControllableState<T>(controlled: T | undefined, initial: T, onChange?: (value: T) => void) {
  const [internal, setInternal] = React.useState(initial);
  const controlledRef = React.useRef(controlled);
  const onChangeRef = React.useRef(onChange);
  const value = controlled === undefined ? internal : controlled;
  const valueRef = React.useRef(value);
  controlledRef.current = controlled;
  onChangeRef.current = onChange;
  valueRef.current = value;
  const setValue = React.useCallback((next: T) => {
    if (controlledRef.current === undefined) setInternal(next);
    if (!Object.is(valueRef.current, next)) onChangeRef.current?.(next);
  }, []);
  return [value, setValue] as const;
}

function textFromNode(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromNode).join(" ");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textFromNode(node.props.children);
  return "";
}

function collectLabels(node: React.ReactNode, labels = new Map<string, React.ReactNode>()) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return;
    const type = child.type as { __selectItem?: boolean };
    if (type.__selectItem && typeof child.props.value === "string") {
      labels.set(child.props.value, child.props.children as React.ReactNode);
    }
    if (child.props.children) collectLabels(child.props.children as React.ReactNode, labels);
  });
  return labels;
}

export type SelectProps = {
  children?: React.ReactNode;
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  name?: string;
  required?: boolean;
  form?: string;
};

function Select({ children, value: valueProp, defaultValue = "", onValueChange, open: openProp, defaultOpen = false, onOpenChange, disabled = false, name, required, form }: SelectProps) {
  const [value, setValue] = useControllableState(valueProp ?? (valueProp === null ? "" : undefined), defaultValue ?? "", onValueChange);
  const [open, setOpenState] = useControllableState(openProp, defaultOpen, onOpenChange);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const generatedId = React.useId();
  const listboxId = `select-listbox-${generatedId}`;
  const items = React.useRef(new Map<string, ItemRecord>());
  const typeBuffer = React.useRef("");
  const typeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const labels = React.useMemo(() => collectLabels(children), [children]);

  const setOpen = React.useCallback((next: boolean) => {
    if (disabled && next) return;
    setOpenState(next);
  }, [disabled, setOpenState]);

  const select = React.useCallback((next: string) => {
    setValue(next);
    setOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }, [setOpen, setValue]);

  const enabledItems = React.useCallback(() => Array.from(items.current.values()).filter((item) => !item.disabled && item.node), []);
  const move = React.useCallback((direction: number | "first" | "last") => {
    const available = enabledItems();
    if (!available.length) return;
    const activeIndex = available.findIndex((item) => item.node === document.activeElement);
    const selectedIndex = available.findIndex((item) => item.value === value);
    let nextIndex = direction === "first" ? 0 : direction === "last" ? available.length - 1 : activeIndex >= 0 ? activeIndex + direction : selectedIndex >= 0 ? selectedIndex : direction > 0 ? 0 : available.length - 1;
    nextIndex = (nextIndex + available.length) % available.length;
    available[nextIndex]?.node?.focus();
  }, [enabledItems, value]);

  const typeahead = React.useCallback((key: string) => {
    if (typeTimer.current) clearTimeout(typeTimer.current);
    typeBuffer.current += key.toLocaleLowerCase();
    typeTimer.current = setTimeout(() => { typeBuffer.current = ""; }, 500);
    const available = enabledItems();
    const match = available.find((item) => item.text.toLocaleLowerCase().startsWith(typeBuffer.current));
    if (match) {
      if (open) match.node?.focus();
      else select(match.value);
    }
  }, [enabledItems, open, select]);

  const register = React.useCallback((item: ItemRecord) => {
    items.current.set(item.value, item);
    return () => items.current.delete(item.value);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !contentRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, setOpen]);

  React.useEffect(() => () => { if (typeTimer.current) clearTimeout(typeTimer.current); }, []);

  const context = React.useMemo<SelectContextValue>(() => ({
    value, open, disabled, triggerRef, contentRef, listboxId, items,
    selectedLabel: labels.get(value), setOpen, select, register, move, typeahead,
  }), [disabled, labels, listboxId, move, open, register, select, setOpen, typeahead, value]);

  return (
    <SelectContext.Provider value={context}>
      {children}
      {name && (
        <select
          aria-hidden="true"
          className="sr-only"
          disabled={disabled}
          form={form}
          name={name}
          onChange={(event) => setValue(event.currentTarget.value)}
          required={required}
          tabIndex={-1}
          value={value}
        >
          {!labels.has("") && <option value="" />}
          {Array.from(labels.entries()).map(([optionValue, label]) => (
            <option key={optionValue} value={optionValue}>{textFromNode(label)}</option>
          ))}
        </select>
      )}
    </SelectContext.Provider>
  );
}

export type SelectTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: "sm" | "default" | "lg" };
function SelectTrigger({ className, size = "default", children, onClick, onKeyDown, ...props }: SelectTriggerProps) {
  const context = useSelect();
  return (
    <button
      {...props}
      type="button"
      role="combobox"
      aria-controls={context.listboxId}
      aria-expanded={context.open}
      aria-haspopup="listbox"
      disabled={context.disabled || props.disabled}
      data-size={size}
      data-state={context.open ? "open" : "closed"}
      data-placeholder={context.value === "" ? "" : undefined}
      data-slot="select-trigger"
      ref={context.triggerRef}
      className={cn("flex min-h-11 w-full select-none items-center justify-between gap-1.5 whitespace-nowrap rounded-[14px] border border-input bg-background px-3 text-sm outline-none transition-[border-color,box-shadow,transform] duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-50 data-[size=sm]:min-h-9 data-[size=lg]:min-h-11 [&_svg]:pointer-events-none [&_svg]:shrink-0", className)}
      onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) context.setOpen(!context.open); }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
          event.preventDefault();
          if (!context.open) context.setOpen(true);
          queueMicrotask(() => context.move(event.key === "ArrowUp" ? -1 : 1));
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault(); context.setOpen(true); queueMicrotask(() => context.move(event.key === "Home" ? "first" : "last"));
        } else if (event.key === "Escape") {
          context.setOpen(false);
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          context.typeahead(event.key);
        }
      }}
    >
      {children}
      <ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-[180ms] data-[state=open]:rotate-180" data-state={context.open ? "open" : "closed"} />
    </button>
  );
}

export type SelectValueProps = React.HTMLAttributes<HTMLSpanElement> & { placeholder?: React.ReactNode };
function SelectValue({ className, placeholder, children, ...props }: SelectValueProps) {
  const context = useSelect();
  const display = children ?? context.selectedLabel;
  return <span className={cn("flex min-w-0 flex-1 items-center gap-1.5 text-left", !display && "text-muted-foreground", className)} data-slot="select-value" {...props}>{display || placeholder}</span>;
}

function positionStyle(trigger: DOMRect, side: Side, align: Align, sideOffset: number, alignOffset: number): React.CSSProperties {
  const physicalSide = side === "inline-start" ? "left" : side === "inline-end" ? "right" : side;
  const style: React.CSSProperties = { position: "fixed", minWidth: trigger.width, maxHeight: "min(320px, calc(100vh - 16px))" };
  if (physicalSide === "bottom") style.top = trigger.bottom + sideOffset;
  if (physicalSide === "top") style.bottom = window.innerHeight - trigger.top + sideOffset;
  if (physicalSide === "right") style.left = trigger.right + sideOffset;
  if (physicalSide === "left") style.right = window.innerWidth - trigger.left + sideOffset;
  if (physicalSide === "bottom" || physicalSide === "top") {
    if (align === "start") style.left = trigger.left + alignOffset;
    if (align === "center") style.left = trigger.left + trigger.width / 2 + alignOffset, style.transform = "translateX(-50%)";
    if (align === "end") style.right = window.innerWidth - trigger.right - alignOffset;
  } else {
    if (align === "start") style.top = trigger.top + alignOffset;
    if (align === "center") style.top = trigger.top + trigger.height / 2 + alignOffset, style.transform = "translateY(-50%)";
    if (align === "end") style.bottom = window.innerHeight - trigger.bottom - alignOffset;
  }
  return style;
}

export type SelectContentProps = React.HTMLAttributes<HTMLDivElement> & { side?: Side; sideOffset?: number; align?: Align; alignOffset?: number; alignItemWithTrigger?: boolean; container?: Element | DocumentFragment | null };
function SelectContent({ className, children, side = "bottom", sideOffset = 6, align = "start", alignOffset = 0, alignItemWithTrigger: _alignItemWithTrigger = true, container, onKeyDown, ...props }: SelectContentProps) {
  const context = useSelect();
  const [style, setStyle] = React.useState<React.CSSProperties>({ visibility: "hidden" });
  React.useLayoutEffect(() => {
    if (!context.open) return;
    const update = () => { if (context.triggerRef.current) setStyle(positionStyle(context.triggerRef.current.getBoundingClientRect(), side, align, sideOffset, alignOffset)); };
    update(); window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [align, alignOffset, context.open, context.triggerRef, side, sideOffset]);
  React.useEffect(() => {
    if (!context.open) return;
    queueMicrotask(() => {
      const selected = context.items.current.get(context.value);
      (selected?.disabled ? null : selected?.node)?.focus();
      if (!selected?.node) context.move("first");
    });
  }, [context.items, context.move, context.open, context.value]);
  if (!context.open || typeof document === "undefined") return null;
  return createPortal(
    <div
      {...props}
      id={context.listboxId}
      role="listbox"
      tabIndex={-1}
      ref={context.contentRef}
      style={{ ...style, ...props.style }}
      data-side={side}
      data-state="open"
      data-slot="select-content"
      className={cn("isolate z-[1002] min-w-36 overflow-y-auto overflow-x-hidden rounded-[24px] border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_18px_48px_rgba(9,9,11,0.12)] outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-[180ms] motion-safe:ease-[cubic-bezier(.32,.72,0,1)]", className)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); context.move(event.key === "ArrowDown" ? 1 : -1); }
        else if (event.key === "Home" || event.key === "End") { event.preventDefault(); context.move(event.key === "Home" ? "first" : "last"); }
        else if (event.key === "Enter" || event.key === " ") { const item = (document.activeElement as HTMLElement)?.dataset.selectValue; if (item !== undefined) { event.preventDefault(); context.select(item); } }
        else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          context.setOpen(false);
          context.triggerRef.current?.focus();
        }
        else if (event.key === "Tab") context.setOpen(false);
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) context.typeahead(event.key);
      }}
    >
      <SelectScrollUpButton />
      {children}
      <SelectScrollDownButton />
    </div>,
    container ?? document.body,
  );
}

function SelectGroup(props: React.HTMLAttributes<HTMLDivElement>) { return <div role="group" data-slot="select-group" {...props} className={cn("scroll-my-1", props.className)} />; }
function SelectLabel(props: React.HTMLAttributes<HTMLDivElement>) { return <div data-slot="select-label" {...props} className={cn("px-3 py-2 text-xs font-semibold text-muted-foreground", props.className)} />; }

export type SelectItemProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value"> & { value: string };
function SelectItem({ className, children, value, disabled = false, onClick, ...props }: SelectItemProps) {
  const context = useSelect();
  const ref = React.useRef<HTMLButtonElement>(null);
  const text = textFromNode(children).trim();
  React.useLayoutEffect(() => context.register({ value, label: children, text, disabled, node: ref.current }), [children, context, disabled, text, value]);
  const selected = context.value === value;
  return (
    <button
      {...props}
      type="button" role="option" aria-selected={selected} disabled={disabled} tabIndex={-1} ref={ref}
      data-disabled={disabled ? "" : undefined} data-state={selected ? "checked" : "unchecked"} data-select-value={value} data-slot="select-item"
      className={cn("relative flex min-h-11 w-full select-none items-center gap-2 rounded-[14px] py-2.5 pr-9 pl-3 text-left text-sm outline-none transition-colors duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] hover:bg-accent focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0", className)}
      onClick={(event) => { onClick?.(event); if (!event.defaultPrevented && !disabled) context.select(value); }}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {selected && <span className="pointer-events-none absolute right-3 flex size-4 items-center justify-center"><CheckIcon className="size-4" /></span>}
    </button>
  );
}
SelectItem.__selectItem = true;

function SelectSeparator(props: React.HTMLAttributes<HTMLDivElement>) { return <div role="separator" data-slot="select-separator" {...props} className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", props.className)} />; }
function SelectScrollUpButton({ className, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const context = useSelect();
  return <button type="button" tabIndex={-1} aria-label="Scroll up" data-slot="select-scroll-up-button" className={cn("sticky top-0 z-10 flex min-h-6 w-full items-center justify-center rounded-lg bg-popover", className)} onClick={(event) => { onClick?.(event); context.contentRef.current?.scrollBy({ top: -120, behavior: "smooth" }); }} {...props}><ChevronUpIcon className="size-4" /></button>;
}
function SelectScrollDownButton({ className, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const context = useSelect();
  return <button type="button" tabIndex={-1} aria-label="Scroll down" data-slot="select-scroll-down-button" className={cn("sticky bottom-0 z-10 flex min-h-6 w-full items-center justify-center rounded-lg bg-popover", className)} onClick={(event) => { onClick?.(event); context.contentRef.current?.scrollBy({ top: 120, behavior: "smooth" }); }} {...props}><ChevronDownIcon className="size-4" /></button>;
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger, SelectValue };
