import {
	forwardRef,
	useEffect,
	useRef,
	useState,
	type ComponentPropsWithoutRef,
	type Ref,
} from "react";
import { CheckIcon, MinusIcon } from "lucide-react";

import { cn } from "../../lib/utils";

export type CheckedState = boolean | "indeterminate";
type CheckedChangeHandler = {
	bivarianceHack(checked: CheckedState): void;
}["bivarianceHack"];

export type CheckboxProps = Omit<
	ComponentPropsWithoutRef<"input">,
	"checked" | "defaultChecked" | "onChange" | "type"
> & {
	checked?: CheckedState;
	defaultChecked?: CheckedState;
	onCheckedChange?: CheckedChangeHandler;
};

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
	if (typeof ref === "function") ref(value);
	else if (ref) ref.current = value;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
	{
		className,
		checked,
		defaultChecked = false,
		onCheckedChange,
		disabled,
		...props
	},
	forwardedRef
) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [uncontrolledChecked, setUncontrolledChecked] = useState<CheckedState>(defaultChecked);
	const currentChecked = checked ?? uncontrolledChecked;
	const isIndeterminate = currentChecked === "indeterminate";
	const isChecked = currentChecked === true;

	useEffect(() => {
		if (inputRef.current) inputRef.current.indeterminate = isIndeterminate;
	}, [isIndeterminate]);

	return (
		<span
			className="relative inline-flex size-4 shrink-0 items-center justify-center after:absolute after:-inset-3 after:content-['']"
			data-slot="checkbox-control"
		>
			<input
				{...props}
				aria-checked={isIndeterminate ? "mixed" : isChecked}
				checked={isChecked}
				className={cn(
					"peer size-4 shrink-0 cursor-pointer appearance-none rounded-[5px] border border-input bg-background outline-none transition-all duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 data-checked:border-primary data-checked:bg-primary active:scale-[.97]",
					className
				)}
				data-checked={isChecked || isIndeterminate ? "" : undefined}
				data-indeterminate={isIndeterminate ? "" : undefined}
				data-slot="checkbox"
				disabled={disabled}
				onChange={(event) => {
					const nextChecked = event.currentTarget.checked;
					if (checked === undefined) setUncontrolledChecked(nextChecked);
					onCheckedChange?.(nextChecked);
				}}
				ref={(node) => {
					inputRef.current = node;
					assignRef(forwardedRef, node);
				}}
				type="checkbox"
			/>
			<span
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 grid place-content-center text-primary-foreground [&>svg]:size-3"
				data-slot="checkbox-indicator"
			>
				{isIndeterminate ? <MinusIcon strokeWidth={3} /> : isChecked ? <CheckIcon strokeWidth={3} /> : null}
			</span>
		</span>
	);
});

export { Checkbox };
