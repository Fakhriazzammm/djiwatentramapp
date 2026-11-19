import { createLazyFileRoute } from "@tanstack/react-router";
import Page from "@/components/karyawan/pages/PayrollPage";

export const Route = createLazyFileRoute("/admin/karyawan/payroll/")({
  component: Page,
});
