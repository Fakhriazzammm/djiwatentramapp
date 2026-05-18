import { useState, useCallback } from "react";
import type { OpnameItem, OpnameRole } from "@/components/attendance/stock-opname-panel";

/**
 * Hub: all opname logic via REST. No external hooks needed inside.
 * Call `checkAndLoad(role, shiftId)` to fetch items + role status.
 */

export type OpnameCheckResult = {
  needsOpname: boolean;
  role: OpnameRole;
  shiftName: string;
  shiftSourceId: string;
  items: OpnameItem[];
  totalStaffInRole: number;
  alreadyClockedOut: number;
  isLastPerson: boolean;
};

export function useOpnameRunner() {
  const [result, setResult] = useState<OpnameCheckResult | null>(null);
  const [loading, setLoading] = useState(false);

  const checkAndLoad = useCallback(async (
    role: OpnameRole,
    shiftSourceId: string,
    shiftName: string,
    staffSourceId: string,
  ): Promise<OpnameCheckResult> => {
    setLoading(true);
    try {
      // Use hardcoded ingredients per role (avoids extra API round-trips)
      const barNames = [
        "Air Galon","Apple Juice","Arabica Beans","Beans Robusta","C1000 Apple",
        "Es Batu","Fresh Milk Greenfield","Gula Aren","Le Mineral","Lemon Tea Max Tea",
        "Matcha Powder","Peach Tea Max Tea","Richgold Label","Robusta Beans",
        "SKM Carnation 488gr","Sirup Green Apple","Sirup Peach","Soda Water Schweppes",
        "Sprite","Sunquick Lemon","Susu Coconut","Susu Kental Manis","White Cream",
      ];
      const kitchenNames = [
        "Barbeque Sauce","Baso Sapi","Bawang Daun","Bawang Goreng","Beras",
        "Biji Wijen","Bubur Base","Butter","Coklat Powder","Daging Ayam","Fla",
        "Garam","Gula Pasir Putih","Kecap Asin","Kecap Ikan","Kecap Manis",
        "Kemangi Instant","Kentang","Kerupuk","Kulit Pangsit (Cap Jempol)",
        "Mayonaise","Merica","Micin","Minyak Bawang Putih","Mix Vegetable",
        "Nasi Ayam Chasiu Sauce","Nasi Ayam Mentega Sauce",
        "Nasi Ayam Rempah Kemangi  Sauce","Nasi Goreng Sauce",
        "Nasi Telor Omega Pontianak Sauce","Patty Hamburg","Pisang",
        "Roti (Bread Co)","Saus Sambel (Del Monte)","Saus Tiram (Mahsuri)",
        "Saus Tomat (Del Monte)","Selada (Ibu Teti Pasar)","Sosis (Salam)",
        "Telor Ayam (Yogya)","Telor Omega (Happy Egg)","Telur Ayam",
        "Tepung Terigu","Timun","Tongcai","Ubi Cilembu","Yamin Base",
      ];

      const names = role === "bar" ? barNames : kitchenNames;
      const nameSet = new Set(names);

      // Fetch inventory via REST
      const { createClient } = await import("@/lib/client");
      const supabase = createClient();
      const pos = supabase.schema("pos");

      const { data: inv, error } = await pos
        .from("inventory")
        .select("source_id, ingredient_name, quantity, unit")
        .limit(500);

      if (error) throw error;

      const items: OpnameItem[] = (inv || [])
        .filter((i: any) => nameSet.has((i.ingredient_name || "").trim()))
        .map((i: any) => ({
          inventoryId: i.source_id,
          name: (i.ingredient_name || "").trim(),
          unit: (i.unit || "").trim(),
          qtyBefore: parseFloat(i.quantity || "0"),
          qtyAfter: parseFloat(i.quantity || "0"),
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

      // Estimate role status (simplified: assume 1-2 staff per role)
      // In production this would query attendance_logs
      const totalStaffInRole = 1; // placeholder
      const alreadyClockedOut = 0;
      const isLastPerson = true;

      const res: OpnameCheckResult = {
        needsOpname: items.length > 0,
        role,
        shiftName,
        shiftSourceId,
        items,
        totalStaffInRole,
        alreadyClockedOut,
        isLastPerson,
      };

      setResult(res);
      return res;
    } finally {
      setLoading(false);
    }
  }, []);

  const submitOpname = useCallback(async (
    opnameResult: OpnameCheckResult,
    staffName: string,
  ) => {
    const { createClient } = await import("@/lib/client");
    const supabase = createClient();
    const pos = supabase.schema("pos");

    // Update all changed items
    for (const item of opnameResult.items) {
      if (Math.abs(item.qtyAfter - item.qtyBefore) > 0.01) {
        await pos
          .from("inventory")
          .update({ quantity: item.qtyAfter })
          .eq("source_id", item.inventoryId);
      }
    }

    return true;
  }, []);

  return { result, loading, checkAndLoad, submitOpname };
}
