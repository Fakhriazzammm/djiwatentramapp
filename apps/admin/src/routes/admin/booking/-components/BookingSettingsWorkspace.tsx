import { Link } from "@tanstack/react-router";
import { Check, ExternalLink, Globe2, Loader2, Save, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useHybridBookingSettings } from "@/hooks/use-hybrid-booking-data";
import { useHybridUpdateBookingSettings } from "@/hooks/use-hybrid-write-actions";

export function BookingSettingsWorkspace() {
	const settings = useHybridBookingSettings("booking");
	const updateSettings = useHybridUpdateBookingSettings();
	const [isSaving, setIsSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [form, setForm] = useState({ title: "", description: "", logoUrl: "", bannerUrl: "", themeColor: "#1a5dc6", bookingWindowDays: 90, isActive: true });

	useEffect(() => {
		if (!settings) return;
		setForm({
			title: settings.title ?? "",
			description: settings.description ?? "",
			logoUrl: settings.logoUrl ?? "",
			bannerUrl: settings.bannerUrl ?? "",
			themeColor: settings.themeColor ?? "#1a5dc6",
			bookingWindowDays: Number(settings.bookingWindowDays ?? 90),
			isActive: Boolean(settings.isActive),
		});
	}, [settings]);

	const handleSave = async () => {
		setIsSaving(true);
		setSaved(false);
		try {
			await updateSettings({ slug: "booking", ...form });
			setSaved(true);
		} finally {
			setIsSaving(false);
		}
	};

	return <div className="mx-auto max-w-5xl space-y-5 pb-10">
		<header className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card p-5 shadow-sm md:flex-row md:items-center md:justify-between md:p-6">
			<div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Booking configuration</p><h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight">Konfigurasi Booking</h1><p className="mt-1 text-sm text-muted-foreground">Kelola halaman publik tanpa mengganggu monitoring booking harian.</p></div>
			<div className="flex gap-2"><a className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted" href={(import.meta.env.VITE_PUBLIC_BOOKING_URL as string | undefined)?.trim() || "https://booking.yumme.id/"} rel="noreferrer" target="_blank"><ExternalLink className="h-4 w-4" /> Preview publik</a><button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60" disabled={isSaving || !settings} onClick={() => void handleSave()} type="button">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}{isSaving ? "Menyimpan..." : saved ? "Tersimpan" : "Simpan"}</button></div>
		</header>

		<nav className="flex gap-1 overflow-x-auto rounded-2xl border border-border/70 bg-card p-1 shadow-sm" aria-label="Konfigurasi booking"><Link className="min-h-11 shrink-0 rounded-xl bg-primary px-4 py-3 text-xs font-bold text-primary-foreground" to="/admin/booking/settings">Halaman Publik</Link><Link className="min-h-11 shrink-0 rounded-xl px-4 py-3 text-xs font-bold text-muted-foreground hover:bg-muted" to="/admin/booking/settings/menu">Menu Booking</Link><Link className="min-h-11 shrink-0 rounded-xl px-4 py-3 text-xs font-bold text-muted-foreground hover:bg-muted" to="/admin/booking/settings/form">Form Booking</Link></nav>

		<section className="grid gap-5 lg:grid-cols-[1fr_320px]">
			<div className="space-y-5 rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
				<div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Globe2 className="h-5 w-5" /></span><div><h2 className="font-display text-base font-bold">Halaman publik</h2><p className="text-xs text-muted-foreground">Konten yang dilihat customer.</p></div></div>
				<div className="grid gap-4 md:grid-cols-2"><label className="space-y-1.5 text-sm font-semibold md:col-span-2"><span>Judul halaman</span><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Djiwa Tentram Cafe & Resto" /></label><label className="space-y-1.5 text-sm font-semibold md:col-span-2"><span>Deskripsi</span><Textarea className="min-h-28" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Jelaskan pengalaman booking customer." /></label><label className="space-y-1.5 text-sm font-semibold"><span>Logo URL</span><Input value={form.logoUrl} onChange={(event) => setForm({ ...form, logoUrl: event.target.value })} placeholder="https://..." /></label><label className="space-y-1.5 text-sm font-semibold"><span>Banner URL</span><Input value={form.bannerUrl} onChange={(event) => setForm({ ...form, bannerUrl: event.target.value })} placeholder="https://..." /></label><label className="space-y-1.5 text-sm font-semibold"><span>Warna tema</span><div className="flex gap-2"><Input className="flex-1" value={form.themeColor} onChange={(event) => setForm({ ...form, themeColor: event.target.value })} /><input aria-label="Pilih warna tema" className="h-10 w-12 rounded-xl border border-border bg-card p-1" type="color" value={form.themeColor} onChange={(event) => setForm({ ...form, themeColor: event.target.value })} /></div></label><label className="space-y-1.5 text-sm font-semibold"><span>Booking ke depan (hari)</span><Input min={1} type="number" value={form.bookingWindowDays} onChange={(event) => setForm({ ...form, bookingWindowDays: Math.max(1, Number(event.target.value)) })} /></label></div>
				<label className="flex min-h-12 cursor-pointer items-center justify-between rounded-2xl border border-border/70 bg-muted/30 px-4"><span><span className="block text-sm font-semibold">Halaman aktif</span><span className="block text-xs text-muted-foreground">Customer dapat membuat reservasi baru.</span></span><input aria-label="Aktifkan halaman booking" checked={form.isActive} className="h-5 w-5 accent-primary" onChange={(event) => setForm({ ...form, isActive: event.target.checked })} type="checkbox" /></label>
			</div>
			<aside className="space-y-4"><div className="rounded-3xl border border-primary/15 bg-primary/5 p-5"><Settings2 className="h-5 w-5 text-primary" /><h2 className="mt-3 font-display text-base font-bold">Batas konfigurasi</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Pengaturan ini hanya mengubah pengalaman halaman publik. Data booking, pembayaran, dan histori tetap aman.</p></div><div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm"><h2 className="font-display text-sm font-bold">Langkah berikutnya</h2><div className="mt-3 space-y-2 text-xs"><Link className="block rounded-xl border border-border p-3 font-semibold hover:bg-muted" to="/admin/booking/settings/menu">Atur menu booking →</Link><Link className="block rounded-xl border border-border p-3 font-semibold hover:bg-muted" to="/admin/booking/settings/form">Atur form customer →</Link></div></div></aside>
		</section>
	</div>;
}
