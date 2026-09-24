import { createLazyFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/admin/karyawan/onboarding/")({
  component: () => <Navigate replace to="/admin/onboarding" />,
});
