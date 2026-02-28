import { createFileRoute } from "@tanstack/react-router";
import { api } from "@tkmpos/backend/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertTriangle,
	Bell,
	Bot,
	Calendar,
	Camera,
	CheckCircle2,
	Lightbulb,
	Loader2,
	Send,
	Settings,
	Shield,
	Sparkles,
	Target,
	TrendingUp,
	X,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageScanner } from "@/components/ai/image-scanner";

export const Route = createFileRoute("/admin/ai-chat")({
	component: AIChatPage,
});

interface ChatMessage {
	role: "user" | "assistant";
	content: string;
	image?: string;
}

interface ToolCall {
	name: string;
	args: Record<string, unknown>;
	status: "pending" | "executing" | "success" | "error";
	result?: string;
	error?: string;
}

interface Suggestion {
	id: string;
	type: string;
	title: string;
	description: string;
	priority: "high" | "medium" | "low";
	action?: any;
	createdAt: number;
}

type TabType = "chat" | "suggestions" | "predictions" | "tasks";

interface ChatSession {
	sessionId: string;
	title: string;
	createdAt: number;
	messageCount: number;
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
	{
		label: "Prediksi Stok",
		message: "Analisis prediksi stok yang akan habis dalam 7 hari ke depan dan rekomendasikan tindakan",
		icon: <TrendingUp className="h-3.5 w-3.5" />,
	},
	{
		label: "Analisis Diskon",
		message: "Analisis efektivitas semua diskon yang aktif dan rekomendasikan strategi promo yang lebih baik",
		icon: <Sparkles className="h-3.5 w-3.5" />,
	},
	{
		label: "Rekonsiliasi",
		message: "Lakukan rekonsiliasi keuangan: bandingkan total pesanan selesai dengan pencatatan pemasukan, dan identifikasi selisih jika ada",
		icon: <Shield className="h-3.5 w-3.5" />,
	},
	{
		label: "Hitung HPP",
		message: "Tampilkan ringkasan kalkulasi HPP semua produk, mana yang margin-nya rendah dan perlu dioptimalkan?",
		icon: <Target className="h-3.5 w-3.5" />,
	},
];

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
	analyzeDiscountEffectiveness: "Analisis Efektivitas Diskon",
	createReconciliationTransaction: "Rekonsiliasi Keuangan",
};

