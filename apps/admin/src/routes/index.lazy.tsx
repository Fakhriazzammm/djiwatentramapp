import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createLazyFileRoute("/")({
	component: IndexRedirect,
});

function IndexRedirect() {
	const navigate = useNavigate();

	useEffect(() => {
		navigate({ to: "/admin/login", replace: true });
	}, [navigate]);

	return null;
}