/**
 * SEARCH BAR COMPONENT
 *
 * Enhanced search dengan debounce, suggestions, dan keyboard navigation.
 */

import { Clock, Mic, Search, X } from "lucide-react";
import {
	type HTMLAttributes,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

export interface SearchSuggestion {
	id: string;
	label: string;
	type?: "product" | "category" | "history";
	icon?: ReactNode;
}

export interface SearchBarProps
	extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
	/**
	 * Current search value
	 */
	value?: string;

	/**
	 * On change callback
	 */
	onChange?: (value: string) => void;

	/**
	 * On search callback (when user submits)
	 */
	onSearch?: (value: string) => void;

	/**
	 * On clear callback
	 */
	onClear?: () => void;

	/**
	 * Placeholder text
	 * @default "Cari menu..."
	 */
	placeholder?: string;

	/**
	 * Debounce delay in ms
	 * @default 300
	 */
	debounceMs?: number;

	/**
	 * Suggestions to show
	 */
	suggestions?: SearchSuggestion[];

	/**
	 * Recent searches
	 */
	recentSearches?: string[];

	/**
	 * Whether to show voice search
	 * @default false
	 */
	enableVoice?: boolean;

	/**
	 * On voice search callback
	 */
	onVoiceSearch?: () => void;

	/**
	 * Loading state
	 */
	loading?: boolean;

	/**
	 * Size variant
	 * @default "md"
	 */
	size?: "sm" | "md" | "lg";

	/**
	 * Icon to show instead of default search icon
	 */
	icon?: ReactNode;

	/**
	 * Whether to show clear button
	 * @default true
	 */
	showClear?: boolean;

	/**
	 * Whether suggestions are visible
	 */
	suggestionsVisible?: boolean;
}

const sizeClasses = {
	sm: "h-9 px-3 text-sm",
	md: "h-10 px-4 text-sm",
	lg: "h-12 px-5 text-base",
} as const;

const iconSizeClasses = {
	sm: "h-4 w-4",
	md: "h-4 w-4",
	lg: "h-5 w-5",
} as const;

// ============================================
// SEARCH BAR COMPONENT
// ============================================

