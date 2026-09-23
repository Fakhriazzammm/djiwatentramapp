import { createLazyFileRoute } from "@tanstack/react-router";
import { RecruitmentDashboardPage } from "@/components/rekrutmen/route-pages";
export const Route = createLazyFileRoute("/admin/rekrutmen/")({ component: RecruitmentDashboardPage });
