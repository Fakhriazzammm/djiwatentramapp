import { createLazyFileRoute } from "@tanstack/react-router";
import { KolCommunityPage } from "./-kol/kol-community";

export const Route = createLazyFileRoute("/admin/kol-community")({ component: KolCommunityPage });
