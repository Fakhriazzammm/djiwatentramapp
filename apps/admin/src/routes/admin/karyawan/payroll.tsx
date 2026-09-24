import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/karyawan/payroll")({
  component: () => <Outlet />,
});
