import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	// Categories for Menu
	categories: defineTable({
		name: v.string(),
		order: v.number(),
	}),

	// Products with variations and pricing
	products: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		price: v.number(),
		promoPrice: v.optional(v.number()),
		categoryId: v.id("categories"),
		image: v.optional(v.string()), // URL to storage or external
		isAvailable: v.boolean(),
		// Flexible variations structure (e.g., Size, Sugar Level, Toppings)
		// schema: [{ type: "Size", options: [{ name: "Large", price: 5000 }] }]
		variations: v.optional(v.any()),
	}).index("by_category", ["categoryId"]),

	// Inventory Management (FIFO support)
	inventory: defineTable({
		ingredientName: v.string(), // e.g., "Milk", "Coffee Beans"
		unit: v.string(), // e.g., "ml", "gram" (Base unit)
		quantity: v.number(), // Total current stock in base unit
		lowStockThreshold: v.number(),
		displayUnit: v.optional(v.string()), // e.g., "Liter"
		conversionFactor: v.optional(v.number()), // e.g., 1000
		baseRecipeId: v.optional(v.id("baseRecipes")), // If this is a pre-mix
	}),

	// Transactions to track stock in/out for FIFO
	inventoryTransactions: defineTable({
		inventoryId: v.id("inventory"),
		quantity: v.number(), // Positive for restock, Negative for usage
		type: v.union(
			v.literal("restock"),
			v.literal("usage"),
			v.literal("adjustment"),
			v.literal("production") // For base recipes
		),
		costPerUnit: v.optional(v.number()), // For calculating COGS
		timestamp: v.number(),
		notes: v.optional(v.string()),
		expiryDate: v.optional(v.number()),
	}).index("by_inventory", ["inventoryId"]),

	// Base Recipes / Compositions (Pre-mixes)
	baseRecipes: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		targetUnit: v.string(), // Unit produced (ml, liter, etc.)
		targetQuantity: v.number(), // Quantity produced in one batch
		ingredients: v.array(
			v.object({
				inventoryId: v.id("inventory"),
				amount: v.number(),
			})
		),
	}),

	// Financial Transactions
	financialTransactions: defineTable({
		type: v.union(v.literal("income"), v.literal("expense")),
		amount: v.number(),
		category: v.string(), // e.g. "Sales", "Rent", "Salary"
		merchant: v.optional(v.string()), // Store/Merchant name
		description: v.optional(v.string()),
		date: v.number(), // Timestamp
		paymentMethod: v.optional(v.string()),
		status: v.union(
			v.literal("completed"),
			v.literal("pending"),
			v.literal("cancelled")
		),
		orderId: v.optional(v.id("orders")),
	})
		.index("by_date", ["date"])
		.index("by_type", ["type"]),

	// Orders
	orders: defineTable({
		orderNumber: v.string(), // Friendly ID e.g., "A-001"
		items: v.array(
			v.object({
				productId: v.id("products"),
				productName: v.string(),
				variant: v.optional(v.string()), // description of selected variants
				quantity: v.number(),
				price: v.number(),
			})
		),
		totalAmount: v.number(),
		status: v.union(
			v.literal("pending"),
			v.literal("paid"),
			v.literal("completed"),
			v.literal("cancelled")
		),
		paymentMethod: v.string(), // "qris", "cash", "credit_card"
		customerName: v.optional(v.string()),
		createdAt: v.number(),
		voucherId: v.optional(v.id("discounts")),
		discountAmount: v.optional(v.number()),
	})
		.index("by_status", ["status"])
		.index("by_createdAt", ["createdAt"]),

	// AI Insights
	salesInsights: defineTable({
		date: v.string(), // YYYY-MM-DD
		summary: v.string(),
		recommendations: v.array(v.string()),
		generatedAt: v.number(),
	}),

	// Site Configuration
	siteSettings: defineTable({
		landingIcon: v.optional(v.string()), // Lucide icon name or image URL
		landingTitle: v.string(),
		landingDescription: v.string(),
		landingButtonText: v.string(),
		logoUrl: v.optional(v.string()),
		paymentPopupImage: v.optional(v.string()), // URL for POS payment popup
		storeName: v.optional(v.string()),
		storeAddress: v.optional(v.string()),
		storePhone: v.optional(v.string()),
		receiptFooter: v.optional(v.string()),
		autoPrint: v.optional(v.boolean()),
		// App Branding
		appName: v.optional(v.string()), // e.g., "Murni POS", "Yumi POS"
		appVersion: v.optional(v.string()), // e.g., "1.0.0"
		developerName: v.optional(v.string()), // e.g., "Zantara Technology"
		// Mayar Payment Gateway
		mayarEnabled: v.optional(v.boolean()),
		mayarTestMode: v.optional(v.boolean()),
	}),

	// Discounts / Vouchers
	discounts: defineTable({
		name: v.string(),
		code: v.optional(v.string()), // For manual entry if needed, or unique ID
		type: v.union(
			v.literal("FIXED"),
			v.literal("PERCENTAGE"),
			v.literal("FLAT_PRICE")
		),
		value: v.number(),
		targetType: v.union(
			v.literal("ALL"),
			v.literal("CATEGORY"),
			v.literal("PRODUCT")
		),
		targetId: v.optional(v.string()), // ID of category or product (legacy)
		targetIds: v.optional(v.array(v.string())), // Multiple IDs of category or product
		formattedId: v.optional(v.string()), // Optional formatted ID for display
		isActive: v.boolean(),
		// Advanced Promo Fields
		minOrderValue: v.optional(v.number()),
		startDate: v.optional(v.number()), // Timestamp
		endDate: v.optional(v.number()), // Timestamp
		startTime: v.optional(v.string()), // "HH:mm"
		endTime: v.optional(v.string()), // "HH:mm"
		days: v.optional(v.array(v.number())), // 0-6 (Sun-Sat)
	}),

	// Variation Presets (Global configurations)
	variationPresets: defineTable({
		name: v.string(), // e.g., "Level Pedas", "Ukuran"
		options: v.array(
			v.object({
				name: v.string(), // e.g., "Level 1", "Large"
				price: v.number(), // Additional price
			})
		),
	}),

	// Recipes linking products/variants to inventory
	recipes: defineTable({
		productId: v.id("products"),
		variantName: v.optional(v.string()), // Optional, if linked to a specific variant
		ingredients: v.array(
			v.object({
				inventoryId: v.id("inventory"),
				amount: v.number(), // Quantity per item
			})
		),
	})
		.index("by_product", ["productId"])
		.index("by_product_variant", ["productId", "variantName"]),

	// HPP Calculations (Harga Pokok Produksi / Cost of Goods Sold)
	hppCalculations: defineTable({
		name: v.string(), // Calculation name, e.g., "HPP Susu Coklat per Gelas"
		description: v.optional(v.string()),
		// Raw material items used
		ingredients: v.array(
			v.object({
				inventoryId: v.optional(v.id("inventory")), // Link to inventory if available
				ingredientName: v.string(),
				purchasePrice: v.number(), // Total purchase price
				purchaseQuantity: v.number(), // How much purchased
				purchaseUnit: v.string(), // e.g., "liter", "kg", "box"
				usagePerServing: v.number(), // Amount used per serving
				usageUnit: v.string(), // e.g., "ml", "gram"
				conversionFactor: v.number(), // How many usageUnit in 1 purchaseUnit (e.g., 1 liter = 1000 ml)
			})
		),
		// Overhead costs (packaging, gas, electricity, etc.)
		overheadCosts: v.array(
			v.object({
				name: v.string(), // e.g., "Cup Plastik", "Sedotan", "Gas LPG"
				costPerServing: v.number(), // Cost per serving
			})
		),
		servingsPerBatch: v.number(), // How many servings produced per batch
		sellingPrice: v.number(), // Target selling price per serving
		productId: v.optional(v.id("products")), // Link to a product if applicable
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_product", ["productId"]),

	// Roles for RBAC
	roles: defineTable({
		name: v.string(), // e.g., "admin", "cashier"
		permissions: v.array(v.string()), // e.g., ["manage_users", "view_reports"]
	}).index("by_name", ["name"]),

	// Users for Custom Auth & Profile
	users: defineTable({
		username: v.string(),
		password: v.optional(v.string()), // Hashed (Optional for Better Auth users)
		name: v.string(),
		roleId: v.id("roles"),
		isActive: v.boolean(),
		lastLogin: v.optional(v.number()),
		authUserId: v.optional(v.string()), // ID from Better Auth
	})
		.index("by_username", ["username"])
		.index("by_role", ["roleId"])
		.index("by_auth_user_id", ["authUserId"]),

	// Scheduled Reports for automatic reporting
	scheduledReports: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		reportType: v.union(
			v.literal("daily"),
			v.literal("weekly"),
			v.literal("monthly")
		),
		dataSources: v.array(
			v.object({
				type: v.union(
					v.literal("sales"),
					v.literal("inventory"),
					v.literal("finance"),
					v.literal("orders"),
					v.literal("products")
				),
				includeDetails: v.optional(v.boolean()),
			})
		),
		schedule: v.object({
			frequency: v.union(
				v.literal("daily"),
				v.literal("weekly"),
				v.literal("monthly")
			),
			hour: v.optional(v.number()),
			dayOfWeek: v.optional(v.number()),
			dayOfMonth: v.optional(v.number()),
		}),
		format: v.union(v.literal("json"), v.literal("pdf"), v.literal("excel")),
		delivery: v.object({
			type: v.union(
				v.literal("email"),
				v.literal("download"),
				v.literal("webhook")
			),
			destination: v.string(),
		}),
		isActive: v.boolean(),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		createdAt: v.number(),
		lastRun: v.optional(v.number()),
		lastResult: v.optional(v.string()),
		nextRunTime: v.optional(v.number()),
	}),

	// Report Templates for AI-generated reports
	reportTemplates: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		template: v.string(), // AI prompt template
		dataSources: v.array(v.string()), // sales, inventory, finance, etc
		createdBy: v.optional(v.id("users")),
		createdAt: v.number(),
		isActive: v.boolean(),
	}),

	// ============================================
	// AI MEMORY & CONTEXT
	// ============================================

	// Conversation Memory for AI context
	conversationMemory: defineTable({
		sessionId: v.string(),
		role: v.union(v.literal("user"), v.literal("assistant")),
		content: v.string(),
		metadata: v.optional(
			v.object({
				imageAttached: v.optional(v.boolean()),
				actionTaken: v.optional(v.string()),
				entities: v.optional(v.array(v.string())),
			})
		),
		timestamp: v.number(),
	})
		.index("by_session", ["sessionId"])
		.index("by_timestamp", ["timestamp"]),

	// User Preferences learned by AI
	userPreferences: defineTable({
		reportFrequency: v.optional(
			v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))
		),
		notifyLowStock: v.optional(v.boolean()),
		notifyPendingOrders: v.optional(v.boolean()),
		suggestedCategories: v.optional(v.array(v.string())),
		preferredCurrency: v.optional(v.string()),
		businessHours: v.optional(
			v.object({
				start: v.optional(v.number()),
				end: v.optional(v.number()),
			})
		),
		createdAt: v.optional(v.number()),
		updatedAt: v.optional(v.number()),
	}),

	// Follow-up Tasks for AI reminders
	followUpTasks: defineTable({
		title: v.string(),
		description: v.string(),
		priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
		status: v.union(
			v.literal("pending"),
			v.literal("completed"),
			v.literal("dismissed")
		),
		dueDate: v.optional(v.number()),
		category: v.union(
			v.literal("inventory"),
			v.literal("orders"),
			v.literal("finance"),
			v.literal("marketing"),
			v.literal("other")
		),
		actionType: v.union(
			v.literal("restock"),
			v.literal("follow_up"),
			v.literal("review"),
			v.literal("create"),
			v.literal("analyze")
		),
		actionData: v.optional(v.any()),
		createdAt: v.number(),
		completedAt: v.optional(v.number()),
		completedBy: v.optional(v.string()),
		dismissalReason: v.optional(v.string()),
	})
		.index("by_status", ["status"])
		.index("by_category", ["category"])
		.index("by_priority", ["priority"])
		.index("by_dueDate", ["dueDate"]),

	// User Action Patterns for AI learning
	userActionPatterns: defineTable({
		action: v.string(), // e.g., "created_expense", "checked_stock"
		context: v.optional(
			v.object({
				category: v.optional(v.string()),
				amount: v.optional(v.number()),
				timeOfDay: v.optional(v.number()),
				dayOfWeek: v.optional(v.number()),
			})
		),
		timestamp: v.number(),
	})
		.index("by_timestamp", ["timestamp"])
		.index("by_action", ["action"]),

	// AI Predictions & Analytics
	aiPredictions: defineTable({
		predictionType: v.union(
			v.literal("stock_out"),
			v.literal("busy_hours"),
			v.literal("revenue"),
			v.literal("demand")
		),
		targetId: v.optional(v.string()), // Product ID, category, etc.
		targetName: v.optional(v.string()),
		prediction: v.any(), // Prediction data
		confidence: v.number(), // 0-1
		validUntil: v.number(), // When prediction expires
		createdAt: v.number(),
		validated: v.optional(v.boolean()), // If prediction was correct
	})
		.index("by_type", ["predictionType"])
		.index("by_validUntil", ["validUntil"]),

	// Anomalies detected by AI
	anomalies: defineTable({
		type: v.union(
			v.literal("unusual_amount"),
			v.literal("duplicate_transaction"),
			v.literal("suspicious_pattern"),
			v.literal("inventory_mismatch")
		),
		description: v.string(),
		severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
		entityId: v.optional(v.string()), // Related transaction/inventory ID
		entityType: v.optional(v.string()), // "transaction", "inventory", etc.
		data: v.optional(v.any()), // Additional data
		status: v.union(
			v.literal("new"),
			v.literal("investigating"),
			v.literal("resolved"),
			v.literal("false_positive")
		),
		createdAt: v.number(),
		resolvedAt: v.optional(v.number()),
		resolvedBy: v.optional(v.string()),
	})
		.index("by_status", ["status"])
		.index("by_severity", ["severity"])
		.index("by_type", ["type"]),

	// Competitor Analysis Data
	competitorAnalysis: defineTable({
		competitorName: v.string(),
		category: v.optional(v.string()), // Product category
		productName: v.optional(v.string()),
		theirPrice: v.number(),
		recommendedPrice: v.number(),
		recommendation: v.string(), // AI pricing suggestion
		confidence: v.number(),
		createdAt: v.number(),
	})
		.index("by_category", ["category"])
		.index("by_competitor", ["competitorName"]),

	// AI Insights Log
	aiInsightsLog: defineTable({
		insightType: v.union(
			v.literal("suggestion"),
			v.literal("warning"),
			v.literal("opportunity"),
			v.literal("prediction")
		),
		title: v.string(),
		content: v.string(),
		category: v.optional(v.string()),
		priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
		status: v.union(
			v.literal("new"),
			v.literal("acknowledged"),
			v.literal("dismissed"),
			v.literal("implemented")
		),
		actionTaken: v.optional(v.string()),
		createdAt: v.number(),
		expiresAt: v.optional(v.number()), // For time-sensitive insights
	})
		.index("by_status", ["status"])
		.index("by_category", ["category"])
		.index("by_priority", ["priority"])
		.index("by_createdAt", ["createdAt"]),

	// Booking Settings for custom booking pages
	bookingSettings: defineTable({
		slug: v.string(),
		title: v.string(),
		description: v.optional(v.string()),
		logoUrl: v.optional(v.string()),
		bannerUrl: v.optional(v.string()),
		themeColor: v.optional(v.string()),
		socialLinks: v.optional(
			v.array(
				v.object({
					platform: v.string(),
					url: v.string(),
					label: v.string(),
				})
			)
		),
		featuredProductIds: v.optional(v.array(v.string())),
		paymentMethods: v.optional(v.array(v.string())),
		bankDetails: v.optional(v.string()),
		isActive: v.boolean(),
	}).index("by_slug", ["slug"]),
});
