import { createLazyFileRoute } from "@tanstack/react-router";
import Page from "@/components/karyawan/pages/DokumenPage";

export const Route = createLazyFileRoute("/admin/karyawan/onboarding/kontrak")({
  component: Page,
});
