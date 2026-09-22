import { createLazyFileRoute } from "@tanstack/react-router";
import { AdminMieYamin } from "../../order-mie-yamin.lazy";

export const Route = createLazyFileRoute("/admin/order-mie-yamin/settings/notifications")({
  component: OrderMieYaminNotificationsPage,
});

function OrderMieYaminNotificationsPage() {
  return <AdminMieYamin forcedTab="notifications" />;
}
