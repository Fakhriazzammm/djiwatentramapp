import { createLazyFileRoute } from "@tanstack/react-router";
import { AdminOnboardingPage } from "../../onboarding.lazy";

export const Route = createLazyFileRoute("/admin/operational-team/register/onboarding")({
	component: AdminOnboardingPage,
});
