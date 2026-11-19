import { createLazyFileRoute } from "@tanstack/react-router";
import Page from "@/components/karyawan/pages/DataKaryawanPage";

export const Route = createLazyFileRoute("/admin/karyawan/data")({
  component: Page,
});
