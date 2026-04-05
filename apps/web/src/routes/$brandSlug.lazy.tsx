import { createLazyFileRoute } from "@tanstack/react-router";
import { CustomerOrderingPage } from "@/components/customer/customer-ordering-page";

export const Route = createLazyFileRoute("/$brandSlug")({
	component: BrandCustomerOrderingRoute,
});

function BrandCustomerOrderingRoute() {
	const { brandSlug } = Route.useParams();
	const search = Route.useSearch();

	return <CustomerOrderingPage brandSlug={brandSlug} search={search} />;
}
