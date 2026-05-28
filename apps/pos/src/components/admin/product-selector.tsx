import { Search, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

interface ProductItem {
	_id: string;
	name: string;
	price?: number;
	categoryId?: string;
}

interface ProductSelectorProps {
	products: ProductItem[];
	recipes: Array<{ productId: string }> | null | undefined;
	selectedProductId?: string;
	onSelect: (productId: string) => void;
	onCreateNew: () => void;
}

function safeLower(value: unknown) {
	return typeof value === "string" ? value.toLowerCase() : "";
}

export function ProductSelector({
	products,
	recipes,
	selectedProductId,
	onSelect,
	onCreateNew,
}: ProductSelectorProps) {
	const [search, setSearch] = useState("");
	const [isOpen, setIsOpen] = useState(false);

	const wrapperRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Build a recipe lookup map (memoized)
	const recipeMap = useMemo(() => {
		if (!recipes) return new Map<string, boolean>();
		return new Map(recipes.map((r) => [r.productId, true]));
	}, [recipes]);

	// Filter products by search text
	const filteredProducts = useMemo(() => {
		if (!search.trim()) return products;
		const q = safeLower(search.trim());
		return products.filter(
			(p) => safeLower(p.name).includes(q) || safeLower(p.categoryId).includes(q),
		);
	}, [products, search]);

	// Click-outside handler
	const handleClickOutside = useCallback((e: MouseEvent) => {
		if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
			setIsOpen(false);
		}
	}, []);

	useEffect(() => {
		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
			return () => document.removeEventListener("mousedown", handleClickOutside);
		}
	}, [isOpen, handleClickOutside]);

	// Close on escape
	useEffect(() => {
		if (!isOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setIsOpen(false);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [isOpen]);

	const handleSelect = useCallback(
		(id: string) => {
			onSelect(id);
			setIsOpen(false);
			setSearch("");
		},
		[onSelect],
	);

	const handleCreateNew = useCallback(() => {
		onCreateNew();
		setIsOpen(false);
		setSearch("");
	}, [onCreateNew]);

	const handleInputFocus = useCallback(() => {
		setIsOpen(true);
	}, []);

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			setSearch(e.target.value);
			if (!isOpen) setIsOpen(true);
		},
		[isOpen],
	);

	return (
		<div ref={wrapperRef} className="relative">
			{/* Search Input Trigger */}
			<div className="relative">
				<Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
				<Input
					ref={inputRef}
					placeholder="Cari produk... (nama, kategori)"
					value={search}
					onChange={handleInputChange}
					onFocus={handleInputFocus}
					className="h-8 pl-7 text-[11px]"
				/>
			</div>

			{/* Dropdown */}
			{isOpen && (
				<div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[300px] overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
					{/* Product list */}
					{filteredProducts.length === 0 ? (
						<div className="px-3 py-4 text-center text-[10px] text-muted-foreground">
							{search
								? `Tidak ada produk "${search}"`
								: "Tidak ada produk tersedia"}
						</div>
					) : (
						filteredProducts.map((product) => {
							const hasRecipe = recipeMap.has(product._id);
							return (
								<div
									key={product._id}
									className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[11px] hover:bg-accent ${
										product._id === selectedProductId
											? "bg-accent font-medium"
											: ""
									}`}
									onClick={() => handleSelect(product._id)}
									onKeyDown={(e) => {
										if (e.key === "Enter") handleSelect(product._id);
									}}
									role="option"
									aria-selected={product._id === selectedProductId}
									tabIndex={0}
								>
									{/* Recipe status badge */}
									{hasRecipe ? (
										<span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600">
											✅
										</span>
									) : (
										<span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">
											⚠️
										</span>
									)}

									{/* Product name */}
									<span className="flex-1 truncate">{product.name}</span>

									{/* Price */}
									{product.price != null && (
										<span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
											Rp{product.price.toLocaleString("id-ID")}
										</span>
									)}
								</div>
							);
						})
					)}

					{/* Divider + Create New */}
					<div className="mt-1 border-t pt-1">
						<div
							className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-primary hover:bg-accent"
							onClick={handleCreateNew}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleCreateNew();
							}}
							role="button"
							tabIndex={0}
						>
							<Plus className="h-3.5 w-3.5 shrink-0" />
							<span>Buat Baru</span>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
