import { createLazyFileRoute } from "@tanstack/react-router";
import { KolOverviewPage } from "./-kol/kol-overview";

export const Route = createLazyFileRoute("/admin/kol")({ component: KolOverviewPage });
