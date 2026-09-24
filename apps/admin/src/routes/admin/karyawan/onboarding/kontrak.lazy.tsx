import { createLazyFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/admin/karyawan/onboarding/kontrak")({
  component: () => <Navigate replace to="/admin/operational-team/register/contract" />,
});
