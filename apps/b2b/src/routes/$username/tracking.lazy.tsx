import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, PackageSearch, Truck } from "lucide-react";
import { CustomerHeader } from "@/components/customer/customer-shell";
import { OrderTrackingView } from "@/components/customer/order-tracking-view";

export const Route = createLazyFileRoute("/$username/tracking")({ component: TrackingPage });

function TrackingPage() {
  const navigate = useNavigate();
  const { username } = Route.useParams();
  const { orderId } = Route.useSearch();

  return (
    <div className="app-page b2b-app min-h-app">
      <div className="app-shell mx-auto flex min-h-app max-w-md flex-col bg-background">
        <CustomerHeader eyebrow="TRACKING ORDER" title="Djiwa Tentram B2B" subtitle="Status pesanan real time" onBack={() => navigate({ to: "/$username", params: { username } })} leading={<ArrowLeft className="h-4 w-4" />} />
        {orderId ? (
          <OrderTrackingView orderId={orderId} />
        ) : (
          <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 py-12 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary"><Truck className="h-8 w-8" /></span>
            <h1 className="mt-4 font-display text-lg font-black">Tracking pengiriman</h1>
            <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-muted-foreground">
              Pilih pesanan pengiriman untuk melihat status live. Tracking hanya tersedia untuk pesanan delivery.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/$username/riwayat", params: { username } })}
              className="mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-[14px] bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground shadow-sm transition-transform duration-200 active:scale-[.97]"
            >
              <PackageSearch className="h-4 w-4" /> Lihat riwayat pesanan
            </button>
          </main>
        )}
      </div>
    </div>
  );
}
