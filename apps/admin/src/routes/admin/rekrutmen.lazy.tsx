import { Outlet } from "@tanstack/react-router";
import { createLazyFileRoute } from "@tanstack/react-router";

function RecruitmentRouteShell() { return <Outlet />; }
export const Route = createLazyFileRoute("/admin/rekrutmen")({ component: RecruitmentRouteShell });
