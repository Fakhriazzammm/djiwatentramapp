import { createLazyFileRoute } from "@tanstack/react-router";
import { KolCampaignsPage } from "./-kol/kol-campaigns";

export const Route = createLazyFileRoute("/admin/kol-campaigns")({ component: KolCampaignsPage });
