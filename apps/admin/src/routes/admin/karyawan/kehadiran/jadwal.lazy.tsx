import { createLazyFileRoute } from "@tanstack/react-router";
import Page from "@/components/karyawan/pages/JadwalPage";

export const Route = createLazyFileRoute("/admin/karyawan/kehadiran/jadwal")({
  component: Page,
});
