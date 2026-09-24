import { createLazyFileRoute } from "@tanstack/react-router";
import { DataKaryawanPage } from "../operational-team/karyawan/data.lazy";

export const Route = createLazyFileRoute("/admin/karyawan/data")({
  component: DataKaryawanPage,
});
