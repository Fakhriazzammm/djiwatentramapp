import { createLazyFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/admin/karyawan/payroll/")({
  component: () => <Navigate replace to="/admin/operational-team/payroll" />,
});
