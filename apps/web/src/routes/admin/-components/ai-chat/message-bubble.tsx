import React, { useState, useMemo } from "react";
import { Bot, Copy, Check, Loader2, FileText, FileBarChart as FileJson, RefreshCw, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ChatMessage, ScanActionButton, QuickActionButton, ExportFormat } from "./types";
import { ScanResultCard } from "./scan-result-card";
import { ChartBubble } from "./chart-bubble";

const COLLAPSE_THRESHOLD = 600;

interface MessageBubbleProps {
	msg: ChatMessage;
	index: number;
	isLast: boolean;
	isLoading: boolean;
	isStreaming: boolean;
	streamingContent: string;
	copiedIndex: number | null;
	actionButtonDone: Set<string>;
	actionButtonLoading: Set<string>;
	onCopy: (text: string, index: number) => void;
	onScanAction: (btn: ScanActionButton, messageIdx: number) => void;
	onQuickAction: (action: QuickActionButton) => void;
	onSendMessage: (text: string) => void;
	onExport: (format: ExportFormat, dataIdx: number) => void;
	onRegenerate?: (index: number) => void;
}

export const MessageBubble = ({
	msg, index, isLast, isLoading, isStreaming, streamingContent,
	copiedIndex, actionButtonDone, actionButtonLoading,
	onCopy, onScanAction, onQuickAction, onSendMessage, onExport, onRegenerate,
}: MessageBubbleProps) => {
	const isAssistant = msg.role === "assistant";
	const [isCollapsed, setIsCollapsed] = useState(true);
	const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

	const displayContent = useMemo(() => {
		if (isLast && isStreaming && isAssistant) return streamingContent;
		return msg.content;
	}, [isLast, isStreaming, isAssistant, streamingContent, msg.content]);

	const isLong = displayContent.length > COLLAPSE_THRESHOLD;
	const visibleContent = isLong && isCollapsed ? displayContent.slice(0, COLLAPSE_THRESHOLD) + "..." : displayContent;

	const handleFeedback = (type: "up" | "down") => {
		setFeedback(prev => prev === type ? null : type);
	};

	if (!isAssistant) {
		return (
			<div className="flex justify-center w-full py-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
				<div className="w-full max-w-3xl px-4">
					<div className="flex justify-end">
						<div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground shadow-sm">
							{msg.image && (
								<img src={msg.image} alt="" className="rounded-xl max-h-64 object-contain mb-2" />
							)}
							<p className="text-sm whitespace-pre-wrap leading-relaxed">{visibleContent}</p>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex justify-center w-full py-2 group animate-in fade-in slide-in-from-bottom-1 duration-300">
			<div className="w-full max-w-3xl px-4">
				<div className="flex gap-3">
					<div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
						<Bot className="h-4 w-4 text-primary" />
					</div>
					<div className="flex-1 min-w-0">
						<div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
							{visibleContent}
							{isLast && isLoading && !isStreaming && (
								<span className="inline-flex ml-1 gap-1 items-center">
									<span className="h-1.5 w-1.5 bg-muted-foreground/40 animate-bounce rounded-full" />
									<span className="h-1.5 w-1.5 bg-muted-foreground/40 animate-bounce [animation-delay:150ms] rounded-full" />
									<span className="h-1.5 w-1.5 bg-muted-foreground/40 animate-bounce [animation-delay:300ms] rounded-full" />
								</span>
							)}
						</div>

						{isLong && !isStreaming && (
							<button onClick={() => setIsCollapsed(!isCollapsed)} className="mt-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors" type="button">
								{isCollapsed ? <>Selengkapnya <ChevronDown className="h-3 w-3" /></> : <>Lebih sedikit <ChevronUp className="h-3 w-3" /></>}
							</button>
						)}

						{msg.chartData && <div className="mt-3"><ChartBubble chart={msg.chartData} /></div>}

						{msg.exportData && (
							<div className="mt-2.5 flex flex-wrap gap-1.5">
								<Button variant="outline" size="sm" className="h-7 text-xs border-border/60" onClick={() => onExport("pdf", index)}>
									<FileText className="h-3.5 w-3.5 mr-1.5" />PDF
								</Button>
								<Button variant="outline" size="sm" className="h-7 text-xs border-border/60" onClick={() => onExport("excel", index)}>
									<FileJson className="h-3.5 w-3.5 mr-1.5" />Excel
								</Button>
							</div>
						)}

						{msg.scanData && <div className="mt-3"><ScanResultCard data={msg.scanData} /></div>}

						{msg.actionButtons && msg.actionButtons.length > 0 && (
							<div className="mt-2.5 flex flex-wrap gap-1.5">
								{msg.actionButtons.map((btn) => {
									const key = `${index}-${btn.id}`;
									const isDone = actionButtonDone.has(key);
									const isBtnLoading = actionButtonLoading.has(key);
									return (
										<Button key={btn.id} variant={isDone ? "outline" : "default"} size="sm" className={`h-7 text-xs px-2.5 ${isDone ? "bg-green-50 text-green-700 border-green-200" : ""}`} onClick={() => onScanAction(btn, index)} disabled={isDone || isBtnLoading}>
											{isBtnLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : (isDone ? "✓ " : btn.icon + " ")}
											{btn.label}
										</Button>
									);
								})}
							</div>
						)}

						{msg.quickActions && msg.quickActions.length > 0 && (
							<div className="mt-3 pt-2 border-t border-border/30">
								<div className="flex flex-wrap gap-1.5">
									{msg.quickActions.map((action) => (
										<Button key={action.id} variant="secondary" size="sm" className="h-7 text-xs px-2.5 rounded-full" onClick={() => onQuickAction(action)}>
											{action.icon} {action.label}
										</Button>
									))}
								</div>
							</div>
						)}

						{msg.genericActions && msg.genericActions.length > 0 && (
							<div className="mt-2 pt-2 border-t border-border/20">
								<div className="flex flex-wrap gap-1.5">
									{msg.genericActions.map((action) => (
										<Button key={action.id} variant="ghost" size="sm" className="h-6 text-xs px-1.5" onClick={() => onSendMessage(action.prompt)}>
											🚀 {action.label}
										</Button>
									))}
								</div>
							</div>
						)}

						{msg.suggestions && msg.suggestions.length > 0 && (
							<div className="mt-3 flex flex-wrap gap-2">
								{msg.suggestions.map((s, i) => (
									<Button key={i} variant="outline" size="sm" className="h-8 text-xs px-3 rounded-full border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground transition-all active:scale-95 whitespace-nowrap" onClick={() => onSendMessage(s.prompt)}>
										✨ {s.label}
									</Button>
								))}
							</div>
						)}

						{!isStreaming && (
							<div className="mt-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
								<Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-md" onClick={() => onCopy(msg.content, index)} title="Salin">
									<AnimatePresence mode="wait">
										{copiedIndex === index ? (
											<motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
												<Check className="h-3.5 w-3.5 text-green-500" />
											</motion.span>
										) : (
											<motion.span key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
												<Copy className="h-3.5 w-3.5" />
											</motion.span>
										)}
									</AnimatePresence>
								</Button>
								{onRegenerate && (
									<Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-md" onClick={() => onRegenerate(index)} title="Regenerasi">
										<RefreshCw className="h-3.5 w-3.5" />
									</Button>
								)}
								<Button variant="ghost" size="icon" className={`h-7 w-7 rounded-md transition-colors ${feedback === "up" ? "text-green-500" : "text-muted-foreground hover:text-green-500"}`} onClick={() => handleFeedback("up")} title="Membantu">
									<ThumbsUp className="h-3 w-3" />
								</Button>
								<Button variant="ghost" size="icon" className={`h-7 w-7 rounded-md transition-colors ${feedback === "down" ? "text-red-500" : "text-muted-foreground hover:text-red-500"}`} onClick={() => handleFeedback("down")} title="Kurang membantu">
									<ThumbsDown className="h-3 w-3" />
								</Button>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
