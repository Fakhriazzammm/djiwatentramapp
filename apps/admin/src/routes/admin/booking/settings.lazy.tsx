import { createLazyFileRoute } from "@tanstack/react-router";
import { BookingSettingsWorkspace } from "./-components/BookingSettingsWorkspace";

export const Route = createLazyFileRoute("/admin/booking/settings")({
	component: BookingSettingsWorkspace,
});
