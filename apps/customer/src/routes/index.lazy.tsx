import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock, Coins, LogIn, MapPin, PartyPopper, Phone, ShoppingCart, Tags, UtensilsCrossed } from "lucide-react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useHybridProducts, useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { AuthModal } from "@/components/customer/auth-modal";
import { CustomerPageSkeleton } from "@/components/customer/customer-states";
import { currency } from "@/components/customer/types";

export const Route = createLazyFileRoute("/")({
	component: BrandCustomerIndex,
});

function BrandCustomerIndex() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const {
		isAuthenticated,
		isLoading,
		customer,
		login,
		register,
		logout,
		resetPassword,
		signInWithGoogle,
		registrationNeedsEmailConfirm,
	} = useCustomerAuth();

	const [authModalOpen, setAuthModalOpen] = useState(false);
	const [authError, setAuthError] = useState<string | undefined>(undefined);

	const storeName = import.meta.env.VITE_BRAND_NAME || "Djiwatentram";
	const logoUrl = import.meta.env.VITE_BRAND_LOGO_URL || "";

	// ── Data tambahan landing: menu preview + info toko ─────────
	const products = useHybridProducts();
	const siteSettings = useHybridSiteSettings();
	const featuredProducts = (products ?? []).slice(0, 4);
	const openingHours = typeof siteSettings?.openingHours === "string" && siteSettings.openingHours.trim() ? siteSettings.openingHours : null;
	const storePhone = typeof siteSettings?.storePhone === "string" && siteSettings.storePhone.trim() ? siteSettings.storePhone : null;
	const storeAddress = typeof siteSettings?.storeAddress === "string" && siteSettings.storeAddress.trim() ? siteSettings.storeAddress : null;

	// ponytail: sudah login → langsung ke /{username}, bukan /order
	useEffect(() => {
		if (isAuthenticated && customer) {
			navigate({ to: `/${customer.username}` });
		}
	}, [isAuthenticated, customer, navigate]);

	// ── Loading state ────────────────────────────────────────────
	// Cegah flash welcome page untuk user yang sudah login
	if (isLoading) {
		return <CustomerPageSkeleton label="Menyiapkan halaman" />;
	}

	// ── Guest welcome page ───────────────────────────────────
	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto flex min-h-app max-w-md flex-col bg-background lg:max-w-5xl">
				{/* ── Sticky header ────────────────────────────── */}
				<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
					<div className="flex items-center gap-2">
						{logoUrl ? (
							<img
								alt={storeName}
								className="h-10 w-10 rounded-xl object-contain"
								src={logoUrl}
							/>
						) : (
							<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
								<ShoppingCart className="h-5 w-5" />
							</div>
						)}
						<div>
							<p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
								Welcome
							</p>
							<h1 className="text-sm font-black tracking-tight">
								{storeName}
							</h1>
						</div>
					</div>
				</header>

				{/* ── Welcome card di tengah ───────────────────── */}
				<main className="flex flex-1 items-start justify-center px-3 py-4 sm:items-center sm:py-6">
					<section className="flex w-full flex-col items-center justify-center text-center">
						<div className="grid w-full gap-3 lg:grid-cols-[1.05fr_1fr] lg:items-stretch lg:gap-4">
							{/* ── Card utama ─────────────────────── */}
							<div className="app-card-strong w-full px-4 py-6">
								<p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
									Pesan lebih mudah
								</p>
								<h2 className="mt-1 font-display text-2xl font-black tracking-tight text-balance">
									Pesan favoritmu, tanpa antre
								</h2>
								<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
									Pesan online tanpa antri — praktis dan cepat.
								</p>

								{/* ── Tombol Mulai pesan ──────────────── */}
								<button
									type="button"
									className="mt-4 min-h-11 w-full rounded-[14px] bg-primary px-5 py-2.5 text-sm font-black text-white shadow-sm transition-transform duration-[180ms] active:scale-[.97]"
									onClick={() => navigate({ to: "/daftar" })}
								>
									Mulai pesan
								</button>

								{/* ── Benefit list ────────────────────── */}
								<div className="mt-4 grid grid-cols-3 gap-1.5">
									{[
										{ icon: Coins, label: "Poin Member" },
										{ icon: PartyPopper, label: "Happy Hour 15rb" },
										{ icon: Tags, label: "Promo Eksklusif" },
									].map((b) => (
										<div key={b.label} className="flex min-h-24 flex-col items-center justify-center rounded-[14px] border border-border/60 bg-muted/30 px-2 py-3 text-center">
											<b.icon aria-hidden="true" className="mx-auto h-5 w-5 text-primary" strokeWidth={2} />
											<p className="mt-1 text-[11px] font-bold leading-tight text-muted-foreground">{b.label}</p>
										</div>
									))}
								</div>

								{/* ── Tombol Masuk / Daftar ───────────── */}
								<button
									type="button"
									className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[14px] border border-border bg-background px-3 py-2.5 text-xs font-black text-muted-foreground transition-all duration-[180ms] hover:bg-muted hover:text-foreground active:scale-[.97]"
									onClick={() => setAuthModalOpen(true)}
								>
									<LogIn className="h-3.5 w-3.5" />
									Masuk / Daftar Member
								</button>
							</div>

							{/* ── Kolom kanan: preview menu + info ─── */}
							<div className="flex w-full flex-col gap-3">
								{/* Menu preview */}
								{featuredProducts.length > 0 ? (
									<div className="app-card-strong w-full px-4 py-4 text-left">
										<div className="flex items-center justify-between">
											<p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Menu Favorit</p>
											<button
												type="button"
												onClick={() => navigate({ to: "/daftar" })}
												className="min-h-11 rounded-[14px] px-2 py-1 text-[11px] font-black text-primary hover:bg-primary/10"
											>
											Lihat semua →
											</button>
										</div>
										<div className="mt-3 grid grid-cols-2 gap-2.5">
											{featuredProducts.map((p) => {
												const image = typeof p.image === "string" && /^https?:\/\//.test(p.image) ? p.image : null;
												return (
													<button
														type="button"
														key={String(p._id)}
														onClick={() => navigate({ to: "/daftar" })}
														className="overflow-hidden rounded-[20px] border border-border bg-card text-left shadow-sm transition-all duration-[180ms] active:scale-[.97]"
													>
														<div className="relative h-24 w-full bg-muted">
															{image ? <img alt={p.name} className="h-full w-full object-cover" src={image} /> : <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground"><UtensilsCrossed aria-hidden="true" className="h-5 w-5" strokeWidth={2} /></div>}
															{p.menuNumber != null ? <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-bold text-white shadow">#{p.menuNumber}</span> : null}
														</div>
														<div className="space-y-1 p-2.5">
															<p className="break-words text-xs font-black leading-snug">{p.name}</p>
															<p className="text-sm font-black text-primary">{currency(Number(p.price ?? 0))}</p>
														</div>
													</button>
												);
											})}
										</div>
									</div>
								) : null}

								{/* Info toko */}
								{openingHours || storePhone || storeAddress ? (
									<div className="app-card-strong w-full px-4 py-4 text-left">
										<p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Info Restoran</p>
										<div className="mt-2.5 space-y-2">
											{openingHours ? (
												<div className="flex items-start gap-2.5">
													<Clock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
													<div>
														<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Jam operasional</p>
														<p className="text-xs font-bold leading-snug">{openingHours}</p>
													</div>
												</div>
											) : null}
											{storePhone ? (
												<div className="flex items-start gap-2.5">
													<Phone aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
													<div>
														<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Telepon</p>
														<a href={`tel:${storePhone.replace(/[^+\d]/g, "")}`} className="text-xs font-bold leading-snug text-primary">{storePhone}</a>
													</div>
												</div>
											) : null}
											{storeAddress ? (
												<div className="flex items-start gap-2.5">
													<MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
													<div>
														<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Alamat</p>
														<p className="text-xs font-bold leading-snug">{storeAddress}</p>
													</div>
												</div>
											) : null}
										</div>
									</div>
								) : null}
							</div>
						</div>
					</section>
				</main>

				{/* ── Auth Modal ───────────────────────────────── */}
				<AuthModal
					open={authModalOpen}
					onOpenChange={(val) => {
						setAuthModalOpen(val);
						if (!val) setAuthError(undefined);
					}}
					onLogin={async (email, password) => {
						try {
							setAuthError(undefined);
							await login(email, password);
						} catch (e: any) {
							setAuthError(e?.message || "Gagal masuk");
						}
					}}
					onRegister={async (email, password, name) => {
						try {
							setAuthError(undefined);
							await register(email, password, name);
						} catch (e: any) {
							setAuthError(e?.message || "Gagal mendaftar");
						}
					}}
					onSkip={() => setAuthModalOpen(false)}
					onGoogleSignIn={signInWithGoogle}
					onResetPassword={async (email) => {
						try {
							await resetPassword(email);
						} catch {}
					}}
					isLoading={isLoading}
					needsEmailConfirm={registrationNeedsEmailConfirm}
					error={authError}
				/>
			</div>
		</div>
	);
}
