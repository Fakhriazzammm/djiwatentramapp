import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Heart, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useHybridProducts } from "@/hooks/use-hybrid-pos-data";
import { currency } from "@/components/customer/types";

export const Route = createLazyFileRoute("/$username/favorit")({
	component: FavoritPage,
});

const FAVORITES_KEY = "djiwa-customer-favorites";

function loadFavorites(): string[] {
	try {
		const raw = localStorage.getItem(FAVORITES_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.map(String) : [];
	} catch {
		return [];
	}
}

type ProductRow = Record<string, any>;

function ProductCard({ product, isFavorite, onToggle, onOrder }: {
	product: ProductRow;
	isFavorite: boolean;
	onToggle: () => void;
	onOrder: () => void;
}) {
	const image = typeof product.image === "string" && /^https?:\/\//.test(product.image) ? product.image : null;
	return (
		<div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 shadow-sm">
			{image ? (
				<img alt={product.name} src={image} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
			) : (
				<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">🍽️</div>
			)}
			<button type="button" className="min-w-0 flex-1 text-left" onClick={onOrder}>
				<p className="truncate text-xs font-black">{product.name}</p>
				<p className="text-[11px] font-bold text-primary">{currency(Number(product.price ?? 0))}</p>
				{product.menuNumber ? (
					<p className="text-[10px] text-muted-foreground">Menu #{product.menuNumber}</p>
				) : null}
			</button>
			<button
				type="button"
				aria-label={isFavorite ? "Hapus dari favorit" : "Tambah ke favorit"}
				onClick={onToggle}
				className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
					isFavorite ? "bg-red-50 text-red-500" : "bg-muted text-muted-foreground hover:text-red-400"
				}`}
			>
				<Heart className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
			</button>
		</div>
	);
}

function FavoritPage() {
	const { username } = Route.useParams();
	const navigate = useNavigate();
	const products = useHybridProducts();
	const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
	const [query, setQuery] = useState("");

	useEffect(() => {
		try {
			localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
		} catch {}
	}, [favorites]);

	const goHome = () => navigate({ to: "/$username", params: { username } });
	const goOrder = () => navigate({ to: "/$username/order", params: { username }, search: { step: "menu" } });

	const toggleFavorite = (id: string) => {
		setFavorites((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
	};

	const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

	const favoriteProducts = useMemo(
		() => (products ?? []).filter((p: ProductRow) => favoriteSet.has(String(p._id))),
		[products, favoriteSet],
	);

	const browseProducts = useMemo(() => {
		const list = (products ?? []).filter((p: ProductRow) => !favoriteSet.has(String(p._id)));
		const q = query.trim().toLowerCase();
		if (!q) return list;
		return list.filter((p: ProductRow) =>
			String(p.name ?? "").toLowerCase().includes(q) ||
			String(p.menuNumber ?? "").toLowerCase().includes(q),
		);
	}, [products, favoriteSet, query]);

	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto min-h-app max-w-md bg-background">
				<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
					<div className="flex items-center gap-2">
						<button type="button" onClick={goHome} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
							<ArrowLeft className="h-4 w-4" /> Kembali
						</button>
						<h1 className="ml-1 text-sm font-black tracking-tight">Favorit</h1>
					</div>
				</header>

				<main className="px-3 py-4">
					{products === undefined ? (
						<div className="flex items-center justify-center py-20">
							<Loader2 className="h-5 w-5 animate-spin text-primary" />
						</div>
					) : (
						<>
							{/* ── Daftar favorit ── */}
							{favoriteProducts.length === 0 ? (
								<div className="flex flex-col items-center rounded-xl border border-dashed border-border px-4 py-8 text-center">
									<span className="text-4xl">⭐</span>
									<h2 className="mt-2 text-base font-black">Belum Ada Favorit</h2>
									<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
										Tandai menu kesukaanmu dengan ikon ❤️ di bawah supaya gampang dicari lagi.
									</p>
								</div>
							) : (
								<div className="space-y-2">
									{favoriteProducts.map((p: ProductRow) => (
										<ProductCard
											key={String(p._id)}
											product={p}
											isFavorite
											onToggle={() => toggleFavorite(String(p._id))}
											onOrder={goOrder}
										/>
									))}
								</div>
							)}

							{/* ── Jelajahi menu ── */}
							<h2 className="mt-6 mb-2 text-xs font-black uppercase tracking-wider text-foreground">Semua Menu</h2>
							<div className="relative mb-2.5">
								<Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
								<input
									type="text"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="Cari menu..."
									className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-xs outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
								/>
							</div>
							{browseProducts.length === 0 ? (
								<p className="py-6 text-center text-xs text-muted-foreground">Tidak ada menu yang cocok.</p>
							) : (
								<div className="space-y-2">
									{browseProducts.map((p: ProductRow) => (
										<ProductCard
											key={String(p._id)}
											product={p}
											isFavorite={false}
											onToggle={() => toggleFavorite(String(p._id))}
											onOrder={goOrder}
										/>
									))}
								</div>
							)}
						</>
					)}
				</main>
			</div>
		</div>
	);
}
