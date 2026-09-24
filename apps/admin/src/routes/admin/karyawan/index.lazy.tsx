import { createLazyFileRoute } from "@tanstack/react-router";
import WorkforceDashboardApple from "@/components/karyawan/WorkforceDashboardApple";

export const Route = createLazyFileRoute("/admin/karyawan/")({
  component: WorkforceDashboardApple,
});
