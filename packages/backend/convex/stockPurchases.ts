
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";

const defineMutation: any = mutation;

export const recordStockPurchase = defineMutation({
  args: {
    purchaseData: v.object({
      total: v.number(),
      merchant: v.optional(v.string()),
      date: v.number(),
      paymentMethod: v.string(),
      items: v.array(v.object({
        name: v.string(),
        qty: v.number(),
        price: v.number()
      }))
    }),
  },
  handler: async (ctx: any, args: any): Promise<{
    transactionId: string | null;
    updatedCount: number;
    createdCount: number;
    message: string;
  }> => {
    const { purchaseData } = args;
    // Step 1: Record the entire purchase as a single expense transaction.
    const payload = {
      type: "expense" as const,
      amount: purchaseData.total,
      category: "Pembelian Stok",
      description: `Pembelian stok dari ${purchaseData.merchant || "Supplier"}`,
      date: purchaseData.date,
      paymentMethod: purchaseData.paymentMethod,
      status: "completed" as const,
    };
    const transactionId = await ctx.runMutation(internal.finance.createTransaction, payload);

    if (!transactionId) {
      throw new Error("Failed to create expense transaction.");
    }

    const allInventory = await ctx.runQuery(internal.inventory.getInventory);
    let updatedCount = 0;
    let createdCount = 0;

    // Step 2: Process each item to update or create inventory.
    for (const item of purchaseData.items) {
      const existingItem = allInventory.find(
        (invItem: any) => invItem.ingredientName.toLowerCase() === item.name.toLowerCase()
      );

      if (existingItem) {
        // If item exists, update its stock.
        await ctx.runMutation(internal.inventory.addStock, {
          inventoryId: existingItem._id,
          quantity: item.qty,
          costPerUnit: item.price,
          notes: `Pembelian dari ${purchaseData.merchant || "Supplier"}`,
        });
        updatedCount++;
      } else {
        // If item does not exist, create a new inventory item.
        await ctx.runMutation(internal.inventory.createInventoryItem, {
          ingredientName: item.name,
          quantity: item.qty,
          unit: "pcs", // Default unit, can be improved later
          lowStockThreshold: 10, // Default threshold
          costPerUnit: item.price,
        });
        createdCount++;
      }
    }

    return {
      transactionId,
      updatedCount,
      createdCount,
      message: `Purchase recorded. ${updatedCount} item(s) updated, ${createdCount} item(s) created.`,
    };
  },
});