function AIChatPage() {
	const [messages, setMessages] = useState<ChatMessage[]>([
		{
			role: "assistant",
			content:
				"Halo! Saya Yumi, asisten AI kamu untuk YUMI POS. Saya bisa membantu merekap data, menganalisis bisnis, MELAKUKAN AKSI seperti tambah produk, update stok, buat pesanan, dan bahkan MULTI-STEP ACTIONS dalam satu permintaan. Sekarang saya dilengkapi dengan Forecasting, Analisis HPP, Efektivitas Diskon, dan Rekonsiliasi Keuangan!",
		},
	]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamingContent, setStreamingContent] = useState("");
	const streamingActiveRef = useRef(false);
	const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
	const [isImageScannerOpen, setIsImageScannerOpen] = useState(false);
	const [selectedImage, setSelectedImage] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<TabType>("chat");
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [showSessionHistory, setShowSessionHistory] = useState(false);

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const yumiChat = useAction(api.ai.yumiChat);

	// Fetch data for AI
	const products = useQuery(api.products.getAllProductsAdmin, {});
	const inventory = useQuery(api.inventory.getInventory, {});
	const orders = useQuery(api.orders.getOrders, {});

	// Chat Sessions
	const chatSessions = useQuery(api.aiMemory.getChatSessions, {});
	const createSessionMutation = useMutation(api.aiMemory.createChatSession);
	const deleteSessionMutation = useMutation(api.aiMemory.deleteChatSession);
	const saveConversationMutation = useMutation(api.aiMemory.saveConversationContext);
	const loadConversationQuery = useQuery(
		api.aiMemory.getConversationContext,
		currentSessionId ? { sessionId: currentSessionId } : "skip"
	);

	// AI Proactive Suggestions
	const proactiveSuggestions = useQuery(api.ai.getProactiveSuggestions, {});

	// Predictive Analytics
	const stockPredictions = useQuery(api.ai.predictStockOut, { daysAhead: 7 });
	const busyHoursPrediction = useQuery(api.ai.predictBusyHours, {});
	const revenuePrediction = useQuery(api.ai.predictDailyRevenue, { daysAhead: 7 });
	const trendingProducts = useQuery(api.ai.predictTrendingProducts, { daysAhead: 7 });
	const bestPromoTime = useQuery(api.ai.predictBestPromoTime, {});

	// Follow-up Tasks
	const pendingTasks = useQuery(api.aiMemory.getPendingTasks, {});
	const completeTaskMutation = useMutation(api.aiMemory.completeTask);
	const dismissTaskMutation = useMutation(api.aiMemory.dismissTask);
	const autoGenerateTasksMutation = useMutation(api.ai.autoGenerateTasks);

	// Financial Summary for reports
	const _financialSummary = useQuery(api.finance.getFinancialSummary, {});

	// Generate smart insights
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
			icon: <Bell className="h-3.5 w-3.5 text-primary" />,
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
	}, []);

	// Auto-scroll while streaming
	useEffect(() => {
		if (isStreaming) {
			messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [streamingContent, isStreaming]);

	// Sanitize AI response - remove markdown formatting
	const sanitizeResponse = (text: string): string => {
		if (!text) return "";
		return text
			// Remove bold markdown
			.replace(/\*\*(.*?)\*\*/g, "$1")
			// Remove italic markdown
			.replace(/\*(.*?)\*/g, "$1")
			// Remove heading markdown
			.replace(/^#+\s+/gm, "")
			// Remove bullet points (*) and replace with emoji
			.replace(/^\*\s+/gm, "• ")
			.replace(/^\-\s+/gm, "• ")
			// Remove code blocks
			.replace(/```[\s\S]*?```/g, "")
			// Remove inline code
			.replace(/`(.*?)`/g, "$1")
			// Remove numbered list markdown
			.replace(/^\d+\.\s+/gm, "")
			// Clean up extra whitespace
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	};

	// Stream text word by word for realistic streaming effect
	const streamText = useCallback(
		(text: string, onComplete: () => void) => {
			const tokens = text.split(/(\s+)/);
			let i = 0;
			streamingActiveRef.current = true;
			setIsStreaming(true);
			setStreamingContent("");

			const next = () => {
				if (!streamingActiveRef.current) return;
				if (i < tokens.length) {
					const chunk = tokens[i];
					setStreamingContent((prev) => prev + chunk);
					i++;
					// 20ms for words, 3ms for whitespace → ~50 chars/sec
					const delay = chunk.trim().length > 0 ? 20 : 3;
					setTimeout(next, delay);
				} else {
					streamingActiveRef.current = false;
					setIsStreaming(false);
					setStreamingContent("");
					onComplete();
				}
			};
			next();
		},
		[]
	);

	// Session management functions (defined before sendMessage to avoid initialization issues)
	const startNewSession = async () => {
		const today = new Date();
		const dateStr = today.toLocaleDateString("id-ID", {
			day: "numeric",
			month: "short",
		});
		const timeStr = today.toLocaleTimeString("id-ID", {
			hour: "2-digit",
			minute: "2-digit",
		});

		try {
			const result = await createSessionMutation({
				title: `Chat ${dateStr} ${timeStr}`,
			});
			if (result) {
				setCurrentSessionId(result.sessionId);
				setMessages([
					{
						role: "assistant",
						content:
							"Halo! Saya Yumi, asisten AI kamu. Ada yang bisa saya bantu hari ini?",
					},
				]);
				setShowSessionHistory(false);
			}
		} catch {
			toast.error("Gagal membuat sesi baru");
		}
	};

	const saveMessage = async (message: ChatMessage) => {
		if (currentSessionId) {
			try {
				await saveConversationMutation({
					sessionId: currentSessionId,
					role: message.role,
					content: message.content,
					metadata: {
						imageAttached: !!message.image,
					},
				});
			} catch (error) {
				console.error("Failed to save message:", error);
			}
		}
	};

	const sendMessage = useCallback(
		async (text: string, image?: string) => {
			if (!(text.trim() || image) || isLoading) {
				return;
			}

			// Create session if none exists
			if (!currentSessionId) {
				await startNewSession();
			}

			const userMessage: ChatMessage = {
				role: "user",
				content: text.trim(),
				image: image || selectedImage || undefined,
			};
			setMessages((prev) => [...prev, userMessage]);
			setInput("");
			setSelectedImage(null);
			setIsLoading(true);
			setToolCalls([]);

			try {
				const history = messages
					.filter((m) => m.role === "user" || m.role === "assistant")
					.map((m) => ({ role: m.role, content: m.content }));

				const attachedImage = image || selectedImage || undefined;
				const response = await yumiChat({
					message: text.trim() || (attachedImage ? "Tolong analisis gambar ini." : ""),
					history,
					image: attachedImage,
				});

				let hasToolExecution = false;
				const detectedTools: ToolCall[] = [];

				if (response?.includes("Berhasil menjalankan")) {
					hasToolExecution = true;
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
					for (const tool of detectedTools) {
						setToolCalls((prev) => [...prev, { ...tool, status: "executing" }]);
						await new Promise((r) => setTimeout(r, 600));
						setToolCalls((prev) =>
							prev.map((t) =>
								t.name === tool.name ? { ...t, status: "success" as const } : t
							)
						);
					}
					setTimeout(() => setToolCalls([]), 3000);
				}

				const sanitized =
					sanitizeResponse(response) ||
					"Maaf, saya tidak bisa memproses permintaan ini.";

				setIsLoading(false);

				// Stream the response word by word for realistic effect
				streamText(sanitized, async () => {
					const assistantMessage: ChatMessage = {
						role: "assistant",
						content: sanitized,
					};
					setMessages((prev) => [...prev, assistantMessage]);
					if (currentSessionId) {
						await saveMessage(userMessage);
						await saveMessage(assistantMessage);
					}
				});
			} catch {
				setIsLoading(false);
				streamingActiveRef.current = false;
				setIsStreaming(false);
				setStreamingContent("");
				setMessages((prev) => [
					...prev,
					{
						role: "assistant",
						content: "Maaf, terjadi kesalahan. Silakan coba lagi.",
					},
				]);
				setToolCalls([]);
			}
		},
		[isLoading, messages, yumiChat, selectedImage, currentSessionId, startNewSession, saveMessage, streamText]
	);

	const handleFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) {
				return;
			}

			if (!file.type.startsWith("image/")) {
				toast.error("Harap upload file gambar");
				return;
			}

			if (file.size > 5 * 1024 * 1024) {
				toast.error("Ukuran gambar maksimal 5MB");
				return;
			}

			const reader = new FileReader();
			reader.onload = (e) => {
				setSelectedImage(e.target?.result as string);
			};
			reader.readAsDataURL(file);
		},
		[]
	);

	const handleRemoveImage = useCallback(() => {
		setSelectedImage(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	}, []);

	const handleCompleteTask = async (taskId: string) => {
		try {
			await completeTaskMutation({ taskId });
			toast.success("Tugas berhasil diselesaikan!");
		} catch {
			toast.error("Gagal menyelesaikan tugas.");
		}
	};

	const handleDismissTask = async (taskId: string) => {
		try {
			await dismissTaskMutation({ taskId });
			toast.success("Tugas berhasil diabaikan.");
		} catch {
			toast.error("Gagal mengabaikan tugas.");
		}
	};

	const handleExecuteSuggestion = async (suggestion: Suggestion) => {
		if (!suggestion.action) {
			toast.info("Tindakan ini memerlukan konfirmasi manual.");
			return;
		}

		setIsLoading(true);
		try {
			// Execute the suggested action via yumi chat
			const prompt = `Lakukan tindakan berikut: ${suggestion.title} - ${suggestion.description}`;
			const response = await yumiChat({
				message: prompt,
				history: [],
			});

			setMessages((prev) => [
				...prev,
				{
					role: "user",
					content: prompt,
				},
				{
					role: "assistant",
					content: sanitizeResponse(response) || "Tindakan berhasil diproses.",
				},
			]);
			toast.success("Tindakan berhasil dieksekusi!");
		} catch (_error) {
			toast.error("Gagal mengeksekusi tindakan.");
		} finally {
			setIsLoading(false);
		}
	};

	// Session management
	const loadSession = async (sessionId: string) => {
		setCurrentSessionId(sessionId);
		setShowSessionHistory(false);
		// Messages will be loaded via loadConversationQuery
	};

	const deleteSession = async (sessionId: string) => {
		try {
			await deleteSessionMutation({ sessionId });
			if (currentSessionId === sessionId) {
				setCurrentSessionId(null);
				setMessages([
					{
						role: "assistant",
						content:
							"Halo! Saya Yumi, asisten AI kamu. Ada yang bisa saya bantu hari ini?",
					},
				]);
			}
			toast.success("Sesi berhasil dihapus");
		} catch {
			toast.error("Gagal menghapus sesi");
		}
	};

	// Load conversation when session changes
	useEffect(() => {
		if (currentSessionId && loadConversationQuery) {
			const history = loadConversationQuery
				.filter((m) => m.role !== "system")
				.map((m) => ({
					role: m.role as "user" | "assistant",
					content: m.content,
				}));

			if (history.length > 0) {
				setMessages(history);
			}
		}
	}, [currentSessionId, loadConversationQuery]);

	// Get predictions for display (disabled for now - functions not implemented)
	// const getStockRiskLevel = () => {
	// 	if (!stockPredictions.data) return "low";
	// 	const highRisk = (stockPredictions.data as any[]).filter((p: any) => p.risk === "high").length;
	// 	return highRisk > 0 ? "high" : highRisk > 2 ? "medium" : "low";
	// };

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background pb-16 md:pb-0">
			{/* Header with Tabs */}
			<div className="flex items-center gap-3 border-border border-b bg-card px-2 py-2">
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 md:h-10 md:w-10 md:rounded-full">
						<Bot className="h-4 w-4 text-primary md:h-5 md:w-5" />
					</div>
					<div className="min-w-0">
						<h2 className="font-bold text-foreground text-sm md:text-base">
							Yumi AI
						</h2>
						<p className="hidden text-muted-foreground text-xs md:block">
							Asisten Bisnis Cerdas
						</p>
					</div>
				</div>

				{/* Smart Insights Badge */}
				{smartInsights.length > 0 && (
					<div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1">
						<Lightbulb className="h-3 w-3 text-primary" />
						<span className="font-medium text-[10px] text-primary">
							{smartInsights.length}
						</span>
					</div>
				)}

				{/* Tabs */}
				<div className="ml-auto flex gap-1">
					{/* Chat History Button */}
					{activeTab === "chat" && (
						<button
							className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-xs transition-colors text-muted-foreground hover:bg-muted"
							onClick={() => setShowSessionHistory(!showSessionHistory)}
							type="button"
						>
							<Bot className="h-4 w-4" />
							<span className="hidden md:inline">Riwayat</span>
						</button>
					)}
					{[
						{
							id: "chat" as TabType,
							label: "Chat",
							icon: <Bot className="h-4 w-4" />,
						},
						{
							id: "suggestions" as TabType,
							label: "Saran",
							icon: <Lightbulb className="h-4 w-4" />,
						},
						{
							id: "predictions" as TabType,
							label: "Prediksi",
							icon: <TrendingUp className="h-4 w-4" />,
						},
						{
							id: "tasks" as TabType,
							label: "Tasks",
							icon: <Target className="h-4 w-4" />,
						},
					].map((tab) => (
						<button
							className={`rounded-lg px-3 py-1.5 font-medium text-xs transition-colors ${
								activeTab === tab.id
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:bg-muted"
							}`}
							key={tab.id}
							onClick={() => setActiveTab(tab.id)}
							type="button"
						>
							<span className="flex items-center gap-1">
								{tab.icon}
								<span className="hidden md:inline">{tab.label}</span>
							</span>
						</button>
					))}
				</div>
			</div>

			{/* Content Area - Scrollable */}
			<div className="flex-1 overflow-y-auto">
				{activeTab === "chat" && (
					<>
						{/* Messages */}
						<div className="p-4 md:p-6 pb-0">
							<div className="mx-auto max-w-full space-y-4 md:max-w-3xl">
								{/* Smart Insights Cards */}
								{smartInsights.length > 0 && messages.length <= 1 && (
									<div className="mb-4 grid grid-cols-3 gap-2 md:gap-3">
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
									</div>
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
													{msg.image && (
														<div className="mb-2 overflow-hidden rounded-lg">
															<img
																alt="Uploaded image"
																className="h-auto max-h-48 w-full object-contain"
																src={msg.image}
															/>
														</div>
													)}
													<div className="whitespace-pre-line">
														{msg.content}
													</div>
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
												</div>
											</div>
										</motion.div>
									))}
								</AnimatePresence>

								{/* Typing Indicator */}
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
													<span className="h-1 w-1 animate-bounce rounded-full bg-primary/60" />
													<span className="h-1 w-1 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: "0.15s" }} />
													<span className="h-1 w-1 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: "0.3s" }} />
												</div>
											</div>
										</div>
									</div>
								)}

								{/* Streaming Message */}
								{isStreaming && streamingContent && (
									<div className="flex justify-start">
										<div className="max-w-[85%] space-y-1 items-start">
											<div className="flex items-center gap-1.5 px-1">
												<Bot className="h-3.5 w-3.5 text-primary" />
												<span className="font-bold text-[10px] text-primary uppercase tracking-wider">
													Yumi
												</span>
											</div>
											<div className="rounded-xl rounded-tl-none border border-border bg-card px-3 py-2.5 text-sm leading-relaxed md:rounded-2xl md:px-4 md:py-3">
												<div className="whitespace-pre-line">
													{streamingContent}
													<span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary" />
												</div>
											</div>
										</div>
									</div>
								)}
