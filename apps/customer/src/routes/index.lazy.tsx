import { createLazyFileRoute } from "@tanstack/react-router";
import { CustomerOrderingPage } from "@/components/customer/customer-ordering-page";

export const Route = createLazyFileRoute("/")({
	component: BrandCustomerOrderingRoute,
});

function BrandCustomerOrderingRoute() {
	const search = Route.useSearch();

	return <CustomerOrderingPage brandSlug={import.meta.env.VITE_BRAND_SLUG || "djiwatentram"} search={search} />;
}
