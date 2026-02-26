import { createFileRoute } from "@tanstack/react-router";
import { api } from "@tkmpos/backend/convex/_generated/api";
import { useAction } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	Bot,
	Send,
	Sparkles,
	Settings,
	CheckCircle2,
	XCircle,
	Loader2,
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

const TEMPLATES = [
	{ label: "Rekap Hari Ini", message: "Berikan rekap lengkap bisnis hari ini" },
	{ label: "Stok Rendah", message: "Produk apa saja yang stoknya rendah?" },
	{ label: "Top Produk", message: "Apa produk terlaris saat ini?" },
	{
		label: "Ringkas Keuangan",
		message: "Ringkas kondisi keuangan saat ini",
	},
	{
		label: "Pesanan Tertunda",
		message: "Ada berapa pesanan yang masih tertunda?",
	},
	{
		label: "Saran Bisnis",
		message: "Berikan saran bisnis berdasarkan data saat ini",
	},
	{
		label: "Tambah Produk",
		message: "Saya ingin menambah produk baru",
	},
	{
		label: "Catat Pengeluaran",
		message: "Saya ingin mencatat pengeluaran operasional",
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
				"Halo! Saya Yumi, asisten AI kamu. Saya bisa membantu merekap data, menganalisis bisnis, MELAKUKAN AKSI seperti tambah produk, update stok, buat pesanan, dan lainnya. Ada yang bisa saya bantu?",
		},
	]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const yumiChat = useAction(api.ai.yumiChat);

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
				let detectedTools: ToolCall[] = [];

				// Check if response contains tool execution indicators
				if (response?.includes("Berhasil menjalankan")) {
					hasToolExecution = true;
					// Extract tool names from response
					for (const [toolKey, toolLabel] of Object.entries(TOOL_LABELS)) {
						if (response.includes(toolLabel) || response.toLowerCase().includes(toolKey.toLowerCase())) {
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
							prev.map((t) => (t.name === tool.name ? { ...t, status: "success" as const } : t))
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
			{/* Header */}
			<div className="flex items-center gap-3 border-border border-b bg-muted/30 px-6 py-4">
				<div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
					<Sparkles className="h-5 w-5 text-primary" />
				</div>
				<div>
					<h2 className="font-bold text-foreground text-lg">Yumi AI Chat</h2>
					<p className="text-muted-foreground text-xs">
						Asisten Bisnis Cerdas dengan Aksi Otomatis
					</p>
				</div>
			</div>

			{/* Messages Container */}
			<div className="flex-1 overflow-y-auto p-6">
				<div className="mx-auto max-w-3xl space-y-6">
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
									className={`max-w-[85%] space-y-2 ${
										msg.role === "user" ? "items-end" : "items-start"
									}`}
								>
									{msg.role === "assistant" && (
										<div className="flex items-center gap-2 px-1">
											<Bot className="h-4 w-4 text-primary" />
											<span className="font-bold text-primary text-xs uppercase tracking-wider">
												Yumi
											</span>
										</div>
									)}
									<div
										className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
											msg.role === "user"
												? "rounded-tr-none bg-primary text-primary-foreground"
												: "rounded-tl-none border border-border bg-background text-foreground"
										}`}
									>
										<div className="whitespace-pre-line">{msg.content}</div>
									</div>
								</div>
							</motion.div>
						))}
					</AnimatePresence>

					{/* Tool Execution Indicator */}
					<AnimatePresence>
						{toolCalls.map((tool, i) => (
							<motion.div
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -20 }}
								initial={{ opacity: 0, x: -20 }}
								key={i}
								transition={{ duration: 0.3 }}
							>
								<div className="flex items-start gap-3">
									<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
										{tool.status === "executing" ? (
											<Loader2 className="h-4 w-4 animate-spin text-primary" />
										) : tool.status === "success" ? (
											<CheckCircle2 className="h-4 w-4 text-green-500" />
										) : (
											<XCircle className="h-4 w-4 text-red-500" />
										)}
									</div>
									<div className="flex-1 rounded-xl border border-border bg-muted/30 px-4 py-3">
										<div className="flex items-center gap-2">
											<Settings className="h-3.5 w-3.5 text-primary" />
											<span className="font-medium text-foreground text-xs">
												{TOOL_LABELS[tool.name] || tool.name}
											</span>
											<span className="text-muted-foreground text-xs">
												{tool.status === "executing"
													? "sedang dieksekusi..."
													: tool.status === "success"
														? "berhasil"
														: "gagal"}
											</span>
										</div>
										{tool.result && tool.status === "success" && (
											<motion.div
												animate={{ height: "auto", opacity: 1 }}
												className="mt-2 text-muted-foreground text-xs"
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

					{isLoading && toolCalls.length === 0 && (
						<div className="flex justify-start">
							<div className="space-y-2">
								<div className="flex items-center gap-2 px-1">
									<Bot className="h-4 w-4 text-primary" />
									<span className="font-bold text-primary text-xs uppercase tracking-wider">
										Yumi
									</span>
								</div>
								<div className="rounded-2xl rounded-tl-none border border-border bg-background px-4 py-3 shadow-sm">
									<div className="flex gap-1.5 pt-1">
										<span
											className="h-2 w-2 animate-bounce rounded-full bg-primary/40"
											style={{ animationDelay: "0ms" }}
										/>
										<span
											className="h-2 w-2 animate-bounce rounded-full bg-primary/40"
											style={{ animationDelay: "150ms" }}
										/>
										<span
											className="h-2 w-2 animate-bounce rounded-full bg-primary/40"
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

			{/* Footer: Templates & Input */}
			<div className="space-y-4 border-border border-t bg-muted/10 p-6">
				<div className="mx-auto max-w-3xl space-y-4">
					{/* Templates */}
					<div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
						{TEMPLATES.map((t) => (
							<button
								className="shrink-0 rounded-full border border-border bg-background px-4 py-1.5 text-foreground text-xs transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
								disabled={isLoading}
								key={t.label}
								onClick={() => sendMessage(t.message)}
								type="button"
							>
								{t.label}
							</button>
						))}
					</div>

					{/* Input Form */}
					<form
						className="relative flex items-center gap-3"
						onSubmit={(e) => {
							e.preventDefault();
							sendMessage(input);
						}}
					>
						<input
							className="flex-1 rounded-2xl border border-border bg-background px-5 py-3.5 text-sm shadow-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10"
							disabled={isLoading}
							onChange={(e) => setInput(e.target.value)}
							placeholder="Tanya Yumi atau minta lakukan aksi (tambah produk, update stok, dll)..."
							ref={inputRef}
							type="text"
							value={input}
						/>
						<button
							className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:bg-primary/90 disabled:opacity-50 disabled:hover:scale-100"
							disabled={isLoading || !input.trim()}
							type="submit"
						>
							{isLoading ? (
								<Loader2 className="h-5 w-5 animate-spin" />
							) : (
								<Send className="h-5 w-5" />
							)}
						</button>
					</form>
					<p className="text-center text-[10px] text-muted-foreground uppercase tracking-widest opacity-50">
						Yumi AI dapat melakukan aksi seperti tambah produk, update stok, buat pesanan, dan lainnya.
					</p>
				</div>
			</div>
		</div>
	);
}
