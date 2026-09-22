import { createLazyFileRoute } from "@tanstack/react-router";
import { BookingSettingsSectionPage } from "../-components/BookingSettingsSectionPage";

export const Route = createLazyFileRoute("/admin/booking/settings/options")({
	component: () => <BookingSettingsSectionPage mode="options" />,
});
