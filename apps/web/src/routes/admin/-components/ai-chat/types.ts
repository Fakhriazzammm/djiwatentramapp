import type { ScanEditParams } from "@/components/scan/scan-edit-modal";

export interface ScanResultData {
	type: string;
	name: string; // Merchant Name
	category: string;
	merchant?: string; // Optional alias for name
	transactionType: "expense" | "income" | "unknown";
	total: number;
	subtotal?: number;
	tax?: number;
	serviceCharge?: number;
	discount?: number;
	items: Array<{ name: string; qty: number; price: number; subtotal: number; unit?: string }>;
	date?: string | null;
	time?: string;
	receiptNumber?: string;
	paymentMethod: string;
	notes?: string;
	confidence: number;
	rawText?: string;
	rewrittenText?: string;
}

export interface QuickActionButton {
	id: string;
	label: string;
	icon: string;
	variant: "navigate" | "finance" | "order" | "product" | "stock" | "discount" | "misc";
	actionType: "navigate" | "sendPrompt";
	href?: string;
	prompt?: string;
}

export interface GenericActionButton {
	id: string;
	label: string;
	prompt: string;
}

export interface ScanActionButton {
	id: string;
	label: string;
	icon: string;
	variant: "expense" | "income" | "stock" | "order";
	params: {
		type: "income" | "expense";
		amount: number;
		category: string;
		merchant?: string;
		description?: string;
		date: number;
		paymentMethod?: string;
		status: "completed";
		syncMode?: "auto" | "finance_only" | "finance_plus_inventory";
	};
	done?: boolean;
}

export interface ChartData {
	type: "bar" | "line" | "pie" | "area";
	title: string;
	description?: string;
	data: Array<Record<string, any>>;
	xAxisKey: string;
	series: Array<{ key: string; name: string; color?: string }>;
}

export interface ExportData {
	title: string;
	rows: Array<Record<string, any>>;
	columns: Array<{ header: string; key: string }>;
	summary?: string;
}

export type ExportFormat = "pdf" | "excel";

export interface ResponseTableData {
	title?: string;
	headers: string[];
	rows: string[][];
	footer?: string[];
}

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
	image?: string;
	scanData?: ScanResultData;
	suggestions?: Array<{ label: string; prompt: string }>;
	actionButtons?: ScanActionButton[];
	quickActions?: QuickActionButton[];
	genericActions?: GenericActionButton[];
	chartData?: ChartData;
	exportData?: ExportData;
	tables?: ResponseTableData[];
	_msgId?: string;
}

export interface ToolCall {
	name: string;
	args?: Record<string, unknown>;
	status: "pending" | "executing" | "success" | "error";
	result?: string;
	error?: string;
}

export interface Suggestion {
	id: string;
	type: string;
	title: string;
	description: string;
	priority: "high" | "medium" | "low";
	action?: {
		type?: string;
		toolName?: string;
		args?: Record<string, unknown>;
	} | null;
	createdAt: number;
}

export type TabType = "chat" | "suggestions" | "predictions" | "tasks";
export type ChatMode = "admin" | "pos";

export interface ChatSession {
	sessionId: string;
	title: string;
	createdAt: number;
	messageCount: number;
}

export interface SmartInsight {
	icon: React.ReactNode;
	text: string;
	type: "success" | "warning" | "info";
}
