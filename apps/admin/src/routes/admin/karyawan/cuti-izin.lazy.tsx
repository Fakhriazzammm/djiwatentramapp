import { createLazyFileRoute } from "@tanstack/react-router";
import Page from "@/components/karyawan/pages/CutiPage";

export const Route = createLazyFileRoute("/admin/karyawan/cuti-izin")({
  component: Page,
});
