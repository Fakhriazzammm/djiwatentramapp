import { createLazyFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/admin/karyawan/kehadiran/pengaturan")({
  component: () => <Navigate replace to="/admin/operational-team/attendance/pengaturan" />,
});
