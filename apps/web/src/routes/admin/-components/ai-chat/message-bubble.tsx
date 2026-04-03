import React, { useMemo, useState } from "react";
import {
	Bot,
	Check,
	Copy,
	ChevronDown,
	ChevronUp,
	FileBarChart as FileJson,
	FileText,
	Loader2,
	RefreshCw,
	ThumbsDown,
	ThumbsUp,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { Button } from "@/components/ui/button";

import { ChartBubble } from "./chart-bubble";
import { ScanResultCard } from "./scan-result-card";
import type { ChatMessage, ExportFormat, QuickActionButton, ScanActionButton } from "./types";

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
	msg,
	index,
	isLast,
	isLoading,
	isStreaming,
	streamingContent,
	copiedIndex,
	actionButtonDone,
	actionButtonLoading,
	onCopy,
	onScanAction,
	onQuickAction,
	onSendMessage,
	onExport,
	onRegenerate,
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
		setFeedback(prev => (prev === type ? null : type));
	};

	if (!isAssistant) {
		return (
			<div className="flex justify-center w-full py-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
				<div className="w-full max-w-3xl px-4">
					<div className="flex justify-end">
						<div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground shadow-sm">
							{msg.image && (
								<img src={msg.image} alt="" className="mb-2 max-h-64 rounded-xl object-contain" />
							)}
							<p className="text-sm whitespace-pre-wrap leading-relaxed">{visibleContent}</p>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="group flex justify-center w-full py-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
			<div className="w-full max-w-3xl px-4">
				<div className="flex gap-3">
					<div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
						<Bot className="h-4 w-4 text-primary" />
					</div>
					<div className="min-w-0 flex-1 rounded-3xl border border-border/60 bg-card px-4 py-3 shadow-sm">
						<div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
							{visibleContent}
							{isLast && isLoading && !isStreaming && (
								<span className="ml-1 inline-flex items-center gap-1">
									<span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce" />
									<span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
									<span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
								</span>
							)}
						</div>

						{isLong && !isStreaming && (
							<button
								onClick={() => setIsCollapsed(!isCollapsed)}
								className="mt-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
								type="button"
							>
								{isCollapsed ? (
									<>
										Selengkapnya <ChevronDown className="h-3 w-3" />
									</>
								) : (
									<>
										Lebih sedikit <ChevronUp className="h-3 w-3" />
									</>
								)}
							</button>
						)}

						{msg.chartData && <div className="mt-3"><ChartBubble chart={msg.chartData} /></div>}

						{msg.exportData && (
							<div className="mt-2.5 flex flex-wrap gap-1.5">
								<Button variant="outline" size="sm" className="h-7 border-border/60 text-xs" onClick={() => onExport("pdf", index)}>
									<FileText className="mr-1.5 h-3.5 w-3.5" />
									PDF
								</Button>
								<Button variant="outline" size="sm" className="h-7 border-border/60 text-xs" onClick={() => onExport("excel", index)}>
									<FileJson className="mr-1.5 h-3.5 w-3.5" />
									Excel
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
										<Button
											key={btn.id}
											variant={isDone ? "outline" : "default"}
											size="sm"
											className={`h-7 px-2.5 text-xs ${isDone ? "border-green-200 bg-green-50 text-green-700" : ""}`}
											onClick={() => onScanAction(btn, index)}
											disabled={isDone || isBtnLoading}
										>
											{isBtnLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : isDone ? "✓ " : `${btn.icon} `}
											{btn.label}
										</Button>
									);
								})}
							</div>
						)}

						{msg.quickActions && msg.quickActions.length > 0 && (
							<div className="mt-3 border-t border-border/30 pt-2">
								<div className="flex flex-wrap gap-1.5">
									{msg.quickActions.map((action) => (
										<Button
											key={action.id}
											variant="outline"
											size="sm"
											className="h-8 rounded-full border-primary/20 bg-primary/5 px-3 text-xs text-foreground hover:bg-primary hover:text-primary-foreground"
											onClick={() => onQuickAction(action)}
										>
											{action.icon} {action.label}
										</Button>
									))}
								</div>
							</div>
						)}

						{msg.genericActions && msg.genericActions.length > 0 && (
							<div className="mt-2 border-t border-border/20 pt-2">
								<div className="flex flex-wrap gap-1.5">
									{msg.genericActions.map((action) => (
										<Button
											key={action.id}
											variant="outline"
											size="sm"
											className="h-8 rounded-full border-primary/20 bg-background px-3 text-xs text-foreground hover:bg-primary hover:text-primary-foreground"
											onClick={() => onSendMessage(action.prompt)}
										>
											{action.label}
										</Button>
									))}
								</div>
							</div>
						)}

						{msg.suggestions && msg.suggestions.length > 0 && (
							<div className="mt-3 flex flex-wrap gap-2">
								{msg.suggestions.map((s, i) => (
									<Button
										key={i}
										variant="outline"
										size="sm"
										className="h-8 rounded-full border-primary/20 bg-background px-3 text-xs text-foreground transition-all hover:bg-primary hover:text-primary-foreground active:scale-95 whitespace-nowrap"
										onClick={() => onSendMessage(s.prompt)}
									>
										{s.label}
									</Button>
								))}
							</div>
						)}

						{!isStreaming && (
							<div className="mt-2 flex items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
								<Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground" onClick={() => onCopy(msg.content, index)} title="Salin">
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
									<Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground" onClick={() => onRegenerate(index)} title="Regenerasi">
										<RefreshCw className="h-3.5 w-3.5" />
									</Button>
								)}
								<Button
									variant="ghost"
									size="icon"
									className={`h-7 w-7 rounded-md transition-colors ${feedback === "up" ? "text-green-500" : "text-muted-foreground hover:text-green-500"}`}
									onClick={() => handleFeedback("up")}
									title="Membantu"
								>
									<ThumbsUp className="h-3 w-3" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className={`h-7 w-7 rounded-md transition-colors ${feedback === "down" ? "text-red-500" : "text-muted-foreground hover:text-red-500"}`}
									onClick={() => handleFeedback("down")}
									title="Kurang membantu"
								>
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
