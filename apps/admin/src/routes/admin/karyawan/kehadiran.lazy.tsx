import { createLazyFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/admin/karyawan/kehadiran")({
  component: () => <Outlet />,
});
