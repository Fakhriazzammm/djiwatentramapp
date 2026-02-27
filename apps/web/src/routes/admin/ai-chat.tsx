import { createFileRoute } from "@tanstack/react-router";
import { api } from "@tkmpos/backend/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertTriangle,
	Bot,
	CheckCircle2,
	Lightbulb,
	Loader2,
	Mic,
	Send,
	Settings,
	Sparkles,
	TrendingUp,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/admin/ai-chat")({
	component: AIChatPage,
});

interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

interface ToolCall {
	name: string;
	args: Record<string, unknown>;
	status: "pending" | "executing" | "success" | "error";
	result?: string;
	error?: string;
}

// Templates with icons
const TEMPLATES: Array<{
	label: string;
	message: string;
	icon: React.ReactNode;
}> = [
	{
		label: "Rekap Hari Ini",
		message: "Berikan rekap lengkap bisnis hari ini",
		icon: <TrendingUp className="h-3.5 w-3.5" />,
	},
	{
		label: "Stok Rendah",
		message: "Produk apa saja yang stoknya rendah?",
		icon: <AlertTriangle className="h-3.5 w-3.5" />,
	},
	{
		label: "Top Produk",
		message: "Apa produk terlaris saat ini?",
		icon: <Sparkles className="h-3.5 w-3.5" />,
	},
	{
		label: "Keuangan",
		message: "Ringkas kondisi keuangan saat ini",
		icon: <Settings className="h-3.5 w-3.5" />,
	},
	{
		label: "Tertunda",
		message: "Ada berapa pesanan yang masih tertunda?",
		icon: <AlertTriangle className="h-3.5 w-3.5" />,
	},
	{
		label: "Saran",
		message: "Berikan saran bisnis berdasarkan data saat ini",
		icon: <Lightbulb className="h-3.5 w-3.5" />,
	},
];

// Tool name to Indonesian label mapping
const TOOL_LABELS: Record<string, string> = {
	createProduct: "Buat Produk",
	updateProduct: "Update Produk",
	deleteProduct: "Hapus Produk",
	createCategory: "Buat Kategori",
	deleteCategory: "Hapus Kategori",
	createInventoryItem: "Buat Item Inventaris",
	addStock: "Tambah Stok",
	usageStock: "Kurangi Stok",
	adjustStock: "Atur Stok",
	deleteInventoryItem: "Hapus Item Inventaris",
	createOrder: "Buat Pesanan",
	updateOrderStatus: "Update Status Pesanan",
	createTransaction: "Catat Transaksi",
	deleteTransaction: "Hapus Transaksi",
	createDiscount: "Buat Diskon",
	updateDiscount: "Update Diskon",
	toggleDiscount: "Aktif/Nonaktifkan Diskon",
	deleteDiscount: "Hapus Diskon",
	createHppCalculation: "Buat Kalkulasi HPP",
	updateHppCalculation: "Update Kalkulasi HPP",
	deleteHppCalculation: "Hapus Kalkulasi HPP",
	syncHppWithInventoryPrices: "Sinkronkan Harga HPP",
	updateStoreSettings: "Update Pengaturan Toko",
};

