import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/karyawan/kehadiran")({
  component: () => <Outlet />,
});
