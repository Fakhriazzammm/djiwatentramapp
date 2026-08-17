import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bell, Bike, Check, Mail, Save, Settings2, ShoppingBag, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { useHybridUpdateSiteSettings } from "@/hooks/use-hybrid-write-actions";

export const Route = createLazyFileRoute("/admin/order-mie-yamin")({
  component: AdminMieYamin,
});

type MieYaminSettings = {
  noodlePricePerKg: number;
  readyPackPrice: number;
  repackFeePer100g: number;
  deliveryArea: string;
  freeShippingPromo: boolean;
  enabledProviders: string[];
  paymentReceiptEmailEnabled: boolean;
  adminNotificationEnabled: boolean;
  adminNotificationNote: string;
  minimumOrderKg: number;
  orderCutoffHour: number;
  maxOrdersPerDate: number;
  shippingFee: number;
  supportWhatsapp: string;
  productImageUrl: string;
  storageInstructions: string;
};

const DEFAULTS: MieYaminSettings = {
  noodlePricePerKg: 10_000,
  readyPackPrice: 5_000,
  repackFeePer100g: 2_000,
  deliveryArea: "Tasikmalaya",
  freeShippingPromo: true,
  enabledProviders: ["gojek", "maxim"],
  paymentReceiptEmailEnabled: true,
  adminNotificationEnabled: true,
  adminNotificationNote: "Order Mie Yamin baru perlu diproses setelah pembayaran terverifikasi.",
  minimumOrderKg: 1,
  orderCutoffHour: 15,
  maxOrdersPerDate: 20,
  shippingFee: 0,
  supportWhatsapp: "",
  productImageUrl: "/logo-djiwa.png",
  storageInstructions: "Simpan sesuai petunjuk admin. Umumnya 1–3 hari di suhu ruang atau 3–7 hari di dalam kulkas.",
};

function money(value: number) {
  return `Rp${Number(value || 0).toLocaleString("id-ID")}`;
}

