import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Banknote, BarChart3, Bot, Calendar, Camera, ClipboardList, Sparkles, Bell, Telescope, TrendingUp, Wallet, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { compressFileToLimit } from "@/lib/image-compress";

import { Button } from "@/components/ui/button";
import { ImageScanner } from "@/components/ai/image-scanner";
import { ScanEditModal, type ScanEditParams } from "@/components/scan/scan-edit-modal";
import { ScanSplitModal } from "@/components/scan/scan-split-modal";
import { ScanHistoryPanel, useScanHistory } from "@/components/scan/scan-history-panel";

import type { ChatMessage, ToolCall, Suggestion, TabType, ChatSession, QuickActionButton, ScanActionButton, ScanResultData, ChatMode, ResponseTableData } from "./types";
import { mkMsgId, toRupiah, TOOL_LABELS, generateQuickActions, generateScanActionButtons, extractSuggestions, extractGenericActions, extractChartData, extractExportData, extractResponseTables, sanitizeResponse } from "./utils";
import { exportReport } from "./report-exporter";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";
import { SessionHistory } from "./session-history";
import { PredictionsPanel } from "./predictions-panel";
import { SuggestionsPanel } from "./suggestions-panel";
import { TasksPanel } from "./tasks-panel";
import { useHybridInventory, useHybridOrders } from "@/hooks/use-hybrid-pos-data";
import {
	useHybridChatSessions,
	useHybridConversationContext,
	useHybridPendingTasks,
	useHybridPredictBestPromoTime,
	useHybridPredictBusyHours,
	useHybridPredictDailyRevenue,
	useHybridPredictStockOut,
	useHybridPredictTrendingProducts,
	useHybridProactiveSuggestions,
	useHybridStreamingMessage,
} from "@/hooks/use-hybrid-finance-analytics-data";
import {
	useHybridAddStock,
	useHybridBulkScanImageData,
	useHybridCompleteTask,
	useHybridCreateBookingOrder,
	useHybridCreateChatSession,
	useHybridCreateDiscount,
	useHybridCreateInventoryItem,
	useHybridCreateOrder,
	useHybridCreateProduct,
	useHybridDeleteChatSession,
	useHybridDeleteTransaction,
	useHybridDismissTask,
	useHybridEndShift,
	useHybridRecordExpenseIntake,
	useHybridRecordStockPurchase,
	useHybridSaveConversationContext,
	useHybridSetFinancialTarget,
	useHybridStartShift,
	useHybridUpdateBookingStatus,
	useHybridUpdateDiscount,
	useHybridUpdateOrderStatus,
	useHybridUpdateProduct,
	useHybridYumiChat,
	useHybridGenerateBusinessBriefing,
} from "@/hooks/use-hybrid-write-actions";

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
	const hydratedSessionRef = useRef<string | null>(null);
	const shouldHydrateSessionRef = useRef(false);
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

	const [editModal, setEditModal] = useState<{
		params: ScanEditParams;
		btnKey: string;
		messageIdx: number;
		variant: "expense" | "income" | "stock" | "order";
		scanData?: ScanResultData;
	} | null>(null);
	const [splitModal, setSplitModal] = useState<{
		params: ScanEditParams;
		btnKey: string;
		scanData?: ScanResultData;
	} | null>(null);
	const [showScanHistory, setShowScanHistory] = useState(false);
	const { history: scanHistory, addEntry: addScanHistory, markSaved: markScanSaved, removeEntry: removeScanHistory, clearAll: clearScanHistory } = useScanHistory();
	const lastScanEntryIdsRef = useRef<string[]>([]);
	const messagesRef = useRef(messages);
	messagesRef.current = messages;

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const navigate = useNavigate();

	const yumiChat = useHybridYumiChat();
	const bulkScanImageDataAction = useHybridBulkScanImageData();
	const generateBusinessBriefingAction = useHybridGenerateBusinessBriefing();
	const recordExpenseMutation = useHybridRecordExpenseIntake();
	const deleteTransactionMutation = useHybridDeleteTransaction();
	const createSessionMutation = useHybridCreateChatSession();
	const deleteSessionMutation = useHybridDeleteChatSession();
	const saveConversationMutation = useHybridSaveConversationContext();
	const completeTaskMutation = useHybridCompleteTask();
	const dismissTaskMutation = useHybridDismissTask();
	const recordStockPurchaseMutation = useHybridRecordStockPurchase();
	const createProductMutation = useHybridCreateProduct();
	const updateProductMutation = useHybridUpdateProduct();
	const createDiscountMutation = useHybridCreateDiscount();
	const toggleDiscountMutation = useHybridUpdateDiscount();
	const createOrderMutation = useHybridCreateOrder();
	const updateOrderStatusMutation = useHybridUpdateOrderStatus();
	const createBookingOrderMutation = useHybridCreateBookingOrder();
	const updateBookingStatusMutation = useHybridUpdateBookingStatus();
	const createInventoryItemMutation = useHybridCreateInventoryItem();
	const addStockMutation = useHybridAddStock();
	const setFinancialTargetMutation = useHybridSetFinancialTarget();
	const startShiftMutation = useHybridStartShift();
	const endShiftMutation = useHybridEndShift();

	const [actionButtonDone, setActionButtonDone] = useState<Set<string>>(new Set());
	const [actionButtonLoading, setActionButtonLoading] = useState<Set<string>>(new Set());

	const isInventoryPurchaseCategory = useCallback((category?: string) => {
		const normalized = (category || "").trim().toLowerCase().replace(/\s+/g, "_");
		return normalized === "belanja_stok" || normalized === "pembelian_stok";
	}, []);

	const createAITrackedTransaction = useCallback(
		(
			payload: Record<string, unknown>,
			sourceLabel: string,
			inputMode: string,
			rawText?: string,
			scanData?: ScanResultData,
		) => {
			const transactionPayload = payload as Record<string, unknown> & {
				type: "income" | "expense";
				amount: number;
				category: string;
				merchant?: string;
				description?: string;
				date: number;
				paymentMethod?: string;
				status?: "completed" | "pending" | "cancelled";
				syncMode?: "auto" | "finance_only" | "finance_plus_inventory";
			};
			const scanItems =
				scanData?.items
					?.map((item) => {
						const itemRecord = item as Record<string, unknown>;
						const nameCandidate =
							(typeof itemRecord.name === "string" && itemRecord.name) ||
							(typeof itemRecord.itemName === "string" && itemRecord.itemName) ||
							(typeof itemRecord.productName === "string" && itemRecord.productName) ||
							(typeof itemRecord.description === "string" && itemRecord.description) ||
							"";
						const quantityCandidate =
							Number(itemRecord.qty) ||
							Number(itemRecord.quantity) ||
							Number(itemRecord.jumlah) ||
							1;
						const priceCandidate =
							Number(itemRecord.price) ||
							Number(itemRecord.unitPrice) ||
							Number(itemRecord.harga) ||
							undefined;
						const totalCandidate =
							Number(itemRecord.subtotal) ||
							Number(itemRecord.total) ||
							Number(itemRecord.lineTotal) ||
							undefined;
						const unitCandidate =
							(typeof itemRecord.unit === "string" && itemRecord.unit) ||
							(typeof itemRecord.uom === "string" && itemRecord.uom) ||
							(typeof itemRecord.satuan === "string" && itemRecord.satuan) ||
							undefined;

						return {
							name: String(nameCandidate).trim(),
							quantity: quantityCandidate > 0 ? quantityCandidate : 1,
							price: priceCandidate && priceCandidate > 0 ? priceCandidate : undefined,
							total: totalCandidate && totalCandidate > 0 ? totalCandidate : undefined,
							unit: unitCandidate,
						};
					})
					.filter((item) => item.name.length > 0) || undefined;
			const merchant =
				transactionPayload.merchant ||
				scanData?.merchant ||
				scanData?.name ||
				undefined;
			const parsedScanDate =
				scanData?.date && !Number.isNaN(new Date(scanData.date).getTime())
					? new Date(scanData.date).getTime()
					: undefined;
			const dateValue = transactionPayload.date || parsedScanDate || Date.now();
			const amountValue =
				transactionPayload.amount ||
				scanData?.total ||
				0;
			const categoryValue =
				transactionPayload.category ||
				scanData?.category ||
				"lainnya";
			const structuredReceiptText = scanData
				? [
						`Merchant: ${scanData.merchant || scanData.name || "-"}`,
						`Tanggal: ${scanData.date || "-"}${scanData.time ? ` ${scanData.time}` : ""}`,
						`No Struk: ${scanData.receiptNumber || "-"}`,
						`Subtotal: ${scanData.subtotal ? `Rp ${toRupiah(scanData.subtotal)}` : "-"}`,
						`Pajak: ${scanData.tax ? `Rp ${toRupiah(scanData.tax)}` : "-"}`,
						`Service: ${scanData.serviceCharge ? `Rp ${toRupiah(scanData.serviceCharge)}` : "-"}`,
						`Diskon: ${scanData.discount ? `Rp ${toRupiah(scanData.discount)}` : "-"}`,
						`Total: Rp ${toRupiah(scanData.total)}`,
						...(scanData.items || []).map(
							(item, idx) =>
								`Item ${idx + 1}: ${item.name} | qty=${item.qty}${item.unit ? ` ${item.unit}` : ""} | harga=${item.price || 0} | subtotal=${item.subtotal || 0}`
						),
					].join("\n")
				: undefined;
			const descriptionValue =
				transactionPayload.description ||
				scanData?.notes ||
				(scanData ? `Transaksi dari scan struk ${merchant || "-"}` : undefined);
			const sourceRef =
				scanData?.receiptNumber ||
				(scanData
					? `scan:${merchant || "unknown"}:${scanData.date || ""}:${Math.round(
							Number(scanData.total) || 0
						)}`
					: undefined);

			return recordExpenseMutation({
				source: scanData ? "ai_receipt_scan" : "ai_tool",
				rawText:
					rawText ||
					scanData?.rawText ||
					structuredReceiptText ||
					(typeof payload.description === "string" ? payload.description : undefined),
				syncMode:
					transactionPayload.syncMode ||
					(transactionPayload.type === "expense"
						? "finance_only"
						: "auto"),
				transaction: {
					type: transactionPayload.type,
					amount: amountValue,
					category: categoryValue,
					merchant: merchant,
					description: descriptionValue,
					date: dateValue,
					paymentMethod:
						typeof transactionPayload.paymentMethod === "string"
							? transactionPayload.paymentMethod
							: "cash",
					status:
						transactionPayload.status === "pending" ||
						transactionPayload.status === "cancelled"
							? transactionPayload.status
							: "completed",
				},
				items:
					scanItems && scanItems.length > 0
						? scanItems
						: undefined,
				metadata: {
					inputMode,
					sourceLabel,
					sourceRef,
					ocrConfidence:
						typeof scanData?.confidence === "number"
							? scanData.confidence
							: undefined,
					receiptDetails: scanData
						? {
								merchantName: scanData.merchant || scanData.name || undefined,
								receiptNumber: scanData.receiptNumber || undefined,
								date: scanData.date || undefined,
								time: scanData.time || undefined,
								subtotal: scanData.subtotal || undefined,
								tax: scanData.tax || undefined,
								serviceCharge: scanData.serviceCharge || undefined,
								discount: scanData.discount || undefined,
								total: scanData.total || undefined,
							}
						: undefined,
				},
			});
		},
		[recordExpenseMutation]
	);

	const chatSessions = useHybridChatSessions();
	const loadConversationQuery = useHybridConversationContext(currentSessionId);
	const streamingMessage = useHybridStreamingMessage(streamSessionId);
	const proactiveSuggestions = useHybridProactiveSuggestions();
	const stockPredictions = useHybridPredictStockOut(7);
	const busyHoursPrediction = useHybridPredictBusyHours();
	const revenuePrediction = useHybridPredictDailyRevenue(7);
	const trendingProducts = useHybridPredictTrendingProducts(7);
	const bestPromoTime = useHybridPredictBestPromoTime();
	const pendingTasks = useHybridPendingTasks();
	const inventory = useHybridInventory();
	const orders = useHybridOrders();

	useEffect(() => {
		if (!isStreaming) return;
		if (scrollThrottleRef.current) return;
		scrollThrottleRef.current = setTimeout(() => {
			messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
			scrollThrottleRef.current = null;
		}, 120);
		return () => { if (scrollThrottleRef.current) { clearTimeout(scrollThrottleRef.current); scrollThrottleRef.current = null; } };
	}, [streamingContent, isStreaming]);

	useEffect(() => {
		if (!currentSessionId || !loadConversationQuery) return;
		if (!shouldHydrateSessionRef.current && messages.length > 0) {
			return;
		}
		if (hydratedSessionRef.current === currentSessionId && messages.length > 0) {
			return;
		}
		if (loadConversationQuery) {
			const loadedMessages: ChatMessage[] = (loadConversationQuery as any).map((item: any) => ({
				role: item.role,
				content: item.content,
				_msgId: item._id,
			}));
			setMessages(loadedMessages);
			hydratedSessionRef.current = currentSessionId;
			shouldHydrateSessionRef.current = false;
		}
	}, [loadConversationQuery, currentSessionId, messages.length]);

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
			hydratedSessionRef.current = null;
			shouldHydrateSessionRef.current = false;
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
		setMessages([]);
		hydratedSessionRef.current = null;
		shouldHydrateSessionRef.current = true;
		setShowSessionHistory(false);
	}, []);

	const deleteSession = useCallback(async (sessionId: string) => {
		try {
			await deleteSessionMutation({ sessionId });
			if (currentSessionId === sessionId) {
				setCurrentSessionId(null);
				setStreamSessionId(null);
				setMessages([]);
				shouldHydrateSessionRef.current = false;
			}
			toast.success("Sesi berhasil dihapus");
		} catch (error) {
			toast.error("Gagal menghapus sesi");
		}
	}, [currentSessionId, deleteSessionMutation]);

	const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		e.target.value = "";
		if (files.length === 0) return;

		const imageFiles = files.filter((file) => {
			if (!file.type.startsWith("image/")) {
				toast.error(`${file.name} bukan gambar yang didukung`);
				return false;
			}
			return true;
		});

		if (imageFiles.length === 0) {
			return;
		}

		try {
			const compressedImages = await Promise.all(
				imageFiles.map((file) => compressFileToLimit(file))
			);
			setSelectedImages((prev) => [...prev, ...compressedImages]);
		} catch (error) {
			console.error("handleFileSelect error:", error);
			toast.error("Gagal membaca lampiran gambar");
		}
	}, []);

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
				context += `\nKRITIS: Ada ${lowStockItems.length} item stok rendah: ${lowStockItems
					.slice(0, 3)
					.map((i: any) => i.ingredientName || i.name || "Item")
					.join(", ")}.`;
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

	const processImagesWithAI = useCallback(async (images: string[]) => {
		if (isScanning) return;
		setIsScanning(true);
		setIsLoading(true);
		setToolCalls([]);
		try {
			const res = await bulkScanImageDataAction({ images }) as Array<{
				success: boolean;
				data?: ScanResultData;
				error?: string;
				index?: number;
			}>;
			if (!res || !res.length) throw new Error("Gagal menganalisis gambar");
			const successfulResults: Array<{ data: ScanResultData; index: number }> = [];
			const failedResults: Array<{ error?: string; index: number }> = [];
			for (let idx = 0; idx < res.length; idx++) {
				const entry = res[idx];
				if (entry.success && entry.data) {
					successfulResults.push({ data: entry.data, index: idx });
				} else {
					failedResults.push({ error: entry.error, index: idx });
				}
			}
			if (successfulResults.length === 0) {
				throw new Error(
					failedResults[0]?.error || "Semua gambar gagal dianalisis"
				);
			}
			const newMessages: ChatMessage[] = [];
			for (const entry of successfulResults) {
				const scanData = entry.data;
				if (!scanData) continue;
				const normalizedScanData: ScanResultData = {
					...scanData,
					rewrittenText: "",
				};
				const normalizedItems = Array.isArray(scanData.items)
					? scanData.items
							.map((item: any) => ({
								name: String(item?.name || "").trim(),
								qty: Number(item?.qty || item?.quantity) || 1,
								unit: String(item?.unit || "").trim(),
								price: Number(item?.price || item?.unitPrice) || 0,
								subtotal:
									Number(item?.subtotal || item?.total) ||
									(Number(item?.price || item?.unitPrice) || 0) *
										(Number(item?.qty || item?.quantity) || 1),
							}))
							.filter((item) => item.name.length > 0)
					: [];
				const itemsStr = normalizedItems.length
					? `\nItem Struk (${normalizedItems.length} baris):\n${normalizedItems
							.map(
								(item: any, idx: number) =>
									`${idx + 1}. ${item.name} | Qty: ${item.qty}${item.unit ? ` ${item.unit}` : ""} | Harga: Rp ${toRupiah(item.price)} | Subtotal: Rp ${toRupiah(item.subtotal)}`
							)
							.join("\n")}`
					: "\nItem Struk: tidak terbaca jelas (silakan review manual sebelum simpan)";
				const merchantName =
					scanData.merchant?.trim() || scanData.name?.trim() || "Toko tidak terbaca";
				const actionButtons = generateScanActionButtons(normalizedScanData);

				const assistantContent = "";

				const paymentLabel: Record<string, string> = {
					cash: "Tunai", qris: "QRIS", card: "Kartu", transfer: "Transfer", unknown: "-",
				};

				const scanTableData: ResponseTableData = {
					title: merchantName,
					headers: normalizedItems.length > 0 ? ["Item", "Qty", "Harga", "Subtotal"] : ["Keterangan", "Nilai"],
					rows: normalizedItems.length > 0
						? normalizedItems.map((item: any) => [
								item.name,
								`${item.qty}${item.unit ? ` ${item.unit}` : ""}`,
								`Rp ${toRupiah(item.price)}`,
								`Rp ${toRupiah(item.subtotal)}`,
							])
						: [
								["Total", `Rp ${toRupiah(scanData.total)}`],
								["Kategori", scanData.category?.replace(/_/g, " ") || "-"],
								["Metode Pembayaran", (paymentLabel[scanData.paymentMethod] ?? scanData.paymentMethod) || "-"],
							],
					footer: normalizedItems.length > 0 && scanData.total > 0
						? ["Total", "", "", `Rp ${toRupiah(scanData.total)}`]
						: undefined,
					meta: {
						merchant: merchantName,
						date: scanData.date || undefined,
						category: scanData.category?.replace(/_/g, " ") || undefined,
						paymentMethod: scanData.paymentMethod || undefined,
						transactionType: scanData.transactionType || "unknown",
						confidence: scanData.confidence,
						receiptNumber: scanData.receiptNumber || undefined,
						tax: scanData.tax ? `Rp ${toRupiah(scanData.tax)}` : undefined,
						serviceCharge: scanData.serviceCharge ? `Rp ${toRupiah(scanData.serviceCharge)}` : undefined,
						discount: scanData.discount ? `-Rp ${toRupiah(scanData.discount)}` : undefined,
						subtotal: scanData.subtotal ? `Rp ${toRupiah(scanData.subtotal)}` : undefined,
					},
				};

				const assistantMsg: ChatMessage = {
					role: "assistant",
					content: assistantContent,
					scanData: normalizedScanData,
					actionButtons,
					tables: [scanTableData],
					_msgId: mkMsgId(),
				};
				newMessages.push(assistantMsg);
				const scanEntryId = addScanHistory({
					thumbnail: images[entry.index] || "",
					merchant: scanData.merchant || scanData.name || "Tidak diketahui",
					total: Number(scanData.total) || 0,
					date: Date.now(),
					category: scanData.category?.replace(/_/g, " ") || "Umum",
					transactionType: scanData.transactionType || "unknown",
					saved: false,
				});
				lastScanEntryIdsRef.current.push(scanEntryId);
			}
			setMessages(prev => [...prev, ...newMessages]);
			setSelectedImages([]);
			setIsScanMode(false);
			toast.success(`${successfulResults.length} gambar berhasil dianalisis`);
			if (failedResults.length > 0) {
				toast.error(`${failedResults.length} gambar gagal dianalisis. Coba upload ulang gambar yang gagal.`);
			}
		} catch (error: any) {
			toast.error(error.message || "Gagal menganalisis gambar");
		} finally {
			setIsScanning(false);
			setIsLoading(false);
		}
	}, [isScanning, bulkScanImageDataAction, addScanHistory]);

	const sendMessage = useCallback(async (text: string) => {
		const trimmed = text.trim();
		const attachedImages = [...selectedImages];
		const effectiveText =
			trimmed ||
			(attachedImages.length > 0
				? "Tolong analisis gambar yang saya lampirkan."
				: "");
		if (!(effectiveText || attachedImages.length > 0) || isLoading || isScanning) return;
		if (attachedImages.length > 0) {
			const scanUserMsg: ChatMessage = {
				role: "user",
				content: effectiveText,
				image: attachedImages[0],
				_msgId: mkMsgId(),
			};
			setMessages((prev) => [...prev, scanUserMsg]);
			await processImagesWithAI(attachedImages);
			setInput("");
			return;
		}
		let sessionId = currentSessionId;
		if (!sessionId && mode === "admin") {
			sessionId = await startNewSession();
			if (!sessionId) return;
		}
		const userMsg: ChatMessage = { role: "user", content: effectiveText, _msgId: mkMsgId() };
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
			const history = messagesRef.current.slice(-10).map(m => ({ role: m.role, content: m.content }));
			const rawResponse = await yumiChat({ 
				sessionId: requestSessionId,
				message: effectiveText, 
				history, 
				images: attachedImages.length > 0 ? attachedImages : undefined,
				contextHint: contextHint || undefined,
			});
			const responseText = typeof rawResponse === "string"
				? rawResponse
				: typeof rawResponse?.content === "string"
					? rawResponse.content
					: "";
			const normalizedToolCalls = Array.isArray((rawResponse as any)?.toolCalls)
				? (rawResponse as any).toolCalls
				: [];
			const safeResponseText = responseText?.trim()
				? responseText
				: "Maaf, respons AI sempat kosong. Silakan kirim ulang pertanyaan Anda.";
			const tables = extractResponseTables(safeResponseText);
			const hasTables = tables.length > 0;
			const suggestions = hasTables ? [] : extractSuggestions(responseText);
			const quickActions = hasTables ? [] : generateQuickActions(effectiveText, safeResponseText);
			const genericActions = hasTables ? [] : extractGenericActions(safeResponseText);
			const chartData = hasTables ? undefined : extractChartData(safeResponseText);
			const exportData = hasTables ? undefined : extractExportData(safeResponseText);
			const sanitizedResponse = hasTables ? "" : sanitizeResponse(safeResponseText);
			setToolCalls(normalizedToolCalls);
			setMessages(prev => prev.map(msg => (
				msg._msgId === pendingAssistantId
					? { role: "assistant", content: sanitizedResponse, suggestions, quickActions, genericActions, chartData, exportData, tables, _msgId: pendingAssistantId }
					: msg
			)));
			if (mode === "admin" && sessionId) {
				await saveConversationMutation({ sessionId: sessionId!, role: "user", content: effectiveText });
				await saveConversationMutation({ sessionId: sessionId!, role: "assistant", content: sanitizedResponse });
			}
		} catch (error: any) {
			console.error("sendMessage error:", error);
			const message =
				error?.data?.message ||
				error?.message ||
				"Gagal mendapatkan respons AI";
			toast.error(message);
			setMessages(prev => prev.filter(msg => msg._msgId !== pendingAssistantId));
			if (attachedImages.length > 0) {
				setSelectedImages(attachedImages);
			}
		} finally {
			streamingActiveRef.current = false;
			setIsStreaming(false);
			setStreamingContent("");
			setIsLoading(false);
		}
	}, [currentSessionId, selectedImages, isLoading, isScanning, yumiChat, startNewSession, saveConversationMutation, processImagesWithAI, mode, contextHint]);

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
		setEditModal({
			params: btn.params,
			btnKey: key,
			messageIdx,
			variant: btn.variant,
			scanData: messages[messageIdx]?.scanData,
		});
	}, [actionButtonDone, messages]);

	const handleSaveFromEditModal = useCallback(async (params: ScanEditParams) => {
		if (!editModal) return;
		const { btnKey } = editModal;
		setActionButtonLoading(prev => { const s = new Set<string>(prev); s.add(btnKey); return s; });
		try {
			await createAITrackedTransaction(
				params as any,
				"AI Scan",
				editModal.variant === "stock" ? "scan_action_stock" : "scan_action_button",
				params.description,
				editModal.scanData,
			);
			toast.success("Berhasil disimpan!");
			setActionButtonDone(prev => { const s = new Set<string>(prev); s.add(btnKey); return s; });
			const scanEntryId = lastScanEntryIdsRef.current.shift();
			if (scanEntryId) markScanSaved(scanEntryId);
			setEditModal(null);

			// Lanjut chat: Biarkan AI menanggapi aksi penyimpanan ini
			const typeLabel = params.type === "expense" ? "pengeluaran" : "pemasukan";
			const followUpPrompt = `Saya telah menyimpan ${typeLabel} ${params.merchant ? "dari " + params.merchant : ""} sebesar Rp ${toRupiah(params.amount)} ke dalam catatan keuangan. Berikan konfirmasi singkat dan saran langkah selanjutnya jika ada.`;
			
			// Gunakan setTimeout agar state modal benar-benar bersih sebelum kirim pesan
			setTimeout(() => {
				sendMessage(followUpPrompt);
			}, 100);
		} catch (error) { toast.error("Gagal menyimpan");
		} finally { setActionButtonLoading(prev => { const s = new Set<string>(prev); s.delete(btnKey); return s; }); }
	}, [editModal, createAITrackedTransaction, markScanSaved]);

	const handleSaveFromSplitModal = useCallback(async (splits: ScanEditParams[]) => {
		if (!splitModal) return;
		try {
			const stockLikeSplits = splits.filter((split) =>
				split.type === "expense" && isInventoryPurchaseCategory(split.category),
			);
			await Promise.all(
				splits.map((p) => {
					const shouldCarryItems =
						stockLikeSplits.length === 1 &&
						stockLikeSplits[0] === p;
					return createAITrackedTransaction(
						p as any,
						"AI Scan",
						"scan_split_action",
						p.description,
						shouldCarryItems ? splitModal.scanData : undefined,
					);
				})
			);
			toast.success("Semua split berhasil disimpan!");
			setActionButtonDone(prev => { const s = new Set<string>(prev); s.add(splitModal.btnKey); return s; });
			const scanEntryId = lastScanEntryIdsRef.current.shift();
			if (scanEntryId) markScanSaved(scanEntryId);
			setSplitModal(null); setEditModal(null);

			// Lanjut chat: Biarkan AI menanggapi aksi split ini
			const totalAmount = splits.reduce((sum, s) => sum + s.amount, 0);
			const followUpPrompt = `Saya telah membagi dan menyimpan transaksi tersebut menjadi ${splits.length} catatan dengan total Rp ${toRupiah(totalAmount)}. Tolong berikan ringkasan singkat hasil split ini.`;
			
			setTimeout(() => {
				sendMessage(followUpPrompt);
			}, 100);
		} catch (error) { toast.error("Gagal menyimpan split"); }
	}, [splitModal, createAITrackedTransaction, isInventoryPurchaseCategory, markScanSaved]);

	const handleExecuteSuggestion = useCallback(async (s: Suggestion) => {
		setIsLoading(true);
		try {
			const action = s.action;
			const actionArgs = action?.args;
			const actionType = action?.type ?? action?.toolName;
			if (!actionType) {
				await sendMessage(`Lakukan saran ini: ${s.title}`);
				return;
			}
			switch (actionType) {
				case "record_stock_purchase":
					await recordStockPurchaseMutation(actionArgs as any);
					toast.success("Stok berhasil dicatat!");
					break;
				case "create_product":
					await createProductMutation(actionArgs as any);
					toast.success("Produk berhasil dibuat!");
					break;
				case "update_product":
					await updateProductMutation(actionArgs as any);
					toast.success("Produk berhasil diperbarui!");
					break;
				case "update_product_price":
					await updateProductMutation(actionArgs as any);
					toast.success("Harga produk berhasil diperbarui!");
					break;
				case "create_discount":
					await createDiscountMutation(actionArgs as any);
					toast.success("Diskon berhasil dibuat!");
					break;
				case "toggle_discount":
					await toggleDiscountMutation(actionArgs as any);
					toast.success("Status diskon berhasil diubah!");
					break;
				case "create_order":
					await createOrderMutation(actionArgs as any);
					toast.success("Pesanan berhasil dibuat!");
					break;
				case "update_order_status":
					await updateOrderStatusMutation(actionArgs as any);
					toast.success("Status pesanan berhasil diperbarui!");
					break;
				case "create_booking":
					await createBookingOrderMutation(actionArgs as any);
					toast.success("Booking berhasil dibuat!");
					break;
				case "update_booking_status":
					await updateBookingStatusMutation(actionArgs as any);
					toast.success("Status booking berhasil diperbarui!");
					break;
				case "create_transaction":
					await createAITrackedTransaction(actionArgs as any, "AI Suggestion", "suggestion_action", s.description || s.title);
					toast.success("Transaksi berhasil dicatat!");
					break;
				case "delete_transaction":
					await deleteTransactionMutation(actionArgs as any);
					toast.success("Transaksi berhasil dihapus!");
					break;
				case "create_inventory_item":
					await createInventoryItemMutation(actionArgs as any);
					toast.success("Item inventaris berhasil dibuat!");
					break;
				case "add_stock":
					if (
						actionArgs &&
						"inventoryId" in actionArgs &&
						"quantity" in actionArgs
					) {
						await addStockMutation({
							inventoryId: actionArgs.inventoryId as any,
							quantity: actionArgs.quantity as number,
							notes: typeof actionArgs.notes === "string" ? actionArgs.notes : undefined,
						});
						toast.success("Stok berhasil ditambahkan!");
					} else {
						await sendMessage(`Tindak lanjuti saran ini: ${s.title}`);
					}
					break;
				case "set_financial_target":
					await setFinancialTargetMutation(actionArgs as any);
					toast.success("Target keuangan berhasil ditetapkan!");
					break;
				case "start_shift":
					await startShiftMutation(actionArgs as any);
					toast.success("Shift berhasil dimulai!");
					break;
				case "end_shift":
					await endShiftMutation(actionArgs as any);
					toast.success("Shift berhasil diakhiri!");
					break;
				default:
					await sendMessage(`Lakukan saran ini: ${s.title}`);
			}
		} catch (error: any) {
			toast.error(error?.message || "Gagal mengeksekusi saran");
		} finally { setIsLoading(false); }
	}, [sendMessage, recordStockPurchaseMutation, createProductMutation, updateProductMutation, createDiscountMutation, toggleDiscountMutation, createOrderMutation, updateOrderStatusMutation, createBookingOrderMutation, updateBookingStatusMutation, createAITrackedTransaction, deleteTransactionMutation, createInventoryItemMutation, addStockMutation, setFinancialTargetMutation, startShiftMutation, endShiftMutation]);

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

	const handleCompleteTask = useCallback(async (taskId: string) => {
		try { await completeTaskMutation({ taskId }); toast.success("Tugas selesai!"); } catch { toast.error("Gagal"); }
	}, [completeTaskMutation]);

	const handleDismissTask = useCallback(async (taskId: string) => {
		try { await dismissTaskMutation({ taskId }); toast.success("Tugas diabaikan"); } catch { toast.error("Gagal"); }
	}, [dismissTaskMutation]);

	const isPOS = mode === "pos";
	const mobileBottomMenuOffset = isPOS
		? ""
		: "mb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] md:mb-0";

	const TAB_ITEMS = [
		{ id: "chat", label: "Chat", icon: Bot },
		{ id: "suggestions", label: "Saran", icon: Sparkles },
		{ id: "predictions", label: "Prediksi", icon: TrendingUp },
		{ id: "tasks", label: "Tugas", icon: Bell },
	];

	return (
		<div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
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
							<h1 className="text-sm font-semibold leading-tight">Djiwa Tentram AI</h1>
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
			<main className="relative min-h-0 flex-1 overflow-hidden">
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
							<div className="flex h-full min-h-0 flex-col">
								<div className="min-h-0 flex-1 overflow-y-auto scroll-smooth overscroll-contain">
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
																	<Wallet className="mx-auto h-4 w-4" aria-hidden="true" /><p className="mt-1">Catat Pengeluaran</p>
																</button>
																<button onClick={() => sendMessage("Ringkas pesanan hari ini")} className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[11px] font-medium text-left hover:bg-muted transition-colors active:scale-[0.97]" type="button">
																	<ClipboardList className="mx-auto h-4 w-4" aria-hidden="true" /><p className="mt-1">Ringkas Pesanan</p>
																</button>
																<button onClick={() => sendMessage("Berapa total pendapatan hari ini?")} className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[11px] font-medium text-left hover:bg-muted transition-colors active:scale-[0.97]" type="button">
																	<Banknote className="mx-auto h-4 w-4" aria-hidden="true" /><p className="mt-1">Total Pendapatan</p>
																</button>
																<button onClick={() => sendMessage("Scan struk belanja")} className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[11px] font-medium text-left hover:bg-muted transition-colors active:scale-[0.97]" type="button">
																	<Camera className="mx-auto h-4 w-4" aria-hidden="true" /><p className="mt-1">Scan Struk</p>
																</button>
															</>
														) : (
															<>
																<button onClick={() => sendMessage("Bagaimana performa toko hari ini?")} className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[11px] font-medium text-left hover:bg-muted transition-colors active:scale-[0.97]" type="button">
																	<BarChart3 className="mx-auto h-4 w-4" aria-hidden="true" /><p className="mt-1">Performa Hari Ini</p>
																</button>
																<button onClick={() => sendMessage("Apa saja stok yang rendah?")} className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[11px] font-medium text-left hover:bg-muted transition-colors active:scale-[0.97]" type="button">
																	<AlertTriangle className="mx-auto h-4 w-4" aria-hidden="true" /><p className="mt-1">Cek Stok Rendah</p>
																</button>
																<button onClick={() => sendMessage("Buatkan laporan laba rugi bulan ini")} className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[11px] font-medium text-left hover:bg-muted transition-colors active:scale-[0.97]" type="button">
																	<TrendingUp className="mx-auto h-4 w-4" aria-hidden="true" /><p className="mt-1">Laporan Laba Rugi</p>
																</button>
																<button onClick={() => sendMessage("Prediksi jam sibuk besok")} className="rounded-xl border border-border/60 bg-background px-3 py-2.5 text-[11px] font-medium text-left hover:bg-muted transition-colors active:scale-[0.97]" type="button">
																	<Telescope className="mx-auto h-4 w-4" aria-hidden="true" /><p className="mt-1">Prediksi Jam Sibuk</p>
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
										<div className="mx-auto max-w-4xl px-3 py-3 md:px-6 md:py-6">
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
											<div ref={messagesEndRef} className={cn("md:h-28", isPOS ? "h-24" : "h-28 md:h-36")} />
										</div>
									)}
								</div>

								<div className={cn(
									"z-20 shrink-0 border-t border-border/50 bg-background/95 px-2 pt-2 pb-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6 md:pt-5 md:pb-5",
									mobileBottomMenuOffset,
									!isPOS && "md:border-t-0 md:bg-gradient-to-t md:from-background md:via-background/96 md:to-transparent"
								)}>
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
						)}
						{activeTab === "suggestions" && <SuggestionsPanel suggestions={proactiveSuggestions as any} onExecute={handleExecuteSuggestion} />}
						{activeTab === "predictions" && <PredictionsPanel stockPredictions={stockPredictions} busyHours={busyHoursPrediction} revenue={revenuePrediction} trending={trendingProducts} promoTime={bestPromoTime} />}
						{activeTab === "tasks" && <TasksPanel tasks={pendingTasks as any} onComplete={handleCompleteTask} onDismiss={handleDismissTask} />}
					</motion.div>
				</AnimatePresence>
			</main>

			<ImageScanner isOpen={isImageScannerOpen} onClose={() => setIsImageScannerOpen(false)} onDataGenerated={(type, data) => setMessages(prev => [...prev, { role: "assistant", content: `Berhasil membuat ${type} dengan data terstruktur.`, _msgId: mkMsgId() }])} />
			{editModal && <ScanEditModal params={editModal.params} allowSplit={editModal.variant !== "stock"} onSave={handleSaveFromEditModal} onSplit={p => splitModal === null && setSplitModal({ params: p, btnKey: editModal.btnKey, scanData: editModal.scanData })} onClose={() => setEditModal(null)} />}
			{splitModal && <ScanSplitModal totalAmount={splitModal.params.amount} transactionType={splitModal.params.type} baseParams={splitModal.params} onSave={handleSaveFromSplitModal} onBack={() => setSplitModal(null)} onClose={() => { setSplitModal(null); setEditModal(null); }} />}
			{showScanHistory && <ScanHistoryPanel history={scanHistory} onRemove={removeScanHistory} onClearAll={clearScanHistory} onClose={() => setShowScanHistory(false)} />}
		</div>
	);
}
