import { createLazyFileRoute } from "@tanstack/react-router";
import { AdminMieYamin } from "../order-mie-yamin.lazy";

export const Route = createLazyFileRoute("/admin/order-mie-yamin/delivery")({
  component: OrderMieYaminDeliveryPage,
});

function OrderMieYaminDeliveryPage() {
  return <AdminMieYamin forcedTab="delivery" />;
}
