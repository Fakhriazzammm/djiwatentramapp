import { uid } from "./calc";
import type { Account, Entry } from "./types";

export type AdjustMode = "opening" | "entry";
export type Adjustment = { diff: number; account?: Account; entry?: Entry };

/**
 * Brings a wallet's balance to what the bank or the wallet really shows.
 * "opening" shifts the starting balance, so no income or spending is invented; "entry" records the gap as a visible record.
 */
export function planAdjustment(account: Account, current: number, target: number, mode: AdjustMode, now = new Date(), id = uid()): Adjustment {
  const diff = Math.round((target - current) * 100) / 100;
  if (diff === 0) return { diff };
  if (mode === "opening") return { diff, account: { ...account, opening: Math.round((account.opening + diff) * 100) / 100 } };
  const iso = now.toISOString();
  return { diff, entry: { id, kind: diff > 0 ? "in" : "out", amount: Math.abs(diff), categoryId: diff > 0 ? "bonus" : "lainnya", accountId: account.id, at: iso, note: "Penyesuaian saldo", tags: ["penyesuaian"], source: "manual", createdAt: iso } };
}
