import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { DeliverySettingsPanel } from "./-components/delivery-settings-panel";

export const Route = createLazyFileRoute("/admin/delivery_/settings")({ component: DeliverySettings });

function DeliverySettings() {
  return <main className="space-y-4 bg-slate-50/80 p-4 text-slate-900 md:p-6">
    <h1 className="text-2xl font-semibold tracking-tight">Pengaturan Delivery Customer</h1>
    <Link to="/admin/delivery" className="inline-flex min-h-11 items-center text-sm underline">Kembali ke monitoring</Link>
    <section aria-label="Pengaturan delivery" className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <DeliverySettingsPanel />
    </section>
  </main>;
}
