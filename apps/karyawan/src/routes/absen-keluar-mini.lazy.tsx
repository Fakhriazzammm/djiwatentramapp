import { createLazyFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from "react";
import { createClient } from "@yumipos/web-shared/lib/client";
import { z } from "zod";
import { motion } from "framer-motion";
import {
  ClipboardList, Check, Camera, Upload,
  Loader2, Sparkles, AlertTriangle, X
} from "lucide-react";
import {
  submitOpnamePerPerson,
  checkIsLastPerson,
  applyFinalOpname,
  recordCheckOut,
  type OpnameItem,
} from "../hooks/use-closing-submit";

// ─── Telegram WebApp Type ─────────────────

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          user?: { id: number; first_name?: string; last_name?: string; username?: string };
          query_id?: string;
        };
        expand: () => void;
        ready: () => void;
        close: () => void;
        MainButton: {
          setText: (text: string) => void;
          show: () => void;
          hide: () => void;
          enable: () => void;
          disable: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
          isVisible: boolean;
          setParams: (params: Record<string, string>) => void;
        };
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        colorScheme: string;
        isExpanded: boolean;
        version: string;
      };
    };
  }
}

// ─── Types ─────────────────────────────────

type KebersihanArea = {
  id: string;
  label: string;
  emoji: string;
  status: "bersih" | "perlu_perbaikan";
  foto: string | null;
  catatan: string;
};

type StaffInfo = {
  sourceId: string;
  name: string;
  roleName: string;
  username?: string;
};

// ─── Constants ────────────────────────────

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
  { id: "bar_kitchen", label: "Bar & Kitchen", emoji: "🍳", status: "bersih", foto: null, catatan: "" },
  { id: "area_customer", label: "Area Customer", emoji: "🪑", status: "bersih", foto: null, catatan: "" },
  { id: "wc", label: "Toilet/WC", emoji: "🚻", status: "bersih", foto: null, catatan: "" },
];

// ─── Route ────────────────────────────────

export const Route = createLazyFileRoute("/absen-keluar-mini")({
  component: MiniClosingPage,
});

// ═══════════════════════════════════════════
//  M I N I   C L O S I N G   P A G E
// ═══════════════════════════════════════════

function MiniClosingPage() {
  const search = useSearch({ from: "/absen-keluar-mini" }) as any;
  const navigate = useNavigate();

  const [staff, setStaff] = useState<StaffInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingStaff, setLoadingStaff] = useState(true);

  // ── Telegram init ──
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.expand();
      tg.ready();
      tg.setHeaderColor("#1a1a2e");
      tg.setBackgroundColor("#ffffff");
    }
  }, []);

  // ── Auth via uid + t ──
  const uid = (search as any)?.uid || "";
  const t = parseInt((search as any)?.t || "0", 10);

  useEffect(() => {
    if (!uid) {
      setLoadError("❌ Tautan tidak valid (tidak ada user ID).");
      setLoadingStaff(false);
      return;
    }
    // Validate timestamp (max 5 minutes)
    const now = Date.now();
    if (t && now - t > 5 * 60 * 1000) {
      setLoadError("⏰ Tautan sudah kedaluwarsa. Silakan klik tombol dari bot lagi.");
      setLoadingStaff(false);
      return;
    }
    fetchStaff(uid);
  }, [uid, t]);

  async function fetchStaff(userId: string) {
    try {
      const supabase = createClient();
      const { data: user, error } = await supabase
        .from("yumi_users")
        .select("source_id, name, slug, raw")
        .eq("source_id", userId)
        .maybeSingle();

      if (error) throw error;
      if (!user) {
        setLoadError("❌ Karyawan tidak ditemukan.");
        setLoadingStaff(false);
        return;
      }

      // Get role name from raw or separate query
      let roleName = "";
      const raw = user.raw as any;
      if (raw?.roleName) {
        roleName = raw.roleName;
      } else {
        // Try role_source_id
        const { data: role } = await supabase
          .schema("public")
          .from("yumi_roles")
          .select("name")
          .eq("source_id", user.raw?.role_source_id || "")
          .maybeSingle();
        if (role) roleName = role.name;
      }

      setStaff({
        sourceId: user.source_id,
        name: user.name,
        roleName,
        username: user.slug || user.source_id.slice(0, 8),
      });
      setLoadingStaff(false);
    } catch (err: any) {
      setLoadError(err?.message || "Gagal memuat data.");
      setLoadingStaff(false);
    }
  }

  if (loadingStaff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Memuat data karyawan...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
        <AlertTriangle className="h-10 w-10 text-rose-400 mb-3" />
        <p className="font-bold text-sm text-center text-foreground">{loadError}</p>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Kembali ke Telegram dan klik tombol dari bot lagi.
        </p>
      </div>
    );
  }

  const role = (() => {
    const r = (staff?.roleName || "").toLowerCase();
    if (r.includes("bar")) return "bar" as const;
    if (r.includes("kitchen") || r.includes("chef") || r.includes("cook") || r.includes("dapur")) return "kitchen" as const;
    return null;
  })();

  return <ClosingForm staff={staff!} role={role} shiftName="Shift" />;
}

