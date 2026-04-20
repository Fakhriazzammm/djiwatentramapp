import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { Coffee, Globe, ShoppingCart, Users } from "lucide-react";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";

export const Route = createLazyFileRoute("/")({
	component: IndexPage,
});

function IndexPage() {
	const settings = useHybridSiteSettings();
	const appName = settings?.appName || "YumiPOS";
	const headerLogoUrl = settings?.headerLogoUrl || settings?.logoUrl || "";
	const landingTitle = settings?.landingTitle || "Point of Sale Modern untuk Bisnis Anda";
	const landingDescription =
		settings?.landingDescription ||
		"Kelola penjualan, inventori, dan laporan keuangan dalam satu aplikasi yang mudah digunakan.";

	return (
		<div className="flex min-h-app flex-col">
			{/* Header */}
			<header className="border-b border-border bg-card px-4 py-4">
				<div className="mx-auto flex max-w-6xl items-center justify-between">
					<div className="flex items-center gap-2">
						{headerLogoUrl ? (
							<div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-card p-1">
								<img
									alt={`${appName} logo`}
									className="h-full w-full object-contain"
									src={headerLogoUrl}
								/>
							</div>
						) : (
							<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
								<Coffee className="h-5 w-5 text-primary-foreground" />
							</div>
						)}
						<span className="font-bold text-xl">{appName}</span>
					</div>
					<nav className="flex items-center gap-2">
						<Link
							className="rounded-lg px-4 py-2 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
							to="/booking"
						>
							Booking
						</Link>

					</nav>
				</div>
			</header>

			{/* Hero Section */}
			<section className="flex flex-1 items-center justify-center bg-gradient-to-br from-muted/50 to-background px-4 py-16">
				<div className="mx-auto max-w-3xl text-center">
					<h1 className="mb-4 font-bold text-4xl text-foreground tracking-tight md:text-5xl lg:text-6xl">
						{landingTitle}
					</h1>
					<p className="mb-8 text-muted-foreground text-lg md:text-xl">
						{landingDescription}
					</p>
					<div className="flex flex-col justify-center gap-3 sm:flex-row">
						<Link
							className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground transition-opacity hover:opacity-90"
							to="/menu"
						>
							<ShoppingCart className="h-5 w-5" />
							Mulai POS
						</Link>
						<Link
							className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-3 font-semibold text-foreground transition-colors hover:bg-muted"
							to="/booking"
						>
							<Globe className="h-5 w-5" />
							Halaman Booking
						</Link>
					</div>
				</div>
			</section>

			{/* Features Section */}
			<section className="border-t border-border bg-card px-4 py-16">
				<div className="mx-auto max-w-6xl">
					<h2 className="mb-8 text-center font-bold text-2xl md:text-3xl">
						Fitur Unggulan
					</h2>
					<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
						<FeatureCard
							description="Proses transaksi dengan cepat dan mudah"
							icon={<ShoppingCart className="h-6 w-6" />}
							title="POS Cepat"
						/>
						<FeatureCard
							description="Pantau stok barang secara real-time"
							icon={<Coffee className="h-6 w-6" />}
							title="Inventori"
						/>
						<FeatureCard
							description="Lihat laporan penjualan dan keuangan"
							icon={<Globe className="h-6 w-6" />}
							title="Laporan"
						/>
						<FeatureCard
							description="Kelola pelanggan dan diskon"
							icon={<Users className="h-6 w-6" />}
							title="Pelanggan"
						/>
					</div>
				</div>
			</section>

			{/* Footer */}
			<footer className="border-t border-border bg-muted/30 px-4 py-6">
				<div className="mx-auto max-w-6xl text-center text-muted-foreground text-sm">
					<p>&copy; 2026 {appName}. All rights reserved.</p>
				</div>
			</footer>
		</div>
	);
}

function FeatureCard({
	icon,
	title,
	description,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
}) {
	return (
		<div className="rounded-xl border border-border bg-background p-6 transition-shadow hover:shadow-md">
			<div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
				{icon}
			</div>
			<h3 className="mb-2 font-semibold text-lg">{title}</h3>
			<p className="text-muted-foreground text-sm">{description}</p>
		</div>
	);
}
