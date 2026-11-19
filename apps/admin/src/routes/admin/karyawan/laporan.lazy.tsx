import { createLazyFileRoute } from "@tanstack/react-router";
import Page from "@/components/karyawan/pages/LaporanPage";

export const Route = createLazyFileRoute("/admin/karyawan/laporan")({
  component: Page,
});
