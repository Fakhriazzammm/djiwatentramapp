import { createLazyFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StockOpnamePanel, type OpnameItem, type OpnameRole } from "@/components/attendance/stock-opname-panel";
import { useOpnameRunner } from "@/hooks/use-opname-runner";

export const Route = createLazyFileRoute("/attendance/stock-opname")({
  component: StockOpnamePage,
});

function StockOpnamePage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/attendance/stock-opname" });
  const { checkAndLoad, submitOpname, loading } = useOpnameRunner();

  const [items, setItems] = useState<OpnameItem[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const role = (search.role || "bar") as OpnameRole;

  const clockoutPayload = useMemo(() => {
    try {
      const raw = sessionStorage.getItem("__clockout_payload__");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);

  // Load ingredients on mount
  useEffect(() => {
    const load = async () => {
      try {
        const res = await checkAndLoad(
          role,
          search.shiftId || "",
          search.shiftName || "Shift",
          search.userId || "",
        );
        setItems(res.items);
      } catch (err: any) {
        toast.error("Gagal memuat data stok: " + (err?.message || "Unknown"));
      } finally {
        setIsInitializing(false);
      }
    };
    void load();
  }, []);

  const handleUpdateItem = useCallback((index: number, qty: number) => {
    setItems((prev) => {
      const next = [...prev];
      const item = next[index];
      const factor = item.conversionFactor || 1;
      next[index] = { ...item, qtyAfter: Math.max(0, qty), operationalQtyAfter: Math.max(0, qty / factor) };
      return next;
    });
  }, []);

  const handleMarkAllSame = useCallback(() => {
    setItems((prev) =>
      prev.map((item) => ({ ...item, qtyAfter: item.qtyBefore, operationalQtyAfter: item.operationalQtyBefore ?? item.qtyBefore }))
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      // 1. Save opname
      await submitOpname(
        {
          needsOpname: true,
          role,
          shiftName: search.shiftName || "Shift",
          shiftSourceId: search.shiftId || "",
          items,
          totalStaffInRole: 1,
          alreadyClockedOut: 0,
          isLastPerson: true,
        },
        search.userName || "Staff",
        search.userId || "",
        {
          pinCode: clockoutPayload?.pinCode ?? undefined,
          faceDescriptor: clockoutPayload?.faceDescriptor ?? undefined,
          location: clockoutPayload?.location ?? undefined,
        },
      );

      toast.success("Stock opname tersimpan & Absen Keluar berhasil!");
      navigate({ to: "/menu" });
    } catch (err: any) {
      toast.error(err?.message || "Gagal menyimpan opname");
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, items, submitOpname, navigate, search, role]);

  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            Memuat data stok...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-border/40 bg-background/90 px-4 backdrop-blur-xl">
        <button
          onClick={() => navigate({ to: "/menu" })}
          className="flex h-8 w-8 items-center justify-center rounded-full border bg-white/80"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-sm font-black uppercase tracking-tight">
            Stock Opname — {role === "bar" ? "Bar" : "Kitchen"}
          </h1>
          <p className="text-[10px] text-muted-foreground font-medium">
            {search.userName} · {search.shiftName || "Shift"}
          </p>
        </div>
      </header>

      {/* Opname Form */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <StockOpnamePanel
          state={{
            role,
            items,
            totalStaffInRole: 1,
            alreadyClockedOut: 0,
            isLastPerson: true,
            shiftName: search.shiftName || "Shift",
          }}
          onUpdateItem={handleUpdateItem}
          onMarkAllSame={handleMarkAllSame}
          onSubmit={handleSubmit}
          isLoading={isSubmitting}
        />
      </div>
    </div>
  );
}
