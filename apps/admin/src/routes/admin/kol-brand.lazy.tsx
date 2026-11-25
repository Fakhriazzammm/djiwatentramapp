import { createLazyFileRoute } from "@tanstack/react-router";
import { KolBrandAdmin } from "./-kol/kol-brand";

export const Route = createLazyFileRoute("/admin/kol-brand")({ component: KolBrandAdmin });
