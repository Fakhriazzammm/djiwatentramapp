import { createLazyFileRoute } from "@tanstack/react-router";
import { BookingSettingsSectionPage } from "../-components/BookingSettingsSectionPage";

export const Route = createLazyFileRoute("/admin/booking/settings/menu")({
	component: () => <BookingSettingsSectionPage mode="menu" />,
});
