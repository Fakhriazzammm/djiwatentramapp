import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { buildDjiwaPayBridgeUrl } from "@yumipos/djiwapay-core";
import { useCustomerAuth } from "@/hooks/use-customer-auth";

export const Route = createLazyFileRoute("/$username/saldo")({ component: DjiwaPayLauncher });

function DjiwaPayLauncher() {
  const { username } = Route.useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, customer } = useCustomerAuth();
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !customer) {
      window.location.replace("/masuk?next=saldo");
      return;
    }
    if (customer.username !== username) {
      navigate({ to: "/$username/saldo", params: { username: customer.username }, replace: true });
      return;
    }
    const returnTo = `${window.location.origin}/${encodeURIComponent(username)}`;
    window.location.replace(buildDjiwaPayBridgeUrl({ context: "b2b", returnTo }));
  }, [customer, isAuthenticated, isLoading, navigate, username]);
  return <main className="app-page flex min-h-app items-center justify-center bg-[#f7f8fa] px-5"><section className="rounded-[24px] bg-white px-6 py-8 text-center shadow-sm"><p className="text-sm font-black text-foreground">Membuka Djiwa Pay</p><p className="mt-1 text-xs text-muted-foreground">Saldo dan riwayat ada di Djiwa Pay.</p></section></main>;
}
