import { createLazyFileRoute } from "@tanstack/react-router";
import { KolPortalAdminPage } from "./-components/KolPortalAdmin";
export const Route = createLazyFileRoute("/admin/kol-collaborations")({ component: KolPortalAdminPage });
