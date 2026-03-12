/**
 * Tool Executors for AI Function Calling
 *
 * This file contains the execution logic for all AI tools.
 * Each tool calls the appropriate Convex mutation.
 */

import { v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";
import { tools } from "./tools";

// Helper to cast string to Convex Id type
function asId<_T extends string>(value: string): any {
	return value as any;
}

// ============================================
// TOOL EXECUTORS
// ============================================

/**
 * Execute a single tool call
 * Routes the tool call to the appropriate mutation
 */
export const executeToolCall = action({
	args: {
		toolName: v.string(),
		args: v.any(),
	},
	handler: async (ctx, args) => {
		const { toolName, args: toolArgs } = args;

		try {
			let result: unknown;

			switch (toolName) {
				// ============================================
				// PRODUCT TOOLS
				// ============================================
				case "createProduct": {
					const parsed = tools.createProduct.parameters.parse(toolArgs);
					result = await ctx.runMutation(api.products.addProduct, {
						name: parsed.name,
						description: parsed.description,
						price: parsed.price,
						categoryId: asId(parsed.categoryId),
						promoPrice: parsed.promoPrice,
						image: parsed.image,
						isAvailable: parsed.isAvailable ?? true,
					});
					break;
				}

				case "updateProduct": {
					const parsed = tools.updateProduct.parameters.parse(toolArgs);
					const updateData: Record<string, unknown> = {};
					if (parsed.name !== undefined) {
						updateData.name = parsed.name;
					}
					if (parsed.description !== undefined) {
						updateData.description = parsed.description;
					}
					if (parsed.price !== undefined) {
						updateData.price = parsed.price;
					}
					if (parsed.promoPrice !== undefined) {
						updateData.promoPrice = parsed.promoPrice;
					}
					if (parsed.categoryId !== undefined) {
						updateData.categoryId = asId(parsed.categoryId);
					}
					if (parsed.image !== undefined) {
						updateData.image = parsed.image;
					}
					if (parsed.isAvailable !== undefined) {
						updateData.isAvailable = parsed.isAvailable;
					}

					await ctx.runMutation(api.products.updateProduct, {
						id: asId(parsed.id),
						...updateData,
					});
					result = { success: true, message: "Produk berhasil diupdate" };
					break;
				}

				case "deleteProduct": {
					const parsed = tools.deleteProduct.parameters.parse(toolArgs);
					await ctx.runMutation(api.products.deleteProduct, {
						id: asId(parsed.id),
					});
					result = { success: true, message: "Produk berhasil dihapus" };
					break;
				}

				case "createCategory": {
					const parsed = tools.createCategory.parameters.parse(toolArgs);
					result = await ctx.runMutation(api.products.createCategory, {
						name: parsed.name,
						order: parsed.order,
					});
					break;
				}

				case "deleteCategory": {
					const parsed = tools.deleteCategory.parameters.parse(toolArgs);
					await ctx.runMutation(api.products.deleteCategory, {
						id: asId(parsed.id),
					});
					result = { success: true, message: "Kategori berhasil dihapus" };
					break;
				}

				// ============================================
				// INVENTORY TOOLS
				// ============================================
				case "createInventoryItem": {
					const parsed = tools.createInventoryItem.parameters.parse(toolArgs);
					result = await ctx.runMutation(api.inventory.createInventoryItem, {
						ingredientName: parsed.ingredientName,
						unit: parsed.unit,
						quantity: parsed.quantity,
						lowStockThreshold: parsed.lowStockThreshold,
						displayUnit: parsed.displayUnit,
						conversionFactor: parsed.conversionFactor,
					});
					break;
				}

				case "addStock": {
					const parsed = tools.addStock.parameters.parse(toolArgs);
					const timestamp = parsed.date ? new Date(parsed.date).getTime() : undefined;
					
					await ctx.runMutation(api.inventory.addStock, {
						inventoryId: asId(parsed.inventoryId),
						quantity: parsed.quantity,
						costPerUnit: parsed.costPerUnit,
						notes: parsed.notes,
						timestamp,
					});
					result = {
						success: true,
						message:
							`Stok berhasil ditambah ${parsed.quantity}${parsed.date ? ` (tanggal: ${parsed.date})` : ""} ${parsed.notes || ""}`.trim(),
					};
					break;
				}

				case "getInventoryBatches": {
					const parsed = tools.getInventoryBatches.parameters.parse(toolArgs);
					result = await ctx.runQuery(api.inventory.getInventoryItemBatches, {
						inventoryId: asId(parsed.inventoryId),
					});
					break;
				}

				case "usageStock": {
					const parsed = tools.usageStock.parameters.parse(toolArgs);
					await ctx.runMutation(api.inventory.usageStock, {
						inventoryId: asId(parsed.inventoryId),
						quantity: parsed.quantity,
						notes: parsed.notes,
					});
					result = {
						success: true,
						message:
							`Stok berhasil dikurangi ${parsed.quantity} ${parsed.notes || ""}`.trim(),
					};
					break;
				}

				case "adjustStock": {
					const parsed = tools.adjustStock.parameters.parse(toolArgs);
					await ctx.runMutation(api.inventory.adjustStock, {
						inventoryId: asId(parsed.inventoryId),
						quantity: parsed.quantity,
						notes: parsed.notes,
					});
					result = {
						success: true,
						message:
							`Stok berhasil diatur ke ${parsed.quantity} ${parsed.notes || ""}`.trim(),
					};
					break;
				}

				case "deleteInventoryItem": {
					const parsed = tools.deleteInventoryItem.parameters.parse(toolArgs);
					await ctx.runMutation(api.inventory.deleteInventoryItem, {
						id: asId(parsed.id),
					});
					result = {
						success: true,
						message: "Item inventory berhasil dihapus",
					};
					break;
				}

				// ============================================
				// ORDER TOOLS
				// ============================================
				case "createOrder": {
					const parsed = tools.createOrder.parameters.parse(toolArgs);
					result = await ctx.runMutation(api.orders.createOrder, {
						items: parsed.items.map((item: any) => ({
							...item,
							productId: asId(item.productId),
						})),
						totalAmount: parsed.totalAmount,
						paymentMethod: parsed.paymentMethod,
						customerName: parsed.customerName,
					});
					break;
				}

				case "updateOrderStatus": {
					const parsed = tools.updateOrderStatus.parameters.parse(toolArgs);
					await ctx.runMutation(api.orders.updateOrderStatus, {
						id: asId(parsed.id),
						status: parsed.status as any,
					});
					result = {
						success: true,
						message: `Status pesanan berhasil diupdate ke ${parsed.status}`,
					};
					break;
				}

				// ============================================
				// FINANCE TOOLS
				// ============================================
				case "createTransaction": {
					const parsed = tools.createTransaction.parameters.parse(toolArgs);
					result = await ctx.runMutation(api.finance.createTransaction, {
						type: parsed.type as any,
						amount: parsed.amount,
						category: parsed.category,
						merchant: parsed.merchant,
						description: parsed.description,
						date: Date.now(),
						paymentMethod: parsed.paymentMethod,
						status: "completed",
					});
					break;
				}

				case "deleteTransaction": {
					const parsed = tools.deleteTransaction.parameters.parse(toolArgs);
					await ctx.runMutation(api.finance.deleteTransaction, {
						id: asId(parsed.id),
					});
					result = { success: true, message: "Transaksi berhasil dihapus" };
					break;
				}

				// ============================================
				// DISCOUNT TOOLS
				// ============================================
				case "createDiscount": {
					const parsed = tools.createDiscount.parameters.parse(toolArgs);
					result = await ctx.runMutation(api.discounts.createDiscount, {
						name: parsed.name,
						type: parsed.type as any,
						value: parsed.value,
						targetType: parsed.targetType as any,
						targetIds: parsed.targetIds,
						isActive: parsed.isActive ?? true,
						minOrderValue: parsed.minOrderValue,
					});
					break;
				}

				case "updateDiscount": {
					const parsed = tools.updateDiscount.parameters.parse(toolArgs);
					const updateData: Record<string, unknown> = {};
					if (parsed.name !== undefined) {
						updateData.name = parsed.name;
					}
					if (parsed.type !== undefined) {
						updateData.type = parsed.type;
					}
					if (parsed.value !== undefined) {
						updateData.value = parsed.value;
					}
					if (parsed.targetType !== undefined) {
						updateData.targetType = parsed.targetType;
					}
					if (parsed.targetIds !== undefined) {
						updateData.targetIds = parsed.targetIds;
					}
					if (parsed.isActive !== undefined) {
						updateData.isActive = parsed.isActive;
					}
					if (parsed.minOrderValue !== undefined) {
						updateData.minOrderValue = parsed.minOrderValue;
					}

					await ctx.runMutation(api.discounts.updateDiscount, {
						id: asId(parsed.id),
						...updateData,
					});
					result = { success: true, message: "Diskon berhasil diupdate" };
					break;
				}

				case "toggleDiscount": {
					const parsed = tools.toggleDiscount.parameters.parse(toolArgs);
					// Get current discount first
					const discounts = await ctx.runQuery(api.discounts.getDiscounts);
					const discount = discounts.find((d: any) => d._id === parsed.id);
					if (discount) {
						await ctx.runMutation(api.discounts.updateDiscount, {
							id: asId(parsed.id),
							isActive: !discount.isActive,
						});
						result = {
							success: true,
							message: `Diskon berhasil ${discount.isActive ? "dinonaktifkan" : "diaktifkan"}`,
						};
					} else {
						throw new Error("Diskon tidak ditemukan");
					}
					break;
				}

				case "deleteDiscount": {
					const parsed = tools.deleteDiscount.parameters.parse(toolArgs);
					await ctx.runMutation(api.discounts.deleteDiscount, {
						id: asId(parsed.id),
					});
					result = { success: true, message: "Diskon berhasil dihapus" };
					break;
				}

				// ============================================
				// HPP TOOLS
				// ============================================
				case "createHppCalculation": {
					const parsed = tools.createHppCalculation.parameters.parse(toolArgs);
					result = await ctx.runMutation(api.hpp.createHppCalculation, {
						name: parsed.name,
						description: parsed.description,
						ingredients: parsed.ingredients.map((ing: any) => ({
							...ing,
							inventoryId: ing.inventoryId ? asId(ing.inventoryId) : undefined,
						})),
						overheadCosts: parsed.overheadCosts ?? [],
						servingsPerBatch: parsed.servingsPerBatch,
						sellingPrice: parsed.sellingPrice,
						productId: parsed.productId ? asId(parsed.productId) : undefined,
					});
					break;
				}

				case "updateHppCalculation": {
					const parsed = tools.updateHppCalculation.parameters.parse(toolArgs);
					const hppData: Record<string, unknown> = {
						id: asId(parsed.id),
						servingsPerBatch: parsed.servingsPerBatch,
						sellingPrice: parsed.sellingPrice,
					};
					if (parsed.name !== undefined) {
						hppData.name = parsed.name;
					}
					if (parsed.description !== undefined) {
						hppData.description = parsed.description;
					}
					if (parsed.ingredients !== undefined) {
						hppData.ingredients = parsed.ingredients.map((ing: any) => ({
							...ing,
							inventoryId: ing.inventoryId ? asId(ing.inventoryId) : undefined,
						}));
					} else {
						hppData.ingredients = [];
					}
					if (parsed.overheadCosts !== undefined) {
						hppData.overheadCosts = parsed.overheadCosts;
					} else {
						hppData.overheadCosts = [];
					}
					if (parsed.productId !== undefined) {
						hppData.productId = asId(parsed.productId);
					}

					await ctx.runMutation(api.hpp.updateHppCalculation, hppData as any);
					result = {
						success: true,
						message: "Kalkulasi HPP berhasil diupdate",
					};
					break;
				}

				case "deleteHppCalculation": {
					const parsed = tools.deleteHppCalculation.parameters.parse(toolArgs);
					await ctx.runMutation(api.hpp.deleteHppCalculation, {
						id: asId(parsed.id),
					});
					result = { success: true, message: "Kalkulasi HPP berhasil dihapus" };
					break;
				}

				case "syncHppWithInventoryPrices": {
					const parsed =
						tools.syncHppWithInventoryPrices.parameters.parse(toolArgs);
					result = await ctx.runMutation(api.hpp.syncHppWithInventoryPrices, {
						id: asId(parsed.id),
					});
					break;
				}

				// ============================================
				// HPP SELLING PRICE UPDATE
				// ============================================
				case "updateHppSellingPrice": {
					const parsed = tools.updateHppSellingPrice.parameters.parse(toolArgs);
					result = await ctx.runMutation(api.hpp.updateHppSellingPrice, {
						id: asId(parsed.id),
						sellingPrice: parsed.sellingPrice,
					});
					break;
				}

				// ============================================
				// FINANCIAL TARGET TOOLS
				// ============================================
				case "setFinancialTarget": {
					const parsed = tools.setFinancialTarget.parameters.parse(toolArgs);
					result = await ctx.runMutation(api.finance.setFinancialTarget, {
						month: parsed.month,
						targetRevenue: parsed.targetRevenue,
						targetProfit: parsed.targetProfit,
						notes: parsed.notes,
					});
					break;
				}

				// ============================================
				// STORE SETTINGS TOOLS
				// ============================================
				case "updateStoreSettings": {
					const _parsed = tools.updateStoreSettings.parameters.parse(toolArgs);
					// Store settings are stored in a different way
					// For now, just return success
					result = {
						success: true,
						message: "Pengaturan toko berhasil diupdate (simulasi)",
					};
					break;
				}

				// ============================================
			// DISCOUNT EFFECTIVENESS TOOLS
			// ============================================
			case "analyzeDiscountEffectiveness": {
				const discountAnalysis = await ctx.runQuery(
					api.ai.analyzeDiscountEffectiveness
				);
				result = discountAnalysis;
				break;
			}

			// ============================================
			// FINANCIAL RECONCILIATION TOOLS
			// ============================================
			case "createReconciliationTransaction": {
				const parsed =
					tools.createReconciliationTransaction.parameters.parse(toolArgs);
				result = await ctx.runMutation(api.finance.createTransaction, {
					type: "income",
					amount: parsed.amount,
					category: parsed.category || "Rekonsiliasi",
					description: parsed.description,
					date: Date.now(),
					paymentMethod: "rekonsiliasi",
					status: "completed",
				});
				break;
			}

			// ============================================
			// BOOKING TOOLS
			// ============================================
				case "updateBookingStatus": {
					const parsed = tools.updateBookingStatus.parameters.parse(toolArgs);
					await ctx.runMutation(api.booking.updateBookingStatus, {
						id: asId(parsed.id),
						bookingStatus: parsed.bookingStatus,
						paymentStatus: parsed.paymentStatus,
					});
					result = {
						success: true,
						message: `Booking berhasil diupdate${parsed.bookingStatus ? ` - status: ${parsed.bookingStatus}` : ""}${parsed.paymentStatus ? ` - pembayaran: ${parsed.paymentStatus}` : ""}`,
					};
					break;
				}

				case "createBooking": {
					const parsed = tools.createBooking.parameters.parse(toolArgs);
					result = await ctx.runMutation(api.booking.createBookingOrder, {
						customerName: parsed.customerName,
						customerPhone: parsed.customerPhone,
						customerEmail: parsed.customerEmail,
						bookingDate: parsed.bookingDate,
						guestCount: parsed.guestCount,
						totalAmount: parsed.totalAmount,
						paymentMethod: parsed.paymentMethod,
						items: parsed.items,
						notes: parsed.notes,
						slug: parsed.slug || "booking",
					});
					break;
				}

				case "bulkCreateBookings": {
					const parsed = tools.bulkCreateBookings.parameters.parse(toolArgs);
					const results = [];
					for (const booking of parsed.bookings) {
						const id = await ctx.runMutation(api.booking.createBookingOrder, {
							...booking,
							slug: booking.slug || "booking",
						});
						results.push(id);
					}
					result = {
						success: true,
						count: results.length,
						ids: results,
					};
					break;
				}

			default:
					return {
						success: false,
						error: `Tool tidak dikenali: ${toolName}`,
					};
			}

			return {
				success: true,
				result,
				toolName,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				toolName,
			};
		}
	},
});
