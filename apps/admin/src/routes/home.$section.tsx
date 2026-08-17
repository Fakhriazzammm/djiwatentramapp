import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/home/$section")({
	beforeLoad: () => {
		throw redirect({ to: "/admin", replace: true });
	},
});
