import { createLazyFileRoute } from "@tanstack/react-router";
import { BookingSettingsPage } from "../booking.lazy";

export const Route = createLazyFileRoute("/admin/booking/orders")({
	component: () => <BookingSettingsPage forcedTab="orders" />,
});
