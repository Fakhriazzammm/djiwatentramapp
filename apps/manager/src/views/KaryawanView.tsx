import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { lazy, Suspense, useEffect, useState, type LazyExoticComponent, type ReactElement } from "react";
import { BarChart3, CalendarDays, ChevronUp, FileBarChart, FileSignature, LayoutDashboard, Users, Wallet, CalendarCheck2 } from "lucide-react";
import { KaryawanNavContext, SUBPAGES, type SubPage } from "./karyawan/nav";

const Ringkasan = lazy(() => import("./karyawan/RingkasanPage"));
const Data = lazy(() => import("./karyawan/DataKaryawanPage"));
const Kehadiran = lazy(() => import("./karyawan/KehadiranPage"));
const Jadwal = lazy(() => import("./karyawan/JadwalPage"));
const Payroll = lazy(() => import("./karyawan/PayrollPage"));
const Dokumen = lazy(() => import("./karyawan/DokumenPage"));
const Cuti = lazy(() => import("./karyawan/CutiPage"));
const Laporan = lazy(() => import("./karyawan/LaporanPage"));

const ITEMS: { id: SubPage; label: string; Icon: typeof Users }[] = [
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

function readSub(): SubPage {
  const part = window.location.hash.slice(1).split("/")[1];
  return (SUBPAGES as readonly string[]).includes(part) ? (part as SubPage) : "ringkasan";
}

/** Karyawan App di Manager: submenu seperti Admin + 8 halaman. */
export function KaryawanView() {
  const [sub, setSub] = useState<SubPage>(readSub);
  const reduce = useReducedMotion();
  const go = (next: SubPage) => {
    setSub(next);
    try { window.history.replaceState(null, "", `#sdm/${next}`); } catch { /* ignore */ }
  };
  useEffect(() => { try { window.history.replaceState(null, "", `#sdm/${sub}`); } catch { /* ignore */ } }, [sub]);
  const View = VIEW[sub];

  return (
    <KaryawanNavContext.Provider value={go}>
      <div className="kk-root flex min-h-full flex-col bg-white lg:flex-row">
        <aside aria-label="Menu Karyawan" className="shrink-0 border-b border-[#e4e4e8] bg-white lg:w-[236px] lg:border-b-0 lg:border-r">
          <div className="hidden px-4 pb-2 pt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-[#a1a1aa] lg:block">Karyawan</div>
          <div className="hidden items-center gap-3 bg-[#e5f0f9] px-3 py-2.5 font-mono text-[11.5px] uppercase tracking-[0.1em] lg:flex">
            <Users className="h-[18px] w-[18px]" aria-hidden="true" />Karyawan App<ChevronUp className="ml-auto h-4 w-4" aria-hidden="true" />
          </div>
          <nav className="flex gap-1 overflow-x-auto p-2 lg:ml-5 lg:block lg:overflow-visible lg:border-l lg:border-[#e4e4e8] lg:p-0">
            {ITEMS.map(({ id, label, Icon }) => {
              const active = id === sub;
              return (
                <motion.button
                  key={id}
                  type="button"
                  onClick={() => go(id)}
                  aria-current={active ? "page" : undefined}
                  whileTap={reduce ? undefined : { scale: 0.97 }}
                  className={`relative flex w-auto shrink-0 items-center gap-3 whitespace-nowrap px-3.5 py-3 text-left font-mono text-[12px] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#111114] lg:w-full ${active ? "text-white" : "text-[#18181b] hover:bg-[#f4f4f6]"}`}
                >
                  {active ? <motion.span layoutId="kk-sub-active" className="absolute inset-0 bg-[#18181b]" transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }} /> : null}
                  <Icon className="relative h-[18px] w-[18px]" aria-hidden="true" />
                  <span className="relative">{label}</span>
                </motion.button>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0 flex-1 bg-[#f4f4f6]">
          <Suspense fallback={<div className="p-6 font-mono text-[11px] uppercase tracking-[0.08em] text-[#666672]">Memuat…</div>}>
            <AnimatePresence mode="wait">
              <motion.div key={sub} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
                <View />
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </div>
      </div>
    </KaryawanNavContext.Provider>
  );
}
