import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Minus, Plus, ChevronDown, ChevronUp, ClipboardList, ArrowRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================
// TYPES
// ============================================================

export type OpnameItem = {
  inventoryId: string;
  name: string;
  unit: string;
  qtyBefore: number;  // stok sistem saat ini
  qtyAfter: number;   // input staff (sisa)
};

export type OpnameRole = "bar" | "kitchen";

export type OpnameState = {
  role: OpnameRole;
  items: OpnameItem[];
  previousInputs?: OpnameItem[];  // dari staff sebelumnya
  totalStaffInRole: number;
  alreadyClockedOut: number;
  isLastPerson: boolean;
  shiftName: string;
};

// ============================================================
// HOOK: Dapatkan daftar bahan berdasarkan role
// ============================================================

// Bar ingredients (23 items)
const BAR_INGREDIENTS = [
  "Air Galon", "Apple Juice", "Arabica Beans", "Beans Robusta",
  "C1000 Apple", "Es Batu", "Fresh Milk Greenfield", "Gula Aren",
  "Le Mineral", "Lemon Tea Max Tea", "Matcha Powder", "Peach Tea Max Tea",
  "Richgold Label", "Robusta Beans", "SKM Carnation 488gr", "Sirup Green Apple",
  "Sirup Peach", "Soda Water Schweppes", "Sprite", "Sunquick Lemon",
  "Susu Coconut", "Susu Kental Manis", "White Cream",
];

// Kitchen ingredients (47 items)
const KITCHEN_INGREDIENTS = [
  "Barbeque Sauce", "Baso Sapi", "Bawang Daun", "Bawang Goreng",
  "Beras", "Biji Wijen", "Bubur Base", "Butter", "Coklat Powder",
  "Daging Ayam", "Fla", "Garam", "Gula Pasir Putih",
  "Kecap Asin", "Kecap Ikan", "Kecap Manis", "Kemangi Instant",
  "Kentang", "Kerupuk", "Kulit Pangsit (Cap Jempol)", "Mayonaise",
  "Merica", "Micin", "Minyak Bawang Putih", "Mix Vegetable",
  "Nasi Ayam Chasiu Sauce", "Nasi Ayam Mentega Sauce",
  "Nasi Ayam Rempah Kemangi  Sauce", "Nasi Goreng Sauce",
  "Nasi Telor Omega Pontianak Sauce", "Patty Hamburg", "Pisang",
  "Roti (Bread Co)", "Saus Sambel (Del Monte)", "Saus Tiram (Mahsuri)",
  "Saus Tomat (Del Monte)", "Selada (Ibu Teti Pasar)", "Sosis (Salam)",
  "Telor Ayam (Yogya)", "Telor Omega (Happy Egg)", "Telur Ayam",
  "Tepung Terigu", "Timun", "Tongcai", "Ubi Cilembu", "Yamin Base",
];

// ============================================================
// COMPONENT: StockOpnamePanel
// ============================================================

type StockOpnamePanelProps = {
  state: OpnameState;
  onUpdateItem: (index: number, qty: number) => void;
  onMarkAllSame: () => void;
  onMarkAllZero?: () => void;
  onSubmit: () => void;
  isLoading: boolean;
};

