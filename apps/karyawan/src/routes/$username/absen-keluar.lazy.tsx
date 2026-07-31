import { createLazyFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useStaffProfile } from "../$username.lazy";
import { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from "react";
import { createClient } from "@yumipos/web-shared/lib/client";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList, Check, ChevronDown, ChevronUp, Camera, Upload,
  Loader2, Sparkles, AlertTriangle, ArrowLeft, X, Image, Brush,
  Save, Search, Lightbulb, Coffee, ChefHat, CookingPot, Armchair, Toilet
} from "lucide-react";
import {
  submitClosingViaEdge,
  prepareKebersihanPhoto,
  type OpnameItem,
  type ClosingEdgeResponse,
} from "../../hooks/use-closing-submit";

// ─── Types ───

type KebersihanArea = {
  id: string;
  label: string;
  icon: "cooking" | "seating" | "toilet";
  status: "bersih" | "perlu_perbaikan";
  /** Object URL — hanya untuk preview di layar. */
  foto: string | null;
  /** File aslinya; ini yang dikirim saat submit. */
  fotoFile?: File | null;
  catatan: string;
};

// ─── Search Schema ───

const searchSchema = z.object({
  shift: z.string().optional(),
  ts: z.string().optional(),
});

// ─── Constants ───

const BAR_INGREDIENTS = new Set([
  "Air Galon", "Apple Juice", "Arabica Beans", "Beans Robusta",
  "C1000 Apple", "Es Batu", "Fresh Milk Greenfield", "Gula Aren",
  "Le Mineral", "Lemon Tea Max Tea", "Matcha Powder", "Peach Tea Max Tea",
  "Richgold Label", "Robusta Beans", "SKM Carnation 488gr", "Sirup Green Apple",
  "Sirup Peach", "Soda Water Schweppes", "Sprite", "Sunquick Lemon",
  "Susu Coconut", "Susu Kental Manis", "White Cream",
]);

const KITCHEN_INGREDIENTS = new Set([
  "Barbeque Sauce", "Baso Sapi", "Bawang Daun", "Bawang Goreng",
  "Beras", "Biji Wijen", "Bubur Base", "Butter", "Coklat Powder", "Daging Ayam",
  "Fla", "Garam", "Gula Pasir Putih", "Kecap Asin", "Kecap Ikan", "Kecap Manis",
  "Kemangi Instant", "Kentang", "Kerupuk", "Kulit Pangsit (Cap Jempol)",
  "Mayonaise", "Merica", "Micin", "Minyak Bawang Putih", "Mix Vegetable",
  "Nasi Ayam Chasiu Sauce", "Nasi Ayam Mentega Sauce",
  "Nasi Ayam Rempah Kemangi  Sauce", "Nasi Goreng Sauce",
  "Nasi Telor Omega Pontianak Sauce", "Patty Hamburg", "Pisang",
  "Roti (Bread Co)", "Saus Sambel (Del Monte)", "Saus Tiram (Mahsuri)",
  "Saus Tomat (Del Monte)", "Selada (Ibu Teti Pasar)", "Sosis (Salam)",
  "Telor Ayam (Yogya)", "Telor Omega (Happy Egg)", "Telur Ayam",
  "Tepung Terigu", "Timun", "Tongcai", "Ubi Cilembu", "Yamin Base",
]);

const AREAS_KEBERSIHAN: KebersihanArea[] = [
  { id: "bar_kitchen", label: "Bar & Kitchen", icon: "cooking", status: "bersih", foto: null, catatan: "" },
  { id: "area_customer", label: "Area Customer", icon: "seating", status: "bersih", foto: null, catatan: "" },
  { id: "wc", label: "Toilet/WC", icon: "toilet", status: "bersih", foto: null, catatan: "" },
];

const KEBERSIHAN_ICONS = { cooking: CookingPot, seating: Armchair, toilet: Toilet };

// ─── Route ───

export const Route = createLazyFileRoute("/$username/absen-keluar")({
  component: ClosingPage,
  validateSearch: searchSchema,
});

// ═══════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════

