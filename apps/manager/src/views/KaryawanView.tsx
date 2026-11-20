import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { lazy, Suspense, type LazyExoticComponent, type ReactElement } from "react";
import { BarChart3, CalendarDays, FileBarChart, FileSignature, LayoutDashboard, Users, Wallet, CalendarCheck2 } from "lucide-react";
import { KaryawanNavContext, SUBPAGES, type SubPage } from "./karyawan/nav";

const Ringkasan = lazy(() => import("./karyawan/RingkasanPage"));
const Data = lazy(() => import("./karyawan/DataKaryawanPage"));
const Kehadiran = lazy(() => import("./karyawan/KehadiranPage"));
const Jadwal = lazy(() => import("./karyawan/JadwalPage"));
const Payroll = lazy(() => import("./karyawan/PayrollPage"));
const Dokumen = lazy(() => import("./karyawan/DokumenPage"));
const Cuti = lazy(() => import("./karyawan/CutiPage"));
const Laporan = lazy(() => import("./karyawan/LaporanPage"));

export const KARYAWAN_ITEMS: { id: SubPage; label: string; Icon: typeof Users }[] = [
  { id: "ringkasan", label: "Ringkasan Karyawan", Icon: LayoutDashboard },
  { id: "data", label: "Data Karyawan", Icon: Users },
  { id: "kehadiran", label: "Kehadiran", Icon: FileBarChart },
  { id: "jadwal", label: "Jadwal", Icon: CalendarDays },
  { id: "payroll", label: "Payroll", Icon: Wallet },
  { id: "dokumen", label: "Dokumen & Kontrak", Icon: FileSignature },
  { id: "cuti", label: "Cuti & Izin", Icon: CalendarCheck2 },
  { id: "laporan", label: "Laporan", Icon: BarChart3 },
];
const VIEW: Record<SubPage, LazyExoticComponent<() => ReactElement>> = { ringkasan: Ringkasan, data: Data, kehadiran: Kehadiran, jadwal: Jadwal, payroll: Payroll, dokumen: Dokumen, cuti: Cuti, laporan: Laporan };

export function readSub(): SubPage {
  const part = window.location.hash.slice(1).split("/")[1];
  return (SUBPAGES as readonly string[]).includes(part) ? (part as SubPage) : "ringkasan";
}

/** Isi Karyawan App. Menu ada di sidebar utama (satu sidebar); di layar kecil muncul sebagai tab. */
export function KaryawanView({ sub, onSub }: { sub: SubPage; onSub: (next: SubPage) => void }) {
  const reduce = useReducedMotion();
  const View = VIEW[sub];
  return (
    <KaryawanNavContext.Provider value={onSub}>
      <div className="kk-root min-h-full bg-[#f4f4f6]">
        <nav aria-label="Menu Karyawan" className="flex gap-1 overflow-x-auto border-b border-[#e4e4e8] bg-white p-2 min-[821px]:hidden">
          {KARYAWAN_ITEMS.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => onSub(id)} aria-current={id === sub ? "page" : undefined} className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2 font-mono text-[11px] ${id === sub ? "bg-[#18181b] text-white" : "text-[#18181b]"}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />{label}
            </button>
          ))}
        </nav>
        <Suspense fallback={<div className="p-6 font-mono text-[11px] uppercase tracking-[0.08em] text-[#666672]">Memuat…</div>}>
          <AnimatePresence mode="wait">
            <motion.div key={sub} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
              <View />
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </div>
    </KaryawanNavContext.Provider>
  );
}
