import { createLazyFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "./admin/route";
import OperationalDecisionDashboard from "./admin/-OperationalDecisionDashboard";

export const Route = createLazyFileRoute("/")({
  component: AdminRootPage,
});

function AdminRootPage() {
  return (
    <AdminLayout>
      <OperationalDecisionDashboard />
    </AdminLayout>
  );
}