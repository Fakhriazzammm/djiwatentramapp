import { createLazyFileRoute } from "@tanstack/react-router";
import { BookingSettingsSectionPage } from "../-components/BookingSettingsSectionPage";

export const Route = createLazyFileRoute("/admin/booking/settings/form")({
	component: () => <BookingSettingsSectionPage mode="form" />,
});
