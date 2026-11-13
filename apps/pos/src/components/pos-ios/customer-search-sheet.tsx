import { Loader2, Search, Star, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/client";
import { IosSheet } from "./ios-kit";

interface CustomerResult { source_id: string; name: string; email?: string | null; phone?: string | null; point?: number | null }

/** Cari pelanggan terdaftar (min. 2 huruf). Query dan debounce sama dengan modal lama. */
export function CustomerSearchSheet({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (customer: { source_id: string; name: string; email?: string | null; phone?: string | null }) => void }) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<CustomerResult[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => {
		if (timer.current) clearTimeout(timer.current);
		const trimmed = query.trim();
		if (trimmed.length < 2) {
			setResults([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		timer.current = setTimeout(async () => {
			try {
				const { data, error: failure } = await createClient().from("pos_customers_view").select("source_id, name, email, phone, point").ilike("name", `%${trimmed}%`).order("name", { ascending: true }).limit(20);
				if (failure) {
					console.error("[CustomerSearch] query error:", failure);
					setError(failure.message);
					setResults([]);
				} else {
					setResults((data ?? []) as CustomerResult[]);
					setError(null);
				}
			} catch (failure) {
				console.error("[CustomerSearch] unexpected error:", failure);
				setError("Terjadi kesalahan saat mencari pelanggan");
				setResults([]);
			} finally {
				setLoading(false);
			}
		}, 350);
		return () => { if (timer.current) clearTimeout(timer.current); };
	}, [query]);

	const close = () => { setQuery(""); setResults([]); setError(null); onClose(); };

	return (
		<IosSheet open={open} onClose={close} title="Cari pelanggan" heightClass="h-[70dvh]">
			<label className="flex h-11 items-center gap-2 rounded-[14px] bg-muted px-3.5">
				<Search className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
				<input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ketik minimal 2 huruf…" aria-label="Cari nama pelanggan" className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
			</label>
			<div className="mt-3 pb-3">
				{loading ? <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Mencari…</div> : null}
				{error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-[13px] font-semibold text-rose-700">{error}</p> : null}
				{!loading && !error && query.trim().length >= 2 && results.length === 0 ? <p className="py-8 text-center text-[13px] text-muted-foreground">Pelanggan tidak ditemukan.</p> : null}
				{results.map((customer) => (
					<button key={customer.source_id} type="button" onClick={() => { onSelect({ source_id: customer.source_id, name: customer.name, email: customer.email, phone: customer.phone }); close(); }} className="flex w-full items-center gap-3 border-b border-border/70 py-3 text-left">
						<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><User className="h-[18px] w-[18px]" aria-hidden="true" /></span>
						<span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-bold">{customer.name}</span><span className="block truncate text-[12.5px] text-muted-foreground">{customer.phone || customer.email || "Tanpa kontak"}</span></span>
						{customer.point ? <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-bold text-amber-600"><Star className="h-3.5 w-3.5" aria-hidden="true" />{customer.point}</span> : null}
					</button>
				))}
			</div>
		</IosSheet>
	);
}
