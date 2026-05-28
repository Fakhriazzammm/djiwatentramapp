/**
 * Tipe data untuk sistem Stock Per Menu (Pre-Deduction)
 * MenuStockItem merepresentasikan satu menu beserta status stock dan komposisi bahan bakunya.
 */

export type MenuStockDeductionMode = "pre" | "post";

export interface MenuStockIngredient {
  inventoryId: string;
  ingredientName: string;
  amount: number; // kebutuhan per porsi (dalam unit bahan, misal gram/ml)
  currentStock: number; // stok bahan saat ini
  unit: string; // satuan (gram, ml, pcs, dll)
  maxPortions: number; // berapa porsi maksimal yang bisa dibuat dari stok ini
  isLow: boolean; // stok bahan di bawah lowStockThreshold
}

export interface MenuStockItem {
  productId: string;
  productName: string;
  categoryName: string;
  currentStock: number; // jumlah porsi tersedia (products.quantity)
  unit: string; // "porsi", "cup", "gelas"
  recipeId: string | null;
  ingredientCount: number;
  ingredients: MenuStockIngredient[];
  isAvailable: boolean;
  price: number;
  image?: string | null;
  menuNumber?: number | null;
}

export interface MenuStockBatch {
  productId: string;
  targetStock: number;
  previousStock: number;
  delta: number;
  mode?: MenuStockDeductionMode;
  note?: string;
}

export interface MenuStockBatchResult {
  ok: boolean;
  productId: string;
  productName: string;
  previousStock: number;
  targetStock: number;
  ingredientsDeducted: number;
  error?: string;
}

/**
 * Hasil kalkulasi "jika menu X porsi, maka butuh bahan Y"
 * Digunakan untuk preview sebelum eksekusi batch prep.
 */
export interface StockRecipeDeductionPreview {
  inventoryId: string;
  ingredientName: string;
  amountPerPortion: number;
  totalNeeded: number; // amount × targetPortions
  currentStock: number;
  unit: string;
  isSufficient: boolean; // currentStock >= totalNeeded
  shortage: number; // kekurangan (0 jika cukup)
}
