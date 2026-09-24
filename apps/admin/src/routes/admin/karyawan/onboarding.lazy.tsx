import { createLazyFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/admin/karyawan/onboarding")({
  component: () => <Outlet />,
});
