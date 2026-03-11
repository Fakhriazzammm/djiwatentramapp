import { createLazyFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Globe, Link as LinkIcon, Loader2, Save, ShoppingBag, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@yumipos/backend/convex/_generated/api";

export const Route = createLazyFileRoute("/admin/booking")({
	component: BookingSettingsPage,
});

function BookingSettingsPage() {
	const settings = useQuery(api.booking.getSettings, { slug: "booking" });
	const updateSettings = useMutation(api.booking.updateSettings);
	const allProducts = useQuery(api.products.getAllProductsAdmin, {});

	const [formData, setFormData] = useState({
		slug: "booking",
		title: "",
		description: "",
		logoUrl: "",
		bannerUrl: "",
		themeColor: "#000000",
		featuredProductIds: [] as string[],
		paymentMethods: [] as string[],
		bankDetails: "",
		isActive: true,
	});

	const [activeTab, setActiveTab] = useState<"general" | "products" | "payment">("general");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (settings) {
			setFormData({
				slug: settings.slug,
				title: settings.title,
				description: settings.description || "",
				logoUrl: settings.logoUrl || "",
				bannerUrl: settings.bannerUrl || "",
				themeColor: settings.themeColor || "#000000",
				featuredProductIds: settings.featuredProductIds || [],
				paymentMethods: settings.paymentMethods || [],
				bankDetails: settings.bankDetails || "",
				isActive: settings.isActive,
			});
		}
	}, [settings]);

	const handleSave = async () => {
		try {
			setIsSaving(true);
			await updateSettings({
				...formData,
			});
			toast.success("Pengaturan halaman booking berhasil disimpan!");
		} catch (error) {
			console.error(error);
			toast.error("Gagal menyimpan pengaturan");
		} finally {
			setIsSaving(false);
		}
	};

	const tabs = [
		{ id: "general", label: "Tampilan & Profil", icon: Smartphone },
		{ id: "products", label: "Produk Unggulan", icon: ShoppingBag },
		{ id: "payment", label: "Pembayaran", icon: Globe },
	] as const;

	return (
		<div className="mx-auto max-w-5xl space-y-4 md:space-y-8">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 className="font-bold text-foreground text-xl tracking-tight md:text-3xl">
						Link in Bio / Booking
					</h2>
					<p className="mt-0.5 text-muted-foreground text-xs md:mt-1 md:text-sm">
						Konfigurasi halaman pemesanan online
					</p>
				</div>
				<div className="flex gap-2">
					<a
						className="flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 font-medium text-foreground text-sm transition-all hover:bg-muted"
						href="/booking"
						rel="noreferrer"
						target="_blank"
					>
						<LinkIcon className="h-4 w-4" /> Buka Halaman
					</a>
					<button
						className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground text-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
						disabled={isSaving}
						onClick={handleSave}
						type="button"
					>
						{isSaving ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Save className="h-4 w-4" />
						)}
						{isSaving ? "Menyimpan..." : "Simpan"}
					</button>
				</div>
			</div>

			<div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-muted/50 p-1 shadow-inner md:p-1.5">
				{tabs.map((tab) => (
					<button
						className={`flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 font-bold transition-all md:flex-1 md:gap-2 md:px-6 md:py-3 ${
							activeTab === tab.id
								? "bg-card text-primary shadow-sm"
								: "text-muted-foreground hover:bg-card/50 hover:text-foreground"
						}`}
						key={tab.id}
						onClick={() => setActiveTab(tab.id)}
						type="button"
					>
						<tab.icon className="h-4 w-4" />
						<span className="text-xs md:text-sm">{tab.label}</span>
					</button>
				))}
			</div>

			<div className="space-y-6">
				{activeTab === "general" && (
					<section className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:space-y-8 md:p-8">
						<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
							<div className="space-y-2">
								<label className="font-medium text-muted-foreground text-xs" htmlFor="page-title">Judul Halaman</label>
								<input
									className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
									id="page-title"
									onChange={(e) => setFormData({ ...formData, title: e.target.value })}
									placeholder="Contoh: Djiwa Tentram Cafe"
									value={formData.title}
								/>
							</div>
							<div className="space-y-2">
								<label className="font-medium text-muted-foreground text-xs" htmlFor="slug-url">Slug URL</label>
								<div className="flex items-center rounded-xl bg-muted/50 px-3">
									<span className="text-muted-foreground text-sm">/</span>
									<input
										className="w-full bg-transparent p-3.5 font-medium text-foreground outline-none"
										disabled
										id="slug-url"
										value={formData.slug}
									/>
								</div>
							</div>
							<div className="space-y-2 md:col-span-2">
								<label className="font-medium text-muted-foreground text-xs" htmlFor="page-desc">Deskripsi / Bio</label>
								<textarea
									className="min-h-[100px] w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
									id="page-desc"
									onChange={(e) => setFormData({ ...formData, description: e.target.value })}
									placeholder="Deskripsi singkat tentang bisnis anda..."
									value={formData.description}
								/>
							</div>
							<div className="space-y-2">
								<label className="font-medium text-muted-foreground text-xs" htmlFor="page-status">Status Halaman</label>
								<div className="flex items-center gap-3">
									<button
										className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${formData.isActive ? "bg-primary" : "bg-muted"}`}
										id="page-status"
										onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
										type="button"
									>
										<span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.isActive ? "translate-x-6" : "translate-x-1"}`} />
									</button>
									<span className="text-sm font-medium">{formData.isActive ? "Aktif" : "Nonaktif"}</span>
								</div>
							</div>
						</div>
					</section>
				)}

				{activeTab === "products" && (
					<section className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-8">
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<h3 className="font-bold text-lg">Pilih Produk</h3>
								<p className="text-sm text-muted-foreground">{formData.featuredProductIds.length} produk dipilih</p>
							</div>
							<p className="text-muted-foreground text-sm">
								Pilih produk yang ingin anda tampilkan di halaman booking.
							</p>

							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								{allProducts?.map((product: any) => (
									<button
										className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
											formData.featuredProductIds.includes(product._id)
												? "border-primary bg-primary/5 ring-1 ring-primary"
												: "border-border bg-card hover:bg-muted/50"
										}`}
										key={product._id}
										onClick={() => {
											const isSelected = formData.featuredProductIds.includes(product._id);
											const newIds = isSelected
												? formData.featuredProductIds.filter((id) => id !== product._id)
												: [...formData.featuredProductIds, product._id];
											setFormData({ ...formData, featuredProductIds: newIds });
										}}
										type="button"
									>
										<div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
											{product.image ? (
												<img alt={product.name} className="h-full w-full object-cover" src={product.image} />
											) : (
												<div className="flex h-full w-full items-center justify-center text-lg font-bold text-muted-foreground">
													{product.name.charAt(0)}
												</div>
											)}
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate font-bold text-sm">{product.name}</p>
											<p className="font-medium text-muted-foreground text-xs">
												Rp {product.price.toLocaleString("id-ID")}
											</p>
										</div>
									</button>
								))}
								{!allProducts && (
									<div className="col-span-full py-12 text-center">
										<Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
										<p className="mt-2 text-sm text-muted-foreground">Memuat produk...</p>
									</div>
								)}
								{allProducts?.length === 0 && (
									<div className="col-span-full py-12 text-center">
										<ShoppingBag className="mx-auto h-8 w-8 text-muted-foreground" />
										<p className="mt-2 text-sm text-muted-foreground">Belum ada produk.</p>
									</div>
								)}
							</div>
						</div>
					</section>
				)}

				{activeTab === "payment" && (
					<section className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-8">
						<div className="space-y-6">
							<div className="space-y-3">
								<span className="font-bold text-sm">Metode Pembayaran</span>
								<div className="flex flex-wrap gap-4">
									{["qris", "bank_transfer", "gateway"].map((method) => (
										<label className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 hover:bg-muted/50" key={method}>
											<input
												checked={formData.paymentMethods.includes(method)}
												className="rounded border-gray-300 text-primary focus:ring-primary"
												onChange={(e) => {
													const newMethods = e.target.checked
														? [...formData.paymentMethods, method]
														: formData.paymentMethods.filter((m) => m !== method);
													setFormData({ ...formData, paymentMethods: newMethods });
												}}
												type="checkbox"
											/>
											<span className="text-sm font-medium uppercase">{method.replace("_", " ")}</span>
										</label>
									))}
								</div>
							</div>

							<div className="space-y-2">
								<label className="font-medium text-muted-foreground text-xs" htmlFor="bank-details">Detail Bank</label>
								<textarea
									className="min-h-[100px] w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
									id="bank-details"
									onChange={(e) => setFormData({ ...formData, bankDetails: e.target.value })}
									placeholder="Contoh: BCA 1234567890 a.n Djiwa Tentram..."
									value={formData.bankDetails}
								/>
							</div>
						</div>
					</section>
				)}
			</div>
		</div>
	);
}
