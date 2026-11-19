import { createLazyFileRoute } from "@tanstack/react-router";
import Page from "@/components/karyawan/pages/KehadiranPage";

export const Route = createLazyFileRoute("/admin/karyawan/kehadiran/")({
  component: Page,
});
