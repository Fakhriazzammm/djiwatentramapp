import { useEffect, useState } from "react";
import { ArrowUpRight, BarChart3, Bell, Bot, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, LayoutGrid, LogOut, Package, Printer, RefreshCw, Search, Settings2, ShieldCheck, User, Wallet, Wifi, WifiOff } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { bluetoothPrinter } from "@/lib/bluetooth-printer";
import { toast } from "sonner";

type WorkspaceAction = "dashboard" | "transaksi" | "kas" | "antrian" | "stock" | "yumi" | "settings" | "sync" | "readiness" | "report" | "booking" | "attendance" | "profile" | "admin" | "logout";

const actions = [
	{ id: "dashboard", label: "Ringkasan hari ini", detail: "Omzet dan aktivitas kasir", icon: BarChart3, group: "Operasional" },
	{ id: "stock", label: "Stok & ketersediaan", detail: "Atur menu yang bisa dipesan", icon: Package, group: "Operasional" },
	{ id: "antrian", label: "Antrean produksi", detail: "Pantau pesanan bar dan dapur", icon: ClipboardList, group: "Operasional" },
	{ id: "booking", label: "Booking", detail: "Reservasi dan pesanan terjadwal", icon: CalendarDays, group: "Operasional" },
	{ id: "readiness", label: "Kesiapan kasir", detail: "Shift, printer dan koneksi", icon: ShieldCheck, group: "Perangkat & laporan" },
	{ id: "sync", label: "Pusat sinkronisasi", detail: "Pesanan offline dan coba kirim ulang", icon: RefreshCw, group: "Perangkat & laporan" },
	{ id: "report", label: "Laporan", detail: "Ringkasan penjualan dan shift", icon: BarChart3, group: "Perangkat & laporan" },
	{ id: "settings", label: "Pengaturan kasir", detail: "Preferensi terminal dan printer", icon: Settings2, group: "Perangkat & laporan" },
	{ id: "yumi", label: "Asisten Djiwa", detail: "Bantuan operasional", icon: Bot, group: "Akun" },
	{ id: "attendance", label: "Absensi", detail: "Masuk dan pulang tim", icon: CheckCircle2, group: "Akun" },
	{ id: "profile", label: "Profil saya", detail: "Akun dan informasi karyawan", icon: User, group: "Akun" },
	{ id: "admin", label: "Panel admin", detail: "Manajemen sesuai hak akses", icon: LayoutGrid, group: "Akun" },
] as const;

