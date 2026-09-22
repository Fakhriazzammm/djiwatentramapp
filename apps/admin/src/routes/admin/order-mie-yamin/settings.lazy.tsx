import { createLazyFileRoute } from "@tanstack/react-router";
import { AdminMieYamin } from "../order-mie-yamin.lazy";

export const Route = createLazyFileRoute("/admin/order-mie-yamin/settings")({
  component: OrderMieYaminSettingsPage,
});

function OrderMieYaminSettingsPage() {
  return <AdminMieYamin forcedTab="pricing" />;
}
