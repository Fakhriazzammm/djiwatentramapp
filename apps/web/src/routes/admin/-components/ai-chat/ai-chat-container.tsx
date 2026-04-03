import { api } from "@yumipos/backend/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Calendar, Sparkles, Bell, TrendingUp, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { ImageScanner } from "@/components/ai/image-scanner";
import { ScanEditModal, type ScanEditParams } from "@/components/scan/scan-edit-modal";
import { ScanSplitModal } from "@/components/scan/scan-split-modal";
import { ScanHistoryPanel, useScanHistory } from "@/components/scan/scan-history-panel";

import type { ChatMessage, ToolCall, Suggestion, TabType, ChatSession, QuickActionButton, ScanActionButton, ScanResultData, ChatMode } from "./types";
import { mkMsgId, toRupiah, TOOL_LABELS, generateQuickActions, generateScanActionButtons, extractSuggestions, extractGenericActions, extractChartData, extractExportData, sanitizeResponse } from "./utils";
import { exportReport } from "./report-exporter";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { SessionHistory } from "./session-history";
import { PredictionsPanel } from "./predictions-panel";
import { SuggestionsPanel } from "./suggestions-panel";
import { TasksPanel } from "./tasks-panel";

interface AIChatContainerProps {
	mode?: ChatMode;
	onClose?: () => void;
	contextHint?: string;
}

