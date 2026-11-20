import { createLazyFileRoute } from "@tanstack/react-router";
import { KolRewardsPage } from "./-kol/kol-rewards";

export const Route = createLazyFileRoute("/admin/kol-rewards")({ component: KolRewardsPage });
