import { CalendarDays, Check, ChevronLeft, ChevronRight, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { useHybridDeliveryOrderCounts } from "@/hooks/use-hybrid-ops-data";

const PROVIDERS = [
  { key: "gojek" as const, label: "Gojek", description: "Pengiriman same-day sesuai area layanan." },
  { key: "maxim" as const, label: "Maxim", description: "Alternatif kurir untuk kebutuhan operasional." },
];

function wibDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function monthKey(value: Date) { return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`; }
function formatDate(value: string) { return new Date(`${value}T12:00:00+07:00`).toLocaleDateString("id-ID", { dateStyle: "long" }); }

export function DeliveryStep({ deliveryDate, setDeliveryDate, deliveryProvider, setDeliveryProvider, deliveryAddress, setDeliveryAddress, onBack, onContinue }: {
  deliveryDate: string;
  setDeliveryDate: (value: string) => void;
  deliveryProvider: "gojek" | "maxim" | "";
  setDeliveryProvider: (value: "gojek" | "maxim" | "") => void;
  deliveryAddress: string;
  setDeliveryAddress: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const minDate = wibDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const today = new Date(`${minDate}T00:00:00+07:00`);
  const [month, setMonth] = useState(() => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  const key = monthKey(month);
  const counts = useHybridDeliveryOrderCounts(key);
  const firstDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)).getUTCDay();
  const days = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = useMemo(() => [...Array(firstDay).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)], [days, firstDay]);
  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(month);
  const canContinue = Boolean(deliveryDate && deliveryProvider && deliveryAddress.trim());

  return <section className="space-y-4 px-2 py-3">
    <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Langkah 2 dari 5</p><h2 className="mt-1 text-xl font-black">Atur pengiriman</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Pilih kurir dan tanggal kirim sebelum masuk ke checkout.</p></div>
    <div className="rounded-3xl border border-border bg-card p-4 shadow-sm"><p className="mb-3 text-sm font-black">Pilih kurir pengiriman</p><div className="grid grid-cols-2 gap-2">{PROVIDERS.map((provider) => <button key={provider.key} type="button" onClick={() => setDeliveryProvider(provider.key)} className={`min-h-28 rounded-2xl border p-3 text-left transition active:scale-[.98] ${deliveryProvider === provider.key ? "border-primary bg-primary/5" : "border-border bg-background"}`}><div className="flex items-center justify-between"><span className="text-sm font-black">{provider.label}</span><Truck className={deliveryProvider === provider.key ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"} /></div><p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{provider.description}</p>{deliveryProvider === provider.key ? <Check className="mt-2 h-4 w-4 text-primary" /> : null}</button>)}</div></div>
    <div className="rounded-3xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-sm font-black capitalize">{monthLabel}</p><p className="mt-0.5 text-[11px] text-muted-foreground">Tanggal kirim tersedia mulai besok</p></div><div className="flex gap-1"><button type="button" aria-label="Bulan sebelumnya" onClick={() => setMonth((value) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() - 1, 1)))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border"><ChevronLeft className="h-4 w-4" /></button><button type="button" aria-label="Bulan berikutnya" onClick={() => setMonth((value) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1)))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border"><ChevronRight className="h-4 w-4" /></button></div></div><div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground">{["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day) => <span key={day}>{day}</span>)}</div><div className="mt-2 grid grid-cols-7 gap-1">{cells.map((day, index) => { const date = day ? `${key}-${String(day).padStart(2, "0")}` : ""; const disabled = !day || date < minDate || (counts?.[date] ?? 0) >= 20; const selected = date === deliveryDate; return <button key={`${key}-${index}`} type="button" disabled={disabled} onClick={() => setDeliveryDate(date)} className={`min-h-11 rounded-xl border text-xs font-black ${selected ? "border-primary bg-primary text-white" : disabled ? "border-transparent text-muted-foreground/30" : "border-transparent hover:border-primary/40 hover:bg-primary/5"}`}>{day ?? ""}{date && counts?.[date] ? <span className="mt-0.5 block text-[9px] font-bold opacity-70">{counts[date]}</span> : null}</button>; })}</div><p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground"><CalendarDays className="h-3.5 w-3.5 text-primary" />{deliveryDate ? `Dipilih: ${formatDate(deliveryDate)}` : "Pilih tanggal pengiriman"}</p></div>
    <label className="block rounded-3xl border border-border bg-card p-4 text-sm font-black shadow-sm">Alamat lengkap penerima<textarea value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} rows={4} placeholder="Nama jalan, nomor rumah, patokan, kecamatan" className="mt-2 w-full rounded-2xl border border-border bg-background p-3 text-xs font-medium outline-none focus:border-primary" /></label>
    <div className="grid grid-cols-2 gap-2"><button type="button" onClick={onBack} className="min-h-12 rounded-2xl border border-border text-xs font-black">Kembali ke menu</button><button type="button" disabled={!canContinue} onClick={onContinue} className="min-h-12 rounded-2xl bg-primary text-xs font-black text-white disabled:opacity-40">Lanjut checkout</button></div>
  </section>;
}
