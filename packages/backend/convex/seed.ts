import { internalMutation } from "./_generated/server";

export const seed = internalMutation({
	args: {},
	handler: async (ctx) => {
		// 1. Categories
		const categories = [
			{ name: "Promo Musiman", order: 0 },
			{ name: "Kopi", order: 1 },
			{ name: "Non-Kopi", order: 2 },
			{ name: "Cemilan", order: 3 },
			{ name: "Makanan Utama", order: 4 },
		];

		const categoryIds = new Map();
		for (const cat of categories) {
			const existing = await ctx.db
				.query("categories")
				.filter((q) => q.eq(q.field("name"), cat.name))
				.first();
			if (existing) {
				categoryIds.set(cat.name, existing._id);
			} else {
				const id = await ctx.db.insert("categories", cat);
				categoryIds.set(cat.name, id);
			}
		}

		// 2. Products
		const products = [
			{
				name: "Combo Kopi & Donat",
				description: "Hemat IDR 5.000",
				price: 35_000,
				categoryId: categoryIds.get("Promo Musiman"),
				isAvailable: true,
				image:
					"https://images.unsplash.com/photo-1521017432531-fbc3e1989461?auto=format&fit=crop&q=80&w=300",
			},
			{
				name: "Iced Americano",
				description: "Double shot espresso dengan air dan es",
				price: 25_000,
				categoryId: categoryIds.get("Kopi"),
				isAvailable: true,
				image:
					"https://images.unsplash.com/photo-1517701604599-bb29b5dd7359?auto=format&fit=crop&q=80&w=300",
			},
			{
				name: "Es Kopi Susu TKM",
				description: "Kopi susu gula aren andalan",
				price: 22_000,
				categoryId: categoryIds.get("Kopi"),
				isAvailable: true,
				image:
					"https://images.unsplash.com/photo-1461023233267-078af589c035?auto=format&fit=crop&q=80&w=300",
			},
			{
				name: "Matcha Latte",
				description: "Matcha premium dengan susu segar",
				price: 32_000,
				categoryId: categoryIds.get("Non-Kopi"),
				isAvailable: true,
				image:
					"https://images.unsplash.com/photo-1515810264245-c438099bb8f1?auto=format&fit=crop&q=80&w=300",
			},
			{
				name: "Cokelat Klasik",
				description: "Cokelat belgia hangat atau dingin",
				price: 28_000,
				categoryId: categoryIds.get("Non-Kopi"),
				isAvailable: true,
				image:
					"https://images.unsplash.com/photo-1544787210-2213d2429f79?auto=format&fit=crop&q=80&w=300",
			},
			{
				name: "Kentang Truffle",
				description: "Kentang goreng dengan minyak truffle dan parmesan",
				price: 35_000,
				categoryId: categoryIds.get("Cemilan"),
				isAvailable: true,
				image:
					"https://images.unsplash.com/photo-1573080496987-a2f07d3b5b15?auto=format&fit=crop&q=80&w=300",
			},
			{
				name: "Nasi Goreng Spesial",
				description: "Nasi goreng dengan telur dan ayam",
				price: 45_000,
				categoryId: categoryIds.get("Makanan Utama"),
				isAvailable: true,
				image:
					"https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&q=80&w=300",
			},
		];

		for (const prod of products) {
			if (!prod.categoryId) {
				continue;
			}
			const existing = await ctx.db
				.query("products")
				.filter((q) => q.eq(q.field("name"), prod.name))
				.first();
			if (!existing) {
				await ctx.db.insert("products", prod);
			}
		}

		// 3. Inventory
		const inventory = [
			{
				ingredientName: "Biji Kopi",
				unit: "gram",
				quantity: 5000,
				lowStockThreshold: 1000,
			},
			{
				ingredientName: "Susu Segar",
				unit: "ml",
				quantity: 10_000,
				lowStockThreshold: 2000,
			},
			{
				ingredientName: "Bubuk Matcha",
				unit: "gram",
				quantity: 500,
				lowStockThreshold: 100,
			},
			{
				ingredientName: "Bubuk Cokelat",
				unit: "gram",
				quantity: 1000,
				lowStockThreshold: 200,
			},
		];

		for (const item of inventory) {
			const existing = await ctx.db
				.query("inventory")
				.filter((q) => q.eq(q.field("ingredientName"), item.ingredientName))
				.first();
			if (!existing) {
				await ctx.db.insert("inventory", item);
			}
		}

		return "Seeding completed!";
	},
});
