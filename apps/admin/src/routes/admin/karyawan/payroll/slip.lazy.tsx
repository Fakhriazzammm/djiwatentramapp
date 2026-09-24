import { createLazyFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/admin/karyawan/payroll/slip")({
  component: () => <Navigate replace to="/admin/operational-team/payroll/slip" />,
});
