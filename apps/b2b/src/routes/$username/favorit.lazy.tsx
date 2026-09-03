import { CustomerHeader } from "@/components/customer/customer-shell";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Heart, Search, Utensils } from "lucide-react";
import { useMemo, useState } from "react";
import { useHybridProducts } from "@/hooks/use-hybrid-pos-data";
import { useCustomerFavorites } from "@/hooks/use-customer-favorites";
import { currency } from "@/components/customer/types";
import { CustomerSectionSkeleton } from "@/components/customer/customer-states";

export const Route = createLazyFileRoute("/$username/favorit")({
	component: FavoritPage,
});

type ProductRow = Record<string, any>;

function ProductCard({ product, isFavorite, onToggle, onOrder }: {
	product: ProductRow;
	isFavorite: boolean;
	onToggle: () => void;
	onOrder: () => void;
}) {
	const image = typeof product.image === "string" && /^https?:\/\//.test(product.image) ? product.image : null;
	return (
		<div className="flex items-center gap-3 rounded-[20px] border border-border bg-card p-3 shadow-sm">
			{image ? (
				<img alt={product.name} src={image} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
			) : (
				<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-muted text-muted-foreground"><Utensils aria-hidden="true" className="h-5 w-5" strokeWidth={2} /></div>
			)}
			<button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={onOrder}>
				<p className="break-words text-xs font-black leading-snug">{product.name}</p>
				<p className="text-[11px] font-bold text-primary">{currency(Number(product.price ?? 0))}</p>
				{product.menuNumber ? (
					<p className="text-[10px] text-muted-foreground">Menu #{product.menuNumber}</p>
				) : null}
			</button>
			<button
				type="button"
				aria-label={isFavorite ? "Hapus dari favorit" : "Tambah ke favorit"}
				onClick={onToggle}
				className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
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
	const { favorites, toggle } = useCustomerFavorites();
	const [query, setQuery] = useState("");

	const goHome = () => navigate({ to: "/$username", params: { username } });
	const goOrder = () => navigate({ to: "/$username/order", params: { username }, search: { step: "menu" } });

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
		<div className="app-page b2b-app min-h-app">
			<div className="app-shell mx-auto min-h-app max-w-md bg-background">
				<CustomerHeader title="Favorit" subtitle="Djiwa Tentram" onBack={goHome} leading={<ArrowLeft className="h-4 w-4" />} />

				<main className="px-3 py-4">
					{products === undefined ? (
						<CustomerSectionSkeleton label="Memuat menu favorit" />
					) : (
						<>
							{/* ── Daftar favorit ── */}
							{favoriteProducts.length === 0 ? (
								<div className="flex flex-col items-center rounded-3xl border border-dashed border-border px-4 py-8 text-center">
									<Heart aria-hidden="true" className="h-8 w-8 text-primary" strokeWidth={2} />
									<h2 className="mt-3 font-display text-base font-black">Belum Ada Favorit</h2>
									<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
										Tandai menu kesukaanmu dengan tombol favorit supaya gampang dicari lagi.
									</p>
									<button type="button" onClick={goOrder} className="mt-4 min-h-11 rounded-[14px] bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground shadow-sm">
										Lihat menu
									</button>
								</div>
							) : (
								<div className="space-y-2">
									{favoriteProducts.map((p: ProductRow) => (
										<ProductCard
											key={String(p._id)}
											product={p}
											isFavorite
											onToggle={() => toggle(String(p._id))}
											onOrder={goOrder}
										/>
									))}
								</div>
							)}

							{/* ── Jelajahi menu ── */}
							<h2 className="mt-6 mb-2 text-xs font-black uppercase tracking-wider text-foreground">Jelajahi menu</h2>
							<div className="relative mb-2.5">
								<Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
								<input
									type="text"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="Cari menu..."
									aria-label="Cari menu"
									className="min-h-11 w-full rounded-[14px] border border-border bg-background py-2 pl-9 pr-3 text-xs outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
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
											onToggle={() => toggle(String(p._id))}
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