function AdminMieYamin() {
  const siteSettings = useHybridSiteSettings() as any;
  const updateSiteSettings = useHybridUpdateSiteSettings();
  const [activeTab, setActiveTab] = useState<"orders" | "pricing" | "delivery" | "notifications">("orders");
  const [form, setForm] = useState<MieYaminSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (siteSettings?.mieYaminSettings) {
      setForm({ ...DEFAULTS, ...siteSettings.mieYaminSettings });
    }
  }, [siteSettings?.mieYaminSettings]);

  const update = <K extends keyof MieYaminSettings>(key: K, value: MieYaminSettings[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleProvider = (provider: string) => {
    const providers = form.enabledProviders.includes(provider)
      ? form.enabledProviders.filter((item) => item !== provider)
      : [...form.enabledProviders, provider];
    update("enabledProviders", providers);
  };

  const save = async () => {
    if (!form.deliveryArea.trim()) {
      toast.error("Area pengiriman wajib diisi.");
      return;
    }
    if (form.enabledProviders.length === 0) {
      toast.error("Pilih minimal satu provider pengiriman.");
      return;
    }
    setSaving(true);
    try {
      await updateSiteSettings({ mieYaminSettings: { ...form, deliveryArea: form.deliveryArea.trim() } });
      toast.success("Pengaturan Order Mie Yamin tersimpan.");
    } catch (error) {
      console.error(error);
      toast.error("Pengaturan gagal disimpan.");
    } finally {
      setSaving(false);
    }
  };

  const tabs = useMemo(() => [
    { id: "orders" as const, label: "Pesanan", icon: ShoppingBag },
    { id: "pricing" as const, label: "Pengaturan Harga", icon: Settings2 },
    { id: "delivery" as const, label: "Pengiriman", icon: Truck },
    { id: "notifications" as const, label: "Notifikasi", icon: Bell },
  ], []);

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/admin/orders" search={{ business: "mieyamin" } as any} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border hover:bg-muted" aria-label="Kembali ke pesanan">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Business control</p>
            <h1 className="font-display text-xl font-bold tracking-tight md:text-2xl">Order Mie Yamin</h1>
            <p className="text-xs text-muted-foreground">Kontrol order, harga, pengiriman, dan notifikasi dari satu tempat.</p>
          </div>
        </div>
        <Button disabled={saving} onClick={save} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "Menyimpan..." : "Simpan pengaturan"}
        </Button>
      </div>

      <div className="grid gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm md:grid-cols-4">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setActiveTab(id)} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${activeTab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {activeTab === "orders" ? (
        <section className="grid gap-4 md:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShoppingBag className="h-5 w-5" /></div>
              <div><h2 className="font-bold">Pesanan Mie Yamin</h2><p className="mt-1 text-sm text-muted-foreground">Semua order dengan business unit <code className="rounded bg-muted px-1">ordermieyamin</code>.</p></div>
            </div>
            <Link to="/admin/orders" search={{ business: "mieyamin" } as any} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90"><ShoppingBag className="h-4 w-4" /> Buka daftar pesanan</Link>
          </div>
          <div className="rounded-2xl border border-border bg-muted/30 p-5">
            <p className="text-xs font-bold text-muted-foreground">Harga aktif</p>
            <p className="mt-2 text-2xl font-black text-primary">{money(form.noodlePricePerKg)}<span className="text-sm font-bold text-muted-foreground"> / kg</span></p>
            <p className="mt-2 text-xs text-muted-foreground">Perubahan harga otomatis dipakai form checkout publik setelah disimpan.</p>
          </div>
        </section>
      ) : null}

      {activeTab === "pricing" ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-bold">Pengaturan Harga</h2>
          <p className="mt-1 text-xs text-muted-foreground">Nilai ini digunakan Order Mie Yamin dan invoice Mayar berikutnya.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="text-sm font-bold">Mie yamin per kg<Input className="mt-2" type="number" min={0} value={form.noodlePricePerKg} onChange={(e) => update("noodlePricePerKg", Number(e.target.value) || 0)} /></label>
            <label className="text-sm font-bold">Kemasan per pcs<Input className="mt-2" type="number" min={0} value={form.readyPackPrice} onChange={(e) => update("readyPackPrice", Number(e.target.value) || 0)} /></label>
            <label className="text-sm font-bold">Repack per 100 gram<Input className="mt-2" type="number" min={0} value={form.repackFeePer100g} onChange={(e) => update("repackFeePer100g", Number(e.target.value) || 0)} /></label>
            <label className="text-sm font-bold">Minimum order (kg)<Input className="mt-2" type="number" min={0.1} step={0.1} value={form.minimumOrderKg} onChange={(e) => update("minimumOrderKg", Math.max(0.1, Number(e.target.value) || 0.1))} /></label>
            <label className="text-sm font-bold">Maksimal order per tanggal<Input className="mt-2" type="number" min={1} value={form.maxOrdersPerDate} onChange={(e) => update("maxOrdersPerDate", Math.max(1, Number(e.target.value) || 1))} /></label>
          </div>
        </section>
      ) : null}

      {activeTab === "delivery" ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-bold">Pengaturan Pengiriman</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-bold">Area layanan<Input className="mt-2" value={form.deliveryArea} onChange={(e) => update("deliveryArea", e.target.value)} /></label>
            <label className="text-sm font-bold">Batas pemesanan hari ini (jam 0–23)<Input className="mt-2" type="number" min={0} max={23} value={form.orderCutoffHour} onChange={(e) => update("orderCutoffHour", Math.min(23, Math.max(0, Number(e.target.value) || 0)))} /></label>
            <label className="text-sm font-bold">Biaya ongkir default<Input className="mt-2" type="number" min={0} value={form.shippingFee} onChange={(e) => update("shippingFee", Math.max(0, Number(e.target.value) || 0))} /></label>
            <div><p className="text-sm font-bold">Provider aktif</p><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => toggleProvider("gojek")} className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-bold ${form.enabledProviders.includes("gojek") ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}><Bike className="h-4 w-4" /> Gojek {form.enabledProviders.includes("gojek") ? <Check className="h-4 w-4" /> : null}</button><button type="button" onClick={() => toggleProvider("maxim")} className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-bold ${form.enabledProviders.includes("maxim") ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}><Truck className="h-4 w-4" /> Maxim {form.enabledProviders.includes("maxim") ? <Check className="h-4 w-4" /> : null}</button></div></div>
          </div>
          <button type="button" onClick={() => update("freeShippingPromo", !form.freeShippingPromo)} className={`mt-5 flex w-full items-center justify-between rounded-xl border p-3 text-left ${form.freeShippingPromo ? "border-emerald-300 bg-emerald-50" : "border-border"}`}><span><b className="block text-sm">Promo ongkir gratis</b><span className="text-xs text-muted-foreground">Tampilkan promo ongkir gratis di checkout.</span></span><span className={`h-5 w-9 rounded-full p-0.5 ${form.freeShippingPromo ? "bg-emerald-500" : "bg-muted"}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${form.freeShippingPromo ? "translate-x-4" : ""}`} /></span></button>
        </section>
      ) : null}

      {activeTab === "notifications" ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-bold">Pengaturan Notifikasi</h2>
          <div className="mt-5 space-y-3">
            <button type="button" onClick={() => update("paymentReceiptEmailEnabled", !form.paymentReceiptEmailEnabled)} className="flex w-full items-center justify-between rounded-xl border border-border p-3 text-left"><span className="flex items-center gap-3"><Mail className="h-4 w-4 text-primary" /><span><b className="block text-sm">Email bukti pembayaran</b><span className="text-xs text-muted-foreground">Kirim email pelanggan jika alamat email diisi.</span></span></span><span className={`h-5 w-9 rounded-full p-0.5 ${form.paymentReceiptEmailEnabled ? "bg-primary" : "bg-muted"}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${form.paymentReceiptEmailEnabled ? "translate-x-4" : ""}`} /></span></button>
            <button type="button" onClick={() => update("adminNotificationEnabled", !form.adminNotificationEnabled)} className="flex w-full items-center justify-between rounded-xl border border-border p-3 text-left"><span className="flex items-center gap-3"><Bell className="h-4 w-4 text-primary" /><span><b className="block text-sm">Notifikasi admin</b><span className="text-xs text-muted-foreground">Aktifkan penanda order Mie Yamin baru untuk operasional.</span></span></span><span className={`h-5 w-9 rounded-full p-0.5 ${form.adminNotificationEnabled ? "bg-primary" : "bg-muted"}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${form.adminNotificationEnabled ? "translate-x-4" : ""}`} /></span></button>
            <label className="block text-sm font-bold">Catatan operasional<textarea value={form.adminNotificationNote} onChange={(e) => update("adminNotificationNote", e.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
            <label className="block text-sm font-bold">Nomor WhatsApp support<Input value={form.supportWhatsapp} onChange={(e) => update("supportWhatsapp", e.target.value)} placeholder="628123456789" className="mt-2" /></label>
            <label className="block text-sm font-bold">URL foto produk<Input value={form.productImageUrl} onChange={(e) => update("productImageUrl", e.target.value)} placeholder="/logo-djiwa.png atau URL gambar" className="mt-2" /></label>
            <label className="block text-sm font-bold">Petunjuk penyimpanan<textarea value={form.storageInstructions} onChange={(e) => update("storageInstructions", e.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
          </div>
        </section>
      ) : null}
    </div>
  );
}