export function StockOpnamePanel({
  state,
  onUpdateItem,
  onMarkAllSame,
  onMarkAllZero,
  onSubmit,
  isLoading,
}: StockOpnamePanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [changedCount, setChangedCount] = useState(0);

  // Hitung jumlah item yang berubah
  useEffect(() => {
    let count = 0;
    state.items.forEach((item) => {
      if (Math.abs(item.qtyAfter - item.qtyBefore) > 0.01) count++;
    });
    setChangedCount(count);
  }, [state.items]);

  const totalItems = state.items.length;
  const roleColors = state.role === "bar" ? "from-sky-500 to-blue-600" : "from-amber-500 to-orange-600";
  const roleBg = state.role === "bar" ? "bg-sky-50 border-sky-200" : "bg-amber-50 border-amber-200";
  const roleText = state.role === "bar" ? "Bar" : "Kitchen";

  // Adjust display quantity (simple adjustments)
  const adjustQty = (index: number, delta: number) => {
    const item = state.items[index];
    const newQty = Math.max(0, item.qtyAfter + delta);
    onUpdateItem(index, newQty);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={cn(
        "relative overflow-hidden rounded-2xl border p-4",
        roleBg
      )}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm",
                roleColors
              )}>
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <p className="font-black text-lg tracking-tight">{roleText} Stock Opname</p>
                <p className="text-[10px] text-muted-foreground font-medium">
                  Shift: {state.shiftName}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex h-8 w-8 items-center justify-center rounded-full border bg-white/80 hover:bg-white"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {/* Staff counter */}
        {!state.isLastPerson && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/60 px-3 py-1.5 text-[10px] font-medium text-muted-foreground">
            <Users className="h-3 w-3" />
            Masih ada {state.totalStaffInRole - state.alreadyClockedOut - 1} rekan lain di {state.role === "bar" ? "Bar" : "Kitchen"}.
            Opname kamu jadi referensi untuk yang terakhir.
          </div>
        )}

        {state.isLastPerson && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-100 px-3 py-1.5 text-[10px] font-bold text-emerald-700">
            <Check className="h-3 w-3" />
            Kamu orang terakhir! Opname ini akan jadi stok FINAL shift ini.
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="mt-3 flex items-center justify-between px-1">
        <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
          {totalItems} bahan · {changedCount} berubah
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onMarkAllZero}
            className="text-[10px] font-bold text-red-500 hover:underline"
          >
            Setel Semua 0
          </button>
          <button
            onClick={onMarkAllSame}
            className="text-[10px] font-bold text-primary hover:underline"
          >
            Tandai Semua Tetap
          </button>
        </div>
      </div>

      {/* Items list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-2 flex-1 overflow-y-auto space-y-1.5"
          >
            {state.items.map((item, i) => {
              const changed = Math.abs(item.qtyAfter - item.qtyBefore) > 0.01;
              const depleted = item.qtyAfter <= 0;
              return (
                <motion.div
                  key={item.inventoryId}
                  animate={
                    changed
                      ? {
                          backgroundColor: [
                            "rgba(59,130,246,0.08)",
                            "rgba(59,130,246,0.18)",
                            "rgba(59,130,246,0.08)",
                          ],
                          transition: {
                            duration: 2,
                            repeat: Infinity,
                            ease: "easeInOut",
                          },
                        }
                      : {}
                  }
                  className={cn(
                    "rounded-xl border overflow-hidden",
                    changed
                      ? "border-primary/30"
                      : "border-transparent bg-muted/30",
                    depleted && "border-red-300 bg-red-50"
                  )}
                >
                  <div className="px-3 py-2">
                    {/* Name + unit */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold truncate leading-tight">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {changed ? (
                            <span>
                              <span className="line-through">{item.qtyBefore.toLocaleString()} {item.unit}</span>
                              {" → "}
                              <span className={cn("font-bold", depleted ? "text-red-600" : "text-emerald-600")}>
                                {item.qtyAfter.toLocaleString()} {item.unit}
                              </span>
                            </span>
                          ) : (
                            <span>{item.qtyBefore.toLocaleString()} {item.unit} (tetap)</span>
                          )}
                        </p>
                      </div>

                      {/* Quick adjust buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => adjustQty(i, -Math.max(1, Math.round(item.qtyAfter * 0.1)))}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border bg-white hover:bg-red-50 hover:border-red-200"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <Input
                          type="number"
                          value={Math.round(item.qtyAfter)}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) && v >= 0) onUpdateItem(i, v);
                          }}
                          className="h-9 w-16 text-center text-[11px] font-bold p-0"
                          min={0}
                        />
                        <button
                          onClick={() => adjustQty(i, Math.max(1, Math.round(item.qtyAfter * 0.1)))}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border bg-white hover:bg-emerald-50 hover:border-emerald-200"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Adaptive step: adjust granularity based on stock magnitude */}
                  {(() => {
                    const adaptiveStep = Math.max(1, Math.round(item.qtyBefore / 50));
                    const maxVal = Math.max(item.qtyBefore * 2, 10);
                    return (
                      <div className="mt-1.5">
                        <input
                          type="range"
                          min={0}
                          max={maxVal}
                          step={adaptiveStep}
                          value={Math.round(item.qtyAfter)}
                          onChange={(e) => onUpdateItem(i, parseInt(e.target.value))}
                          className="w-full h-1.5 appearance-none rounded-full bg-muted/50 cursor-pointer accent-primary
                            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5
                            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm
                            [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125"
                        />
                        {adaptiveStep > 1 && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Step {adaptiveStep} (stok besar)
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Preset buttons row */}
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        onClick={() => onUpdateItem(i, 0)}
                        className="flex h-8 min-w-[2.5rem] items-center justify-center rounded-lg border border-red-200 bg-red-50 text-[10px] font-bold text-red-600 hover:bg-red-100"
                      >
                        0
                      </button>
                      <button
                        onClick={() => onUpdateItem(i, Math.round(item.qtyBefore / 2))}
                        className="flex h-8 min-w-[2.5rem] items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700 hover:bg-amber-100"
                      >
                        ½
                      </button>
                      <button
                        onClick={() => onUpdateItem(i, item.qtyBefore)}
                        className="flex h-8 min-w-[2.5rem] items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100"
                      >
                        1
                      </button>
                      <button
                        onClick={() => adjustQty(i, 1)}
                        className="flex h-8 min-w-[2.5rem] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-[10px] font-bold text-gray-700 hover:bg-gray-100"
                      >
                        +1
                      </button>
                      <button
                        onClick={() => adjustQty(i, -1)}
                        disabled={item.qtyAfter <= 0}
                        className="flex h-8 min-w-[2.5rem] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-[10px] font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        -1
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit button */}
      <div className="mt-4 pt-3 border-t">
        <Button
          onClick={onSubmit}
          disabled={isLoading}
          className={cn(
            "w-full h-12 rounded-2xl font-black text-base shadow-lg transition-all",
            state.isLastPerson
              ? "bg-emerald-500 hover:bg-emerald-400 text-white"
              : "bg-gradient-to-r " + roleColors + " text-white"
          )}
        >
          {isLoading ? (
            "Menyimpan..."
          ) : state.isLastPerson ? (
            <>
              <Check className="mr-2 h-5 w-5" />
              Simpan FINAL & Absen Keluar
            </>
          ) : (
            <>
              <ArrowRight className="mr-2 h-5 w-5" />
              Simpan & Absen Keluar
            </>
          )}
        </Button>
        {state.previousInputs && state.previousInputs.length > 0 && (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Input sebelumnya dari rekan tersedia sebagai referensi
          </p>
        )}
      </div>
    </div>
  );
}
