import { useEffect, useMemo, useState } from "react";
import { Camera, ChevronDown, CircleDollarSign, CreditCard, RotateCcw, WalletCards } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";

export type ShiftPaymentKey =
  | "qris_kasir"
  | "tunai_kasir"
  | "djiwa_pay"
  | "djiwaapp_qris"
  | "djiwaapp_bayar_kasir"
  | "gofood"
  | "grabfood"
  | "shopeefood"
  | "online_unmapped";

export type ShiftPaymentBreakdown = Record<ShiftPaymentKey, number>;

export const SHIFT_PAYMENT_CHANNELS: Array<{ key: ShiftPaymentKey; label: string; group: "direct" | "online"; icon: typeof CreditCard }> = [
  { key: "qris_kasir", label: "QRIS Kasir", group: "direct", icon: CreditCard },
  { key: "tunai_kasir", label: "Tunai Kasir", group: "direct", icon: CircleDollarSign },
  { key: "djiwa_pay", label: "Djiwa Pay", group: "direct", icon: WalletCards },
  { key: "djiwaapp_qris", label: "DjiwaApp — QRIS", group: "direct", icon: CreditCard },
  { key: "djiwaapp_bayar_kasir", label: "DjiwaApp — Bayar Kasir", group: "direct", icon: CircleDollarSign },
  { key: "gofood", label: "GoFood", group: "online", icon: CreditCard },
  { key: "grabfood", label: "GrabFood", group: "online", icon: CreditCard },
  { key: "shopeefood", label: "ShopeeFood", group: "online", icon: CreditCard },
  { key: "online_unmapped", label: "Online Food — Platform Belum Terpetakan", group: "online", icon: CreditCard },
];

export const EMPTY_SHIFT_PAYMENT_BREAKDOWN: ShiftPaymentBreakdown = {
  qris_kasir: 0, tunai_kasir: 0, djiwa_pay: 0, djiwaapp_qris: 0,
  djiwaapp_bayar_kasir: 0, gofood: 0, grabfood: 0, shopeefood: 0, online_unmapped: 0,
};

export const EMPTY_SHIFT_PAYMENT_ACTUAL: Partial<Record<ShiftPaymentKey, number | null>> = {
  qris_kasir: null,
  tunai_kasir: null,
  djiwa_pay: null,
  djiwaapp_qris: null,
  djiwaapp_bayar_kasir: null,
  gofood: null,
  grabfood: null,
  shopeefood: null, online_unmapped: null,
};

export function formatRupiah(value: number) {
  return `Rp ${Math.max(0, Number(value) || 0).toLocaleString("id-ID")}`;
}

function AnimatedValue({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDisplay(value));
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className="inline-block tabular-nums transition-all duration-200 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1">{formatRupiah(display)}</span>;
}

function Difference({ expected, actual, confirmed }: { expected: number; actual: number; confirmed: boolean }) {
  if (!confirmed) return <span className="text-muted-foreground">Belum diisi</span>;
  const difference = actual - expected;
  if (difference === 0) return <span className="text-emerald-700">Pas</span>;
  return <span className={difference < 0 ? "text-amber-800" : "text-blue-800"}>{difference < 0 ? "Kurang " : "Lebih "}<AnimatedValue value={Math.abs(difference)} /></span>;
}

