import { createLazyFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/components/rekrutmen/route-pages";
export const Route = createLazyFileRoute("/admin/rekrutmen/reports")({ component: ReportsPage });
