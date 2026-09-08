import { createLazyFileRoute } from "@tanstack/react-router";
import { DashboardAdmin } from "./admin/index.lazy";

export const Route = createLazyFileRoute("/")({
  component: DashboardAdmin,
});