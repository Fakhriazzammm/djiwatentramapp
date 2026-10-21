import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { buildDjiwaPayUrl } from "@yumipos/djiwapay-core";

export const Route = createLazyFileRoute("/$username/saldo")({ component: DjiwaPayLauncher });

function DjiwaPayLauncher() {
  const { username } = Route.useParams();
  useEffect(() => {
    const returnTo = `${window.location.origin}/${encodeURIComponent(username)}/saldo`;
    window.location.replace(buildDjiwaPayUrl({ context: "customer", returnTo }));
  }, [username]);
  return <main className="app-page flex min-h-app items-center justify-center bg-[#f7f8fa] px-5"><section className="rounded-[24px] bg-white px-6 py-8 text-center shadow-sm"><p className="text-sm font-black text-foreground">Membuka Djiwa Pay</p><p className="mt-1 text-xs text-muted-foreground">Saldo dan riwayat dipusatkan di pay.djiwatentram.web.id.</p></section></main>;
}