function ClosingPage() {
  const { staff, username } = useStaffProfile();
  const search = useSearch({ from: Route.id as any });
  const navigate = useNavigate();

  // Determine shift name: from URL param, or from latest check-in, or fallback
  const [shiftName, setShiftName] = useState<string>((search as any)?.shift || "");
  useEffect(() => {
    if (shiftName) return; // already have it from URL
    const fetchShift = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("pos_attendance_logs")
          .select("shiftName")
          .eq("type", "check_in")
          .eq("userId", staff?._id || username)
          .order("timestamp", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.shiftName) setShiftName(data.shiftName);
        else setShiftName("Shift");
      } catch {
        setShiftName("Shift");
      }
    };
    fetchShift();
  }, [staff, username, shiftName]);
  const [activeTab, setActiveTab] = useState<"opname" | "kebersihan">("opname");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Detect role for stock opname
  const role = useMemo<"bar" | "kitchen" | null>(() => {
    const r = (staff?.roleName || "").toLowerCase();
    if (r.includes("bar")) return "bar";
    if (r.includes("kitchen") || r.includes("chef") || r.includes("cook") || r.includes("dapur")) return "kitchen";
    return null;
  }, [staff]);

  const needsOpname = role !== null;

  // Refs to child sections for data extraction
  const opnameRef = useRef<{ getItems: () => OpnameItem[] }>(null);
  const kebersihanRef = useRef<{ getAreas: () => KebersihanArea[] }>(null);

  const userId = staff?._id || username;
  const userName = staff?.name || username;
  const roleName = staff?.roleName || "";

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="shrink-0 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => navigate({ to: `/${username}/beranda` })}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="font-black text-sm tracking-tight">Closing Shift</h1>
            <p className="text-[10px] text-muted-foreground font-semibold">
              {userName} • {shiftName}
            </p>
          </div>
        </div>

        {/* Status Banner */}
        {submitDone && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center mb-4"
          >
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 mb-2">
              <Check className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="font-bold text-emerald-800 text-sm">Laporan Closing Terkirim!</p>
            <p className="text-xs text-emerald-600 mt-1">
              Stock opname & kebersihan tersimpan. Absen keluar berhasil.
            </p>
            <button
              onClick={() => navigate({ to: `/${username}/beranda` })}
              className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-[14px] bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" /> Kembali ke Beranda
            </button>
          </motion.div>
        )}

        {/* Error Banner */}
        {submitError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-rose-50 border border-rose-200 p-4 mb-4"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
              <div>
                <p className="font-bold text-rose-800 text-xs">Gagal menyimpan</p>
                <p className="text-xs text-rose-600 mt-0.5">{submitError}</p>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {!submitDone && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 rounded-xl bg-muted/50 p-1 mb-4 shrink-0">
            {needsOpname && (
              <button
                onClick={() => setActiveTab("opname")}
                className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[14px] py-2 text-xs font-bold transition-all ${
                  activeTab === "opname"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ClipboardList className="h-4 w-4" /> Stock Opname
              </button>
            )}
            <button
              onClick={() => setActiveTab("kebersihan")}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[14px] py-2 text-xs font-bold transition-all ${
                activeTab === "kebersihan"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Brush className="h-4 w-4" /> Kebersihan
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              {activeTab === "opname" && needsOpname && (
                <motion.div
                  key="opname"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                >
                  <StockOpnameSection ref={opnameRef} role={role!} />
                </motion.div>
              )}
              {activeTab === "kebersihan" && (
                <motion.div
                  key="kebersihan"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                >
                  <KebersihanSection ref={kebersihanRef} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Submit Button */}
          <div className="shrink-0 pt-4 pb-2 border-t border-border mt-4">
            <button
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="w-full rounded-[14px] bg-gradient-to-r from-emerald-500 to-emerald-600 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-200/50 transition-all hover:shadow-xl hover:shadow-emerald-200/60 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyimpan...
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Kirim Laporan Closing
                </span>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );

  // ── Handle Submit ──────────────────────────────────────────

  async function handleSubmit() {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      // 1. Get opname items
      const opnameItems = opnameRef.current?.getItems() ?? [];
      const markedChanged = opnameItems.filter(
        (i) => Math.abs(i.qtyAfter - i.qtyBefore) > 0.01
      );

      // 2. Kebersihan: kecilkan foto lalu ikutkan ke payload. Sebelumnya
      //    data ini hanya hidup di state dan hilang begitu submit.
      const areasKebersihan = kebersihanRef.current?.getAreas() ?? [];
      const kebersihan = await Promise.all(
        areasKebersihan.map(async (a) => ({
          id: a.id,
          label: a.label,
          status: a.status,
          catatan: a.catatan,
          ...(a.fotoFile ? await prepareKebersihanPhoto(a.fotoFile) : {}),
        })),
      );

      // 3. Submit ALL via Edge Function (atomic — handles lock, opname, last-person check, inventory update, check-out)
      const result = await submitClosingViaEdge({
        userId,
        userName,
        roleName,
        shiftName,
        role,
        items: markedChanged.length > 0 ? markedChanged : opnameItems,
        source: "karyawan_web",
        kebersihan,
      });

      setSubmitDone(true);
    } catch (err: any) {
      const msg = err?.message || err?.toString() || "Terjadi kesalahan";
      setSubmitError(msg);
      console.error("[closing] handleSubmit error:", err);
    } finally {
      setIsSubmitting(false);
    }
  }
}

// ═══════════════════════════════════════════
//  STOCK OPNAME SECTION
// ═══════════════════════════════════════════

const StockOpnameSection = forwardRef<{ getItems: () => OpnameItem[] }, { role: "bar" | "kitchen" }>(
  function StockOpnameSection({ role }, ref) {
    const [items, setItems] = useState<OpnameItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [allSame, setAllSame] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const targetNames = role === "bar" ? BAR_INGREDIENTS : KITCHEN_INGREDIENTS;
    const RoleIcon = role === "bar" ? Coffee : ChefHat;
    const roleLabel = role === "bar" ? "BAR" : "KITCHEN";

    useEffect(() => {
      const load = async () => {
        try {
          setLoading(true);
          const supabase = createClient();
          const { data: inventory, error: invErr } = await supabase
            .schema("pos")
            .from("inventory")
            .select("source_id, ingredient_name, quantity, unit")
            .limit(500);

          if (invErr) throw invErr;

          const mapped: OpnameItem[] = (inventory || [])
            .filter((i: any) => targetNames.has((i.ingredient_name || "").trim()))
            .map((i: any) => ({
              inventoryId: i.source_id,
              name: (i.ingredient_name || "").trim(),
              unit: (i.unit || "").trim(),
              qtyBefore: parseFloat(i.quantity || "0"),
              qtyAfter: parseFloat(i.quantity || "0"),
            }))
            .sort((a: OpnameItem, b: OpnameItem) => a.name.localeCompare(b.name));

          setItems(mapped);
        } catch (err: any) {
          setError(err?.message || "Gagal memuat data stok");
        } finally {
          setLoading(false);
        }
      };
      load();
    }, [role]);

    // Expose getItems to parent via ref
    useImperativeHandle(ref, () => ({
      getItems: () => items.map((i) => ({
        ...i,
        isChanged: Math.abs(i.qtyAfter - i.qtyBefore) > 0.01,
      })),
    }));

    const updateQty = (index: number, qty: number) => {
      setItems((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], qtyAfter: Math.max(0, qty) };
        return next;
      });
      setAllSame(false);
    };

    const markAllSame = () => {
      setItems((prev) =>
        prev.map((item) => ({ ...item, qtyAfter: item.qtyBefore }))
      );
      setAllSame(true);
    };

    const changedItems = items.filter(
      (i) => Math.abs(i.qtyAfter - i.qtyBefore) > 0.01
    );

    const filtered = searchQuery
      ? items.filter((i) =>
          i.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : items;

    const lowStock = items.filter((i) => i.qtyAfter > 0 && i.qtyAfter <= 3);

    if (loading) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Memuat data stok...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-center">
          <AlertTriangle className="h-8 w-8 text-rose-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-rose-700">Gagal memuat data</p>
          <p className="text-xs text-rose-500 mt-1">{error}</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {/* Header */}
        <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-200 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-black text-sm"><RoleIcon className="h-4 w-4" /> {roleLabel} Stock Opname</p>
              <p className="text-[10px] text-muted-foreground font-medium">
                {items.length} bahan — {changedItems.length} berubah
              </p>
            </div>
            {allSame && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                <Check className="h-3 w-3" /> Sama semua
              </span>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <button
            onClick={markAllSame}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[14px] border border-border bg-background px-3 py-2.5 text-xs font-bold hover:bg-muted transition-colors"
          >
            <Check className="h-4 w-4" /> Semua Sama
          </button>
          <button
            onClick={() => setSaved(true)}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-emerald-500 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-600 transition-colors"
          >
            <Save className="h-4 w-4" /> Simpan Opname
          </button>
        </div>

        {/* Notification: data will be used on final submit */}
        {saved && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-center"
          >
            <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-blue-700">
              <Check className="h-4 w-4 shrink-0" /> Opname tersimpan sementara. Tekan "Kirim Laporan Closing" untuk absen keluar.
            </p>
          </motion.div>
        )}

        {/* Info banner */}
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5">
          <p className="flex items-start gap-1.5 text-[10px] font-medium text-amber-700 leading-relaxed">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Opname ini akan disimpan per orang. Hanya <strong>orang terakhir</strong> yang
            absen keluar yang perubahannya diterapkan ke stok ({roleLabel}).</span>
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari bahan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-h-11 w-full rounded-[14px] border border-border bg-background py-2.5 pl-10 pr-12 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              aria-label="Hapus pencarian"
              className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[14px] text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Stock List */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "Bahan tidak ditemukan" : "Tidak ada data stok"}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((item, idx) => {
              const globalIdx = items.findIndex((i) => i.inventoryId === item.inventoryId);
              const diff = item.qtyAfter - item.qtyBefore;
              const isChanged = Math.abs(diff) > 0.01;

              return (
                <div
                  key={item.inventoryId}
                  className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 transition-all ${
                    isChanged
                      ? "border-amber-200 bg-amber-50/50"
                      : "border-border bg-background"
                  }`}
                >
                  <span className="w-6 text-[10px] font-bold text-muted-foreground text-right shrink-0">
                    {globalIdx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Stok: {item.qtyBefore} {item.unit}
                      {isChanged && (
                        <span className={`ml-1 font-bold ${diff < 0 ? "text-rose-500" : "text-emerald-500"}`}>
                          → {item.qtyAfter} ({diff > 0 ? "+" : ""}{diff})
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => updateQty(globalIdx, item.qtyAfter - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-xs font-bold hover:bg-muted transition-colors"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={item.qtyAfter}
                      onChange={(e) => updateQty(globalIdx, parseFloat(e.target.value) || 0)}
                      className="h-7 w-14 rounded-lg border border-border bg-background text-center text-xs font-bold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min={0}
                      step={1}
                    />
                    <button
                      onClick={() => updateQty(globalIdx, item.qtyAfter + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-xs font-bold hover:bg-muted transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Low Stock Alert */}
        {lowStock.length > 0 && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">
                Stok Menipis
              </p>
            </div>
            {lowStock.slice(0, 5).map((item) => (
              <p key={item.name} className="text-xs text-amber-700 ml-6">
                • {item.name} — sisa {item.qtyAfter}
              </p>
            ))}
            {lowStock.length > 5 && (
              <p className="text-xs text-amber-500 ml-6">+{lowStock.length - 5} lainnya</p>
            )}
          </div>
        )}
      </div>
    );
  }
);

// ═══════════════════════════════════════════
//  KEBERSIHAN SECTION
// ═══════════════════════════════════════════

const KebersihanSection = forwardRef<{ getAreas: () => KebersihanArea[] }>(function KebersihanSection(_props, ref) {
  const [areas, setAreas] = useState<KebersihanArea[]>(AREAS_KEBERSIHAN);
  const [saved, setSaved] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Expose getAreas to parent via ref
  useImperativeHandle(ref, () => ({
    getAreas: () => areas,
  }));

  const updateStatus = (id: string, status: "bersih" | "perlu_perbaikan") => {
    setAreas((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
  };

  const updateCatatan = (id: string, catatan: string) => {
    setAreas((prev) =>
      prev.map((a) => (a.id === id ? { ...a, catatan } : a))
    );
  };

  const handleFileSelect = (id: string, file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAreas((prev) =>
      prev.map((a) => (a.id === id ? { ...a, foto: url, fotoFile: file } : a))
    );
  };

  const triggerFileInput = (id: string) => {
    fileInputRefs.current[id]?.click();
  };

  const removeFoto = (id: string) => {
    setAreas((prev) =>
      prev.map((a) => (a.id === id ? { ...a, foto: null, fotoFile: null } : a))
    );
  };

  const completedCount = areas.filter((a) => a.status === "bersih").length;
  const photoCount = areas.filter((a) => a.foto !== null).length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="flex items-center gap-1.5 font-black text-sm"><Brush className="h-4 w-4" /> Checklist Kebersihan</p>
            <p className="text-[10px] text-muted-foreground font-medium">
              {completedCount}/3 area bersih — {photoCount} foto
            </p>
          </div>
        </div>
      </div>

      {/* Area Cards */}
      {areas.map((area) => {
        const AreaIcon = KEBERSIHAN_ICONS[area.icon];
        return (
        <div
          key={area.id}
          className={`rounded-2xl border p-4 transition-all ${
            area.status === "perlu_perbaikan"
              ? "border-amber-200 bg-amber-50/30"
              : area.foto
              ? "border-emerald-200 bg-emerald-50/30"
              : "border-border bg-background"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AreaIcon className="h-5 w-5 text-muted-foreground" />
              <p className="font-bold text-sm">{area.label}</p>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => updateStatus(area.id, "bersih")}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-[14px] px-3 py-1.5 text-[10px] font-bold transition-all ${
                  area.status === "bersih"
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700"
                }`}
              >
                <Check className="h-3.5 w-3.5" /> Bersih
              </button>
              <button
                onClick={() => updateStatus(area.id, "perlu_perbaikan")}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-[14px] px-3 py-1.5 text-[10px] font-bold transition-all ${
                  area.status === "perlu_perbaikan"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-amber-100 hover:text-amber-700"
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Perlu Perbaikan
              </button>
            </div>
          </div>

          {/* Photo Upload */}
          <div className="flex items-center gap-3">
            {area.foto ? (
              <div className="relative">
                <img
                  src={area.foto}
                  alt={area.label}
                  className="h-16 w-16 rounded-xl object-cover border border-border"
                />
                <button
                  onClick={() => removeFoto(area.id)}
                  className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => triggerFileInput(area.id)}
                className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary transition-all"
              >
                <Camera className="h-6 w-6" />
              </button>
            )}
            <input
              ref={(el) => { fileInputRefs.current[area.id] = el; }}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileSelect(area.id, e.target.files?.[0] || null)}
            />

            {/* Catatan */}
            <div className="flex-1">
              <input
                type="text"
                placeholder="Catatan (opsional)"
                value={area.catatan}
                onChange={(e) => updateCatatan(area.id, e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none transition-all focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50"
              />
              {area.status === "perlu_perbaikan" && !area.catatan && (
                <p className="flex items-center gap-1 text-[10px] text-amber-500 mt-1">
                  <Lightbulb className="h-3 w-3" /> Tambahkan catatan untuk tim maintenance
                </p>
              )}
            </div>
          </div>
        </div>
        );
      })}

      {/* Save Button */}
      <button
        onClick={() => setSaved(true)}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-emerald-500 py-3 text-sm font-bold text-white hover:bg-emerald-600 transition-all active:scale-[0.98]"
      >
        <Save className="h-4 w-4" /> Simpan Checklist Kebersihan
      </button>

      {saved && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center"
        >
          <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-700">
            <Check className="h-4 w-4 shrink-0" /> Checklist kebersihan tersimpan! Tekan "Kirim Laporan Closing" untuk absen keluar.
          </p>
        </motion.div>
      )}
    </div>
  );
});
