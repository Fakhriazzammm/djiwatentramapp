import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Get active orders filtered by track (kitchen or bar)
export const getTrackOrders = query({
  args: { track: v.union(v.literal("kitchen"), v.literal("bar")) },
  handler: async (ctx, args) => {
    const { track } = args;

    // 1. Get all categories for this track
    const allCategories = await ctx.db.query("categories").collect();
    const trackCategoryIds = new Set(
      allCategories
        .filter((c) => c.track === track || (c.parentId && allCategories.find(p => p._id === c.parentId)?.track === track))
        .map((c) => c._id)
    );

    // 2. Get all products to map category to track
    const products = await ctx.db.query("products").collect();
    const productToTrack = new Map();
    for (const p of products) {
      if (trackCategoryIds.has(p.categoryId)) {
        productToTrack.set(p._id, track);
      }
    }

    // 3. Get all orders that are not completed or cancelled
    // Actually, usually Bar/Kitchen wants to see Paid orders (confirmed)
    const activeOrders = await ctx.db
      .query("orders")
      .filter((q) => 
        q.and(
          q.neq(q.field("status"), "completed"),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .collect();

    // 4. Filter items in each order by track
    return activeOrders
      .map((order) => {
        const trackItems = order.items.filter((item) => productToTrack.get(item.productId) === track);
        if (trackItems.length === 0) return null;

        return {
          ...order,
          items: trackItems,
          originalItemCount: order.items.length,
          // Add indices to identifying items for updateOrderItemStatus
          itemsWithMetadata: order.items
            .map((item, index) => ({ ...item, originalIndex: index }))
            .filter((item) => productToTrack.get(item.productId) === track),
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a?.createdAt || 0) - (b?.createdAt || 0)); // Oldest first
  },
});

// Update status for a specific item within an order
export const updateOrderItemStatus = mutation({
  args: {
    orderId: v.id("orders"),
    itemIndex: v.number(), // The index in the original items array
    status: v.union(v.literal("pending"), v.literal("preparing"), v.literal("ready")),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const newItems = [...order.items];
    newItems[args.itemIndex] = {
      ...newItems[args.itemIndex],
      status: args.status,
    };

    await ctx.db.patch(args.orderId, { items: newItems });

    // Auto-complete logic: Check if all items in the order are "ready"
    // Note: Items might not have a status yet (legacy), so treat undefined as "pending"
    const allReady = newItems.every((item) => item.status === "ready");

    if (allReady) {
      await ctx.db.patch(args.orderId, { status: "completed" });
    }
  },
});

// Get products for a specific track to manage stock
export const getTrackProducts = query({
  args: { track: v.union(v.literal("kitchen"), v.literal("bar")) },
  handler: async (ctx, args) => {
    const { track } = args;

    const allCategories = await ctx.db.query("categories").collect();
    const trackCategoryIds = new Set(
      allCategories
        .filter((c) => c.track === track || (c.parentId && allCategories.find(p => p._id === c.parentId)?.track === track))
        .map((c) => c._id)
    );

    const products = await ctx.db
      .query("products")
      .collect();

    const filtered = products.filter((p) => trackCategoryIds.has(p.categoryId));

    return await Promise.all(
      filtered.map(async (p) => {
        if (p.image && !p.image.startsWith("http")) {
          const url = await ctx.storage.getUrl(p.image);
          if (url) {
            return { ...p, image: url, storageId: p.image };
          }
        }
        return p;
      })
    );
  },
});

// Toggle product availability (Stock management)
export const toggleProductAvailability = mutation({
  args: { 
    productId: v.id("products"),
    isAvailable: v.boolean() 
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.productId, { isAvailable: args.isAvailable });
  },
});

// Admin: Seed Sample Operational Data
export const seedOperationalData = mutation({
  args: { track: v.union(v.literal("kitchen"), v.literal("bar")) },
  handler: async (ctx, args) => {
    const { track } = args;
    
    // Check if categories already exist for this track
    const existing = await ctx.db
      .query("categories")
      .filter((q) => q.eq(q.field("track"), track))
      .first();
    
    if (existing) return { message: "Data already exists" };

    // Create a base category
    const categoryId = await ctx.db.insert("categories", {
      name: track === "kitchen" ? "Makanan Utama" : "Minuman Segar",
      order: 0,
      track,
    });

    // Create sample products
    const samples = track === "kitchen" 
      ? [
          { name: "Nasi Goreng Spesial", price: 25000, quantity: 50 },
          { name: "Ayam Bakar Madu", price: 35000, quantity: 30 },
          { name: "Sate Ayam (10 Tusuk)", price: 28000, quantity: 40 },
        ]
      : [
          { name: "Es Teh Manis", price: 5000, quantity: 100 },
          { name: "Es Jeruk Peras", price: 12000, quantity: 50 },
          { name: "Kopi Susu Gula Aren", price: 18000, quantity: 60 },
        ];

    for (const item of samples) {
      await ctx.db.insert("products", {
        ...item,
        categoryId,
        isAvailable: true,
      });
    }

    return { message: "Sample data created successfully" };
  },
});
