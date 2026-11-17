import { createLazyFileRoute } from "@tanstack/react-router";
import { KolCreatorsPage } from "./-kol/kol-creators";

export const Route = createLazyFileRoute("/admin/kol-creators")({ component: KolCreatorsPage });
