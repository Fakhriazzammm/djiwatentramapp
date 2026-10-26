import { useState, useCallback } from "react";
import type { OpnameItem, OpnameRole } from "@/components/attendance/stock-opname-panel";

export type OpnameCheckResult = {
  needsOpname: boolean; role: OpnameRole; shiftName: string; shiftSourceId: string;
  items: OpnameItem[]; totalStaffInRole: number; alreadyClockedOut: number; isLastPerson: boolean;
};

const ENABLE_OPERATIONAL_OPNAME_V2 = String(
  import.meta.env.VITE_OPERATIONAL_STOCK_OPNAME_V2 ?? "false",
).toLowerCase() === "true";

const LEGACY_NAMES: Record<OpnameRole, Set<string>> = {
  bar: new Set(["Air Galon","Apple Juice","Arabica Beans","Beans Robusta","C1000 Apple","Es Batu","Fresh Milk Greenfield","Gula Aren","Le Mineral","Lemon Tea Max Tea","Matcha Powder","Peach Tea Max Tea","Richgold Label","Robusta Beans","SKM Carnation 488gr","Sirup Green Apple","Sirup Peach","Soda Water Schweppes","Sprite","Sunquick Lemon","Susu Coconut","Susu Kental Manis","White Cream"]),
  kitchen: new Set(["Barbeque Sauce","Baso Sapi","Bawang Daun","Bawang Goreng","Beras","Biji Wijen","Bubur Base","Butter","Coklat Powder","Daging Ayam","Fla","Garam","Gula Pasir Putih","Kecap Asin","Kecap Ikan","Kecap Manis","Kemangi Instant","Kentang","Kerupuk","Kulit Pangsit (Cap Jempol)","Mayonaise","Merica","Micin","Minyak Bawang Putih","Mix Vegetable","Nasi Ayam Chasiu Sauce","Nasi Ayam Mentega Sauce","Nasi Ayam Rempah Kemangi  Sauce","Nasi Goreng Sauce","Nasi Telor Omega Pontianak Sauce","Patty Hamburg","Pisang","Roti (Bread Co)","Saus Sambel (Del Monte)","Saus Tiram (Mahsuri)","Saus Tomat (Del Monte)","Selada (Ibu Teti Pasar)","Sosis (Salam)","Telor Ayam (Yogya)","Telor Omega (Happy Egg)","Telur Ayam","Tepung Terigu","Timun","Tongcai","Ubi Cilembu","Yamin Base"]),
};

function mapItem(i: any): OpnameItem {
  const baseUnit = String(i.base_unit || i.unit || "pcs").trim();
  const factor = Number(i.content_to_base_factor ?? i.conversion_factor ?? 1) || 1;
  const baseBefore = Number(i.quantity ?? 0);
  const operationalUnit = String(i.operational_unit || "").trim() || baseUnit;
  const operationalBefore = i.operational_quantity == null ? baseBefore / factor : Number(i.operational_quantity);
  return { inventoryId: String(i.source_id), name: String(i.ingredient_name || "").trim(), unit: baseUnit, qtyBefore: baseBefore, qtyAfter: baseBefore, operationalUnit, operationalQtyBefore: operationalBefore, operationalQtyAfter: operationalBefore, baseUnit, conversionFactor: factor };
}

export function useOpnameRunner() {
  const [result, setResult] = useState<OpnameCheckResult | null>(null);
  const [loading, setLoading] = useState(false);

  const checkAndLoad = useCallback(async (role: OpnameRole, shiftSourceId: string, shiftName: string, _staffSourceId: string): Promise<OpnameCheckResult> => {
    setLoading(true);
    try {
      const { createClient } = await import("@/lib/client");
      const pos = createClient().schema("pos");
      let inventory: any[] = [];
      let operationalQuery = ENABLE_OPERATIONAL_OPNAME_V2;
      if (operationalQuery) {
        const operational = await pos.from("inventory").select("source_id, ingredient_name, quantity, unit, operational_unit, operational_quantity, operational_area, base_unit, content_to_base_factor, conversion_factor").limit(500);
        if (operational.error) {
          operationalQuery = false;
        } else {
          inventory = operational.data || [];
        }
      }
      if (!operationalQuery) {
        const legacy = await pos.from("inventory").select("source_id, ingredient_name, quantity, unit").limit(500);
        if (legacy.error) throw legacy.error;
        inventory = legacy.data || [];
      }
      const legacyNames = LEGACY_NAMES[role];
      const areaScoped = operationalQuery ? inventory.filter((i) => i.operational_area === role || i.operational_area === "general") : [];
      const scoped = areaScoped.length > 0 ? areaScoped : inventory.filter((i) => legacyNames.has(String(i.ingredient_name || "").trim()));
      const items = scoped.map(mapItem).filter((i) => i.name).sort((a, b) => a.name.localeCompare(b.name));
      const res = { needsOpname: items.length > 0, role, shiftName, shiftSourceId, items, totalStaffInRole: 1, alreadyClockedOut: 0, isLastPerson: true };
      setResult(res); return res;
    } finally { setLoading(false); }
  }, []);

  const submitOpname = useCallback(async (opnameResult: OpnameCheckResult, staffName: string, userId: string, auth?: { pinCode?: string; faceDescriptor?: number[]; location?: { lat: number; lng: number } | null }) => {
    const response = await fetch("https://supabase.djiwatentram.web.id/functions/v1/process-closing", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, userName: staffName, roleName: opnameResult.role, shiftName: opnameResult.shiftName, role: opnameResult.role, items: opnameResult.items, source: "pos_web", kebersihan: [], pinCode: auth?.pinCode, faceDescriptor: auth?.faceDescriptor, location: auth?.location }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error?.message || "Gagal memproses closing");
    return data;
  }, []);

  return { result, loading, checkAndLoad, submitOpname };
}
