import { createLazyFileRoute } from "@tanstack/react-router";
import { BookingSettingsPage } from "../booking.lazy";

export const Route = createLazyFileRoute("/admin/booking/capacity")({
	component: () => <BookingSettingsPage forcedTab="capacity" />,
});
