import { createLazyFileRoute } from "@tanstack/react-router";
import { KolReportsPage } from "./-components/KolMarketingSubpages";
export const Route = createLazyFileRoute("/admin/kol-reports")({ component: KolReportsPage });
