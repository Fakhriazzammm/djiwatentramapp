"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { User, Search, Star, Loader2 } from "lucide-react";

interface CustomerSearchResult {
  source_id: string;
  name: string;
  phone?: string | null;
  point?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (customer: { source_id: string; name: string }) => void;
}

export function CustomerSearchModal({ open, onOpenChange, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data, error: err } = await supabase
          .from("pos_customers_view")
          .select("source_id, name, phone, point")
          .ilike("name", `%${trimmed}%`)
          .order("name", { ascending: true })
          .limit(20);

        if (err) {
          console.error("[CustomerSearch] query error:", err);
          setError(err.message);
          setResults([]);
        } else {
          setResults((data ?? []) as CustomerSearchResult[]);
          setError(null);
        }
      } catch (e) {
        console.error("[CustomerSearch] unexpected error:", e);
        setError("Terjadi kesalahan saat mencari pelanggan");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const handleSelect = (customer: CustomerSearchResult) => {
    onSelect({ source_id: customer.source_id, name: customer.name });
    setQuery("");
    setResults([]);
    onOpenChange(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
            <Search className="h-4 w-4" />
            Cari Pelanggan
          </DialogTitle>
          <DialogDescription>
            Ketik minimal 2 huruf untuk mencari pelanggan terdaftar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="Cari nama pelanggan..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 rounded-xl border-border/70 bg-white px-3 text-sm font-semibold placeholder:text-xs placeholder:font-medium"
            autoFocus
          />

          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[11px] font-medium">Mencari...</span>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
              <p className="text-[11px] font-medium text-destructive">{error}</p>
            </div>
          )}

          {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <User className="mb-2 h-8 w-8 text-muted-foreground/30" />
              <p className="text-[11px] font-medium">Pelanggan tidak ditemukan</p>
              <p className="text-[10px] text-muted-foreground/70">Coba dengan kata kunci lain</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-border/50 bg-muted/20 p-1">
              {results.map((customer) => (
                <button
                  key={customer.source_id}
                  type="button"
                  onClick={() => handleSelect(customer)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all hover:bg-primary/10 hover:text-primary active:scale-[0.99]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold leading-tight">
                        {customer.name}
                      </span>
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    </div>
                    {customer.phone && (
                      <p className="text-[10px] font-medium text-muted-foreground">
                        {customer.phone}
                      </p>
                    )}
                    {customer.point != null && customer.point > 0 && (
                      <p className="text-[10px] font-medium text-amber-600">
                        {customer.point} poin
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {query.trim().length < 2 && !loading && (
            <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
              <User className="mb-1.5 h-6 w-6 text-muted-foreground/20" />
              <p className="text-[10px] font-medium">Ketik minimal 2 huruf untuk mulai mencari</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
