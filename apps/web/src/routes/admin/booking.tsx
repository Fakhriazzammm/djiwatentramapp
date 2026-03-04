import { createFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
	Globe,
	Image as ImageIcon,
	Layout,
	Link as LinkIcon,
	Save,
	ShoppingBag,
	Smartphone,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LoadingState } from "@/components/ui/loading-state";

export const Route = createFileRoute("/admin/booking")({
	component: BookingSettingsPage,
});

function BookingSettingsPage() {
	const settings = useQuery(api.booking.getSettings, { slug: "booking" });
	const products = useQuery(api.products.getAllProductsAdmin);
	const updateSettings = useMutation(api.booking.updateSettings);
	const generateUploadUrl = useMutation(api.site_settings.generateUploadUrl);

	const [formData, setFormData] = useState({
		slug: "booking",
		title: "",
		description: "",
		logoUrl: "",
		bannerUrl: "",
		themeColor: "#000000",
		socialLinks: [] as { platform: string; url: string; label: string }[],
		featuredProductIds: [] as string[],
		paymentMethods: [] as string[],
		bankDetails: "",
		isActive: true,
	});

	const [activeTab, setActiveTab] = useState<"general" | "products" | "payment">("general");

	useEffect(() => {
		if (settings) {
			setFormData({
				slug: settings.slug || "booking",
				title: settings.title || "",
				description: settings.description || "",
				logoUrl: settings.logoUrl || "",
				bannerUrl: settings.bannerUrl || "",
				themeColor: settings.themeColor || "#000000",
				socialLinks: settings.socialLinks || [],
				featuredProductIds: settings.featuredProductIds || [],
				paymentMethods: settings.paymentMethods || [],
				bankDetails: settings.bankDetails || "",
				isActive: settings.isActive ?? true,
			});
		}
	}, [settings]);

	const handleSave = async () => {
		try {
			await updateSettings(formData);
			toast.success("Pengaturan halaman booking berhasil disimpan!");
		} catch (error) {
			console.error(error);
			toast.error("Gagal menyimpan pengaturan");
		}
	};

	const handleFileUpload = async (file: File, field: "logoUrl" | "bannerUrl") => {
		try {
			const postUrl = await generateUploadUrl();
			const result = await fetch(postUrl, {
				method: "POST",
				headers: { "Content-Type": file.type },
				body: file,
			});
			if (!result.ok) {
				throw new Error("Upload failed");
			}
			const { storageId } = await result.json();
			
            // We need to get the public URL. 
            // Since we don't have a direct helper here, we might need to rely on the storageId being used directly 
            // or fetched via a query.
            // For now, let's assume the frontend can handle storageId or we need a way to get the URL.
            // Wait, Convex storage IDs are not URLs. 
            // Usually we store the storageId and use `useQuery(api.files.getUrl, { storageId })` to display it.
            // But here we are storing string URLs in schema.
            // Existing code in settings.tsx stores storageId in `paymentPopupImage`.
            // So we will store storageId.
            
            setFormData(prev => ({ ...prev, [field]: storageId }));
			toast.success("Upload berhasil!");
		} catch (_error) {
			toast.error("Gagal mengupload gambar");
		}
	};

    if (!settings && !products) {
        return <LoadingState />;
    }

	const tabs = [
		{ id: "general", label: "Tampilan & Profil", icon: Smartphone },
		{ id: "products", label: "Produk Unggulan", icon: ShoppingBag },
		{ id: "payment", label: "Pembayaran", icon: Globe },
	] as const;

	return (
		<div className="mx-auto max-w-5xl space-y-4 md:space-y-8">
			{/* Header */}
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
                        href="/booking" 
                        target="_blank"
                        className="flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-3 font-medium text-foreground text-sm transition-all hover:bg-muted"
                    >
                        <LinkIcon className="h-4 w-4" /> Buka Halaman
                    </a>
                    <button
                        className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground text-sm transition-all hover:opacity-90 active:scale-95 md:gap-3 md:px-8 md:py-3.5"
                        onClick={handleSave}
                        type="button"
                    >
                        <Save className="h-4 w-4" /> Simpan
                    </button>
                </div>
			</div>

			{/* Tab Switcher */}
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

			{/* Content */}
			<div className="space-y-6">
                {activeTab === "general" && (
                    <section className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:space-y-8 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="font-medium text-muted-foreground text-xs" htmlFor="page-title">Judul Halaman (Nama Bisnis)</label>
                                <input
                                    id="page-title"
                                    className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
                                    value={formData.title}
                                    onChange={e => setFormData({...formData, title: e.target.value})}
                                    placeholder="Contoh: Djiwa Tentram Cafe"
                                />
                            </div>
                             <div className="space-y-2">
                                <label className="font-medium text-muted-foreground text-xs" htmlFor="slug-url">Slug URL</label>
                                <div className="flex items-center rounded-xl bg-muted/50 px-3">
                                    <span className="text-muted-foreground text-sm">/</span>
                                    <input
                                        id="slug-url"
                                        className="w-full bg-transparent p-3.5 font-medium text-foreground outline-none"
                                        value={formData.slug}
                                        disabled
                                        // onChange={e => setFormData({...formData, slug: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <label className="font-medium text-muted-foreground text-xs" htmlFor="page-desc">Deskripsi / Bio</label>
                                <textarea
                                    id="page-desc"
                                    className="min-h-[100px] w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
                                    value={formData.description}
                                    onChange={e => setFormData({...formData, description: e.target.value})}
                                    placeholder="Deskripsi singkat tentang bisnis anda..."
                                />
                            </div>
                            
                            {/* Logo Upload */}
                            <div className="space-y-2">
                                <label className="font-medium text-muted-foreground text-xs" htmlFor="logo-upload">Logo (Avatar)</label>
                                <input
                                    id="logo-upload"
                                    type="file"
                                    accept="image/*"
                                    className="w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                                    onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], "logoUrl")}
                                />
                                {formData.logoUrl && (
                                    <p className="text-xs text-green-500">Logo tersimpan (ID: {formData.logoUrl.slice(0, 10)}...)</p>
                                )}
                            </div>

                             {/* Banner Upload */}
                             <div className="space-y-2">
                                <label className="font-medium text-muted-foreground text-xs" htmlFor="banner-upload">Banner Image</label>
                                <input
                                    id="banner-upload"
                                    type="file"
                                    accept="image/*"
                                    className="w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                                    onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], "bannerUrl")}
                                />
                                 {formData.bannerUrl && (
                                    <p className="text-xs text-green-500">Banner tersimpan (ID: {formData.bannerUrl.slice(0, 10)}...)</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="font-medium text-muted-foreground text-xs" htmlFor="page-status">Status Halaman</label>
                                <div className="flex items-center gap-3">
                                    <button
                                        id="page-status"
                                        type="button"
                                        onClick={() => setFormData({...formData, isActive: !formData.isActive})}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${formData.isActive ? 'bg-primary' : 'bg-muted'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                    <span className="text-sm font-medium">{formData.isActive ? 'Aktif' : 'Nonaktif'}</span>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {activeTab === "products" && (
                    <section className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:space-y-8 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-lg">Pilih Produk</h3>
                                <p className="text-sm text-muted-foreground">{formData.featuredProductIds.length} produk dipilih</p>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {products?.map(product => (
                                    <button
                                        type="button"
                                        key={product._id}
                                        onClick={() => {
                                            const newIds = formData.featuredProductIds.includes(product._id)
                                                ? formData.featuredProductIds.filter(id => id !== product._id)
                                                : [...formData.featuredProductIds, product._id];
                                            setFormData({...formData, featuredProductIds: newIds});
                                        }}
                                        className={`cursor-pointer rounded-xl border p-4 transition-all text-left ${
                                            formData.featuredProductIds.includes(product._id)
                                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                                : 'border-border hover:border-primary/50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                                                formData.featuredProductIds.includes(product._id)
                                                    ? 'bg-primary border-primary'
                                                    : 'border-muted-foreground'
                                            }`}>
                                                {formData.featuredProductIds.includes(product._id) && <div className="h-2 w-2 rounded-full bg-white" />}
                                            </div>
                                            <div>
                                                <p className="font-medium text-sm">{product.name}</p>
                                                <p className="text-xs text-muted-foreground">Rp {product.price.toLocaleString("id-ID")}</p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                {activeTab === "payment" && (
                    <section className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:space-y-8 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <span className="font-bold text-sm">Metode Pembayaran</span>
                                <div className="flex flex-wrap gap-4">
                                    {['qris', 'bank_transfer', 'gateway'].map(method => (
                                        <label key={method} className="flex items-center gap-2 cursor-pointer border rounded-lg p-3 hover:bg-muted/50">
                                            <input
                                                type="checkbox"
                                                checked={formData.paymentMethods.includes(method)}
                                                onChange={e => {
                                                    const newMethods = e.target.checked
                                                        ? [...formData.paymentMethods, method]
                                                        : formData.paymentMethods.filter(m => m !== method);
                                                    setFormData({...formData, paymentMethods: newMethods});
                                                }}
                                                className="rounded border-gray-300 text-primary focus:ring-primary"
                                            />
                                            <span className="text-sm font-medium uppercase">{method.replace('_', ' ')}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="font-medium text-muted-foreground text-xs" htmlFor="bank-details">Detail Bank (Untuk Transfer Manual)</label>
                                <textarea
                                    id="bank-details"
                                    className="min-h-[100px] w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
                                    value={formData.bankDetails}
                                    onChange={e => setFormData({...formData, bankDetails: e.target.value})}
                                    placeholder="Contoh: BCA 1234567890 a.n Djiwa Tentram..."
                                />
                            </div>
                        </div>
                    </section>
                )}
            </div>
		</div>
	);
}