export function ShiftPaymentReconciliation({
  expected,
  actual,
  onActualChange,
  cashBreakdown,
  onCashChange,
  onAutoFillCash,
  onPhotoChange,
  photo,
}: {
  expected: ShiftPaymentBreakdown;
  actual: Partial<Record<ShiftPaymentKey, number | null>>;
  onActualChange: (key: ShiftPaymentKey, value: string) => void;
  cashBreakdown: Record<string, number>;
  onCashChange: (key: string, value: number) => void;
  onAutoFillCash: () => void;
  onPhotoChange: (photo: File | null) => void;
  photo: File | null;
}) {
  const cashTotal = useMemo(() => Object.entries(cashBreakdown).reduce((sum, [key, count]) => sum + Number(key.replace("bill", "")) * Number(count || 0), 0), [cashBreakdown]);
  const channels = SHIFT_PAYMENT_CHANNELS;
  const cashKeys = ["bill100000", "bill50000", "bill20000", "bill10000", "bill5000", "bill2000", "bill1000", "bill500", "bill200", "bill100"];
  const [cashTouchedKeys, setCashTouchedKeys] = useState<Set<string>>(new Set());
  const grouped = (group: "direct" | "online") => channels.filter((channel) => channel.group === group);
  const totalExpected = channels.reduce((sum, channel) => sum + Number(expected[channel.key] || 0), 0);
  const totalActual = channels.reduce((sum, channel) => sum + (actual[channel.key] == null ? 0 : Number(actual[channel.key] || 0)), 0);
  // Tunai belum terkonfirmasi hanya karena total awal bernilai Rp0.
  // Kasir harus mengisi minimal satu pecahan terlebih dahulu; ini mencegah
  // kondisi kosong Rp0 vs Rp0 tampil menyesatkan sebagai "Pas".
  const cashConfirmed = cashTouchedKeys.size > 0 || cashTotal > 0;
  const confirmedCount = channels.filter((channel) => channel.key === "tunai_kasir" ? cashConfirmed : actual[channel.key] !== null && actual[channel.key] !== undefined).length;
  const totalConfirmed = confirmedCount === channels.length;
  const totalDifference = totalActual - totalExpected;
  const render = (channel: typeof channels[number]) => {
    const isCash = channel.key === "tunai_kasir";
    const actualValue = isCash ? cashTotal : Number(actual[channel.key] ?? 0);
    const confirmed = isCash || actual[channel.key] !== null && actual[channel.key] !== undefined;
    const Icon = channel.icon;
    return <div key={channel.key} className="rounded-xl border border-border/80 bg-background p-3 shadow-[0_2px_12px_rgba(9,9,11,0.03)]">
      <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-extrabold"><Icon className="h-4 w-4 text-primary" />{channel.label}</div><div className={`rounded-full border px-2 py-1 text-[10px] font-bold ${!confirmed ? "border-border bg-muted/30 text-muted-foreground" : actualValue === expected[channel.key] ? "border-emerald-200 bg-emerald-50 text-emerald-700" : actualValue < expected[channel.key] ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}><Difference expected={expected[channel.key]} actual={actualValue} confirmed={confirmed} /></div></div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-muted/35 px-2.5 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Menurut Sistem</p><p className="mt-0.5 font-black"><AnimatedValue value={expected[channel.key]} /></p></div><div className="rounded-lg border border-primary/15 bg-primary/[0.03] px-2.5 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{isCash ? "Total Uang Fisik" : "Nominal Aktual"}</p>{isCash ? <p className="mt-0.5 font-black text-primary"><AnimatedValue value={cashTotal} /></p> : <Input type="number" min={0} inputMode="numeric" readOnly value={actual[channel.key] ?? expected[channel.key] ?? 0} onChange={(event) => onActualChange(channel.key, event.target.value)} className="mt-1 h-9 rounded-lg text-sm font-black bg-muted/40" />}</div></div>
      {isCash && <Collapsible defaultOpen className="mt-2"><CollapsibleTrigger className="flex min-h-[40px] w-full items-center justify-between rounded-lg border border-border px-3 text-xs font-bold text-muted-foreground"><span>Pecahan Uang</span><ChevronDown className="h-4 w-4" /></CollapsibleTrigger><CollapsibleContent className="mt-2 rounded-lg bg-muted/20 p-2"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase text-muted-foreground">Uang Kertas & Logam</p><button type="button" onClick={() => { setCashTouchedKeys(new Set(cashKeys)); onAutoFillCash(); }} className="min-h-[36px] rounded-lg bg-primary/10 px-3 text-[10px] font-bold text-primary">Auto-fill</button></div><div className="mt-2 grid grid-cols-2 gap-1.5">{cashKeys.map((key) => <div key={key} className="flex items-center gap-1"><span className="w-12 text-[10px] font-black text-muted-foreground">{formatRupiah(Number(key.replace("bill", "")))}</span><Input type="number" min={0} inputMode="numeric" value={cashTouchedKeys.has(key) && Number(cashBreakdown[key] || 0) > 0 ? cashBreakdown[key] : ""} placeholder="0" onFocus={() => setCashTouchedKeys((current) => new Set(current).add(key))} onChange={(event) => { setCashTouchedKeys((current) => new Set(current).add(key)); onCashChange(key, Number(event.target.value)); }} className="h-9 rounded-lg text-center text-sm font-black" /></div>)}</div></CollapsibleContent></Collapsible>}
      <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-2 text-xs"><span className="font-semibold text-muted-foreground">Perbedaan</span><strong className="font-black"><Difference expected={expected[channel.key]} actual={actualValue} confirmed={confirmed} /></strong></div>
    </div>;
  };
  return <div className="space-y-3"><Card className="rounded-2xl border-border bg-card shadow-sm"><CardContent className="space-y-3 p-3"><div><h4 className="text-base font-black tracking-tight">Konfirmasi Pembayaran Shift</h4><p className="mt-1 text-xs text-muted-foreground">Cocokkan nominal sistem dengan nominal aktual sebelum mengakhiri shift.</p></div><div className="space-y-2">{grouped("direct").map(render)}</div></CardContent></Card><Card className="rounded-2xl border-border bg-card shadow-sm"><CardContent className="space-y-3 p-3"><div><h4 className="text-base font-black tracking-tight">TRANSAKSI ONLINE FOOD</h4><p className="mt-1 text-xs text-muted-foreground">Konfirmasi total dari dashboard platform.</p></div><div className="space-y-2">{grouped("online").map(render)}</div></CardContent></Card><Card className="rounded-2xl border-border bg-card shadow-sm"><CardContent className="grid grid-cols-3 gap-2 p-3 text-center"><div><p className="text-[10px] font-semibold uppercase text-muted-foreground">Sistem</p><p className="mt-1 text-sm font-black"><AnimatedValue value={totalExpected} /></p></div><div><p className="text-[10px] font-semibold uppercase text-muted-foreground">Aktual</p><p className="mt-1 text-sm font-black text-primary"><AnimatedValue value={totalActual} /></p></div><div><p className="text-[10px] font-semibold uppercase text-muted-foreground">Perbedaan</p><p className={`mt-1 text-sm font-black ${!totalConfirmed ? "text-muted-foreground" : totalDifference === 0 ? "text-emerald-700" : totalDifference < 0 ? "text-amber-800" : "text-blue-800"}`}>{totalConfirmed ? <AnimatedValue value={Math.abs(totalDifference)} /> : "—"}</p></div></CardContent></Card><Card className="rounded-2xl border-amber-200 bg-amber-50/40 shadow-sm"><CardContent className="space-y-3 p-3"><div><h4 className="flex items-center gap-2 text-base font-black tracking-tight"><Camera className="h-4 w-4" />Foto Bukti Penutupan <span className="text-rose-600">*</span></h4><p className="mt-1 text-xs text-muted-foreground">Wajib ambil foto langsung dari kamera sebelum tutup kasir.</p></div>{photo ? <div className="space-y-2"><img src={URL.createObjectURL(photo)} alt="Preview bukti penutupan" className="max-h-56 w-full rounded-xl object-cover" /><button type="button" onClick={() => onPhotoChange(null)} className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg border border-border bg-background text-xs font-black"><RotateCcw className="h-4 w-4" /> Ambil ulang</button></div> : <label className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-300 bg-background text-xs font-black text-amber-900"><Camera className="h-6 w-6" /><span>Buka kamera & ambil foto</span><input className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => onPhotoChange(event.target.files?.[0] ?? null)} /></label>}</CardContent></Card></div>;
}
