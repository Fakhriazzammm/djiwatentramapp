import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Package, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { CustomerPageSkeleton } from "@/components/customer/customer-states";
import { currency } from "@/components/customer/types";
import { useHybridProducts } from "@/hooks/use-hybrid-pos-data";
import { B2B_BRAND_NAME } from "@/lib/marketplace-config";

export const Route = createLazyFileRoute("/")({
	component: B2BLandingPage,
});

const FALLBACK_PRODUCT = {
	name: "Mie Mentah Kiloan Djiwa Tentram",
	description: "Mie mentah kiloan Djiwa Tentram untuk kebutuhan produksi B2B.",
	price: 30000,
	image: "/mie-yamin-product.png",
};

function B2BLandingPage() {
	const navigate = useNavigate();
	const { customer, isAuthenticated, isLoading } = useCustomerAuth();
	const products = useHybridProducts();
	const product = products?.find((item) => Number(item.menuNumber) === 3013);
	const productIsLoading = products == null;
	const isAvailable = product ? product.isAvailable !== false && Number(product.quantity ?? 0) > 0 : false;

	useEffect(() => {
		if (!isLoading && isAuthenticated && customer) {
			navigate({ to: "/$username/order", params: { username: customer.username }, search: { step: "menu" }, replace: true });
		}
	}, [customer, isAuthenticated, isLoading, navigate]);

	const startOrdering = () => {
		if (isAuthenticated && customer) {
			navigate({ to: "/$username/order", params: { username: customer.username }, search: { step: "menu" } });
			return;
		}
		window.localStorage.setItem("b2b-checkout-intent", "produksi");
		navigate({ to: "/daftar" });
	};

	if (isLoading) return <CustomerPageSkeleton label="Memeriksa sesi Djiwa Tentram" />;

	const name = product?.name || FALLBACK_PRODUCT.name;
	const description = product?.description || FALLBACK_PRODUCT.description;
	const price = Number(product?.price ?? FALLBACK_PRODUCT.price);
	const image = typeof product?.image === "string" && product.image.trim() ? product.image : FALLBACK_PRODUCT.image;

	return (
		<div className="app-page b2b-app min-h-app bg-background">
			<div className="app-shell mx-auto flex min-h-app w-full max-w-md flex-col">
				<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur-xl">
					<div className="flex items-center gap-3">
						<img src="/logo-djiwa.png" alt="Djiwa Tentram" className="h-10 w-10 rounded-xl object-contain" />
						<div className="min-w-0">
							<p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Djiwa Tentram</p>
							<h1 className="truncate text-sm font-black">B2B Supply</h1>
						</div>
					</div>
				</header>

				<main className="flex-1 space-y-4 px-3 py-4 sm:py-6">
					<section className="rounded-[26px] bg-primary px-5 py-6 text-primary-foreground shadow-sm">
						<p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70">SUPLAI MIE B2B DJIWA TENTRAM</p>
						<h2 className="mt-2 font-display text-3xl font-black leading-tight">Mie mentah kiloan untuk operasional usaha.</h2>
						<p className="mt-3 text-sm leading-relaxed text-white/80">Pesan langsung dari Djiwa Tentram untuk warung mie, restoran, cafe, dan kebutuhan dapur produksi.</p>
						<button type="button" onClick={startOrdering} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-primary shadow-sm transition-transform active:scale-[.98]">
							Pesan mie sekarang <ArrowRight aria-hidden="true" className="h-4 w-4" />
						</button>
					</section>

					<section className="overflow-hidden rounded-[24px] border border-border bg-card shadow-sm">
						<div className="relative h-52 bg-muted">
							<img src={image} alt={name} className="h-full w-full object-cover" />
							<span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-black text-white">#3013</span>
							<span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-black text-foreground">Produksi</span>
						</div>
						<div className="space-y-2.5 p-4">
							<p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Produk B2B</p>
							<h3 className="text-xl font-black leading-tight">{name}</h3>
							<p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
							<div className="flex items-end justify-between gap-3 pt-2">
								<p className="text-2xl font-black text-primary">{currency(price)}<span className="text-xs font-bold text-muted-foreground"> / kilo</span></p>
								<span className={`rounded-full px-2.5 py-1 text-xs font-black ${productIsLoading ? "bg-muted text-muted-foreground" : isAvailable ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{productIsLoading ? "Memeriksa stok" : isAvailable ? "Aktif" : "SOLD"}</span>
							</div>
						</div>
					</section>

					<section className="rounded-[22px] border border-border bg-card p-4">
						<p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Untuk kebutuhan usaha</p>
						<div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-bold">
							{["Warung mie", "Restoran & cafe", "Dapur produksi"].map((label) => <div className="rounded-xl bg-muted/60 px-2 py-3" key={label}>{label}</div>)}
						</div>
					</section>

					<section className="space-y-2 rounded-[22px] border border-border bg-card p-4 text-sm">
						{["Harga jelas per kilo", "Pesan sesuai kebutuhan produksi", "Pantau status pesanan dari satu akun"].map((label) => <div className="flex items-start gap-2.5" key={label}><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{label}</span></div>)}
					</section>

					<button type="button" onClick={startOrdering} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-white shadow-sm transition-transform active:scale-[.98]">
						Pesan mie sekarang <ArrowRight aria-hidden="true" className="h-4 w-4" />
					</button>
					<div className="flex items-center justify-center gap-2 pb-3 text-center text-[11px] text-muted-foreground"><ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />Satu akun Djiwa Tentram untuk order dan pantau status pesanan.</div>
				</main>
			</div>
		</div>
	);
}
