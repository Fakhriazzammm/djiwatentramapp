import { useEffect, useState } from "react";
import { createLazyFileRoute } from "@tanstack/react-router";
import { Loader2, LogIn } from "lucide-react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { getMerchandiseAuthReturnUrl, redirectToDjiwaAppLogin } from "@/lib/auth-client";

export const Route = createLazyFileRoute("/masuk")({
  component: MerchandiseAuthBridge,
});

function MerchandiseAuthBridge() {
  const { isAuthenticated, isLoading, customer } = useCustomerAuth();
  const [redirectStarted, setRedirectStarted] = useState(false);

  useEffect(() => {
    if (isLoading || redirectStarted) return;
    if (isAuthenticated && customer) {
      const returnTo = getMerchandiseAuthReturnUrl(customer.username);
      if (returnTo && returnTo !== window.location.href) window.location.assign(returnTo);
      return;
    }

    setRedirectStarted(true);
    redirectToDjiwaAppLogin();
  }, [customer, isAuthenticated, isLoading, redirectStarted]);

  return (
    <div className="app-page merchandise-app min-h-app px-3 py-4 sm:py-6">
      <main className="app-shell mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col items-center justify-center bg-background px-5 py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {isLoading || redirectStarted ? <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" /> : <LogIn className="h-7 w-7" aria-hidden="true" />}
        </div>
        <p className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-primary">Djiwa App</p>
        <h1 className="mt-2 text-xl font-black">Login dilakukan di Djiwa App</h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Setelah login atau daftar, kamu akan kembali ke checkout Merchandise yang sedang dibuka.
        </p>
        <button
          type="button"
          className="mt-6 min-h-11 w-full max-w-xs rounded-[14px] bg-primary px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"
          disabled={isLoading || redirectStarted}
          onClick={() => redirectToDjiwaAppLogin()}
        >
          {redirectStarted ? "Membuka Djiwa App..." : "Buka login Djiwa App"}
        </button>
      </main>
    </div>
  );
}