function AIChatPage() {
	const [messages, setMessages] = useState<ChatMessage[]>([
		{
			role: "assistant",
			content:
				"Halo! Saya Yumi, asisten AI kamu. Saya bisa membantu merekap data, menganalisis bisnis, MELAKUKAN AKSI seperti tambah produk, update stok, buat pesanan, dan bahkan MULTI-STEP ACTIONS dalam satu permintaan. Ada yang bisa saya bantu?",
		},
	]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const yumiChat = useAction(api.ai.yumiChat);

	// Fetch data for Smart Insights
	const products = useQuery(api.products.getAllProductsAdmin, {});
	const inventory = useQuery(api.inventory.getInventory, {});
	const orders = useQuery(api.orders.getOrders, {});

	// Generate smart insights from data
	const smartInsights: Array<{
		icon: React.ReactNode;
		text: string;
		type: "success" | "warning" | "info";
	}> = [];

	const lowStockItems =
		inventory?.filter((i) => i.quantity <= i.lowStockThreshold) ?? [];
	if (lowStockItems.length > 0) {
		smartInsights.push({
			icon: <AlertTriangle className="h-3.5 w-3.5 text-accent" />,
			text: `${lowStockItems.length} stok rendah`,
			type: "warning",
		});
	}

	const pendingOrders = orders?.filter((o) => o.status === "pending") ?? [];
	if (pendingOrders.length > 0) {
		smartInsights.push({
			icon: <Settings className="h-3.5 w-3.5 text-primary" />,
			text: `${pendingOrders.length} perlu diproses`,
			type: "info",
		});
	}

	const availableProducts = products?.filter((p) => p.isAvailable).length ?? 0;
	if (availableProducts > 0) {
		smartInsights.push({
			icon: <TrendingUp className="h-3.5 w-3.5 text-primary" />,
			text: `${availableProducts} produk aktif`,
			type: "success",
		});
	}

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, toolCalls]);

	const sendMessage = useCallback(
		async (text: string) => {
			if (!text.trim() || isLoading) {
				return;
			}

			const userMessage: ChatMessage = { role: "user", content: text.trim() };
			setMessages((prev) => [...prev, userMessage]);
			setInput("");
			setIsLoading(true);
			setToolCalls([]);

			try {
				const history = messages
					.filter((m) => m.role === "user" || m.role === "assistant")
					.map((m) => ({ role: m.role, content: m.content }));

				// Simulate tool execution detection
				// In a real implementation, the backend would return tool call info
				const response = await yumiChat({
					message: text.trim(),
					history,
				});

				// Parse response to detect if tools were used
				// The backend response may contain tool execution results
				let hasToolExecution = false;
				const detectedTools: ToolCall[] = [];

				// Check if response contains tool execution indicators
				if (response?.includes("Berhasil menjalankan")) {
					hasToolExecution = true;
					// Extract tool names from response
					for (const [toolKey, toolLabel] of Object.entries(TOOL_LABELS)) {
						if (
							response.includes(toolLabel) ||
							response.toLowerCase().includes(toolKey.toLowerCase())
						) {
							detectedTools.push({
								name: toolKey,
								args: {},
								status: "success",
								result: "Berhasil",
							});
						}
					}
				}

				if (hasToolExecution && detectedTools.length > 0) {
					// Animate tool execution
					for (const tool of detectedTools) {
						setToolCalls((prev) => [...prev, { ...tool, status: "executing" }]);
						await new Promise((r) => setTimeout(r, 600));
						setToolCalls((prev) =>
							prev.map((t) =>
								t.name === tool.name ? { ...t, status: "success" as const } : t
							)
						);
					}
					// Clear tool calls after a delay
					setTimeout(() => setToolCalls([]), 3000);
				}

				setMessages((prev) => [
					...prev,
					{
						role: "assistant",
						content:
							response || "Maaf, saya tidak bisa memproses permintaan ini.",
					},
				]);
			} catch {
				setMessages((prev) => [
					...prev,
					{
						role: "assistant",
						content: "Maaf, terjadi kesalahan. Silakan coba lagi.",
					},
				]);
				setToolCalls([]);
			} finally {
				setIsLoading(false);
			}
		},
		[isLoading, messages, yumiChat]
	);

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			{/* Header - Compact */}
			<div className="flex items-center gap-3 border-border border-b bg-card px-4 py-3 md:px-6 md:py-4">
				<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 md:h-10 md:w-10 md:rounded-full">
					<Sparkles className="h-4 w-4 text-primary md:h-5 md:w-5" />
				</div>
				<div className="min-w-0 flex-1">
					<h2 className="font-bold text-foreground text-sm md:text-base">
						Yumi AI
					</h2>
					<p className="hidden text-muted-foreground text-xs md:block">
						Asisten Bisnis dengan Multi-Step Actions
					</p>
				</div>
				{/* Smart Insights Badge - Compact */}
				{smartInsights.length > 0 && (
					<div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1">
						<Lightbulb className="h-3 w-3 text-primary" />
						<span className="font-medium text-[10px] text-primary">
							{smartInsights.length}
						</span>
					</div>
				)}
			</div>

			{/* Messages Container */}
			<div className="flex-1 overflow-y-auto p-4 md:p-6">
				<div className="mx-auto max-w-full space-y-4 md:max-w-3xl md:space-y-6">
					{/* Smart Insights Cards - Compact for mobile */}
					{smartInsights.length > 0 && messages.length <= 1 && (
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							className="mb-4 grid grid-cols-3 gap-2 md:mb-6 md:gap-3"
							initial={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.4 }}
						>
							{smartInsights.map((insight, i) => (
								<motion.div
									animate={{ opacity: 1, scale: 1 }}
									className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2 py-2 md:gap-2 md:rounded-xl md:px-3 md:py-2"
									initial={{ opacity: 0, scale: 0.9 }}
									key={i}
									transition={{ delay: i * 0.1, duration: 0.3 }}
								>
									{insight.icon}
									<span className="text-[10px] text-muted-foreground md:text-xs">
										{insight.text}
									</span>
								</motion.div>
							))}
						</motion.div>
					)}

					<AnimatePresence initial={false}>
						{messages.map((msg, i) => (
							<motion.div
								animate={{ opacity: 1, y: 0 }}
								className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
								exit={{ opacity: 0, scale: 0.95 }}
								initial={{ opacity: 0, y: 10 }}
								key={`${msg.role}-${i}`}
								transition={{ duration: 0.3 }}
							>
								<div
									className={`max-w-[85%] space-y-1 md:space-y-2 ${
										msg.role === "user" ? "items-end" : "items-start"
									}`}
								>
									{msg.role === "assistant" && (
										<div className="flex items-center gap-1.5 px-1">
											<Bot className="h-3.5 w-3.5 text-primary md:h-4 md:w-4" />
											<span className="font-bold text-[10px] text-primary uppercase tracking-wider md:text-xs">
												Yumi
											</span>
										</div>
									)}
									<div
										className={`rounded-xl px-3 py-2.5 text-sm leading-relaxed md:rounded-2xl md:px-4 md:py-3 ${
											msg.role === "user"
												? "rounded-tr-none bg-primary text-primary-foreground"
												: "rounded-tl-none border border-border bg-card text-foreground"
										}`}
									>
										<div className="whitespace-pre-line">{msg.content}</div>
									</div>
								</div>
							</motion.div>
						))}
					</AnimatePresence>

					{/* Tool Execution Indicator - Compact */}
					<AnimatePresence>
						{toolCalls.map((tool, i) => (
							<motion.div
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -20 }}
								initial={{ opacity: 0, x: -20 }}
								key={i}
								transition={{ duration: 0.3 }}
							>
								<div className="flex items-start gap-2">
									<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
										{tool.status === "executing" ? (
											<Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
										) : tool.status === "success" ? (
											<CheckCircle2 className="h-3.5 w-3.5 text-primary" />
										) : (
											<XCircle className="h-3.5 w-3.5 text-destructive" />
										)}
									</div>
									<div className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2">
										<div className="flex items-center gap-2">
											<Settings className="h-3 w-3 text-primary" />
											<span className="font-medium text-[10px] text-foreground">
												{TOOL_LABELS[tool.name] || tool.name}
											</span>
											<span className="text-[10px] text-muted-foreground">
												{tool.status === "executing"
													? "eksekusi..."
													: tool.status === "success"
														? "berhasil"
														: "gagal"}
											</span>
										</div>
										{tool.result && tool.status === "success" && (
											<motion.div
												animate={{ height: "auto", opacity: 1 }}
												className="mt-1.5 text-[10px] text-muted-foreground"
												initial={{ height: 0, opacity: 0 }}
											>
												{tool.result}
											</motion.div>
										)}
									</div>
								</div>
							</motion.div>
						))}
					</AnimatePresence>

					{/* Multi-Step Progress Badge - Compact */}
					{toolCalls.length > 1 && (
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="flex justify-center"
							initial={{ opacity: 0, scale: 0.9 }}
						>
							<div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5">
								<Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
								<span className="font-medium text-[10px] text-primary">
									{toolCalls.length} langkah
								</span>
							</div>
						</motion.div>
					)}

					{/* Typing Indicator - Compact */}
					{isLoading && toolCalls.length === 0 && (
						<div className="flex justify-start">
							<div className="space-y-1">
								<div className="flex items-center gap-1.5 px-1">
									<Bot className="h-3.5 w-3.5 text-primary" />
									<span className="font-bold text-[10px] text-primary uppercase tracking-wider">
										Yumi
									</span>
								</div>
								<div className="rounded-xl rounded-tl-none border border-border bg-card px-3 py-2">
									<div className="flex gap-1">
										<span
											className="h-1 w-1 animate-bounce rounded-full bg-primary/60"
											style={{ animationDelay: "0ms" }}
										/>
										<span
											className="h-1 w-1 animate-bounce rounded-full bg-primary/60"
											style={{ animationDelay: "150ms" }}
										/>
										<span
											className="h-1 w-1 animate-bounce rounded-full bg-primary/60"
											style={{ animationDelay: "300ms" }}
										/>
									</div>
								</div>
							</div>
						</div>
					)}
					<div ref={messagesEndRef} />
				</div>
			</div>

			{/* Footer: Templates & Input - Compact */}
			<div className="space-y-3 border-border border-t bg-card p-4 md:space-y-4 md:p-6">
				<div className="mx-auto max-w-full space-y-3 md:max-w-3xl md:space-y-4">
					{/* Templates - Horizontal Scroll Compact */}
					<div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
						{TEMPLATES.map((t) => (
							<button
								className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-[10px] text-muted-foreground transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
								disabled={isLoading}
								key={t.label}
								onClick={() => sendMessage(t.message)}
								type="button"
							>
								{t.icon}
								<span className="whitespace-nowrap">{t.label}</span>
							</button>
						))}
					</div>

					{/* Input Form - Compact with Voice Button */}
					<form
						className="relative flex items-center gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							sendMessage(input);
						}}
					>
						<input
							className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm shadow-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
							disabled={isLoading}
							onChange={(e) => setInput(e.target.value)}
							placeholder="Tanya Yumi..."
							ref={inputRef}
							type="text"
							value={input}
						/>
						{/* Voice Button (placeholder for future) */}
						<button
							className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all hover:bg-muted/80 disabled:opacity-50 md:hidden"
							disabled
							type="button"
						>
							<Mic className="h-4 w-4" />
						</button>
						<button
							className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow transition-all hover:scale-105 hover:bg-primary/90 disabled:opacity-50 disabled:hover:scale-100 md:h-10 md:w-10"
							disabled={isLoading || !input.trim()}
							type="submit"
						>
							{isLoading ? (
								<Loader2 className="h-4 w-4 animate-spin md:h-5 md:w-5" />
							) : (
								<Send className="h-4 w-4 md:h-5 md:w-5" />
							)}
						</button>
					</form>
				</div>
			</div>
		</div>
	);
}
