import { createLazyFileRoute } from "@tanstack/react-router";
import { OrderMieYaminOverviewPage } from "./-components/OrderMieYaminOverviewPage";

export const Route = createLazyFileRoute("/admin/order-mie-yamin/")({
  component: OrderMieYaminOverviewPage,
});
