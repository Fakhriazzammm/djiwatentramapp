import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Package } from "lucide-react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useHybridProducts } from "@/hooks/use-hybrid-pos-data";
import { B2B_BRAND_NAME } from "@/lib/marketplace-config";
import { currency } from "@/components/customer/types";

export const Route = createLazyFileRoute("/produksi")({
  component: ProduksiPage,
});

function ProduksiPage() {
  const navigate = useNavigate();
  const { customer, isAuthenticated, isLoading } = useCustomerAuth();
  const products = useHybridProducts();
  const product = products?.find((item) => Number(item.menuNumber) === 3013);

  const startCheckout = () => {
    if (isAuthenticated && customer) {
      navigate({ to: "/$username/order", params: { username: customer.username }, search: { step: "menu" } });
      return;
    }
    // Preserve the product landing intent through the guest data form.
    // Guest localStorage is origin-scoped, so the intent is consumed only by B2B.
    window.localStorage.setItem("b2b-checkout-intent", "produksi");
    navigate({ to: "/daftar" });
  };

  return (
    <div className="app-page b2b-app min-h-app px-3 py-4 sm:py-8">
      <main className="app-shell mx-auto w-full max-w-md overflow-hidden rounded-[28px] bg-background shadow-sm">
        <section className="bg-primary px-5 pb-6 pt-7 text-primary-foreground">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15"><Package className="h-5 w-5" /></div>
            <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">B2B • Produksi</p><h1 className="text-lg font-black">{B2B_BRAND_NAME}</h1></div>
          </div>
          <h2 className="mt-8 font-display text-3xl font-black leading-tight">Pasokan mie untuk operasionalmu.</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/80">Pesan mie mentah kiloan Djiwa Tentram dengan checkout praktis untuk kebutuhan produksi B2B.</p>
        </section>

        <section className="space-y-4 px-4 py-5">
          <div className="overflow-hidden rounded-[22px] border border-border bg-card shadow-sm">
            <div className="relative h-52 bg-muted">
              <img src={product?.image || "/mie-yamin-product.png"} alt="Mie Mentah Kiloan Djiwa Tentram" className="h-full w-full object-cover" />
              <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-black text-white">#3013</span>
            </div>
            <div className="space-y-2.5 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Produksi</p>
              <h3 className="text-xl font-black">{product?.name || "Mie Mentah Kiloan Djiwa Tentram"}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{product?.description || "Mie mentah kiloan Djiwa Tentram untuk kebutuhan B2B."}</p>
              <div className="flex items-end justify-between gap-3 pt-2"><p className="text-2xl font-black text-primary">{currency(Number(product?.price ?? 30000))}<span className="text-xs font-bold text-muted-foreground"> / kilo</span></p><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${product?.isAvailable === false || Number(product?.quantity ?? 1) <= 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{product?.isAvailable === false || Number(product?.quantity ?? 1) <= 0 ? "SOLD" : "Aktif"}</span></div>
            </div>
          </div>

          <div className="grid gap-2 rounded-[20px] border border-border bg-card p-4 text-sm">
            {['Pilih jumlah kilo sesuai kebutuhan produksi', 'Checkout dengan akun Djiwa Tentram yang sama', 'Pantau status pesanan dari riwayat order'].map((label) => <div className="flex items-start gap-2.5" key={label}><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{label}</span></div>)}
          </div>

          <button type="button" onClick={startCheckout} disabled={isLoading} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-white shadow-sm transition-transform active:scale-[.98] disabled:opacity-60">{isAuthenticated ? "Lanjut ke checkout" : "Mulai pesan B2B"}<ArrowRight className="h-4 w-4" /></button>
          <p className="text-center text-[11px] text-muted-foreground">Satu akun untuk Djiwa Tentram, Merchandise, dan B2B.</p>
        </section>
      </main>
    </div>
  );
}