<div ref={messagesEndRef} />
							</div>
						</div>
					</>
				)}

				{/* Suggestions Tab */}
				{activeTab === "suggestions" && (
					<div className="space-y-4 p-4">
						<h3 className="mb-4 font-bold text-foreground">
							Saran Proaktif AI
						</h3>

						{!proactiveSuggestions || proactiveSuggestions.length === 0 ? (
							<div className="py-8 text-center">
								<Lightbulb className="mx-auto mb-2 h-12 w-12 text-muted-foreground" />
								<p className="text-muted-foreground">
									Tidak ada saran saat ini. Semua berjalan lancar!
								</p>
							</div>
						) : (
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
								{proactiveSuggestions.map((suggestion: any) => (
									<div
										className={`space-y-2 rounded-xl border p-4 ${
											suggestion.priority === "high"
												? "border-destructive/50 bg-destructive/5"
												: suggestion.priority === "medium"
													? "border-warning/50 bg-warning/5"
													: "border-border bg-muted/50"
										}`}
										key={suggestion.id}
									>
										<div className="flex items-start justify-between">
											<div className="flex items-center gap-2">
												{suggestion.type === "low_stock" && (
													<AlertTriangle className="h-4 w-4 text-accent" />
												)}
												{suggestion.type === "pending_order" && (
													<Bell className="h-4 w-4 text-primary" />
												)}
												{suggestion.type === "stock_prediction" && (
													<TrendingUp className="h-4 w-4 text-purple-500" />
												)}
												{suggestion.type === "promo_opportunity" && (
													<Sparkles className="h-4 w-4 text-green-500" />
												)}
												<p className="font-semibold text-sm">
													{suggestion.title}
												</p>
											</div>
											<span
												className={`rounded-full px-2 py-0.5 text-[10px] ${
													suggestion.priority === "high"
														? "bg-destructive text-destructive-foreground"
														: suggestion.priority === "medium"
															? "bg-warning text-warning-foreground"
															: "bg-muted text-muted-foreground"
												}`}
											>
												{suggestion.priority === "high"
													? "Penting"
													: suggestion.priority === "medium"
														? "Sedang"
														: "Biasa"}
											</span>
										</div>
										<p className="text-muted-foreground text-xs">
											{suggestion.description}
										</p>

										{suggestion.action && (
											<button
												className="mt-2 w-full rounded-lg bg-primary py-2 font-semibold text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-50"
												disabled={isLoading}
												onClick={() => handleExecuteSuggestion(suggestion)}
												type="button"
											>
												Lakukan
											</button>
										)}
									</div>
								))}
							</div>
						)}
					</div>
				)}

				{/* Predictions Tab */}
				{activeTab === "predictions" && (
					<div className="space-y-4 p-4">
						<h3 className="mb-4 font-bold text-foreground">Prediksi AI</h3>

						{/* Stock Out Predictions */}
						<div className="space-y-3">
							<h4 className="text-muted-foreground text-sm font-semibold">
								Prediksi Stok Habis
							</h4>
							{stockPredictions && stockPredictions.length > 0 ? (
								<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
									{stockPredictions.map((item: any) => (
										<div
											className={`rounded-lg border p-3 ${
												item.risk === "high"
													? "border-destructive/50 bg-destructive/5"
													: "border-warning/50 bg-warning/5"
											}`}
											key={item.ingredientName}
										>
											<div className="flex items-center justify-between">
												<div>
													<p className="font-medium text-sm">
														{item.ingredientName}
													</p>
													<p className="text-muted-foreground text-xs">
														Sisa: {item.currentStock} {item.unit}
													</p>
												</div>
												<div className="text-right">
													<p className="text-foreground text-xs">
														{item.daysUntilEmpty <= 1
															? "Habis hari ini"
															: item.daysUntilEmpty === 1
																? "Habis besok"
																: `Habis dalam ${item.daysUntilEmpty} hari`}
													</p>
													<p className="text-muted-foreground text-xs">
														Pakai: {item.dailyUsage}/hari
													</p>
												</div>
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
									<p className="text-muted-foreground text-sm">
										Tidak ada item yang berisiko habis dalam 7 hari ke depan
									</p>
								</div>
							)}
						</div>

						{/* Busy Hours Prediction */}
						<div className="space-y-3">
							<h4 className="text-muted-foreground text-sm font-semibold">
								Jam Ramai
							</h4>
							{busyHoursPrediction && busyHoursPrediction.peakHours ? (
								<div className="grid grid-cols-5 gap-2">
									{busyHoursPrediction.peakHours.map((hour: any) => (
										<div
											className="rounded-lg border border-primary/30 bg-primary/5 p-2 text-center"
											key={hour.hour}
										>
											<p className="font-bold text-primary">
												{hour.hour}:00
											</p>
											<p className="text-muted-foreground text-xs">
												{hour.percentage}%
											</p>
										</div>
									))}
								</div>
							) : (
								<div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
									<p className="text-muted-foreground text-sm">
										Belum cukup data untuk analisis jam ramai
									</p>
								</div>
							)}
						</div>

						{/* Revenue Prediction */}
						<div className="space-y-3">
							<h4 className="text-muted-foreground text-sm font-semibold">
								Prediksi Pendapatan 7 Hari Kedepan
							</h4>
							{revenuePrediction && revenuePrediction.predictions ? (
								<>
									<div className="flex items-center gap-2">
										<p className="text-muted-foreground text-xs">
											Rata-rata harian saat ini:
										</p>
										<p className="font-bold text-foreground text-sm">
											Rp {revenuePrediction.currentAvgDaily?.toLocaleString("id-ID")}
										</p>
										<span
											className={`rounded-full px-2 py-0.5 text-[10px] ${
												revenuePrediction.trend === "increasing"
													? "bg-green-500/20 text-green-600"
													: revenuePrediction.trend === "decreasing"
														? "bg-red-500/20 text-red-600"
														: "bg-muted text-muted-foreground"
											}`}
										>
											{revenuePrediction.trend === "increasing"
												? "Naik"
												: revenuePrediction.trend === "decreasing"
													? "Turun"
													: "Stabil"}
										</span>
									</div>
									<div className="grid grid-cols-7 gap-2">
										{revenuePrediction.predictions.map(
											(pred: any, index: number) => (
												<div
													className="rounded-lg border border-border bg-card p-2 text-center"
													key={pred.date}
												>
													<p className="text-muted-foreground text-[10px]">
														{pred.dayName.slice(0, 3)}
													</p>
													<p className="font-medium text-xs">
														{(pred.predictedRevenue / 1000).toFixed(0)}k
													</p>
												</div>
											)
										)}
									</div>
								</>
							) : (
								<div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
									<p className="text-muted-foreground text-sm">
										Belum cukup data untuk prediksi pendapatan
									</p>
								</div>
							)}
						</div>

						{/* Trending Products Prediction */}
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<h4 className="text-muted-foreground text-sm font-semibold">
									Produk Trending
								</h4>
								{trendingProducts && trendingProducts.length > 0 && (
									<span className="text-muted-foreground text-xs">
										Berdasarkan growth rate 7 hari terakhir
									</span>
								)}
							</div>
							{trendingProducts && trendingProducts.length > 0 ? (
								<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
									{trendingProducts.slice(0, 4).map((product: any) => (
										<div
											className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
											key={product._id}
										>
											<div
												className={`flex h-8 w-8 items-center justify-center rounded-full ${
													product.growthRate > 0
														? "bg-green-500/20 text-green-600"
														: product.growthRate < 0
															? "bg-red-500/20 text-red-600"
															: "bg-muted text-muted-foreground"
												}`}
											>
												<TrendingUp className="h-4 w-4" />
											</div>
											<div className="flex-1">
												<p className="font-medium text-xs">{product.name}</p>
												<p className="text-muted-foreground text-[10px]">
													{product.recentSales} terjual minggu ini
												</p>
											</div>
											<div className="text-right">
												<p
													className={`text-xs font-semibold ${
														product.growthRate > 0
															? "text-green-600"
															: "text-red-600"
													}`}
												>
													{product.growthRate > 0 ? "+" : ""}
													{product.growthRate}%
												</p>
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="rounded-lg border border-border bg-muted/50 p-3 text-center">
									<p className="text-muted-foreground text-xs">
										Belum cukup data untuk analisis trending
									</p>
								</div>
							)}
						</div>

						{/* Best Promo Time Prediction */}
						<div className="space-y-3">
							<h4 className="text-muted-foreground text-sm font-semibold">
								Waktu Terbaik untuk Promo
							</h4>
							{bestPromoTime && bestPromoTime.hasEnoughData ? (
								<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
									<div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
										<p className="text-muted-foreground text-[10px]">Hari Terbaik</p>
										<p className="font-semibold text-sm text-primary">
											{bestPromoTime.bestDay?.day}
										</p>
										<p className="text-muted-foreground text-xs">
											{bestPromoTime.bestDay?.recommendation}
										</p>
									</div>
									<div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
										<p className="text-muted-foreground text-[10px]">Hari Butuh Promo</p>
										<p className="font-semibold text-sm text-warning">
											{bestPromoTime.worstDay?.day}
										</p>
										<p className="text-muted-foreground text-xs">
											{bestPromoTime.worstDay?.recommendation}
										</p>
									</div>
								</div>
							) : (
								<div className="rounded-lg border border-border bg-muted/50 p-3 text-center">
									<p className="text-muted-foreground text-xs">
										{bestPromoTime?.message || "Analisis waktu promo akan segera hadir"}
									</p>
								</div>
							)}
						</div>
					</div>
				)}

				{/* Tasks Tab */}
				{activeTab === "tasks" && (
					<div className="space-y-4 p-4">
						<div className="mb-4 flex items-center justify-between">
							<h3 className="font-bold text-foreground">Tindak Lanjutan</h3>
							<button
								className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-primary text-xs font-medium transition-colors hover:bg-primary/20 disabled:opacity-50"
								disabled={isLoading}
								onClick={async () => {
									setIsLoading(true);
									try {
										const result = await autoGenerateTasksMutation({});
										if (result) {
											toast.success(
												`${result.created} tugas baru berhasil dibuat!`
											);
										}
									} catch {
										toast.error("Gagal membuat tugas otomatis.");
									} finally {
										setIsLoading(false);
									}
								}}
								type="button"
							>
								<Sparkles className="h-3.5 w-3.5" />
								<span>Generate AI Tasks</span>
							</button>
						</div>

						{pendingTasks && pendingTasks.length > 0 ? (
							<div className="space-y-3">
								{pendingTasks.map((task: any) => (
									<div
										className={`rounded-lg border p-3 ${
											task.priority === "high"
												? "border-destructive/50 bg-destructive/5"
												: task.priority === "medium"
													? "border-warning/50 bg-warning/5"
													: "border-border bg-card"
										}`}
										key={task._id}
									>
										<div className="flex items-start gap-3">
											<div
												className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
													task.priority === "high"
														? "bg-destructive/20 text-destructive"
														: task.priority === "medium"
															? "bg-warning/20 text-warning"
															: "bg-primary/20 text-primary"
												}`}
											>
												<Target className="h-4 w-4" />
											</div>
											<div className="flex-1 min-w-0">
												<p className="font-medium text-sm">{task.title}</p>
												{task.description && (
													<p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">
														{task.description}
													</p>
												)}
												<div className="mt-1.5 flex items-center gap-2">
													<span
														className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
															task.category === "inventory"
																? "bg-blue-500/20 text-blue-600"
																: task.category === "orders"
																	? "bg-purple-500/20 text-purple-600"
																	: task.category === "finance"
																		? "bg-green-500/20 text-green-600"
																		: task.category === "marketing"
																			? "bg-orange-500/20 text-orange-600"
																			: "bg-gray-500/20 text-gray-600"
														}`}
													>
														{task.category}
													</span>
													{task.dueDate && (
														<span className="text-muted-foreground text-[10px]">
															<Calendar className="inline h-2.5 w-2.5 mr-0.5" />
															{new Date(task.dueDate).toLocaleDateString(
																"id-ID",
																{ day: "numeric", month: "short" }
															)}
														</span>
													)}
													{task.isOverdue && (
														<span className="text-destructive text-[10px] font-medium">
															Terlambat!
														</span>
													)}
												</div>
											</div>
											<div className="flex items-center gap-2">
												<button
													className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
													onClick={() => handleCompleteTask(task._id)}
													type="button"
												>
													Selesai
												</button>
												<button
													className="rounded-lg border border-border bg-muted px-3 py-1.5 text-muted-foreground text-xs font-medium hover:bg-muted transition-colors"
													onClick={() => handleDismissTask(task._id)}
													type="button"
												>
													Abai
												</button>
											</div>
										</div>
									</div>
								))}
							</div>
						) : (
							<div className="py-8 text-center">
								<Target className="mx-auto mb-2 h-12 w-12 text-muted-foreground" />
								<p className="text-muted-foreground">
									Tidak ada tugas tertunda
								</p>
							</div>
						)}
					</div>
				)}
			</div>

			{/* Input Form - Fixed at bottom, only for chat tab */}
			{activeTab === "chat" && (
				<div className="border-border border-t bg-card px-3 pb-4 pt-3 md:px-4">
					<div className="mx-auto max-w-full space-y-2 md:max-w-3xl">
						{/* Templates */}
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

						{/* ChatGPT/Claude-style Input Box */}
						<div className="rounded-2xl border border-border bg-background shadow-sm transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
							{/* Image Preview inside input box */}
							{selectedImage && (
								<div className="flex items-center gap-2 border-border border-b px-3 pt-2 pb-2">
									<div className="relative h-14 w-14 overflow-hidden rounded-xl border border-border bg-muted shadow-sm">
										<img
											alt="Preview"
											className="h-full w-full object-cover"
											src={selectedImage}
										/>
										<button
											className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white shadow-md transition-opacity hover:opacity-90"
											onClick={handleRemoveImage}
											type="button"
										>
											<X className="h-3 w-3" />
										</button>
									</div>
									<p className="text-muted-foreground text-xs">Gambar terlampir • AI akan membaca isinya</p>
								</div>
							)}

							{/* Hidden file input */}
							<input
								accept="image/*"
								className="hidden"
								onChange={handleFileSelect}
								ref={fileInputRef}
								type="file"
							/>

							{/* Textarea */}
							<textarea
								className="max-h-40 min-h-[44px] w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
								disabled={isLoading}
								onChange={(e) => {
									setInput(e.target.value);
									e.target.style.height = "auto";
									e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										if (input.trim() || selectedImage) {
											sendMessage(input);
											if (inputRef.current) {
												inputRef.current.style.height = "auto";
											}
										}
									}
								}}
								placeholder="Tanya Yumi... (Enter kirim, Shift+Enter baris baru)"
								ref={inputRef}
								rows={1}
								value={input}
							/>

							{/* Action Bar */}
							<div className="flex items-center justify-between px-2 pb-2">
								{/* Left: Camera/File upload */}
								<button
									className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
									disabled={isLoading}
									onClick={() => fileInputRef.current?.click()}
									title="Upload gambar atau ambil foto"
									type="button"
								>
									<Camera className="h-4 w-4" />
								</button>

								{/* Right: Send button */}
								<button
									className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
									disabled={isLoading || !(input.trim() || selectedImage)}
									onClick={() => {
										if (input.trim() || selectedImage) {
											sendMessage(input);
											if (inputRef.current) {
												inputRef.current.style.height = "auto";
											}
										}
									}}
									title="Kirim pesan"
									type="button"
								>
									{isLoading ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<Send className="h-4 w-4" />
									)}
								</button>
							</div>
						</div>

						<p className="text-center text-[10px] text-muted-foreground">
							Yumi AI dapat membuat kesalahan. Selalu verifikasi informasi penting.
						</p>
					</div>
				</div>
			)}

			{/* Chat History Sidebar Panel */}
			<AnimatePresence>
				{showSessionHistory && (
					<>
						{/* Backdrop */}
						<motion.div
							animate={{ opacity: 1 }}
							className="fixed inset-0 z-40 bg-black/50"
							exit={{ opacity: 0 }}
							initial={{ opacity: 0 }}
							onClick={() => setShowSessionHistory(false)}
						/>
						{/* Session History Panel */}
						<motion.div
							animate={{ x: 0 }}
							className="fixed right-0 top-0 bottom-0 z-50 w-80 border-border border-l bg-card shadow-2xl md:rounded-l-2xl"
							exit={{ x: "100%" }}
							initial={{ x: "100%" }}
							transition={{ type: "spring", damping: 25, stiffness: 300 }}
						>
							<div className="flex h-full flex-col">
								{/* Header */}
								<div className="flex items-center justify-between border-border border-b p-4">
									<div>
										<h3 className="font-semibold text-foreground">
											Riwayat Chat
										</h3>
										<p className="text-muted-foreground text-xs">
											{chatSessions?.length || 0} sesi
										</p>
									</div>
									<button
										className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80"
										onClick={() => setShowSessionHistory(false)}
										type="button"
									>
										<X className="h-4 w-4" />
									</button>
								</div>

								{/* New Chat Button */}
								<div className="p-3 border-border border-b">
									<button
										className="flex w-full items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-primary-foreground text-sm font-medium transition-colors hover:bg-primary/90"
										onClick={() => startNewSession()}
										type="button"
									>
										<Sparkles className="h-4 w-4" />
										Chat Baru
									</button>
								</div>

								{/* Session List */}
								<div className="flex-1 overflow-y-auto p-2 space-y-1">
									{!chatSessions || chatSessions.length === 0 ? (
										<div className="py-8 text-center">
											<Bot className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
											<p className="text-muted-foreground text-sm">
												Belum ada riwayat chat
											</p>
										</div>
									) : (
										chatSessions.map((session: ChatSession) => (
											<div
												className={`group relative rounded-lg border p-3 transition-all cursor-pointer ${
													currentSessionId === session.sessionId
														? "border-primary bg-primary/5"
														: "border-border bg-card hover:bg-muted/50"
												}`}
												key={session.sessionId}
												onClick={() => loadSession(session.sessionId)}
											>
												<div className="flex items-start justify-between gap-2">
													<div className="flex-1 min-w-0">
														<p className="font-medium text-xs text-foreground line-clamp-1">
															{session.title}
														</p>
														<p className="text-muted-foreground text-[10px]">
															{session.messageCount} pesan
														</p>
													</div>
													<button
														className="opacity-0 group-hover:opacity-100 transition-opacity"
														onClick={(e) => {
															e.stopPropagation();
															deleteSession(session.sessionId);
														}}
														type="button"
													>
														<X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
													</button>
												</div>
												<p className="text-muted-foreground text-[10px] mt-1">
													{new Date(session.createdAt).toLocaleDateString(
														"id-ID",
														{
															day: "numeric",
															month: "short",
															hour: "2-digit",
															minute: "2-digit",
														}
													)}
												</p>
											</div>
										))
									)}
								</div>
							</div>
						</motion.div>
					</>
				)}
			</AnimatePresence>

			{/* Image Scanner Modal */}
			<ImageScanner
				isOpen={isImageScannerOpen}
				onClose={() => setIsImageScannerOpen(false)}
				onDataGenerated={(type, data) => {
					setMessages((prev) => [
						...prev,
						{
							role: "assistant",
							content: `Berhasil membuat ${type} dengan data: ${JSON.stringify(data)}`,
						},
					]);
				}}
			/>
		</div>
	);
}

export default AIChatPage;
