import { createLazyFileRoute } from "@tanstack/react-router";
import { AdminKolData } from "./kol.lazy";

export const Route = createLazyFileRoute("/admin/kol-data")({
  component: AdminKolData,
});
