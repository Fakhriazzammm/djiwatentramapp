import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
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
        <OrderTrackingView orderId={orderId} />
      </div>
    </div>
  );
}
