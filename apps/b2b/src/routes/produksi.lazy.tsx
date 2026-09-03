import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { CustomerPageSkeleton } from "@/components/customer/customer-states";

export const Route = createLazyFileRoute("/produksi")({
	component: ProduksiRedirectPage,
});

function ProduksiRedirectPage() {
	const navigate = useNavigate();

	useEffect(() => {
		navigate({ to: "/", replace: true });
	}, [navigate]);

	return <CustomerPageSkeleton label="Membuka katalog produksi" />;
}
