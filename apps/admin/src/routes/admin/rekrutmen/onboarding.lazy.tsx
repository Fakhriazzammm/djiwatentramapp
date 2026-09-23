import { createLazyFileRoute } from "@tanstack/react-router";
import { OnboardingPage } from "@/components/rekrutmen/route-pages";
export const Route = createLazyFileRoute("/admin/rekrutmen/onboarding")({ component: OnboardingPage });
