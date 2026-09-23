import { createLazyFileRoute } from "@tanstack/react-router";
import { KolCollaborationsPage } from "./-components/KolMarketingSubpages";
export const Route = createLazyFileRoute("/admin/kol-collaborations")({ component: KolCollaborationsPage });
