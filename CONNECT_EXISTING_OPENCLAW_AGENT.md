# 🔗 Menghubungkan Agent OpenClaw yang Sudah Ada ke TKM POS

## 📋 Prerequisites

Anda sudah memiliki:
- ✅ Agent OpenClaw yang sudah dibuat
- ✅ Agent ID dari OpenClaw dashboard
- ✅ API Key dari OpenClaw
- ✅ Aplikasi TKM POS yang berjalan

---

## 🚀 Langkah-Langkah Integrasi

### Step 1: Dapatkan Credentials dari OpenClaw

1. Login ke [OpenClaw Dashboard](https://app.openclaw.ai)
2. Pilih agent Anda
3. Copy informasi berikut:
   - **Agent ID**: `agent_xxxxxxxxxxxxx`
   - **API Key**: `sk_xxxxxxxxxxxxx`
   - **Webhook URL** (yang akan kita setup)

---

### Step 2: Setup Environment Variables

Tambahkan ke `packages/backend/.env.local`:

```env
# OpenClaw Agent Configuration
OPENCLAW_API_KEY=sk_your_actual_api_key_here
OPENCLAW_AGENT_ID=agent_your_actual_agent_id_here
OPENCLAW_WEBHOOK_SECRET=your_webhook_secret_here

# Base URL aplikasi Anda (untuk webhook)
CONVEX_SITE_URL=https://your-app.convex.site
```

Juga tambahkan ke `apps/web/.env.local`:

```env
VITE_OPENCLAW_AGENT_ID=agent_your_actual_agent_id_here
```

---

### Step 3: Install Dependencies

```bash
# Di root project
bun add @openclaw/sdk axios

# Atau jika menggunakan npm
npm install @openclaw/sdk axios
```

---

### Step 4: Buat OpenClaw Integration Layer

#### 4.1 Create Client File

Buat file: `packages/backend/convex/openclaw.ts`

```typescript
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Send message to OpenClaw agent and get response
 */
export const chat = action({
  args: {
    message: v.string(),
    conversationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.OPENCLAW_API_KEY;
    const agentId = process.env.OPENCLAW_AGENT_ID;

    if (!apiKey || !agentId) {
      throw new Error("OpenClaw credentials not configured");
    }

    try {
      // Call OpenClaw API
      const response = await fetch("https://api.openclaw.ai/v1/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          message: args.message,
          conversation_id: args.conversationId,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenClaw API error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        message: data.message,
        conversationId: data.conversation_id,
        actions: data.actions || [],
      };
    } catch (error) {
      console.error("OpenClaw chat error:", error);
      throw new Error("Failed to communicate with OpenClaw agent");
    }
  },
});

/**
 * Handle tool/action calls from OpenClaw agent
 * This is called by OpenClaw when agent needs to execute an action
 */
export const executeToolCall = internalAction({
  args: {
    toolName: v.string(),
    parameters: v.any(),
  },
  handler: async (ctx, args) => {
    const { toolName, parameters } = args;

    console.log(`Executing tool: ${toolName}`, parameters);

    try {
      switch (toolName) {
        // Product Management
        case "get_products":
          return await ctx.runQuery(internal.products.getProducts, {
            categoryId: parameters.categoryId,
          });

        case "get_product_by_id":
          return await ctx.runQuery(internal.products.getProductById, {
            id: parameters.productId,
          });

        case "search_products":
          return await ctx.runQuery(internal.products.searchProducts, {
            query: parameters.query,
          });

        // Inventory Management
        case "get_inventory":
          return await ctx.runQuery(internal.inventory.getInventory);

        case "get_low_stock_items":
          const inventory = await ctx.runQuery(internal.inventory.getInventory);
          return inventory.filter(
            (item: any) => item.quantity <= item.lowStockThreshold
          );

        case "update_stock":
          if (parameters.type === "add") {
            return await ctx.runMutation(internal.inventory.addStock, {
              inventoryId: parameters.inventoryId,
              quantity: parameters.quantity,
              notes: parameters.notes || "Updated by OpenClaw agent",
            });
          } else if (parameters.type === "usage") {
            return await ctx.runMutation(internal.inventory.usageStock, {
              inventoryId: parameters.inventoryId,
              quantity: parameters.quantity,
              notes: parameters.notes || "Updated by OpenClaw agent",
            });
          }
          break;

        // Order Management
        case "get_orders":
          return await ctx.runQuery(internal.orders.getOrders, {
            status: parameters.status,
          });

        case "create_order":
          return await ctx.runMutation(internal.orders.createOrder, {
            items: parameters.items,
            totalAmount: parameters.totalAmount,
            paymentMethod: parameters.paymentMethod || "cash",
            customerName: parameters.customerName,
          });

        case "update_order_status":
          return await ctx.runMutation(internal.orders.updateOrderStatus, {
            id: parameters.orderId,
            status: parameters.status,
          });

        case "get_order_by_number":
          const orders = await ctx.runQuery(internal.orders.getOrders, {});
          return orders.find(
            (order: any) => order.orderNumber === parameters.orderNumber
          );

        // Financial Reports
        case "get_financial_summary":
          return await ctx.runQuery(internal.finance.getFinancialSummary, {
            startDate: parameters.startDate,
            endDate: parameters.endDate,
          });

        case "get_sales_report":
          const allOrders = await ctx.runQuery(internal.orders.getOrders, {});
          const startDate = parameters.startDate || 0;
          const endDate = parameters.endDate || Date.now();

          const filteredOrders = allOrders.filter(
            (order: any) =>
              order.createdAt >= startDate &&
              order.createdAt <= endDate &&
              (order.status === "completed" || order.status === "paid")
          );

          const totalSales = filteredOrders.reduce(
            (sum: number, order: any) => sum + order.totalAmount,
            0
          );

          return {
            totalOrders: filteredOrders.length,
            totalSales,
            averageOrderValue:
              filteredOrders.length > 0 ? totalSales / filteredOrders.length : 0,
            orders: filteredOrders,
          };

        // AI Predictions
        case "predict_stockout":
          const inventoryData = await ctx.runQuery(
            internal.inventory.getInventory
          );
          const recentOrders = await ctx.runQuery(internal.orders.getOrders, {});

          return await ctx.runAction(internal.ai.predictStockOut, {
            inventoryData: JSON.stringify(inventoryData),
            recentSalesTrend: JSON.stringify(recentOrders.slice(0, 50)),
          });

        case "get_business_insights":
          const financeSummary = await ctx.runQuery(
            internal.finance.getFinancialSummary,
            {}
          );
          const inventorySummary = await ctx.runQuery(
            internal.inventory.getInventory
          );
          const ordersSummary = await ctx.runQuery(internal.orders.getOrders, {});

          return await ctx.runAction(internal.ai.generateCompanyOverview, {
            financeSummary: JSON.stringify(financeSummary),
            inventorySummary: JSON.stringify({
              totalItems: inventorySummary.length,
              lowStockCount: inventorySummary.filter(
                (i: any) => i.quantity <= i.lowStockThreshold
              ).length,
            }),
            ordersSummary: JSON.stringify({
              totalOrders: ordersSummary.length,
              totalSales: ordersSummary.reduce(
                (sum: number, o: any) => sum + o.totalAmount,
                0
              ),
            }),
          });

        // Discount Management
        case "get_active_discounts":
          return await ctx.runQuery(internal.discounts.getActiveDiscounts);

        case "create_discount":
          return await ctx.runMutation(internal.discounts.createDiscount, {
            name: parameters.name,
            type: parameters.type,
            value: parameters.value,
            targetType: parameters.targetType,
            isActive: true,
          });

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      console.error(`Tool execution error (${toolName}):`, error);
      throw error;
    }
  },
});

/**
 * Register available tools with OpenClaw agent
 * Call this once to sync tools with your agent
 */
export const registerTools = action({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.OPENCLAW_API_KEY;
    const agentId = process.env.OPENCLAW_AGENT_ID;

    const tools = [
      {
        name: "get_products",
        description:
          "Get all products with details, prices, and availability. Can filter by category.",
        parameters: {
          type: "object",
          properties: {
            categoryId: {
              type: "string",
              description: "Optional category ID to filter products",
            },
          },
        },
      },
      {
        name: "search_products",
        description: "Search products by name or description",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_inventory",
        description: "Get current inventory levels for all items",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_low_stock_items",
        description: "Get items that are running low on stock",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "update_stock",
        description: "Add or remove stock for an inventory item",
        parameters: {
          type: "object",
          properties: {
            inventoryId: {
              type: "string",
              description: "Inventory item ID",
            },
            quantity: {
              type: "number",
              description: "Quantity to add or remove",
            },
            type: {
              type: "string",
              enum: ["add", "usage"],
              description: "Type of update: add (restock) or usage (consume)",
            },
            notes: {
              type: "string",
              description: "Optional notes",
            },
          },
          required: ["inventoryId", "quantity", "type"],
        },
      },
      {
        name: "get_orders",
        description: "Get orders, optionally filtered by status",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["pending", "paid", "completed", "cancelled"],
              description: "Filter by order status",
            },
          },
        },
      },
      {
        name: "create_order",
        description: "Create a new order",
        parameters: {
          type: "object",
          properties: {
            items: {
              type: "array",
              description: "Array of order items",
              items: {
                type: "object",
                properties: {
                  productId: { type: "string" },
                  productName: { type: "string" },
                  quantity: { type: "number" },
                  price: { type: "number" },
                },
              },
            },
            totalAmount: {
              type: "number",
              description: "Total order amount",
            },
            customerName: {
              type: "string",
              description: "Customer name",
            },
            paymentMethod: {
              type: "string",
              description: "Payment method (cash, qris, etc)",
            },
          },
          required: ["items", "totalAmount"],
        },
      },
      {
        name: "get_financial_summary",
        description: "Get financial summary for a date range",
        parameters: {
          type: "object",
          properties: {
            startDate: {
              type: "number",
              description: "Start date timestamp (optional)",
            },
            endDate: {
              type: "number",
              description: "End date timestamp (optional)",
            },
          },
        },
      },
      {
        name: "get_sales_report",
        description: "Get detailed sales report with statistics",
        parameters: {
          type: "object",
          properties: {
            startDate: {
              type: "number",
              description: "Start date timestamp",
            },
            endDate: {
              type: "number",
              description: "End date timestamp",
            },
          },
        },
      },
      {
        name: "predict_stockout",
        description: "Predict which items will run out of stock soon using AI",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_business_insights",
        description: "Get AI-generated business insights and recommendations",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_active_discounts",
        description: "Get all active discounts and promotions",
        parameters: {
          type: "object",
          properties: {},
        },
      },
    ];

    try {
      const response = await fetch(
        `https://api.openclaw.ai/v1/agents/${agentId}/tools`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ tools }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to register tools: ${response.statusText}`);
      }

      return {
        success: true,
        toolsCount: tools.length,
        message: "Tools registered successfully with OpenClaw agent",
      };
    } catch (error) {
      console.error("Failed to register tools:", error);
      throw error;
    }
  },
});
```

---

### Step 5: Setup Webhook Endpoint

Update `packages/backend/convex/http.ts`:

```typescript
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// Existing auth route
http.route({
  path: "/auth",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    return await auth.handler(request);
  }),
});

