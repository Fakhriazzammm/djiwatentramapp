import { createLazyFileRoute } from "@tanstack/react-router";
import { KolVisitsPage } from "./-kol/kol-visits";

export const Route = createLazyFileRoute("/admin/kol-visits")({ component: KolVisitsPage });
