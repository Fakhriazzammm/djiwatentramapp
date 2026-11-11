import { createLazyFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "./admin/route";
import CommandCenter from "./admin/-dashboard/CommandCenter";

export const Route = createLazyFileRoute("/")({
  component: AdminRootPage,
});

function AdminRootPage() {
  return (
    <AdminLayout>
      <CommandCenter />
    </AdminLayout>
  );
}