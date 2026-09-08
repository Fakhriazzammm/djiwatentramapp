import { createLazyFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "./admin/route";
import { DashboardAdmin } from "./admin/index.lazy";

export const Route = createLazyFileRoute("/")({
  component: AdminRootPage,
});

function AdminRootPage() {
  return (
    <AdminLayout>
      <DashboardAdmin />
    </AdminLayout>
  );
}