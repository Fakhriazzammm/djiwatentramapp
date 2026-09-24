import { createLazyFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/admin/karyawan")({
  component: () => <Outlet />,
});
