import { createLazyFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/admin/karyawan/kehadiran/")({
  component: () => <Navigate replace to="/admin/operational-team/attendance" />,
});