export function SearchBar({
	value: controlledValue,
	onChange,
	onSearch,
	onClear,
	placeholder = "Cari menu...",
	debounceMs = 300,
	suggestions = [],
	recentSearches = [],
	enableVoice = false,
	onVoiceSearch,
	loading = false,
	size = "md",
	icon,
	showClear = true,
	suggestionsVisible,
	className,
	...props
}: SearchBarProps) {
	const [uncontrolledValue, setUncontrolledValue] = useState("");
	const [isFocused, setIsFocused] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(-1);
	const inputRef = useRef<HTMLInputElement>(null);
	const debounceTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

	const isControlled = controlledValue !== undefined;
	const inputValue = isControlled ? controlledValue : uncontrolledValue;
	const hasValue = inputValue.length > 0;
	const showSuggestions = (suggestionsVisible ?? isFocused) && hasValue;

	// Debounced search
	const debouncedOnChange = useCallback(
		(newValue: string) => {
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}

			debounceTimerRef.current = setTimeout(() => {
				onChange?.(newValue);
			}, debounceMs);
		},
		[onChange, debounceMs]
	);

	const handleChange = (newValue: string) => {
		if (!isControlled) {
			setUncontrolledValue(newValue);
		}
		debouncedOnChange(newValue);
		setSelectedIndex(-1);
	};

	const handleClear = () => {
		handleChange("");
		onClear?.();
		inputRef.current?.focus();
	};

	const handleSubmit = (submittedValue?: string) => {
		const valueToSubmit = submittedValue ?? inputValue;
		onSearch?.(valueToSubmit);
		setIsFocused(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		const items = [...(recentSearches || []), ...suggestions];

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : prev));
				break;
			case "ArrowUp":
				e.preventDefault();
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
				break;
			case "Enter":
				e.preventDefault();
				if (selectedIndex >= 0 && items[selectedIndex]) {
					const item = items[selectedIndex];
					const itemLabel = typeof item === "string" ? item : item.label;
					handleSubmit(itemLabel || inputValue);
				} else {
					handleSubmit();
				}
				break;
			case "Escape":
				setIsFocused(false);
				setSelectedIndex(-1);
				break;
			default:
				// No action needed for other keys
				break;
		}
	};

	// Voice search
	const handleVoiceSearch = () => {
		if (!(enableVoice && onVoiceSearch)) {
			return;
		}

		// Check if browser supports Web Speech API
		if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
			onVoiceSearch();
		} else {
			console.warn("Speech recognition not supported in this browser");
		}
	};

	// Clean up debounce timer
	useEffect(() => {
		return () => {
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}
		};
	}, []);

	const allSuggestions = [
		...recentSearches.map((label, i) => ({
			id: `recent-${i}`,
			label,
			type: "history" as const,
			icon: <Clock className={iconSizeClasses[size]} />,
		})),
		...suggestions,
	];

	return (
		<div className={cn("relative w-full", className)} {...props}>
			{/* Input Container */}
			<div
				className={cn(
					"flex items-center gap-2 rounded-full border border-border bg-card pr-2 shadow-sm transition-shadow",
					"focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/20",
					sizeClasses[size],
					isFocused && "shadow-md"
				)}
			>
				{/* Search Icon */}
				<span className="pl-3 text-muted-foreground">
					{icon ?? <Search className={iconSizeClasses[size]} />}
				</span>

				{/* Input */}
				<input
					className={cn(
						"flex-1 border-none bg-transparent outline-none placeholder:text-muted-foreground",
						"disabled:cursor-not-allowed disabled:opacity-50"
					)}
					onBlur={(_e) => {
						// Delay to allow clicking on suggestions
						setTimeout(() => setIsFocused(false), 200);
					}}
					onChange={(e) => handleChange(e.target.value)}
					onFocus={() => setIsFocused(true)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					ref={inputRef}
					type="text"
					value={inputValue}
				/>

				{/* Actions */}
				<div className="flex items-center gap-1">
					{loading && (
						<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					)}

					{enableVoice && (
						<button
							className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							onClick={handleVoiceSearch}
							title="Cari dengan suara"
							type="button"
						>
							<Mic className={iconSizeClasses[size]} />
						</button>
					)}

					{showClear && hasValue && (
						<button
							className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							onClick={handleClear}
							title="Hapus pencarian"
							type="button"
						>
							<X className={iconSizeClasses[size]} />
						</button>
					)}
				</div>
			</div>

			{/* Suggestions Dropdown */}
			{showSuggestions && allSuggestions.length > 0 && (
				<div
					className={cn(
						"absolute top-full z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg",
						"animate-fadeIn"
					)}
				>
					<ul className="max-h-64 overflow-y-auto py-1">
						{allSuggestions.map((suggestion, index) => (
							<li key={suggestion.id}>
								<button
									className={cn(
										"flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
										"hover:bg-muted focus:bg-muted focus:outline-none",
										selectedIndex === index && "bg-muted"
									)}
									onClick={() => handleSubmit(suggestion.label)}
									type="button"
								>
									{suggestion.icon && (
										<span className="text-muted-foreground">
											{suggestion.icon}
										</span>
									)}
									<span className="flex-1 truncate text-sm">
										{suggestion.label}
									</span>
									{suggestion.type && (
										<span className="text-muted-foreground text-xs uppercase tracking-wider">
											{suggestion.type}
										</span>
									)}
								</button>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}

SearchBar.displayName = "SearchBar";

// ============================================
// QUICK SEARCH TRIGGER (Floating Action Button)
// ============================================

export interface QuickSearchTriggerProps
	extends HTMLAttributes<HTMLButtonElement> {
	/**
	 * Whether search is active
	 */
	isActive?: boolean;

	/**
	 * Badge count (e.g., recent searches)
	 */
	badge?: number;

	/**
	 * Size
	 * @default "md"
	 */
	size?: "sm" | "md" | "lg";
}

const triggerSizes = {
	sm: "h-10 w-10",
	md: "h-12 w-12",
	lg: "h-14 w-14",
} as const;

export function QuickSearchTrigger({
	isActive = false,
	badge,
	size = "md",
	className,
	...props
}: QuickSearchTriggerProps) {
	return (
		<button
			className={cn(
				"fixed right-4 bottom-20 z-40 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all",
				"hover:scale-110 active:scale-95",
				"focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
				triggerSizes[size],
				isActive && "hidden",
				className
			)}
			type="button"
			{...props}
		>
			<Search className="h-5 w-5" />
			{badge !== undefined && badge > 0 && (
				<span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive font-bold text-[10px]">
					{badge > 9 ? "9+" : badge}
				</span>
			)}
		</button>
	);
}

QuickSearchTrigger.displayName = "QuickSearchTrigger";
