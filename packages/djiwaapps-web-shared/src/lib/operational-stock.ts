import type { ComponentType } from "react";

export type OperationalStockStatus = "healthy" | "low" | "out";

export type OperationalStockItem = {
  inventoryId: string;
  name: string;
  operationalUnit: string;
  operationalQuantity: number;
  operationalLowStockThreshold: number;
  operationalIconKey?: string | null;
  operationalArea?: "bar" | "kitchen" | "warehouse" | "general" | string | null;
  status: OperationalStockStatus;
  note?: string;
};

export function getOperationalStockStatus(
  quantity: number | null | undefined,
  threshold: number | null | undefined,
): OperationalStockStatus {
  const safeQuantity = Number(quantity ?? 0);
  const safeThreshold = Math.max(0, Number(threshold ?? 0));
  if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) return "out";
  if (safeThreshold > 0 && safeQuantity <= safeThreshold) return "low";
  return "healthy";
}

export function formatOperationalStock(
  quantity: number | null | undefined,
  unit: string | null | undefined,
): string {
  const safeQuantity = Number(quantity ?? 0);
  const formatted = Number.isInteger(safeQuantity)
    ? String(safeQuantity)
    : safeQuantity.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  return `${formatted} ${String(unit ?? "unit").trim() || "unit"}`;
}

export function isOperationalStockConfigured(item: {
  operationalUnit?: string | null;
  operationalQuantity?: number | null;
}): boolean {
  return Boolean(String(item.operationalUnit ?? "").trim()) && item.operationalQuantity != null;
}

export function getOperationalAreaForRole(
  roleName: string | null | undefined,
): "bar" | "kitchen" | null {
  const role = String(roleName ?? "").toLowerCase();
  if (role.includes("barista") || role.includes("bar")) return "bar";
  if (role.includes("chef") || role.includes("kitchen") || role.includes("cook") || role.includes("dapur")) {
    return "kitchen";
  }
  return null;
}

export const operationalStatusLabels: Record<OperationalStockStatus, string> = {
  healthy: "Aman",
  low: "Menipis",
  out: "Habis",
};

export const operationalStatusClasses: Record<OperationalStockStatus, string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-700",
  low: "border-amber-200 bg-amber-50 text-amber-700",
  out: "border-rose-200 bg-rose-50 text-rose-700",
};

export type OperationalStockIcon = ComponentType<{ className?: string }>;