// OpenClaw webhook endpoint
http.route({
  path: "/openclaw/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      // Verify webhook signature (optional but recommended)
      const signature = request.headers.get("x-openclaw-signature");
      const webhookSecret = process.env.OPENCLAW_WEBHOOK_SECRET;

      // Parse request body
      const body = await request.json();
      const { tool_name, parameters, request_id } = body;

      console.log("OpenClaw webhook received:", { tool_name, parameters });

      // Execute the tool
      const result = await ctx.runAction(internal.openclaw.executeToolCall, {
        toolName: tool_name,
        parameters: parameters || {},
      });

      return new Response(
        JSON.stringify({
          success: true,
          request_id,
          result,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error("OpenClaw webhook error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

export default http;
```

---

### Step 6: Create Frontend Chat Component

Buat file: `apps/web/src/components/openclaw-chat.tsx`

```typescript
import { useState, useRef, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "@tkmpos/backend/convex/_generated/api";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export function OpenClawChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sendMessage = useAction(api.openclaw.chat);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await sendMessage({
        message: input,
        conversationId,
      });

      if (!conversationId && response.conversationId) {
        setConversationId(response.conversationId);
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.message,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      toast.error("Gagal mengirim pesan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card shadow-lg">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-base">AI Assistant</h3>
          <p className="text-muted-foreground text-xs">
            Powered by OpenClaw
          </p>
        </div>
        {conversationId && (
          <div className="rounded-full bg-green-500/10 px-3 py-1">
            <span className="text-green-600 text-xs">● Connected</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 rounded-full bg-primary/10 p-6">
              <Bot className="h-12 w-12 text-primary" />
            </div>
            <h4 className="mb-2 font-bold text-lg">Halo! 👋</h4>
            <p className="mb-4 max-w-sm text-muted-foreground text-sm">
              Saya AI assistant Anda. Tanya apa saja tentang bisnis, produk,
              stok, atau penjualan.
            </p>
            <div className="space-y-2 text-left text-xs">
              <p className="text-muted-foreground">Contoh pertanyaan:</p>
              <div className="space-y-1">
                <button
                  className="block w-full rounded-lg bg-muted px-3 py-2 text-left transition-colors hover:bg-muted/80"
                  onClick={() => setInput("Berapa total penjualan hari ini?")}
                  type="button"
                >
                  💰 Berapa total penjualan hari ini?
                </button>
                <button
                  className="block w-full rounded-lg bg-muted px-3 py-2 text-left transition-colors hover:bg-muted/80"
                  onClick={() => setInput("Produk apa yang stoknya rendah?")}
                  type="button"
                >
                  📦 Produk apa yang stoknya rendah?
                </button>
                <button
                  className="block w-full rounded-lg bg-muted px-3 py-2 text-left transition-colors hover:bg-muted/80"
                  onClick={() => setInput("Produk apa yang paling laku?")}
                  type="button"
                >
                  🔥 Produk apa yang paling laku?
                </button>
              </div>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {message.role === "assistant" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {message.content}
              </p>
              <p
                className={`mt-2 text-[10px] ${
                  message.role === "user"
                    ? "text-primary-foreground/60"
                    : "text-muted-foreground"
                }`}
              >
                {new Date(message.timestamp).toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            {message.role === "user" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="rounded-2xl bg-muted px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground text-sm">
                  Sedang berpikir...
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border bg-muted/30 p-4">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            disabled={isLoading}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ketik pesan Anda..."
            value={input}
          />
          <button
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
            disabled={isLoading || !input.trim()}
            onClick={handleSend}
            type="button"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
        <p className="mt-2 text-center text-muted-foreground text-xs">
          Tekan Enter untuk kirim, Shift+Enter untuk baris baru
        </p>
      </div>
    </div>
  );
}
```

---

### Step 7: Add Chat to Admin Dashboard

Update `apps/web/src/routes/admin/index.tsx`:

```typescript
import { OpenClawChat } from "@/components/openclaw-chat";

function DashboardPage() {
  // ... existing code

  return (
    <div className="space-y-6">
      {/* Existing dashboard content */}
      
      {/* Add OpenClaw Chat */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left side - existing content */}
        <div className="lg:col-span-2">
          {/* Your existing dashboard widgets */}
        </div>
        
        {/* Right side - OpenClaw Chat */}
        <div className="h-[700px]">
          <OpenClawChat />
        </div>
      </div>
    </div>
  );
}
```

---

### Step 8: Configure OpenClaw Agent

1. **Login ke OpenClaw Dashboard**
2. **Pilih agent Anda**
3. **Configure Webhook URL:**
   ```
   https://your-convex-deployment.convex.site/openclaw/webhook
   ```
4. **Sync Tools** - Jalankan sekali untuk register tools:
   ```bash
   # Via Convex dashboard atau CLI
   npx convex run openclaw:registerTools
   ```

---

### Step 9: Deploy & Test

```bash
# Deploy Convex backend
npx convex deploy

# Build dan deploy frontend
bun run build

# Test locally
bun run dev
```

---

## 🧪 Testing

### Test 1: Simple Query
```
User: "Halo"
Expected: Agent menyapa dan menawarkan bantuan
```

### Test 2: Data Query
```
User: "Berapa total penjualan hari ini?"
Expected: Agent memanggil get_sales_report dan memberikan angka
```

### Test 3: Inventory Check
```
User: "Produk apa yang stoknya rendah?"
Expected: Agent memanggil get_low_stock_items dan list produk
```

### Test 4: Create Order
```
User: "Buatkan pesanan untuk Budi: 2 Americano"
Expected: Agent memanggil create_order dan konfirmasi
```

---

## 🔧 Troubleshooting

### Agent tidak merespon
```bash
# Check Convex logs
npx convex logs

# Verify environment variables
echo $OPENCLAW_API_KEY
echo $OPENCLAW_AGENT_ID
```

### Webhook tidak terpanggil
1. Pastikan webhook URL benar di OpenClaw dashboard
2. Check Convex deployment URL
3. Verify HTTP route registered

### Tool execution error
1. Check Convex function names match
2. Verify parameters schema
3. Review error logs

---

## 📊 Monitor Usage

Tambahkan logging untuk tracking:

```typescript
// In executeToolCall
console.log({
  timestamp: Date.now(),
  tool: toolName,
  parameters,
  success: true,
});
```

---

## 🎉 Selesai!

Agent OpenClaw Anda sekarang sudah terhubung dengan TKM POS dan bisa:
- ✅ Menjawab pertanyaan tentang data bisnis
- ✅ Mengakses dan query database real-time
- ✅ Membuat pesanan otomatis
- ✅ Update inventory
- ✅ Generate reports
- ✅ Memberikan business insights

**Next Steps:**
1. Customize prompt agent di OpenClaw dashboard
2. Tambahkan tools sesuai kebutuhan
3. Train agent dengan contoh conversations
4. Monitor dan optimize performance
