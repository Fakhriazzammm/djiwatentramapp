import { useState, useCallback, useEffect, useMemo } from "react";
import { createClient } from "@/lib/client";
import { makeSourceId } from "@/lib/id-utils";
import { OpnameItem, OpnameRole } from "@/components/attendance/stock-opname-panel";

// ============================================================
// HOOK: useStockOpname — Fetch & submit stock opname data
// ============================================================

type OpnameInput = {
  items: OpnameItem[];
  role: OpnameRole;
  shiftSourceId: string;
  staffSourceId: string;
  staffName: string;
  isFinal: boolean;
  previousOpnameIds?: string[];
};

export function useStockOpname() {
  const [isLoading, setIsLoading] = useState(false);

  /** Fetch all inventory items for a given role with current stock */
  const fetchOpnameItems = useCallback(async (role: OpnameRole): Promise<OpnameItem[]> => {
    const supabase = createClient();
    const pos = supabase.schema("pos");

    // Get all inventory items
    const { data: inventory, error } = await pos
      .from("inventory")
      .select("source_id, ingredient_name, quantity, unit, last_purchase_price")
      .limit(500);

    if (error) throw error;

    // Role-based ingredient names
    const barNames = new Set([
      "Air Galon", "Apple Juice", "Arabica Beans", "Beans Robusta",
      "C1000 Apple", "Es Batu", "Fresh Milk Greenfield", "Gula Aren",
      "Le Mineral", "Lemon Tea Max Tea", "Matcha Powder", "Peach Tea Max Tea",
      "Richgold Label", "Robusta Beans", "SKM Carnation 488gr", "Sirup Green Apple",
      "Sirup Peach", "Soda Water Schweppes", "Sprite", "Sunquick Lemon",
      "Susu Coconut", "Susu Kental Manis", "White Cream",
    ]);

    const kitchenNames = new Set([
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
    ]);

    const targetNames = role === "bar" ? barNames : kitchenNames;

    const items: OpnameItem[] = (inventory || [])
      .filter((inv: any) => {
        const name = (inv.ingredient_name || "").trim();
        return targetNames.has(name);
      })
      .map((inv: any) => ({
        inventoryId: inv.source_id,
        name: (inv.ingredient_name || "").trim(),
        unit: (inv.unit || "").trim(),
        qtyBefore: parseFloat(inv.quantity || "0"),
        qtyAfter: parseFloat(inv.quantity || "0"), // default = unchanged
      }))
      .sort((a: OpnameItem, b: OpnameItem) => a.name.localeCompare(b.name));

    return items;
  }, []);

  /** Get active shift info for a staff member */
  const getShiftInfo = useCallback(async (staffSourceId: string) => {
    const supabase = createClient();
    const pos = supabase.schema("pos");

    // Get active shift
    const { data: shifts, error: shiftErr } = await pos
      .from("shift_reports")
      .select("source_id, shift_name, status, cashier_name, team_members")
      .eq("status", "AKTIF")
      .limit(1);

    if (shiftErr) throw shiftErr;

    const shift = shifts?.[0];
    if (!shift) return { shiftSourceId: "", shiftName: "No Shift", teamMembers: "" };

    // Count staff in this role for this shift
    const { data: logs, error: logErr } = await pos
      .from("attendance_logs")
      .select("staff_source_id, type, role")
      .eq("shift_source_id", shift.source_id);

    if (logErr) throw logErr;

    return {
      shiftSourceId: shift.source_id,
      shiftName: shift.shift_name || "Shift",
      teamMembers: shift.team_members || "",
    };
  }, []);

  /** Count how many staff of this role have already clocked out in this shift */
  const getRoleStatus = useCallback(async (shiftSourceId: string, role: OpnameRole) => {
    const supabase = createClient();
    const pos = supabase.schema("pos");

    // Get attendance today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();

    const { data: logs, error } = await pos
      .from("attendance_logs")
      .select("staff_source_id, staff_name, type, role, creation_time")
      .gte("creation_time", todayStartMs)
      .order("creation_time", { ascending: false });

    if (error) {
      console.warn("getRoleStatus: using estimate", error);
      return { total: 1, clockedOut: 0, isLast: true };
    }

    const roleLogs = (logs || []).filter((l: any) => l.role === role);
    const uniqueStaff = new Set(roleLogs.map((l: any) => l.staff_source_id));
    const clockedOutStaff = new Set(
      roleLogs
        .filter((l: any) => l.type === "check_out")
        .map((l: any) => l.staff_source_id)
    );

    return {
      total: uniqueStaff.size || 1,
      clockedOut: clockedOutStaff.size,
      isLast: clockedOutStaff.size >= (uniqueStaff.size || 1) - 1,
    };
  }, []);

  /** Submit stock opname via legacy_mirror (like attendance) */
  const submitOpname = useCallback(async (input: OpnameInput) => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const id = makeSourceId("opname");
      const timestamp = Date.now();

      // Update inventory quantities
      for (const item of input.items) {
        if (Math.abs(item.qtyAfter - item.qtyBefore) > 0.01) {
          await supabase
            .schema("pos")
            .from("inventory")
            .update({ quantity: item.qtyAfter })
            .eq("source_id", item.inventoryId);
        }
      }

      // Log the opname
      const { error } = await supabase
        .schema("pos")
        .from("inventory_transactions")
        .insert({
          source_id: id,
          inventory_source_id: null,
          tx_type: "stock_opname",
          quantity_change: 0,
          notes: JSON.stringify({
            role: input.role,
            shift_source_id: input.shiftSourceId,
            staff_name: input.staffName,
            is_final: input.isFinal,
            items: input.items.map((i) => ({
              name: i.name,
              before: i.qtyBefore,
              after: i.qtyAfter,
              unit: i.unit,
            })),
          }),
          tx_timestamp: timestamp,
          creation_time: timestamp,
        });

      if (error) throw error;

      return { success: true, id };
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    fetchOpnameItems,
    getShiftInfo,
    getRoleStatus,
    submitOpname,
    isLoading,
  };
}