export default function AIChatContainer({ mode = "admin", onClose, contextHint }: AIChatContainerProps) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamingContent, setStreamingContent] = useState("");
	const [streamSessionId, setStreamSessionId] = useState<string | null>(null);
	const streamingActiveRef = useRef(false);
	const scrollThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
	const [isImageScannerOpen, setIsImageScannerOpen] = useState(false);
	const [selectedImages, setSelectedImages] = useState<string[]>([]);
	const [activeTab, setActiveTab] = useState<TabType>("chat");
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [showSessionHistory, setShowSessionHistory] = useState(false);
	const [isScanMode, setIsScanMode] = useState(false);
	const [isScanning, setIsScanning] = useState(false);
	const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
	const briefingAttemptedRef = useRef(false);

	const [editModal, setEditModal] = useState<{ params: ScanEditParams; btnKey: string; messageIdx: number } | null>(null);
	const [splitModal, setSplitModal] = useState<{ params: ScanEditParams; btnKey: string } | null>(null);
	const [showScanHistory, setShowScanHistory] = useState(false);
	const { history: scanHistory, addEntry: addScanHistory, markSaved: markScanSaved, removeEntry: removeScanHistory, clearAll: clearScanHistory } = useScanHistory();

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const navigate = useNavigate();

	const yumiChat = useAction(api.ai.yumiChat);
	const bulkScanImageDataAction = useAction(api.ai.bulkScanImageData);
	const generateBusinessBriefingAction = useAction(api.ai.generateBusinessBriefing);
	
	const createTransactionMutation = useMutation(api.finance.createTransaction);
	const deleteTransactionMutation = useMutation(api.finance.deleteTransaction);
	const createSessionMutation = useMutation(api.aiMemory.createChatSession);
	const deleteSessionMutation = useMutation(api.aiMemory.deleteChatSession);
	const saveConversationMutation = useMutation(api.aiMemory.saveConversationContext);
	const completeTaskMutation = useMutation(api.aiMemory.completeTask);
	const dismissTaskMutation = useMutation(api.aiMemory.dismissTask);
	const recordStockPurchaseMutation = useMutation(api.stockPurchases.recordStockPurchase);
	const createProductMutation = useMutation(api.products.createProduct);
	const updateProductMutation = useMutation(api.products.updateProduct);
	const createDiscountMutation = useMutation(api.discounts.createDiscount);
	const toggleDiscountMutation = useMutation(api.discounts.updateDiscount);
	const createOrderMutation = useMutation(api.orders.createOrder);
	const updateOrderStatusMutation = useMutation(api.orders.updateOrderStatus);
	const createBookingOrderMutation = useMutation(api.booking.createBookingOrder);
	const updateBookingStatusMutation = useMutation(api.booking.updateBookingStatus);
	const createInventoryItemMutation = useMutation(api.inventory.createInventoryItem);
	const addStockMutation = useMutation(api.inventory.addStock);
	const setFinancialTargetMutation = useMutation(api.finance.setFinancialTarget);
	const startShiftMutation = useMutation(api.finance.startShift);
	const endShiftMutation = useMutation(api.finance.endShift);

	const [actionButtonDone, setActionButtonDone] = useState<Set<string>>(new Set());
	const [actionButtonLoading, setActionButtonLoading] = useState<Set<string>>(new Set());

	const chatSessions = useQuery(api.aiMemory.getChatSessions, {});
	const loadConversationQuery = useQuery(
		api.aiMemory.getConversationContext,
		currentSessionId ? { sessionId: currentSessionId } : "skip"
	);
	const streamingMessage = useQuery(
		api.ai.getStreamingMessage,
		streamSessionId ? { sessionId: streamSessionId } : "skip"
	);
	const proactiveSuggestions = useQuery(api.ai.getProactiveSuggestions, {});
	const stockPredictions = useQuery(api.ai.predictStockOut, { daysAhead: 7 });
	const busyHoursPrediction = useQuery(api.ai.predictBusyHours, {});
	const revenuePrediction = useQuery(api.ai.predictDailyRevenue, { daysAhead: 7 });
	const trendingProducts = useQuery(api.ai.predictTrendingProducts, { daysAhead: 7 });
	const bestPromoTime = useQuery(api.ai.predictBestPromoTime, {});
	const pendingTasks = useQuery(api.aiMemory.getPendingTasks, {});
	const inventory = useQuery(api.inventory.getInventory, {});
	const orders = useQuery(api.orders.getOrders, {});

	useEffect(() => {
		if (!isStreaming) return;
		if (scrollThrottleRef.current) return;
		scrollThrottleRef.current = setTimeout(() => {
			messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
			scrollThrottleRef.current = null;
		}, 120);
	}, [streamingContent, isStreaming]);

	useEffect(() => {
		if (loadConversationQuery) {
			const loadedMessages: ChatMessage[] = (loadConversationQuery as any).map((item: any) => ({
				role: item.role,
				content: item.content,
				_msgId: item._id,
			}));
			setMessages(loadedMessages);
		}
	}, [loadConversationQuery]);

	useEffect(() => {
		if (!streamSessionId || !streamingMessage) return;
		if (streamingMessage.status === "streaming" || (isLoading && streamingMessage.content)) {
			streamingActiveRef.current = true;
			setIsStreaming(true);
			setStreamingContent(streamingMessage.content);
			return;
		}
		if (streamingMessage.status === "completed") {
			streamingActiveRef.current = false;
			setIsStreaming(false);
		}
	}, [streamSessionId, streamingMessage, isLoading]);

	const startNewSession = useCallback(async () => {
		try {
			const result = await createSessionMutation({ 
				title: "Percakapan Baru " + new Date().toLocaleTimeString("id-ID")
			});
			const sid = (result as any).sessionId || result;
			setCurrentSessionId(sid);
			setStreamSessionId(sid);
			setMessages([]);
			setToolCalls([]);
			briefingAttemptedRef.current = false;
			return sid;
		} catch (error) {
			toast.error("Gagal membuat sesi baru");
			return null;
		}
	}, [createSessionMutation]);

	const loadSession = useCallback((sessionId: string) => {
		setCurrentSessionId(sessionId);
		setStreamSessionId(sessionId);
		setShowSessionHistory(false);
	}, []);

	const deleteSession = useCallback(async (sessionId: string) => {
		try {
			await deleteSessionMutation({ sessionId });
			if (currentSessionId === sessionId) {
				setCurrentSessionId(null);
				setStreamSessionId(null);
				setMessages([]);
			}
			toast.success("Sesi berhasil dihapus");
		} catch (error) {
			toast.error("Gagal menghapus sesi");
		}
	}, [currentSessionId, deleteSessionMutation]);

	const compressImage = useCallback((dataUrl: string): Promise<string> => {
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement("canvas");
				const ctx = canvas.getContext("2d");
				if (!ctx) { resolve(dataUrl); return; }
				const maxDimension = 1024;
				let { width, height } = img;
				if (width > maxDimension || height > maxDimension) {
					if (width > height) { height = Math.round((height * maxDimension) / width); width = maxDimension;
					} else { width = Math.round((width * maxDimension) / height); height = maxDimension; }
				}
				canvas.width = width;
				canvas.height = height;
				ctx.drawImage(img, 0, 0, width, height);
				let quality = 0.8;
				let result = canvas.toDataURL("image/jpeg", quality);
				while (result.length > 500_000 && quality > 0.3) {
					quality -= 0.1;
					result = canvas.toDataURL("image/jpeg", quality);
				}
				resolve(result);
			};
			img.onerror = () => resolve(dataUrl);
			img.src = dataUrl;
		});
	}, []);

	const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		if (files.length === 0) return;
		files.forEach(file => {
			if (!file.type.startsWith("image/")) { toast.error(`${file.name} bukan gambar`); return; }
			const reader = new FileReader();
			reader.onload = async (event) => {
				const raw = event.target?.result as string;
				const compressed = await compressImage(raw);
				setSelectedImages(prev => [...prev, compressed]);
			};
			reader.readAsDataURL(file);
		});
		e.target.value = '';
	}, [compressImage]);

	const runDailyBriefing = useCallback(async () => {
		if (briefingAttemptedRef.current) return;
		if (inventory === undefined || orders === undefined) return;
		const isDataLoaded = inventory !== undefined && orders !== undefined;
		if (!isDataLoaded) return;
		briefingAttemptedRef.current = true;
		setIsLoading(true);
		try {
			const lowStockItems = inventory?.filter((i: any) => i.quantity <= i.lowStockThreshold) || [];
			const pendingOrderCount = orders?.filter((o: any) => o.status === "pending").length || 0;
			let context = "";
			if (lowStockItems.length > 0) {
				context += `\nKRITIS: Ada ${lowStockItems.length} item stok rendah: ${lowStockItems.slice(0,3).map((i:any)=>i.name).join(", ")}.`;
			}
			if (pendingOrderCount > 0) {
				context += `\nPERHATIAN: Ada ${pendingOrderCount} pesanan baru yang belum diproses.`;
			}
			const localHour = new Date().getHours();
			const briefing = await generateBusinessBriefingAction({ localHour, context: context || undefined });
			if (briefing) {
				const briefingText = typeof briefing === "string" ? briefing : briefing.content;
				const sanitizedBriefing = sanitizeResponse(briefingText);
				const assistantMsg: ChatMessage = {
					role: "assistant",
					content: sanitizedBriefing,
					suggestions: extractSuggestions(briefingText),
					chartData: extractChartData(briefingText),
					exportData: extractExportData(briefingText),
					_msgId: mkMsgId(),
				};
				setMessages(prev => {
					if (prev.length > 0) return prev;
					return [assistantMsg];
				});
			}
		} catch (error) {
			console.error("Briefing error:", error);
		} finally {
			setIsLoading(false);
		}
	}, [generateBusinessBriefingAction, inventory, orders]);

	useEffect(() => {
		if (activeTab === "chat" && messages.length === 0 && !isLoading && !isStreaming) {
			const timer = setTimeout(() => {
				runDailyBriefing();
			}, 100);
			return () => clearTimeout(timer);
		}
	}, [activeTab, messages.length, isLoading, isStreaming, runDailyBriefing]);

	const processImagesWithAI = useCallback(async (images: string[], customPrompt?: string) => {
		if (isScanning) return;
		setIsScanning(true);
		setIsLoading(true);
		setToolCalls([]);
		try {
			const res = await bulkScanImageDataAction({ images });
			if (!res || !res.length) throw new Error("Gagal menganalisis gambar");
			const newMessages: ChatMessage[] = [];
			for (let i = 0; i < res.length; i++) {
				const scanData = res[i].data;
				if (!scanData) continue;
				const itemsStr = scanData.items?.length 
					? `\n📋 Detail Item (${scanData.items.length} item):\n` + scanData.items.map((item: any, idx: number) => `${idx + 1}. ${item.name} x${item.qty} = Rp ${toRupiah(item.subtotal)}`).join("\n")
					: "";
				const assistantContent = `🍩 Merchant: ${scanData.name || "Toko"}${itemsStr}\n\n💰 Total: Rp ${toRupiah(scanData.total)}\n📊 Keyakinan: ${scanData.confidence}% | Kategori: ${scanData.category?.replace(/_/g, " ") || "Umum"}`;
				const assistantMsg: ChatMessage = {
					role: "assistant",
					content: assistantContent,
					scanData,
					actionButtons: generateScanActionButtons(scanData),
					_msgId: mkMsgId(),
				};
				newMessages.push(assistantMsg);
				addScanHistory({ ...scanData, id: assistantMsg._msgId!, timestamp: Date.now() });
			}
			setMessages(prev => [...prev, ...newMessages]);
			setSelectedImages([]);
			setIsScanMode(false);
			toast.success(`${res.length} gambar berhasil dianalisis`);
		} catch (error: any) {
			toast.error(error.message || "Gagal menganalisis gambar");
		} finally {
			setIsScanning(false);
			setIsLoading(false);
		}
	}, [isScanning, bulkScanImageDataAction, addScanHistory]);

	const sendMessage = useCallback(async (text: string) => {
		const trimmed = text.trim();
		if (!(trimmed || selectedImages.length > 0) || isLoading || isScanning) return;
		if (isScanMode && selectedImages.length > 0) {
			await processImagesWithAI(selectedImages, trimmed);
			setInput("");
			return;
		}
		let sessionId = currentSessionId;
		if (!sessionId && mode === "admin") {
			sessionId = await startNewSession();
			if (!sessionId) return;
		}
		const userMsg: ChatMessage = { role: "user", content: trimmed, image: selectedImages[0], _msgId: mkMsgId() };
		const requestSessionId = sessionId ?? `pos-${mkMsgId()}`;
		const pendingAssistantId = mkMsgId();
		setStreamSessionId(requestSessionId);
		setMessages(prev => [...prev, userMsg, { role: "assistant", content: "", _msgId: pendingAssistantId }]);
		setInput("");
		setSelectedImages([]);
		setIsLoading(true);
		setIsStreaming(false);
		setStreamingContent("");
		setToolCalls([]);
		try {
			const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
			const response = await yumiChat({ 
				sessionId: requestSessionId,
				message: trimmed, 
				history, 
				images: selectedImages.length > 0 ? selectedImages : (userMsg.image ? [userMsg.image] : undefined),
				contextHint: contextHint || undefined,
			});
			const responseText = response.content;
			const suggestions = extractSuggestions(responseText);
			const quickActions = generateQuickActions(trimmed, responseText);
			const genericActions = extractGenericActions(responseText);
			const chartData = extractChartData(responseText);
			const exportData = extractExportData(responseText);
			const sanitizedResponse = sanitizeResponse(responseText);
			setToolCalls(response.toolCalls);
			setMessages(prev => prev.map(msg => (
				msg._msgId === pendingAssistantId
					? { role: "assistant", content: sanitizedResponse, suggestions, quickActions, genericActions, chartData, exportData, _msgId: pendingAssistantId }
					: msg
			)));
			if (mode === "admin" && sessionId) {
				await saveConversationMutation({ sessionId: sessionId!, role: "user", content: trimmed });
				await saveConversationMutation({ sessionId: sessionId!, role: "assistant", content: sanitizedResponse });
			}
		} catch (error) {
			toast.error("Gagal mendapatkan respons AI");
			setMessages(prev => prev.filter(msg => msg._msgId !== pendingAssistantId));
		} finally {
			streamingActiveRef.current = false;
			setIsStreaming(false);
			setStreamingContent("");
			setIsLoading(false);
		}
	}, [currentSessionId, selectedImages, isLoading, isScanning, isScanMode, messages, yumiChat, startNewSession, saveConversationMutation, processImagesWithAI, mode, contextHint]);

	const handleCopy = useCallback((text: string, index: number) => {
		navigator.clipboard.writeText(text);
		setCopiedIndex(index);
		setTimeout(() => setCopiedIndex(null), 2000);
	}, []);

	const handleQuickAction = useCallback((action: QuickActionButton) => {
		if (action.actionType === "navigate" && action.href) {
			navigate({ to: action.href as any });
		} else if (action.actionType === "sendPrompt" && action.prompt) {
			sendMessage(action.prompt);
		}
	}, [navigate, sendMessage]);

	const handleScanAction = useCallback((btn: ScanActionButton, messageIdx: number) => {
		const key = `${messageIdx}-${btn.id}`;
		if (actionButtonDone.has(key)) return;
		setEditModal({ params: btn.params, btnKey: key, messageIdx });
	}, [actionButtonDone]);

	const handleSaveFromEditModal = useCallback(async (params: ScanEditParams) => {
		if (!editModal) return;
		const { btnKey } = editModal;
		setActionButtonLoading(prev => { const s = new Set<string>(prev); s.add(btnKey); return s; });
		try {
			await createTransactionMutation(params);
			toast.success("Berhasil disimpan!");
			setActionButtonDone(prev => { const s = new Set<string>(prev); s.add(btnKey); return s; });
			markScanSaved(btnKey);
			setEditModal(null);
		} catch (error) { toast.error("Gagal menyimpan");
		} finally { setActionButtonLoading(prev => { const s = new Set<string>(prev); s.delete(btnKey); return s; }); }
	}, [editModal, createTransactionMutation, markScanSaved]);

	const handleSaveFromSplitModal = useCallback(async (splits: ScanEditParams[]) => {
		if (!splitModal) return;
		try {
			await Promise.all(splits.map(p => createTransactionMutation(p)));
			toast.success("Semua split berhasil disimpan!");
			setActionButtonDone(prev => { const s = new Set<string>(prev); s.add(splitModal.btnKey); return s; });
			markScanSaved(splitModal.btnKey);
			setSplitModal(null); setEditModal(null);
		} catch (error) { toast.error("Gagal menyimpan split"); }
	}, [splitModal, createTransactionMutation, markScanSaved]);

	const handleExecuteSuggestion = async (s: Suggestion) => {
		setIsLoading(true);
		try {
			if (!s.action?.type) {
				await sendMessage(`Lakukan saran ini: ${s.title}`);
				return;
			}
			switch (s.action.type) {
				case "record_stock_purchase":
					await recordStockPurchaseMutation(s.action.args);
					toast.success("Stok berhasil dicatat!");
					break;
				case "create_product":
					await createProductMutation(s.action.args);
					toast.success("Produk berhasil dibuat!");
					break;
				case "update_product":
					await updateProductMutation(s.action.args);
					toast.success("Produk berhasil diperbarui!");
					break;
				case "update_product_price":
					await updateProductMutation(s.action.args);
					toast.success("Harga produk berhasil diperbarui!");
					break;
				case "create_discount":
					await createDiscountMutation(s.action.args);
					toast.success("Diskon berhasil dibuat!");
					break;
				case "toggle_discount":
					await toggleDiscountMutation(s.action.args);
					toast.success("Status diskon berhasil diubah!");
					break;
				case "create_order":
					await createOrderMutation(s.action.args);
					toast.success("Pesanan berhasil dibuat!");
					break;
				case "update_order_status":
					await updateOrderStatusMutation(s.action.args);
					toast.success("Status pesanan berhasil diperbarui!");
					break;
				case "create_booking":
					await createBookingOrderMutation(s.action.args);
					toast.success("Booking berhasil dibuat!");
					break;
				case "update_booking_status":
					await updateBookingStatusMutation(s.action.args);
					toast.success("Status booking berhasil diperbarui!");
					break;
				case "create_transaction":
					await createTransactionMutation(s.action.args);
					toast.success("Transaksi berhasil dicatat!");
					break;
				case "delete_transaction":
					await deleteTransactionMutation(s.action.args);
					toast.success("Transaksi berhasil dihapus!");
					break;
				case "create_inventory_item":
					await createInventoryItemMutation(s.action.args);
					toast.success("Item inventaris berhasil dibuat!");
					break;
				case "add_stock":
					await addStockMutation(s.action.args);
					toast.success("Stok berhasil ditambahkan!");
					break;
				case "set_financial_target":
					await setFinancialTargetMutation(s.action.args);
					toast.success("Target keuangan berhasil ditetapkan!");
					break;
				case "start_shift":
					await startShiftMutation(s.action.args);
					toast.success("Shift berhasil dimulai!");
					break;
				case "end_shift":
					await endShiftMutation(s.action.args);
					toast.success("Shift berhasil diakhiri!");
					break;
				default:
					await sendMessage(`Lakukan saran ini: ${s.title}`);
			}
		} catch (error: any) {
			toast.error(error?.message || "Gagal mengeksekusi saran");
		} finally { setIsLoading(false); }
	};

	const handleExport = useCallback(async (format: any, dataIdx: number) => {
		const msg = messages[dataIdx];
		if (!msg?.exportData) return;
		try {
			toast.info(`Sedang menyiapkan ${format.toUpperCase()}...`);
			await exportReport(msg.exportData, format);
			toast.success("Laporan berhasil diunduh");
		} catch (error) {
			toast.error("Gagal mengunduh laporan");
		}
	}, [messages]);

	const handleCompleteTask = async (taskId: string) => {
		try { await completeTaskMutation({ taskId }); toast.success("Tugas selesai!"); } catch { toast.error("Gagal"); }
	};

	const handleDismissTask = async (taskId: string) => {
		try { await dismissTaskMutation({ taskId }); toast.success("Tugas diabaikan"); } catch { toast.error("Gagal"); }
	};

	const isPOS = mode === "pos";

	const TAB_ITEMS = [
		{ id: "chat", label: "Chat", icon: Bot },
		{ id: "suggestions", label: "Saran", icon: Sparkles },
		{ id: "predictions", label: "Prediksi", icon: TrendingUp },
		{ id: "tasks", label: "Tugas", icon: Bell },
	];

	return (
		<div className={cn("flex flex-col bg-background overflow-hidden relative", isPOS ? "h-full w-full" : "h-[100dvh]")}>
			{/* Session History Sidebar */}
			{!isPOS && (
				<AnimatePresence>
					{showSessionHistory && (
						<>
							<motion.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								className="absolute inset-0 bg-black/20 z-40"
								onClick={() => setShowSessionHistory(false)}
							/>
							<motion.div
								initial={{ x: "-100%" }}
								animate={{ x: 0 }}
								exit={{ x: "-100%" }}
								transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
								className="absolute inset-y-0 left-0 z-50 w-80 bg-background border-r border-border shadow-xl"
							>
								<div className="flex flex-col h-full">
									<div className="flex items-center justify-between p-4 border-b border-border">
										<h2 className="text-sm font-semibold">Riwayat Sesi</h2>
										<button onClick={() => setShowSessionHistory(false)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" type="button">
											<X className="h-4 w-4" />
										</button>
									</div>
									<div className="flex-1 overflow-y-auto">
										<SessionHistory 
											sessions={chatSessions as any} 
											currentSessionId={currentSessionId}
											onLoad={loadSession}
											onDelete={deleteSession}
											onStartNew={startNewSession}
										/>
									</div>
								</div>
							</motion.div>
						</>
					)}
				</AnimatePresence>
			)}

			{/* Header */}
			<header className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-background shrink-0 z-20">
				<div className="flex items-center gap-2.5">
					{!isPOS && (
						<Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setShowSessionHistory(!showSessionHistory)} type="button">
							<Calendar className="h-3.5 w-3.5" />
						</Button>
					)}
					<div className="flex items-center gap-2">
						<div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
							<Bot className="h-3.5 w-3.5 text-primary" />
						</div>
						<div>
							<h1 className="text-sm font-semibold leading-tight">Yumi AI</h1>
							<p className="text-[10px] text-muted-foreground leading-tight">
								{isPOS ? "Asisten Kasir" : "Asisten Bisnis"}
							</p>
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{!isPOS && (
						<div className="flex items-center gap-0.5 bg-muted/60 rounded-full p-0.5">
							{TAB_ITEMS.map((item) => {
								const Icon = item.icon;
								return (
									<button
										key={item.id}
										onClick={() => setActiveTab(item.id as TabType)}
										className={cn(
											"flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all",
											activeTab === item.id
												? "bg-background shadow-sm text-foreground"
												: "text-muted-foreground hover:text-foreground"
										)}
										type="button"
									>
										<Icon className="h-3.5 w-3.5" />
										<span className="hidden md:inline">{item.label}</span>
									</button>
								);
							})}
						</div>
					)}
					{isPOS && onClose && (
						<Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onClose} type="button">
							<X className="h-4 w-4" />
						</Button>
					)}
				</div>
			</header>

			{/* Main Content */}
			<main className="flex-1 overflow-hidden relative">
				<AnimatePresence mode="wait">
					<motion.div
						key={activeTab}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="h-full"
					>
						{activeTab === "chat" && (
							<div className="flex flex-col h-full">
								<div className="flex-1 overflow-y-auto scroll-smooth">
									{messages.length === 0 ? (
										<div className="h-full flex flex-col items-center justify-center px-4">
											{!isLoading ? (
												<>
													<div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-4">
														<Bot className="h-7 w-7 text-primary" />
													</div>
													<h3 className="text-lg font-semibold mb-1.5">Apa yang bisa saya bantu?</h3>
													<p className="text-sm text-muted-foreground max-w-md mb-8 text-center">
														{isPOS
															? "Kasir siap membantu operasional toko Anda."
															: "Tanya apa saja tentang stok, keuangan, prediksi, atau performa toko Anda."
														}
													</p>
												<div className={`grid grid-cols-2 gap-2 w-full ${isPOS ? "max-w-xs" : "max-w-lg"}`}>
														{isPOS ? (
															<>
																<button onClick={() => sendMessage("Catat pengeluaran")} className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[11px] font-medium text-left hover:bg-muted transition-colors active:scale-[0.97]" type="button">
																	<span className="text-base">💰</span><p className="mt-1">Catat Pengeluaran</p>
																</button>
																<button onClick={() => sendMessage("Ringkas pesanan hari ini")} className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[11px] font-medium text-left hover:bg-muted transition-colors active:scale-[0.97]" type="button">
																	<span className="text-base">📋</span><p className="mt-1">Ringkas Pesanan</p>
																</button>
																<button onClick={() => sendMessage("Berapa total pendapatan hari ini?")} className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[11px] font-medium text-left hover:bg-muted transition-colors active:scale-[0.97]" type="button">
																	<span className="text-base">💵</span><p className="mt-1">Total Pendapatan</p>
																</button>
																<button onClick={() => sendMessage("Scan struk belanja")} className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[11px] font-medium text-left hover:bg-muted transition-colors active:scale-[0.97]" type="button">
																	<span className="text-base">📸</span><p className="mt-1">Scan Struk</p>
																</button>
															</>
														) : (
															<>
																<button onClick={() => sendMessage("Bagaimana performa toko hari ini?")} className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[11px] font-medium text-left hover:bg-muted transition-colors active:scale-[0.97]" type="button">
																	<span className="text-base">📊</span><p className="mt-1">Performa Hari Ini</p>
																</button>
																<button onClick={() => sendMessage("Apa saja stok yang rendah?")} className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[11px] font-medium text-left hover:bg-muted transition-colors active:scale-[0.97]" type="button">
																	<span className="text-base">⚠️</span><p className="mt-1">Cek Stok Rendah</p>
																</button>
																<button onClick={() => sendMessage("Buatkan laporan laba rugi bulan ini")} className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[11px] font-medium text-left hover:bg-muted transition-colors active:scale-[0.97]" type="button">
																	<span className="text-base">📈</span><p className="mt-1">Laporan Laba Rugi</p>
																</button>
																<button onClick={() => sendMessage("Prediksi jam sibuk besok")} className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[11px] font-medium text-left hover:bg-muted transition-colors active:scale-[0.97]" type="button">
																	<span className="text-base">🔮</span><p className="mt-1">Prediksi Jam Sibuk</p>
																</button>
															</>
														)}
													</div>
												</>
											) : (
												<div className="flex gap-1.5">
													<span className="h-2 w-2 bg-primary/40 animate-bounce rounded-full" />
													<span className="h-2 w-2 bg-primary/40 animate-bounce [animation-delay:150ms] rounded-full" />
													<span className="h-2 w-2 bg-primary/40 animate-bounce [animation-delay:300ms] rounded-full" />
												</div>
											)}
										</div>
									) : (
										<div className="mx-auto max-w-3xl px-4 py-4">
											{messages.map((msg, idx) => (
												<MessageBubble 
													key={msg._msgId || idx}
													msg={msg}
													index={idx}
													isLast={idx === messages.length - 1}
													isLoading={isLoading}
													isStreaming={isStreaming}
													streamingContent={streamingContent}
													copiedIndex={copiedIndex}
													actionButtonDone={actionButtonDone}
													actionButtonLoading={actionButtonLoading}
													onCopy={handleCopy}
													onScanAction={handleScanAction}
													onQuickAction={handleQuickAction}
													onSendMessage={sendMessage}
													onExport={handleExport}
												/>
											))}
											<div ref={messagesEndRef} className="h-4" />
										</div>
									)}
								</div>

								<div className="shrink-0 bg-background border-t border-border/50">
								<div className="px-3 py-2">
									<ChatInput 
										mode={mode}
										input={input}
										setInput={setInput}
										isLoading={isLoading}
										isScanning={isScanning}
										isScanMode={isScanMode}
										setIsScanMode={setIsScanMode}
										selectedImages={selectedImages}
										onRemoveImage={() => { setSelectedImages([]); if (fileInputRef.current) fileInputRef.current.value = ""; }}
										onFileSelect={handleFileSelect}
										onSendMessage={sendMessage}
										onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
										toolCalls={toolCalls}
										fileInputRef={fileInputRef}
										inputRef={inputRef}
										showTemplates={messages.length < 2}
									/>
								</div>
							</div>
						</div>
						)}
						{activeTab === "suggestions" && <SuggestionsPanel suggestions={proactiveSuggestions as any} onExecute={handleExecuteSuggestion} />}
						{activeTab === "predictions" && <PredictionsPanel stockPredictions={stockPredictions} busyHours={busyHoursPrediction} revenue={revenuePrediction} trending={trendingProducts} promoTime={bestPromoTime} />}
						{activeTab === "tasks" && <TasksPanel tasks={pendingTasks as any} onComplete={handleCompleteTask} onDismiss={handleDismissTask} />}
					</motion.div>
				</AnimatePresence>
			</main>

			<ImageScanner isOpen={isImageScannerOpen} onClose={() => setIsImageScannerOpen(false)} onDataGenerated={(type, data) => setMessages(prev => [...prev, { role: "assistant", content: `Berhasil membuat ${type} dengan data terstruktur.`, _msgId: mkMsgId() }])} />
			{editModal && <ScanEditModal params={editModal.params} onSave={handleSaveFromEditModal} onSplit={p => splitModal === null && setSplitModal({ params: p, btnKey: editModal.btnKey })} onClose={() => setEditModal(null)} />}
			{splitModal && <ScanSplitModal totalAmount={splitModal.params.amount} transactionType={splitModal.params.type} baseParams={splitModal.params} onSave={handleSaveFromSplitModal} onBack={() => setSplitModal(null)} onClose={() => { setSplitModal(null); setEditModal(null); }} />}
			{showScanHistory && <ScanHistoryPanel history={scanHistory} onRemove={removeScanHistory} onClearAll={clearScanHistory} onClose={() => setShowScanHistory(false)} />}
		</div>
	);
}