export function PosWorkspaceMenu({ open, onOpenChange, onAction, userName, canAdmin, canReport, hasProfile, pendingCount }: {
	open: boolean; onOpenChange: (open: boolean) => void; onAction: (action: WorkspaceAction) => void;
	userName: string; canAdmin: boolean; canReport: boolean; hasProfile: boolean; pendingCount: number;
}) {
	const [query, setQuery] = useState("");
	const filtered = actions.filter(action => (action.id !== "admin" || canAdmin) && (action.id !== "report" || canReport) && (action.id !== "profile" || hasProfile) && `${action.label} ${action.detail}`.toLowerCase().includes(query.trim().toLowerCase()));
	return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="bottom" className="mx-auto flex max-h-[92dvh] w-full max-w-xl gap-0 overflow-hidden rounded-t-3xl p-0" showCloseButton>
		<div className="border-b px-5 pb-4 pt-5"><SheetTitle className="text-xl">Lainnya</SheetTitle><SheetDescription className="mt-1 text-sm">{userName || "Kasir"} · Semua kebutuhan operasional</SheetDescription>
		<label className="mt-4 flex min-h-12 items-center gap-3 rounded-2xl border bg-muted/30 px-3 focus-within:ring-2 focus-within:ring-primary/20"><Search className="h-5 w-5 shrink-0 text-muted-foreground"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari stok, printer, laporan…" aria-label="Cari fitur kasir" className="min-w-0 flex-1 border-0 bg-transparent py-3 text-base outline-none focus:ring-0"/></label></div>
		<div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
			{["Operasional", "Perangkat & laporan", "Akun"].map(group => {const entries = filtered.filter(action => action.group === group); return entries.length ? <section key={group} className="mt-4"><h3 className="px-2 pb-1 text-xs font-semibold text-muted-foreground">{group}</h3>{entries.map(action => <button key={action.id} type="button" onClick={() => onAction(action.id)} className="flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-muted active:bg-muted"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/7 text-primary"><action.icon className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{action.label}</span><span className="block text-xs leading-5 text-muted-foreground">{action.detail}</span></span>{action.id === "sync" && pendingCount > 0 ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">{pendingCount}</span> : null}<ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground"/></button>)}</section> : null;})}
			{!filtered.length ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">Tidak ada fitur yang cocok. Coba kata lain.</p> : null}
			<button type="button" onClick={() => onAction("logout")} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold text-destructive"><LogOut className="h-4 w-4"/>Keluar akun</button>
		</div>
	</SheetContent></Sheet>;
}

export function PosReadinessSheet({ open, onOpenChange, shiftOpen, shiftKnown, cashierName, online, pendingCount, unpaidCount, onAction }: {
	open:boolean; onOpenChange:(open:boolean)=>void; shiftOpen:boolean; shiftKnown:boolean; cashierName:string; online:boolean; pendingCount:number; unpaidCount:number; onAction:(action:WorkspaceAction)=>void;
}) {
	const [printerConnected, setPrinterConnected] = useState(() => bluetoothPrinter.isConnected());
	const [connecting, setConnecting] = useState(false);
	useEffect(() => {
		if (!open) return;
		setPrinterConnected(bluetoothPrinter.isConnected());
		const timer = window.setInterval(() => setPrinterConnected(bluetoothPrinter.isConnected()), 2000);
		return () => window.clearInterval(timer);
	}, [open]);
	async function connect() {setConnecting(true); try {await bluetoothPrinter.connect(); setPrinterConnected(bluetoothPrinter.isConnected()); toast.success("Printer terhubung");} catch(error) {toast.error(error instanceof Error ? error.message : "Printer belum terhubung");} finally {setConnecting(false);}}
	const rows = [
		{label:"Shift kasir",detail:shiftKnown ? shiftOpen ? `Aktif · ${cashierName || "Kasir"}` : "Belum dibuka" : "Memuat status shift…",ok:shiftOpen,icon:Wallet,action:"kas" as const,button:shiftOpen?"Lihat shift":"Buka shift"},
		{label:"Koneksi perangkat",detail:online?"Perangkat online":"Perangkat offline · pesanan tunai bisa disimpan lokal",ok:online,icon:online?Wifi:WifiOff,action:"sync" as const,button:"Cek sinkronisasi"},
		{label:"Pesanan belum tersinkron",detail:pendingCount ? `${pendingCount} pesanan perlu dikirim` : "Semua pesanan lokal sudah terkirim",ok:pendingCount===0,icon:RefreshCw,action:"sync" as const,button:"Lihat antrean"},
		{label:"Tagihan terbuka",detail:unpaidCount ? `${unpaidCount} pesanan belum lunas pada shift ini` : "Tidak ada tagihan terbuka pada shift ini",ok:unpaidCount===0,icon:Bell,action:"transaksi" as const,button:"Lihat pesanan"},
	];
	return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="bottom" className="mx-auto max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"><SheetTitle className="text-xl">Kesiapan kasir</SheetTitle><SheetDescription>Periksa kebutuhan operasional sebelum mulai melayani.</SheetDescription><div className="mt-2 space-y-3">{rows.map(row => <div key={row.label} className="rounded-2xl border bg-card p-4"><div className="flex items-start gap-3"><row.icon className={`mt-0.5 h-5 w-5 shrink-0 ${row.ok?"text-emerald-600":"text-amber-600"}`}/><div><p className="text-sm font-semibold">{row.label}</p><p className="mt-1 text-sm text-muted-foreground">{row.detail}</p></div></div><button type="button" onClick={()=>onAction(row.action)} className="mt-2 flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">{row.button}<ChevronRight className="h-4 w-4"/></button></div>)}<div className="rounded-2xl border p-4"><div className="flex items-center gap-3"><Printer className="h-5 w-5 text-primary"/><p className="text-sm font-semibold">Printer struk</p></div><p className="mt-2 text-sm text-muted-foreground">{printerConnected?"Terhubung dan siap mencetak":"Hubungkan printer, atau simpan transaksi dan cetak nanti."}</p><button type="button" disabled={connecting} onClick={()=>void connect()} className="mt-3 min-h-11 rounded-xl border px-4 text-sm font-semibold">{connecting?"Menghubungkan…":printerConnected?"Periksa koneksi":"Hubungkan printer"}</button></div></div></SheetContent></Sheet>;
}

export type { WorkspaceAction };
