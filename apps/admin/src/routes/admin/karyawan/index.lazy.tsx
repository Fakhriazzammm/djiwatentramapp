import { createLazyFileRoute } from "@tanstack/react-router";
import RingkasanPage from "@/components/karyawan/pages/RingkasanPage";

export const Route = createLazyFileRoute("/admin/karyawan/")({
  component: RingkasanPage,
});
