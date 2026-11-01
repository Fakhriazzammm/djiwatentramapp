import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useCustomerSplashGate } from "@/hooks/use-customer-splash-gate";
import { CalendarDays, Clock, MapPin, Phone, ShoppingCart, UtensilsCrossed } from "lucide-react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useHybridAllProducts, useHybridBestSellers, useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { AuthModal } from "@/components/customer/auth-modal";
import { CustomerPageSkeleton } from "@/components/customer/customer-states";
import { ImageWithPlaceholder } from "@/components/customer/image-with-placeholder";
import { CustomerOnboarding, CustomerSplash } from "@/components/customer/customer-entry";
import { currency } from "@/components/customer/types";
import { CUSTOMER_LOGO_FALLBACK } from "@/lib/asset-url";

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
	// Brand moment splash hanya sekali per sesi; kunjungan ulang langsung masuk agar
	// navigasi tidak tertahan animasi pembuka.
	const [entryPhase, setEntryPhase] = useState<"splash" | "onboarding" | "home">(() => {
		try {
			return sessionStorage.getItem("customer:splash-brand-seen") ? "onboarding" : "splash";
		} catch {
			return "splash";
		}
	});

	const storeName = import.meta.env.VITE_BRAND_NAME || "Djiwatentram";

	// ── Data tambahan landing: best seller + info toko ──────────
	const products = useHybridAllProducts();
	const bestSellers = useHybridBestSellers();
	const siteSettings = useHybridSiteSettings();
	const logoUrl = siteSettings?.logoUrl || import.meta.env.VITE_BRAND_LOGO_URL || CUSTOMER_LOGO_FALLBACK;
	const landingDataReady = !isLoading && products !== undefined && bestSellers !== undefined && siteSettings !== undefined;
	// Data menu biasanya siap jauh sebelum sesi auth selesai; animasi resolve
	// dijalankan sejak data siap supaya tidak menambah waktu tunggu splash.
	const posDataReady = products !== undefined && bestSellers !== undefined && siteSettings !== undefined;
	const splashGate = useCustomerSplashGate({
		ready: landingDataReady,
		resolveWhen: posDataReady,
		minVisibleMs: entryPhase === "splash" ? 1800 : 400,
	});

	const productMap = new Map<string, Record<string, any>>();
	for (const p of products ?? []) productMap.set(String((p as Record<string, any>)._id), p as Record<string, any>);

	// Best seller: gabung view (product_id, total_sold) dengan produk aktif
	// untuk ambil image/harga/menuNumber terbaru. Fallback ke nama dari view.
	const featuredProducts = (bestSellers ?? [])
		.slice(0, 4)
		.map((b) => {
			const product = productMap.get(b.productId);
			return {
				productId: b.productId,
				name: product?.name || b.productName,
				image: typeof product?.image === "string" && /^https?:\/\//.test(product.image) ? product.image : null,
				price: product?.price != null && Number.isFinite(Number(product.price)) ? Number(product.price) : null,
				isAvailable: product?.isAvailable !== false,
				menuNumber: product?.menuNumber != null ? Number(product.menuNumber) : null,
				totalSold: b.totalSold,
			};
		});

	const openTime = typeof siteSettings?.openingTime === "string" && siteSettings.openingTime.trim() ? siteSettings.openingTime.trim() : null;
	const closeTime = typeof siteSettings?.closingTime === "string" && siteSettings.closingTime.trim() ? siteSettings.closingTime.trim() : null;
	const openingHours = typeof siteSettings?.openingHours === "string" && siteSettings.openingHours.trim() ? siteSettings.openingHours : null;
	const storePhone = typeof siteSettings?.storePhone === "string" && siteSettings.storePhone.trim() ? siteSettings.storePhone : null;
	const storeAddress = typeof siteSettings?.storeAddress === "string" && siteSettings.storeAddress.trim() ? siteSettings.storeAddress : null;
	const hasHours = Boolean(openTime || closeTime || openingHours);

	useEffect(() => {
		if (entryPhase !== "splash") return;
		try {
			sessionStorage.setItem("customer:splash-brand-seen", "1");
		} catch {
			// Storage bisa dibatasi; brand moment tetap berjalan tanpa penanda sesi.
		}
		const timeoutId = window.setTimeout(() => setEntryPhase("onboarding"), 1800);
		return () => window.clearTimeout(timeoutId);
	}, [entryPhase]);

	const completeOnboarding = () => {
		setEntryPhase("home");
	};
	const featuredCarouselRef = useRef<HTMLDivElement>(null);
	const [carouselPaused, setCarouselPaused] = useState(false);

	useEffect(() => {
		if (featuredProducts.length < 2 || carouselPaused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

		const intervalId = window.setInterval(() => {
			if (document.hidden) return;
			const carousel = featuredCarouselRef.current;
			if (!carousel) return;

			const firstCard = carousel.querySelector<HTMLElement>("[data-carousel-card]");
			const step = (firstCard?.offsetWidth ?? 176) + 12;
			const reachedEnd = carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - step;
			carousel.scrollTo({ left: reachedEnd ? 0 : carousel.scrollLeft + step, behavior: "smooth" });
		}, 4500);

		return () => window.clearInterval(intervalId);
	}, [carouselPaused, featuredProducts.length]);

	// ponytail: sudah login → langsung ke /{username}, bukan /order
	useEffect(() => {
		if (!landingDataReady) return;
		if (isAuthenticated && customer) {
			navigate({ to: `/${customer.username}` });
		}
	}, [landingDataReady, isAuthenticated, customer, navigate]);

	if (splashGate.visible) {
		return <CustomerSplash storeName={storeName} {...splashGate.splashProps} />;
	}

	if (entryPhase === "onboarding") {
		return (
			<CustomerOnboarding
				logoUrl={logoUrl}
				storeName={storeName}
				onMember={() => { completeOnboarding(); navigate({ to: "/masuk" }); }}
				onGuest={completeOnboarding}
			/>
		);
	}

	// Auth bootstrap may still be finishing after onboarding.
	if (isLoading) {
		return <CustomerPageSkeleton label="Menyiapkan halaman" />;
	}

	// ── Guest welcome page ───────────────────────────────────
	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto flex min-h-app w-full max-w-md flex-col bg-background">
				{/* ── Sticky header ────────────────────────────── */}
				<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
					<div className="flex items-center gap-2">
						<img alt={storeName} className="h-10 w-10 rounded-xl object-contain" src={logoUrl || "/logo-djiwa.png"} />
						<div>
							<p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
								Welcome
							</p>
							<h1 className="text-sm font-black tracking-tight">
								{storeName}
							</h1>
						</div>
					</div>
				</header>

				{/* ── Welcome card di tengah ───────────────────── */}
				<main className="flex flex-1 items-start justify-center px-3 py-4 sm:py-6">
					<section className="w-full max-w-md">
						<div className="space-y-3">
							{/* ── Card utama ─────────────────────── */}
							<div className="app-card-strong w-full px-4 py-6">
								<p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
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

								<a
									href="https://booking.djiwatentram.web.id/"
									aria-label="Booking Acara & Kolaborasi"
									className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[14px] border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs font-black text-primary transition-all duration-[180ms] hover:bg-primary/10 active:scale-[.97]"
								>
									<CalendarDays className="h-3.5 w-3.5" />
									Booking Acara & Kolaborasi
								</a>

							</div>

							{/* ── Kolom kanan: preview menu + info ─── */}
							<div className="flex w-full flex-col gap-3">
								{/* Menu preview */}
								{featuredProducts.length > 0 ? (
									<div className="app-card-strong w-full px-4 py-4 text-left">
										<div className="flex items-center justify-between">
											<p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Menu Best Seller</p>
											<button
												type="button"
												onClick={() => navigate({ to: "/daftar" })}
												className="min-h-11 rounded-[14px] px-2 py-1 text-[11px] font-black text-primary hover:bg-primary/10"
											>
											Lihat semua →
											</button>
										</div>
										<div
											ref={featuredCarouselRef}
											onPointerEnter={() => setCarouselPaused(true)}
											onPointerLeave={() => setCarouselPaused(false)}
											onPointerDown={() => setCarouselPaused(true)}
											onPointerUp={() => setCarouselPaused(false)}
											onFocusCapture={() => setCarouselPaused(true)}
											onBlurCapture={(event) => {
												if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCarouselPaused(false);
											}}
											aria-label="Menu best seller"
											className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
										>
											{featuredProducts.map((p) => (
												<button
													type="button"
													key={p.productId}
													onClick={() => navigate({ to: "/daftar" })}
													data-carousel-card
													className="min-w-[176px] snap-start overflow-hidden rounded-[20px] border border-border bg-card text-left shadow-sm transition-all duration-[180ms] active:scale-[.97]"
												>
													<div className="relative h-24 w-full bg-muted">
														<ImageWithPlaceholder src={p.image ?? ""} alt={p.name} containerClassName="h-full w-full" className="object-cover" loading="lazy" decoding="async" fallback={<UtensilsCrossed aria-hidden="true" className="h-5 w-5" strokeWidth={2} />} />
														{!p.isAvailable ? <span className="absolute inset-x-2 bottom-2 rounded-full bg-slate-950/75 px-2 py-1 text-center text-[10px] font-black text-white">Tidak tersedia</span> : null}
														{p.menuNumber != null ? <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-bold text-white shadow">#{p.menuNumber}</span> : null}
													</div>
													<div className="space-y-1 p-2.5">
														<p className="break-words text-xs font-black leading-snug">{p.name}</p>
														<p className="text-sm font-black text-primary">{p.price != null ? currency(p.price) : "Harga belum tersedia"}</p>
														<p className="text-[10px] font-semibold text-muted-foreground">Terjual {p.totalSold.toLocaleString("id-ID")}x</p>
													</div>
												</button>
											))}
										</div>
									</div>
								) : null}

								{/* Info toko */}
								{openingHours || storePhone || storeAddress || hasHours ? (
									<div className="app-card-strong w-full px-4 py-4 text-left">
										<p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Info Restoran</p>
										<div className="mt-2.5 space-y-2">
											{openTime || closeTime || openingHours ? (
												<div className="flex items-start gap-2.5">
													<Clock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
													<div>
														<p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Jam operasional</p>
														<p className="text-xs font-bold leading-snug">
															{openTime && closeTime
																? `Buka ${openTime} – Tutup ${closeTime}`
																: openingHours || [openTime, closeTime].filter(Boolean).join(" – ")}
														</p>
													</div>
												</div>
											) : null}
											{storePhone ? (
												<div className="flex items-start gap-2.5">
													<Phone aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
													<div>
														<p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Telepon</p>
														<a href={`tel:${storePhone.replace(/[^+\d]/g, "")}`} className="text-xs font-bold leading-snug text-primary">{storePhone}</a>
													</div>
												</div>
											) : null}
											{storeAddress ? (
												<div className="flex items-start gap-2.5">
													<MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
													<div>
														<p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Alamat</p>
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
					onGoogleSignIn={async () => {
						try {
							setAuthError(undefined);
							await signInWithGoogle();
						} catch (e: any) {
							setAuthError(e?.message || "Gagal masuk dengan Google");
						}
					}}
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
