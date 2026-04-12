import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	// Categories for Menu
	categories: defineTable({
		name: v.string(),
		order: v.number(),
		parentId: v.optional(v.id("categories")), // For Sub-Categories
		track: v.optional(v.union(v.literal("kitchen"), v.literal("bar"))),
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
		quantity: v.optional(v.number()), // Jumlah stok tersisa
		menuNumber: v.optional(v.number()), // Nomor urut di menu
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
		defaultBrandName: v.optional(v.string()),
		preferredStoreId: v.optional(v.id("inventoryStores")),
		aliases: v.optional(v.array(v.string())),
		lastPurchasePrice: v.optional(v.number()),
		lastPurchaseAt: v.optional(v.number()),
		lastPurchaseStoreId: v.optional(v.id("inventoryStores")),
	}),

	inventoryStores: defineTable({
		name: v.string(),
		type: v.union(
			v.literal("store"),
			v.literal("supplier"),
			v.literal("market"),
			v.literal("other")
		),
		phone: v.optional(v.string()),
		address: v.optional(v.string()),
		notes: v.optional(v.string()),
		isActive: v.boolean(),
	}).index("by_name", ["name"]),

	// Transactions to track stock in/out for FIFO
	inventoryTransactions: defineTable({
		inventoryId: v.id("inventory"),
		quantity: v.number(), // Positive for restock, Negative for usage
		type: v.union(
			v.literal("restock"),
			v.literal("usage"),
			v.literal("adjustment"),
			v.literal("production"), // For base recipes
			v.literal("costing_reference") // Cost reference without changing stock
		),
		costPerUnit: v.optional(v.number()), // For calculating COGS
		remainingQuantity: v.optional(v.number()), // For FIFO tracking
		timestamp: v.number(),
		notes: v.optional(v.string()),
		expiryDate: v.optional(v.number()),
		brandName: v.optional(v.string()),
		storeId: v.optional(v.id("inventoryStores")),
		purchaseUnit: v.optional(v.string()),
		purchaseQuantity: v.optional(v.number()),
		lineTotal: v.optional(v.number()),
		sourceTransactionId: v.optional(v.id("financialTransactions")),
		sourceLabel: v.optional(v.string()),
		sourceFingerprint: v.optional(v.string()),
	}).index("by_inventory", ["inventoryId"])
		.index("by_inventory_and_type", ["inventoryId", "type"])
		.index("by_inventory_and_timestamp", ["inventoryId", "timestamp"])
		.index("by_type_and_timestamp", ["type", "timestamp"])
		.index("by_source_transaction_id", ["sourceTransactionId"]),

	// Base Recipes / Compositions (Pre-mixes)
	baseRecipes: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		category: v.optional(v.string()), // e.g., "Base Susu", "Base Sauce"
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
		bookingOrderId: v.optional(v.id("bookingOrders")),
		attachmentUrl: v.optional(v.string()),
		sourceFingerprint: v.optional(v.string()),
		isRecurring: v.optional(v.boolean()),
		recurringInterval: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
		tags: v.optional(v.array(v.string())),
		metadata: v.optional(
			v.object({
				source: v.optional(v.string()),
				inputMode: v.optional(v.string()),
				aiSessionId: v.optional(v.string()),
				importedAt: v.optional(v.number()),
				rawText: v.optional(v.string()),
				sourceRef: v.optional(v.string()),
				sourceLabel: v.optional(v.string()),
				syncSource: v.optional(v.string()),
				syncOutcome: v.optional(v.string()),
				syncWarnings: v.optional(v.array(v.string())),
				ocrConfidence: v.optional(v.number()),
				receiptDetails: v.optional(
					v.object({
						merchantName: v.optional(v.string()),
						receiptNumber: v.optional(v.string()),
						date: v.optional(v.string()),
						time: v.optional(v.string()),
						subtotal: v.optional(v.number()),
						tax: v.optional(v.number()),
						serviceCharge: v.optional(v.number()),
						discount: v.optional(v.number()),
						total: v.optional(v.number()),
					})
				),
				scanItems: v.optional(
					v.array(
						v.object({
							name: v.string(),
							quantity: v.number(),
							price: v.optional(v.number()),
							total: v.optional(v.number()),
							unit: v.optional(v.string()),
						})
					)
				),
			})
		),
	})
		.index("by_date", ["date"])
		.index("by_type", ["type"])
		.index("by_type_and_date", ["type", "date"])
		.index("by_status_and_date", ["status", "date"])
		.index("by_source_ref_and_date", ["metadata.sourceRef", "date"])
		.index("by_source_fingerprint", ["sourceFingerprint"]),

	// Orders
	orders: defineTable({
		orderNumber: v.string(), // Friendly ID e.g., "ORD-D-AB12CD"
		items: v.array(
			v.object({
				productId: v.id("products"),
				productName: v.string(),
				variant: v.optional(v.string()), // description of selected variants
				quantity: v.number(),
				price: v.number(),
				originalPrice: v.optional(v.number()),
				hppSnapshot: v.optional(
					v.object({
						hppCalculationId: v.optional(v.id("hppCalculations")),
						productId: v.id("products"),
						productName: v.string(),
						hppPerUnit: v.number(),
						quantity: v.number(),
						totalHpp: v.number(),
						sellingPricePerUnit: v.number(),
						source: v.union(v.literal("calculation"), v.literal("fallback")),
						recordedAt: v.number(),
					})
				),
				status: v.optional(v.union(v.literal("pending"), v.literal("preparing"), v.literal("ready"))),
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
		tableNumber: v.optional(v.string()),
		orderType: v.optional(v.union(v.literal("dine_in"), v.literal("takeaway"))),
		source: v.optional(
			v.union(
				v.literal("pos"),
				v.literal("customer_self_service"),
				v.literal("booking")
			)
		),
		brandSlug: v.optional(v.string()),
		guestCount: v.optional(v.number()),
		freeRefillSelected: v.optional(v.boolean()),
		dessertLater: v.optional(v.boolean()),
		notes: v.optional(v.string()),
		createdAt: v.number(),
		voucherId: v.optional(v.id("discounts")),
		discountAmount: v.optional(v.number()),
		taxAmount: v.optional(v.number()),
		serviceChargeAmount: v.optional(v.number()),
		receiptMeta: v.optional(
			v.object({
				promotionLabels: v.optional(v.array(v.string())),
				adjustmentLines: v.optional(
					v.array(
						v.object({
							label: v.string(),
							amount: v.number(),
						})
					)
				),
			})
		),
		paymentReceiptKind: v.optional(
			v.union(
				v.literal("cashier_pending"),
				v.literal("gateway_paid"),
				v.literal("manual_qris_pending"),
				v.literal("transfer_pending")
			)
		),
		paymentGateway: v.optional(
			v.object({
				provider: v.string(),
				invoiceId: v.string(),
				transactionId: v.optional(v.string()),
				invoiceUrl: v.optional(v.string()),
				status: v.union(
					v.literal("created"),
					v.literal("pending"),
					v.literal("paid"),
					v.literal("expired"),
					v.literal("cancelled"),
					v.literal("failed")
				),
				paidAt: v.optional(v.number()),
			})
		),
		gatewayInvoiceId: v.optional(v.string()),
	})
		.index("by_status", ["status"])
		.index("by_createdAt", ["createdAt"])
		.index("by_gateway_invoice_id", ["gatewayInvoiceId"]),

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
		headerLogoUrl: v.optional(v.string()),
		faviconUrl: v.optional(v.string()),
		pwaIcon192Url: v.optional(v.string()),
		pwaIcon512Url: v.optional(v.string()),
		pwaMaskableIconUrl: v.optional(v.string()),
		seoMetaTitle: v.optional(v.string()),
		seoMetaDescription: v.optional(v.string()),
		seoMetaKeywords: v.optional(v.string()),
		seoShareTitle: v.optional(v.string()),
		seoShareDescription: v.optional(v.string()),
		seoShareImageUrl: v.optional(v.string()),
		seoCanonicalUrl: v.optional(v.string()),
		paymentPopupImage: v.optional(v.string()), // URL for POS payment popup
		storeName: v.optional(v.string()),
		storeAddress: v.optional(v.string()),
		storePhone: v.optional(v.string()),
		resendFromEmail: v.optional(v.string()),
		receiptFooter: v.optional(v.string()),
		autoPrint: v.optional(v.boolean()),
		autoPrintKitchenReceipt: v.optional(v.boolean()),
		allowOpenBillPrint: v.optional(v.boolean()),
		// App Branding
		appName: v.optional(v.string()), // e.g., "Murni POS", "Yumi POS"
		appVersion: v.optional(v.string()), // e.g., "1.0.0"
		developerName: v.optional(v.string()), // e.g., "Zantara Technology"
		// Mayar Payment Gateway
		mayarEnabled: v.optional(v.boolean()),
		mayarTestMode: v.optional(v.boolean()),
		paymentMethodsManual: v.optional(
			v.object({
				cash: v.boolean(),
				qris: v.boolean(),
				transfer: v.boolean(),
			})
		),
		taxRate: v.optional(v.number()),
		serviceChargeRate: v.optional(v.number()),
		qrisImage: v.optional(v.string()), 
		// Receipt Customization
		receiptLogo: v.optional(v.string()),
		receiptHeader: v.optional(v.string()),
		receiptShowLogo: v.optional(v.boolean()),
		receiptShowAddress: v.optional(v.boolean()),
		receiptShowPhone: v.optional(v.boolean()),
		receiptShowOrderNumber: v.optional(v.boolean()),
		receiptShowCustomerName: v.optional(v.boolean()),
		receiptShowCashierName: v.optional(v.boolean()),
		receiptShowNotes: v.optional(v.boolean()),
		receiptFontSize: v.optional(v.string()),
		aiModelConfig: v.optional(
			v.object({
				ocrVisionModel: v.optional(v.string()),
				chatTextModel: v.optional(v.string()),
				synthesisModel: v.optional(v.string()),
				analyticsModel: v.optional(v.string()),
				fallbackModel: v.optional(v.string()),
			})
		),
		shiftSettings: v.optional(
			v.object({
				predefinedShifts: v.optional(v.array(v.string())),
				defaultStartingCash: v.optional(v.number()),
				reminderMinutesBeforeClose: v.optional(v.number()),
				autoSendShiftReportEmail: v.optional(v.boolean()),
				shiftSchedules: v.optional(
					v.array(
						v.object({
							name: v.string(),
							openTime: v.optional(v.string()),
							closeTime: v.optional(v.string()),
						})
					)
				),
			})
		),
		customerOrdering: v.optional(
			v.object({
				enabled: v.optional(v.boolean()),
				welcomeTitle: v.optional(v.string()),
				welcomeSubtitle: v.optional(v.string()),
				welcomeButtonLabel: v.optional(v.string()),
				enablePartySizeSelection: v.optional(v.boolean()),
				enableFreeRefillPrompt: v.optional(v.boolean()),
				enableBarcodeScan: v.optional(v.boolean()),
				enableMenuNumberEntry: v.optional(v.boolean()),
				enableCatalogBrowsing: v.optional(v.boolean()),
				enableStaffCall: v.optional(v.boolean()),
				enableDessertLater: v.optional(v.boolean()),
				requireTableNumber: v.optional(v.boolean()),
				cashPaymentLabel: v.optional(v.string()),
				mayarPaymentLabel: v.optional(v.string()),
			})
		),
	}),

	customerServiceRequests: defineTable({
		brandSlug: v.string(),
		orderId: v.optional(v.id("orders")),
		orderNumber: v.optional(v.string()),
		requestType: v.union(v.literal("call_staff"), v.literal("bring_dessert")),
		status: v.union(
			v.literal("pending"),
			v.literal("acknowledged"),
			v.literal("completed"),
			v.literal("cancelled")
		),
		tableNumber: v.optional(v.string()),
		customerName: v.optional(v.string()),
		notes: v.optional(v.string()),
		source: v.optional(v.union(v.literal("customer_page"), v.literal("admin"))),
		createdAt: v.number(),
		resolvedAt: v.optional(v.number()),
	})
		.index("by_status", ["status"])
		.index("by_brandSlug_and_status", ["brandSlug", "status"])
		.index("by_orderId", ["orderId"])
		.index("by_createdAt", ["createdAt"]),

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
		// Happy Hour specific
		isHappyHour: v.optional(v.boolean()),
		productPrices: v.optional(
			v.array(
				v.object({
					productId: v.string(),
					price: v.number(),
				})
			)
		),
		// Free Refill Promo specific
		isFreeRefill: v.optional(v.boolean()),
		refillPrice: v.optional(v.number()),
		refillAvailability: v.optional(
			v.union(v.literal("ALWAYS"), v.literal("HAPPY_HOUR"))
		),
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
		sourceType: v.optional(v.union(v.literal("manual"), v.literal("recipe_based"))),
		lastCostSyncAt: v.optional(v.number()),
		lastRecipeSyncAt: v.optional(v.number()),
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
		homePin: v.optional(v.string()),
		name: v.string(),
		roleId: v.id("roles"),
		isActive: v.boolean(),
		receiveReportEmails: v.optional(v.boolean()),
		lastLogin: v.optional(v.number()),
		authUserId: v.optional(v.string()), // ID from Better Auth
		faceDescriptor: v.optional(v.array(v.number())), // Facial biometric data
		slug: v.optional(v.string()), // Unique username for URL profile
	})
		.index("by_username", ["username"])
		.index("by_role", ["roleId"])
		.index("by_homePin", ["homePin"])
		.index("by_auth_user_id", ["authUserId"])
		.index("by_slug", ["slug"]),

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

	// Buffer for real-time AI streaming
	streamingMessages: defineTable({
		sessionId: v.string(),
		content: v.string(),
		status: v.union(v.literal("streaming"), v.literal("completed"), v.literal("error")),
		lastUpdated: v.number(),
	}).index("by_session", ["sessionId"]),

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

	// Financial Targets (monthly revenue goals)
	financialTargets: defineTable({
		month: v.string(), // "YYYY-MM" format
		targetRevenue: v.number(),
		targetProfit: v.optional(v.number()),
		notes: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_month", ["month"]),
	
	// Shift Management
	shifts: defineTable({
		cashierName: v.string(),
		shiftName: v.string(),
		teamMembers: v.optional(v.string()),
		startTime: v.number(),
		endTime: v.optional(v.number()),
		startingCash: v.number(), // Modal Awal
		endingCashPhysical: v.optional(v.number()), // Uang Fisik di Laci
		endingCashExpected: v.optional(v.number()), // Calculated by system
		nonCashConfirmed: v.optional(v.number()), // Manual input for QRIS/EDC
		nonCashExpected: v.optional(v.number()), // Calculated by system
		cashBreakdown: v.optional(
			v.object({
				bill100000: v.number(),
				bill50000: v.number(),
				bill20000: v.number(),
				bill10000: v.number(),
				bill5000: v.number(),
				bill2000: v.number(),
				bill1000: v.number(),
				bill500: v.number(),
				bill200: v.number(),
				bill100: v.number(),
			})
		),
		notes: v.optional(v.string()),
		closingTasks: v.optional(v.array(v.string())),
		summary: v.optional(
			v.object({
				totalRevenue: v.number(),
				totalExpenses: v.number(),
				totalItemsSold: v.number(),
				cashRevenue: v.number(),
				qrisRevenue: v.number(),
				totalDiscount: v.number(),
			})
		),
	})
		.index("by_startTime", ["startTime"])
		.index("by_endTime", ["endTime"]),

	// Attendance Tracking
	attendance: defineTable({
		userId: v.id("users"),
		type: v.union(v.literal("check_in"), v.literal("check_out")),
		timestamp: v.number(),
		photoUrl: v.optional(v.string()),
		notes: v.optional(v.string()),
		location: v.optional(
			v.object({
				lat: v.number(),
				lng: v.number(),
				address: v.optional(v.string()),
			})
		),
	})
		.index("by_user", ["userId"])
		.index("by_timestamp", ["timestamp"])
		.index("by_user_and_timestamp", ["userId", "timestamp"]),

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
		qrisImage: v.optional(v.string()),
		isActive: v.boolean(),
		customFields: v.optional(
			v.array(
				v.object({
					id: v.string(),
					label: v.string(),
					type: v.string(), // "text", "number", "dropdown", "checkbox"
					required: v.boolean(),
					placeholder: v.optional(v.string()),
					options: v.optional(v.array(v.string())), // for dropdown
				})
			)
		),
	}).index("by_slug", ["slug"]),

	// Customer booking orders
	bookingOrders: defineTable({
		slug: v.string(),
		bookingCode: v.string(),
		customerName: v.string(),
		customerPhone: v.string(),
		customerEmail: v.string(),
		notes: v.optional(v.string()),
		bookingDate: v.string(), // "YYYY-MM-DD"
		items: v.array(
			v.object({
				productId: v.string(),
				name: v.string(),
				price: v.number(),
				quantity: v.number(),
			})
		),
		totalAmount: v.number(),
		paymentMethod: v.string(),
		paymentStatus: v.union(
			v.literal("pending"),
			v.literal("paid"),
			v.literal("cancelled")
		),
		bookingStatus: v.union(
			v.literal("pending"),
			v.literal("confirmed"),
			v.literal("cancelled"),
			v.literal("completed")
		),
		guestCount: v.optional(v.number()),
		tableCount: v.optional(v.number()),
		paymentProofImage: v.optional(v.string()),
		transferredAmount: v.optional(v.number()),
		customAnswers: v.optional(v.any()), // Map of field ID to value
		createdAt: v.number(),
	})
		.index("by_slug", ["slug"])
		.index("by_slug_date", ["slug", "bookingDate"])
		.index("by_booking_code", ["bookingCode"])
		.index("by_createdAt", ["createdAt"]),

	// Admin-set capacity limits per date
	bookingDateCapacity: defineTable({
		slug: v.string(),
		date: v.string(), // "YYYY-MM-DD"
		maxPeople: v.number(),
		maxTables: v.number(),
		peoplePerTable: v.number(),
		notes: v.optional(v.string()),
	}).index("by_slug_date", ["slug", "date"]),

	// Resend webhook events (delivery status, bounce, complaint, dll)
	resendWebhookEvents: defineTable({
		provider: v.literal("resend"),
		eventType: v.string(),
		emailId: v.optional(v.string()),
		webhookId: v.optional(v.string()),
		createdAt: v.optional(v.number()),
		receivedAt: v.number(),
		signatureValid: v.boolean(),
		payload: v.any(),
	})
		.index("by_eventType", ["eventType"])
		.index("by_emailId", ["emailId"])
		.index("by_receivedAt", ["receivedAt"]),
});