// ═══════════════════════════════════════════
//  C L O S I N G   F O R M
// ═══════════════════════════════════════════

function ClosingForm({ staff, role, shiftName }: { staff: StaffInfo; role: "bar" | "kitchen" | null; shiftName: string }) {
  const [activeTab, setActiveTab] = useState<"opname" | "kebersihan">("opname");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const opnameRef = useRef<{ getItems: () => OpnameItem[] }>(null);
  const kebersihanRef = useRef<{ getAreas: () => KebersihanArea[] }>(null);
  const needsOpname = role !== null;

  const userId = staff.sourceId;
  const userName = staff.name;
  const roleName = staff.roleName;

  // ── Telegram MainButton sync ──
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    if (submitDone) return;

    tg.MainButton.setText("✅ Kirim Laporan Closing");
    tg.MainButton.show();
    tg.MainButton.enable();
    tg.MainButton.onClick(handleSubmit);

    return () => {
      tg.MainButton.offClick(handleSubmit);
    };
  }, [submitDone, activeTab]);

  // ── Show/update MainButton ──
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg || submitDone) return;

    if (isSubmitting) {
      tg.MainButton.setText("⏳ Menyimpan...");
      tg.MainButton.disable();
    } else {
      tg.MainButton.setText("✅ Kirim Laporan Closing");
      tg.MainButton.enable();
    }
  }, [isSubmitting, submitDone]);

  // ── Handle submit ──
  async function handleSubmit() {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const opnameItems = opnameRef.current?.getItems() ?? [];
      const markedChanged = opnameItems.filter(
        (i) => Math.abs(i.qtyAfter - i.qtyBefore) > 0.01
      );

      // 1. Save opname per-person
      if (role && opnameItems.length > 0) {
        await submitOpnamePerPerson(markedChanged.length > 0 ? markedChanged : opnameItems, {
          userId,
          staffName: userName,
          role,
          shiftSourceId: "",
          shiftName,
          notes: `Opname by ${userName} (${role}) via Telegram Mini App — ${markedChanged.length} item berubah`,
        });
      }

      // 2. Check last person
      let isLastPerson = false;
      if (role) {
        try {
          const result = await checkIsLastPerson(userId, shiftName, roleName);
          isLastPerson = result.isLast;
        } catch {
          isLastPerson = true;
        }
      }

      // 3. Apply final opname if last
      if (role && isLastPerson && markedChanged.length > 0) {
        await applyFinalOpname(markedChanged, userName, userId);
      }

      // 4. Record check-out
      await recordCheckOut({
        userId,
        userName,
        roleName,
        shiftName,
        notes: `Absen keluar via Telegram Mini App (${role} — ${isLastPerson ? "final" : "per-person"})`,
      });

      setSubmitDone(true);

      // 5. Close Mini App after 1.5s delay
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.MainButton.setText("✅ Selesai! Tutup...");
        setTimeout(() => tg.close(), 1500);
      }
    } catch (err: any) {
      const msg = err?.message || err?.toString() || "Terjadi kesalahan";
      setSubmitError(msg);
      console.error("[mini] handleSubmit error:", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Mini header */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border sticky top-0 bg-background z-10">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm">
            <ClipboardList className="h-4 w-4" />
          </div>
          <div>
            <p className="font-black text-xs tracking-tight">Closing Shift</p>
            <p className="text-[9px] text-muted-foreground font-semibold">
              {userName} • {roleName} • {shiftName}
            </p>
          </div>
          {submitDone && (
            <span className="ml-auto rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700 flex items-center gap-1">
              <Check className="h-3 w-3" /> Selesai
            </span>
          )}
        </div>

        {/* Error banner */}
        {submitError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-rose-50 border border-rose-200 p-3 mt-3"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
              <p className="text-xs text-rose-700">{submitError}</p>
            </div>
          </motion.div>
        )}

        {/* Success banner */}
        {submitDone && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 mt-3 text-center"
          >
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 mb-1">
              <Check className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="font-bold text-sm text-emerald-800">Absen Keluar Berhasil! ✅</p>
            <p className="text-xs text-emerald-600 mt-0.5">Stock opname & kebersihan tersimpan.</p>
            <p className="text-[10px] text-emerald-500 mt-1">Menutup otomatis...</p>
          </motion.div>
        )}
      </div>

      {/* Tabs */}
      {!submitDone && (
        <div className="shrink-0 px-4 pt-3">
          <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
            {needsOpname && (
              <button
                onClick={() => setActiveTab("opname")}
                className={`flex-1 rounded-lg py-2 text-[11px] font-bold transition-all ${
                  activeTab === "opname"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                🧾 Stock Opname
              </button>
            )}
            <button
              onClick={() => setActiveTab("kebersihan")}
              className={`flex-1 rounded-lg py-2 text-[11px] font-bold transition-all ${
                activeTab === "kebersihan"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              🧹 Kebersihan
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {!submitDone && (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {activeTab === "opname" && needsOpname && (
            <StockOpnameSection ref={opnameRef} role={role!} mini />
          )}
          {activeTab === "kebersihan" && (
            <KebersihanSection ref={kebersihanRef} />
          )}
        </div>
      )}

      {/* Padding for Telegram safe area */}
      <div className="h-4 shrink-0" />
    </div>
  );
}

// ═══════════════════════════════════════════
//  STOCK OPNAME SECTION (reused)
// ═══════════════════════════════════════════

const StockOpnameSection = forwardRef<{ getItems: () => OpnameItem[] }, { role: "bar" | "kitchen"; mini?: boolean }>(
  function StockOpnameSection({ role, mini }, ref) {
    const [items, setItems] = useState<OpnameItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [allSame, setAllSame] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const targetNames = role === "bar" ? BAR_INGREDIENTS : KITCHEN_INGREDIENTS;
    const roleEmoji = role === "bar" ? "☕" : "🍳";
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
      ? items.filter((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()))
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
      <div className="space-y-2.5">
        {/* Header card */}
        <div className="rounded-xl bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-200 p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm">
              <ClipboardList className="h-4 w-4" />
            </div>
            <div>
              <p className="font-bold text-xs">{roleEmoji} {roleLabel} Stock Opname</p>
              <p className="text-[9px] text-muted-foreground">
                {items.length} bahan — {changedItems.length} berubah
              </p>
            </div>
            {allSame && (
              <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                ✅ Sama
              </span>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2">
          <button onClick={markAllSame} className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-bold hover:bg-muted">
            ✅ Semua Sama
          </button>
          <button onClick={() => setSaved(true)} className="flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-600">
            💾 Simpan
          </button>
        </div>

        {saved && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-center">
            <p className="text-[11px] font-semibold text-blue-700">✅ Opname tersimpan sementara.</p>
          </motion.div>
        )}

        {/* Info banner (compact for mini) */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2">
          <p className="text-[9px] font-medium text-amber-700 leading-relaxed">
            💡 Hanya <strong>orang terakhir</strong> yang absen keluar perubahannya diterapkan ke stok.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="🔍 Cari bahan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none transition-all focus:ring-2 focus:ring-primary/20"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Stock list */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <p className="text-xs text-muted-foreground">{searchQuery ? "Bahan tidak ditemukan" : "Tidak ada data stok"}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((item, idx) => {
              const globalIdx = items.findIndex((i) => i.inventoryId === item.inventoryId);
              const diff = item.qtyAfter - item.qtyBefore;
              const isChanged = Math.abs(diff) > 0.01;

              return (
                <div key={item.inventoryId} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 transition-all ${
                  isChanged ? "border-amber-200 bg-amber-50/50" : "border-border bg-background"
                }`}>
                  <span className="w-5 text-[9px] font-bold text-muted-foreground text-right shrink-0">{globalIdx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold truncate">{item.name}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {item.qtyBefore} {item.unit}
                      {isChanged && (
                        <span className={`ml-1 font-bold ${diff < 0 ? "text-rose-500" : "text-emerald-500"}`}>
                          → {item.qtyAfter} ({diff > 0 ? "+" : ""}{diff})
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => updateQty(globalIdx, item.qtyAfter - 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-xs font-bold hover:bg-muted">−</button>
                    <input type="number" value={item.qtyAfter}
                      onChange={(e) => updateQty(globalIdx, parseFloat(e.target.value) || 0)}
                      className="h-6 w-12 rounded-md border border-border bg-background text-center text-[11px] font-bold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min={0} step={1} />
                    <button onClick={() => updateQty(globalIdx, item.qtyAfter + 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-xs font-bold hover:bg-muted">+</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Low stock */}
        {lowStock.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5">
            <p className="text-[9px] font-bold text-amber-700 uppercase tracking-widest mb-1">Stok Menipis</p>
            {lowStock.slice(0, 3).map((item) => (
              <p key={item.name} className="text-[10px] text-amber-700">• {item.name} — {item.qtyAfter}</p>
            ))}
            {lowStock.length > 3 && <p className="text-[9px] text-amber-500">+{lowStock.length - 3} lainnya</p>}
          </div>
        )}
      </div>
    );
  }
);

// ═══════════════════════════════════════════
//  KEBERSIHAN SECTION (reused)
// ═══════════════════════════════════════════

const KebersihanSection = forwardRef<{ getAreas: () => KebersihanArea[] }>(function KebersihanSection(_props, ref) {
  const [areas, setAreas] = useState<KebersihanArea[]>(AREAS_KEBERSIHAN);
  const [saved, setSaved] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useImperativeHandle(ref, () => ({
    getAreas: () => areas,
  }));

  const updateStatus = (id: string, status: "bersih" | "perlu_perbaikan") => {
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  };

  const updateCatatan = (id: string, catatan: string) => {
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, catatan } : a)));
  };

  const handleFileSelect = (id: string, file: File | null) => {
    if (!file) return;
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, foto: URL.createObjectURL(file) } : a)));
  };

  const triggerFileInput = (id: string) => fileInputRefs.current[id]?.click();
  const removeFoto = (id: string) => setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, foto: null } : a)));

  const completedCount = areas.filter((a) => a.status === "bersih").length;
  const photoCount = areas.filter((a) => a.foto !== null).length;

  return (
    <div className="space-y-2.5">
      <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="font-bold text-xs">🧹 Checklist Kebersihan</p>
            <p className="text-[9px] text-muted-foreground">{completedCount}/3 area ✅ — {photoCount} foto</p>
          </div>
        </div>
      </div>

      {areas.map((area) => (
        <div key={area.id} className={`rounded-xl border p-3 transition-all ${
          area.status === "perlu_perbaikan" ? "border-amber-200 bg-amber-50/30" :
          area.foto ? "border-emerald-200 bg-emerald-50/30" : "border-border bg-background"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-base">{area.emoji}</span>
              <p className="font-bold text-xs">{area.label}</p>
            </div>
            <div className="flex gap-1">
              <button onClick={() => updateStatus(area.id, "bersih")}
                className={`rounded-md px-2 py-1 text-[9px] font-bold transition-all ${
                  area.status === "bersih" ? "bg-emerald-500 text-white shadow-sm" : "bg-muted text-muted-foreground"
                }`}>✅ Bersih</button>
              <button onClick={() => updateStatus(area.id, "perlu_perbaikan")}
                className={`rounded-md px-2 py-1 text-[9px] font-bold transition-all ${
                  area.status === "perlu_perbaikan" ? "bg-amber-500 text-white shadow-sm" : "bg-muted text-muted-foreground"
                }`}>⚠️ Perlu</button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {area.foto ? (
              <div className="relative">
                <img src={area.foto} alt={area.label} className="h-12 w-12 rounded-lg object-cover border" />
                <button onClick={() => removeFoto(area.id)} className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white shadow">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ) : (
              <button onClick={() => triggerFileInput(area.id)} className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary/50">
                <Camera className="h-5 w-5" />
              </button>
            )}
            <input ref={(el) => { fileInputRefs.current[area.id] = el; }}
              type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => handleFileSelect(area.id, e.target.files?.[0] || null)} />
            <input type="text" placeholder="Catatan" value={area.catatan}
              onChange={(e) => updateCatatan(area.id, e.target.value)}
              className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50" />
          </div>
        </div>
      ))}

      <button onClick={() => setSaved(true)}
        className="w-full rounded-lg bg-emerald-500 py-2.5 text-xs font-bold text-white hover:bg-emerald-600 active:scale-[0.98]">
        💾 Simpan Checklist
      </button>

      {saved && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-center">
          <p className="text-[11px] font-bold text-emerald-700">✅ Checklist tersimpan!</p>
        </motion.div>
      )}
    </div>
  );
});
