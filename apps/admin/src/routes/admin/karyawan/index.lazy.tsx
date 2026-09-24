import { createLazyFileRoute } from "@tanstack/react-router";
import WorkforceDashboard from "@/components/karyawan/WorkforceDashboard";

export const Route = createLazyFileRoute("/admin/karyawan/")({
  component: WorkforceDashboard,
});
