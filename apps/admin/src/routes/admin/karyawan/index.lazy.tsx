import { createLazyFileRoute } from "@tanstack/react-router";
import EmployeeDashboard from "@/components/karyawan/EmployeeDashboard";

export const Route = createLazyFileRoute("/admin/karyawan/")({
  component: EmployeeDashboard,
});
