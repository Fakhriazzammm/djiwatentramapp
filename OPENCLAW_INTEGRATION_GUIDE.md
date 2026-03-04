# 🤖 Panduan Integrasi OpenClaw Agent ke Yumi POS

## 📋 Daftar Isi
1. [Apa itu OpenClaw?](#apa-itu-openclaw)
2. [Arsitektur Integrasi](#arsitektur-integrasi)
3. [Setup & Instalasi](#setup--instalasi)
4. [Implementasi Backend](#implementasi-backend)
5. [Implementasi Frontend](#implementasi-frontend)
6. [Use Cases & Contoh](#use-cases--contoh)
7. [Security & Best Practices](#security--best-practices)

---

## 🎯 Apa itu OpenClaw?

OpenClaw adalah AI agent framework yang memungkinkan AI untuk:
- Mengakses dan memanipulasi data aplikasi
- Menjalankan fungsi/actions secara otomatis
- Memberikan insights dan rekomendasi
- Mengotomasi workflow bisnis

**Keuntungan untuk Yumi POS:**
- AI assistant yang bisa akses real-time data
- Automasi tasks (restock, pricing, reporting)
- Predictive analytics yang lebih akurat
- Natural language interface untuk staff

---

## 🏗️ Arsitektur Integrasi

```
┌─────────────────────────────────────────────────────────────┐
│                     Yumi POS Application                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐         ┌──────────────┐                  │
│  │   Frontend   │◄────────┤   Backend    │                  │
│  │  (React UI)  │         │   (Convex)   │                  │
│  └──────┬───────┘         └──────┬───────┘                  │
│         │                        │                           │
│         │                        │                           │
│  ┌──────▼────────────────────────▼───────┐                  │
│  │      OpenClaw Integration Layer       │                  │
│  │  ┌─────────────────────────────────┐  │                  │
│  │  │  Agent Actions (Tools/Functions)│  │                  │
│  │  ├─────────────────────────────────┤  │                  │
│  │  │ • getProducts()                 │  │                  │
│  │  │ • createOrder()                 │  │                  │
│  │  │ • updateInventory()             │  │                  │
│  │  │ • generateReport()              │  │                  │
│  │  │ • predictStockout()             │  │                  │
│  │  └─────────────────────────────────┘  │                  │
│  └────────────────┬───────────────────────┘                  │
│                   │                                          │
└───────────────────┼──────────────────────────────────────────┘
                    │
                    │ API Calls
                    │
         ┌──────────▼──────────┐
         │   OpenClaw Agent    │
         │   (AI Processing)   │
         └─────────────────────┘
```

---

## 🚀 Setup & Instalasi

### 1. Install Dependencies

```bash
# Install OpenClaw SDK
bun add @openclaw/sdk

# Install additional dependencies
bun add zod openai
```

### 2. Environment Variables

Tambahkan ke `packages/backend/.env.local`:

```env
# OpenClaw Configuration
OPENCLAW_API_KEY=your_openclaw_api_key_here
OPENCLAW_AGENT_ID=your_agent_id_here
OPENCLAW_WEBHOOK_SECRET=your_webhook_secret_here

# OpenAI (jika menggunakan OpenAI sebagai LLM)
OPENAI_API_KEY=your_openai_key_here
```

### 3. Update Package.json

```json
{
  "dependencies": {
    "@openclaw/sdk": "^1.0.0",
    "zod": "^3.24.1",
    "openai": "^4.0.0"
  }
}
```

---

## 🔧 Implementasi Backend

### 1. Buat OpenClaw Client

Buat file: `packages/backend/convex/openclaw/client.ts`

```typescript
import { OpenClaw } from "@openclaw/sdk";

// Initialize OpenClaw client
export const openclawClient = new OpenClaw({
  apiKey: process.env.OPENCLAW_API_KEY!,
  agentId: process.env.OPENCLAW_AGENT_ID!,
});

// Helper to verify webhook signatures
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const secret = process.env.OPENCLAW_WEBHOOK_SECRET!;
  // Implement signature verification logic
  return true; // Placeholder
}
```

### 2. Define Agent Actions (Tools)

Buat file: `packages/backend/convex/openclaw/actions.ts`

```typescript
import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { openclawClient } from "./client";

/**
 * Register all available actions with OpenClaw
 */
export const registerActions = action({
  args: {},
  handler: async (ctx) => {
    const actions = [
      {
        name: "getProducts",
        description: "Get all products with their details, prices, and availability",
        parameters: {
          categoryId: {
            type: "string",
            description: "Optional category ID to filter products",
            required: false,
          },
        },
      },
      {
        name: "getInventory",
        description: "Get current inventory levels and stock information",
        parameters: {},
      },
      {
        name: "createOrder",
        description: "Create a new order with items",
        parameters: {
          items: {
            type: "array",
            description: "Array of order items",
            required: true,
          },
          customerName: {
            type: "string",
            description: "Customer name",
            required: false,
          },
        },
      },
      {
        name: "updateInventory",
        description: "Update inventory stock levels",
        parameters: {
          inventoryId: {
            type: "string",
            description: "Inventory item ID",
            required: true,
          },
          quantity: {
            type: "number",
            description: "Quantity to add or remove",
            required: true,
          },
          type: {
            type: "string",
            description: "Type: restock, usage, or adjustment",
            required: true,
          },
        },
      },
      {
        name: "getFinancialSummary",
        description: "Get financial summary for a date range",
        parameters: {
          startDate: {
            type: "number",
            description: "Start date timestamp",
            required: false,
          },
          endDate: {
            type: "number",
            description: "End date timestamp",
            required: false,
          },
        },
      },
      {
        name: "predictStockout",
        description: "Predict which items will run out of stock soon",
        parameters: {
          days: {
            type: "number",
            description: "Number of days to predict ahead",
            required: false,
          },
        },
      },
      {
        name: "generateReport",
        description: "Generate business report (sales, inventory, financial)",
        parameters: {
          reportType: {
            type: "string",
            description: "Type: sales, inventory, or financial",
            required: true,
          },
          period: {
            type: "string",
            description: "Period: daily, weekly, or monthly",
            required: true,
          },
        },
      },
    ];

    // Register actions with OpenClaw
    await openclawClient.registerActions(actions);

    return { success: true, actionsCount: actions.length };
  },
});

/**
 * Execute action requested by OpenClaw agent
 */
export const executeAction = internalAction({
  args: {
    actionName: v.string(),
    parameters: v.any(),
  },
  handler: async (ctx, args) => {
    const { actionName, parameters } = args;

    switch (actionName) {
      case "getProducts":
        return await ctx.runQuery("products:getProducts" as never, {
          categoryId: parameters.categoryId,
        } as never);

      case "getInventory":
        return await ctx.runQuery("inventory:getInventory" as never);

      case "createOrder":
        return await ctx.runMutation("orders:createOrder" as never, {
          items: parameters.items,
          totalAmount: parameters.totalAmount,
          paymentMethod: parameters.paymentMethod || "cash",
          customerName: parameters.customerName,
        } as never);

      case "updateInventory":
        if (parameters.type === "restock") {
          return await ctx.runMutation("inventory:addStock" as never, {
            inventoryId: parameters.inventoryId,
            quantity: parameters.quantity,
            notes: "Updated by OpenClaw agent",
          } as never);
        } else if (parameters.type === "usage") {
          return await ctx.runMutation("inventory:usageStock" as never, {
            inventoryId: parameters.inventoryId,
            quantity: parameters.quantity,
            notes: "Updated by OpenClaw agent",
          } as never);
        }
        break;

      case "getFinancialSummary":
        return await ctx.runQuery("finance:getFinancialSummary" as never, {
          startDate: parameters.startDate,
          endDate: parameters.endDate,
        } as never);

      case "predictStockout":
        const inventory = await ctx.runQuery("inventory:getInventory" as never);
        const orders = await ctx.runQuery("orders:getOrders" as never, {} as never);
        
        return await ctx.runAction("ai:predictStockOut" as never, {
          inventoryData: JSON.stringify(inventory),
          recentSalesTrend: JSON.stringify(orders),
        } as never);

      case "generateReport":
        // Implement report generation logic
        return { message: "Report generation not yet implemented" };

      default:
        throw new Error(`Unknown action: ${actionName}`);
    }
  },
});
```

### 3. Create Webhook Handler

Buat file: `packages/backend/convex/openclaw/webhook.ts`

```typescript
import { httpAction } from "../_generated/server";
import { verifyWebhookSignature } from "./client";

/**
 * Webhook endpoint for OpenClaw to send requests
 */
export const webhook = httpAction(async (ctx, request) => {
  // Verify webhook signature
  const signature = request.headers.get("x-openclaw-signature");
  const body = await request.text();

  if (!signature || !verifyWebhookSignature(body, signature)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = JSON.parse(body);
  const { actionName, parameters, requestId } = payload;

  try {
    // Execute the requested action
    const result = await ctx.runAction("openclaw/actions:executeAction" as never, {
      actionName,
      parameters,
    } as never);

    return new Response(
      JSON.stringify({
        success: true,
        requestId,
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
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
```

### 4. Update HTTP Routes

Update `packages/backend/convex/http.ts`:

```typescript
import { httpRouter } from "convex/server";
import { webhook as openclawWebhook } from "./openclaw/webhook";

const http = httpRouter();

// Existing routes...
http.route({
  path: "/auth",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    return await auth.handler(request);
  }),
});

// OpenClaw webhook
http.route({
  path: "/openclaw/webhook",
  method: "POST",
  handler: openclawWebhook,
});

export default http;
```

---

## 💻 Implementasi Frontend

### 1. Create OpenClaw Chat Component

Buat file: `apps/web/src/components/openclaw/agent-chat.tsx`

```typescript
import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@yumipos/backend/convex/_generated/api";
import { Send, Bot, User } from "lucide-react";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: number;
}

export function OpenClawChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const sendToAgent = useAction(api.openclaw.actions.sendMessage);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await sendToAgent({ message: input });

      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "agent",
        content: response.message,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, agentMessage]);
    } catch (error) {
      toast.error("Gagal mengirim pesan ke agent");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border p-4">
        <div className="rounded-full bg-primary/10 p-2">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-bold text-sm">OpenClaw AI Assistant</h3>
          <p className="text-muted-foreground text-xs">
            Tanya apa saja tentang bisnis Anda
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Bot className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <p className="font-medium text-muted-foreground">
              Mulai percakapan dengan AI Assistant
            </p>
            <p className="mt-1 text-muted-foreground/60 text-xs">
              Contoh: "Berapa total penjualan hari ini?"
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {message.role === "agent" && (
              <div className="rounded-full bg-primary/10 p-2">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              <p className="text-sm">{message.content}</p>
              <p className="mt-1 text-[10px] opacity-60">
                {new Date(message.timestamp).toLocaleTimeString("id-ID")}
              </p>
            </div>
            {message.role === "user" && (
              <div className="rounded-full bg-primary/10 p-2">
                <User className="h-4 w-4 text-primary" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="rounded-lg bg-muted p-3">
              <div className="flex gap-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" />
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50"
                  style={{ animationDelay: "0.1s" }}
                />
                <div
                  className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50"
                  style={{ animationDelay: "0.2s" }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary"
            disabled={isLoading}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ketik pesan..."
            value={input}
          />
          <button
            className="rounded-lg bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            disabled={isLoading || !input.trim()}
            onClick={handleSend}
            type="button"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 2. Add to Admin Dashboard

Update `apps/web/src/routes/admin/index.tsx`:

```typescript
import { OpenClawChat } from "@/components/openclaw/agent-chat";

function DashboardPage() {
  // ... existing code

  return (
    <div className="space-y-6">
      {/* Existing stats and content */}
      
      {/* OpenClaw Chat Section */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Existing content */}
        </div>
        
        <div className="h-[600px]">
          <OpenClawChat />
        </div>
      </div>
    </div>
  );
}
```

---

## 🎯 Use Cases & Contoh

### 1. Natural Language Queries

**User:** "Berapa total penjualan minggu ini?"

**Agent Response:**
```
Total penjualan minggu ini adalah Rp 15.450.000
- Senin: Rp 2.100.000
- Selasa: Rp 2.300.000
- Rabu: Rp 2.150.000
- Kamis: Rp 2.400.000
- Jumat: Rp 3.200.000
- Sabtu: Rp 2.100.000
- Minggu: Rp 1.200.000

Tren: ↑ 12% dibanding minggu lalu
```

### 2. Inventory Management

**User:** "Produk apa yang hampir habis?"

**Agent Response:**
```
Ada 3 item yang stoknya rendah:
1. Fresh Milk - Tersisa 500ml (min: 1000ml)
2. Coffee Beans - Tersisa 250g (min: 500g)
3. Sugar - Tersisa 800g (min: 1000g)

Rekomendasi: Pesan ulang dalam 2 hari
```

### 3. Automated Actions

**User:** "Buatkan pesanan untuk Budi: 2 Americano dan 1 Latte"

**Agent Response:**
```
✅ Pesanan berhasil dibuat!

Order #A-123
Pelanggan: Budi
Items:
- 2x Americano @ Rp 25.000 = Rp 50.000
- 1x Latte @ Rp 30.000 = Rp 30.000

Total: Rp 80.000
Status: Pending

Apakah ingin langsung proses pembayaran?
```

### 4. Business Insights

**User:** "Produk apa yang paling laku bulan ini?"

**Agent Response:**
```
Top 5 Produk Terlaris Bulan Ini:

1. 🥇 Americano - 450 cup (Rp 11.250.000)
2. 🥈 Latte - 380 cup (Rp 11.400.000)
3. 🥉 Cappuccino - 320 cup (Rp 9.600.000)
4. Es Kopi Susu - 280 cup (Rp 7.000.000)
5. Espresso - 210 cup (Rp 4.200.000)

💡 Insight: Latte memiliki revenue tertinggi meski volume lebih rendah dari Americano. Pertimbangkan untuk promosi Latte.
```

---

## 🔒 Security & Best Practices

### 1. Authentication & Authorization

```typescript
// Add role-based access control
export const executeAction = internalAction({
  args: {
    actionName: v.string(),
    parameters: v.any(),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify user has permission
    if (args.userId) {
      const user = await ctx.runQuery("users:getUser" as never, {
        id: args.userId,
      } as never);

      if (!user || !hasPermission(user, args.actionName)) {
        throw new Error("Unauthorized");
      }
    }

    // Execute action...
  },
});
```

### 2. Rate Limiting

```typescript
// Implement rate limiting
const rateLimiter = new Map<string, number[]>();

function checkRateLimit(userId: string, limit = 10, window = 60000): boolean {
  const now = Date.now();
  const userRequests = rateLimiter.get(userId) || [];
  
  // Remove old requests
  const recentRequests = userRequests.filter((time) => now - time < window);
  
  if (recentRequests.length >= limit) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimiter.set(userId, recentRequests);
  return true;
}
```

### 3. Input Validation

```typescript
import { z } from "zod";

const actionParametersSchema = z.object({
  actionName: z.string().min(1),
  parameters: z.record(z.any()),
});

// Validate before execution
const validated = actionParametersSchema.parse(args);
```

### 4. Audit Logging

```typescript
// Log all agent actions
await ctx.runMutation("audit:logAction" as never, {
  actionName: args.actionName,
  parameters: args.parameters,
  userId: args.userId,
  timestamp: Date.now(),
  result: "success",
} as never);
```

### 5. Error Handling

```typescript
try {
  const result = await executeAction(actionName, parameters);
  return { success: true, result };
} catch (error) {
  // Log error
  console.error("Agent action failed:", error);
  
  // Return user-friendly message
  return {
    success: false,
    error: "Maaf, terjadi kesalahan. Silakan coba lagi.",
  };
}
```

---

## 📊 Monitoring & Analytics

### Track Agent Usage

```typescript
// Schema for agent analytics
agentAnalytics: defineTable({
  actionName: v.string(),
  userId: v.optional(v.string()),
  executionTime: v.number(),
  success: v.boolean(),
  timestamp: v.number(),
}).index("by_timestamp", ["timestamp"])
```

### Dashboard Metrics

- Total agent requests
- Success rate
- Average response time
- Most used actions
- Error rate by action

---

## 🚀 Deployment Checklist

- [ ] Set environment variables
- [ ] Register actions with OpenClaw
- [ ] Configure webhook URL
- [ ] Test all actions
- [ ] Implement rate limiting
- [ ] Add audit logging
- [ ] Setup monitoring
- [ ] Train staff on usage
- [ ] Document custom actions
- [ ] Plan for scaling

---

## 📚 Resources

- [OpenClaw Documentation](https://docs.openclaw.ai)
- [Convex Actions Guide](https://docs.convex.dev/functions/actions)
- [Webhook Security Best Practices](https://webhooks.fyi/security/best-practices)

---

## 🆘 Troubleshooting

### Agent tidak merespon
- Cek API key dan agent ID
- Verify webhook URL accessible
- Check Convex logs for errors

### Action gagal execute
- Validate parameters schema
- Check user permissions
- Review error logs

### Slow response time
- Optimize database queries
- Implement caching
- Use pagination for large datasets

---

## 🎉 Kesimpulan

Dengan integrasi OpenClaw, Yumi POS mendapatkan:
- ✅ AI assistant yang powerful
- ✅ Natural language interface
- ✅ Automated workflows
- ✅ Better business insights
- ✅ Improved user experience

**Next Steps:**
1. Setup OpenClaw account
2. Implement backend actions
3. Add frontend chat component
4. Test with real scenarios
5. Train staff
6. Monitor & optimize
