import { createLazyFileRoute } from "@tanstack/react-router";
import { BookingOverviewPage } from "./-components/BookingOverviewPage";

export const Route = createLazyFileRoute("/admin/booking/")({
	component: BookingOverviewPage,
});
