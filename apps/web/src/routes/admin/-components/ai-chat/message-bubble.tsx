import React from "react";
import { Bot, Copy, Check, Loader2, Download, FileText, FileBarChart as FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage, ScanActionButton, QuickActionButton, ExportFormat } from "./types";
import { ScanResultCard } from "./scan-result-card";
import { ChartBubble } from "./chart-bubble";

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
}: MessageBubbleProps) => {
	const isAssistant = msg.role === "assistant";
	
	return (
		<div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-2.5 w-full animate-in fade-in slide-in-from-bottom-2 duration-300 group`}>
			<div className={`flex w-full max-w-[92%] md:max-w-[85%] gap-2 md:gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
				{isAssistant && (
					<div className="flex-shrink-0 h-8 w-8 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mt-1 shadow-inner group-hover:scale-110 transition-transform duration-300">
						<Bot className="h-4 w-4 text-primary" />
					</div>
				)}
				<div className={`flex-1 transition-all duration-300 ${
					msg.role === "user" 
						? "rounded-[22px] rounded-tr-[4px] bg-gradient-to-br from-primary via-primary to-primary/90 px-4 py-2.5 text-primary-foreground shadow-lg shadow-primary/15 border border-white/10" 
						: "bg-card/40 backdrop-blur-md border border-border/60 rounded-[22px] rounded-tl-[4px] px-4 py-3 shadow-sm hover:shadow-md hover:bg-card/60"
				}`}>
					{msg.image && (
						<div className="mb-3">
							<img src={msg.image} alt="Lampiran" className="rounded-xl max-h-64 object-contain border border-border shadow-sm" />
						</div>
					)}
					
					<div className={`whitespace-pre-wrap text-[12px] md:text-[13px] leading-relaxed tracking-tight ${msg.role === "user" ? "font-medium" : "text-foreground/90"}`}>
						{isLast && isStreaming && isAssistant
							? streamingContent
							: msg.content}
						{isLast && isLoading && !isStreaming && isAssistant && (
							<span className="inline-flex ml-1.5 gap-1 items-center pb-0.5">
								<span className="w-1.5 h-1.5 bg-primary animate-bounce rounded-full"></span>
								<span className="w-1.5 h-1.5 bg-primary animate-bounce [animation-delay:0.2s] rounded-full"></span>
								<span className="w-1.5 h-1.5 bg-primary animate-bounce [animation-delay:0.4s] rounded-full"></span>
							</span>
						)}
					</div>

					{msg.chartData && <ChartBubble chart={msg.chartData} />}

					{msg.exportData && (
						<div className="mt-2.5 flex flex-wrap gap-1.5 animate-in fade-in slide-in-from-left-2 duration-500">
							<Button 
								variant="outline" 
								size="sm" 
								className="h-7 text-[10px] font-bold border-primary/20 text-primary hover:bg-primary/5 shadow-sm"
								onClick={() => onExport("pdf", index)}
							>
								<FileText className="h-3.5 w-3.5 mr-1.5" />
								Download PDF
							</Button>
							<Button 
								variant="outline" 
								size="sm" 
								className="h-7 text-[10px] font-bold border-green-200 text-green-700 hover:bg-green-50 shadow-sm"
								onClick={() => onExport("excel", index)}
							>
								<FileJson className="h-3.5 w-3.5 mr-1.5" />
								Download Excel
							</Button>
						</div>
					)}

					{msg.scanData && <ScanResultCard data={msg.scanData} />}

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
										className={`h-7 text-[10px] font-bold px-2.5 shadow-sm ${isDone ? "bg-green-50 text-green-700 border-green-200" : ""}`}
										onClick={() => onScanAction(btn, index)}
										disabled={isDone || isBtnLoading}
									>
										{isBtnLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : (isDone ? "✅ " : btn.icon + " ")}
										{btn.label}
									</Button>
								);
							})}
						</div>
					)}

					{msg.quickActions && msg.quickActions.length > 0 && (
						<div className="mt-3.5 pt-2 border-t border-border/50">
							<p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Saran Tindakan</p>
							<div className="flex flex-wrap gap-1.5">
								{msg.quickActions.map((action) => (
									<Button
										key={action.id}
										variant="secondary"
										size="sm"
										className="h-7 text-[10px] font-semibold px-2.5 rounded-full hover:bg-primary/10 hover:text-primary transition-colors border border-border/40"
										onClick={() => onQuickAction(action)}
									>
										{action.icon} {action.label}
									</Button>
								))}
							</div>
						</div>
					)}

					{msg.genericActions && msg.genericActions.length > 0 && (
						<div className="mt-2.5 pt-2 border-t border-border/40">
							<div className="flex flex-wrap gap-1.5">
								{msg.genericActions.map((action) => (
									<Button
										key={action.id}
										variant="ghost"
										size="sm"
										className="h-6 text-[9px] font-medium px-1.5 hover:bg-muted"
										onClick={() => onSendMessage(action.prompt)}
									>
										🚀 {action.label}
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
									className="h-8 text-[10px] font-bold px-3.5 rounded-full border-primary/20 bg-background/50 text-primary hover:bg-primary hover:text-white hover:border-primary transition-all active:scale-95 whitespace-nowrap shadow-sm"
									onClick={() => onSendMessage(s.prompt)}
								>
									✨ {s.label}
								</Button>
							))}
						</div>
					)}

					{isAssistant && !isStreaming && (
						<div className="mt-1 flex items-center gap-1.5 opacity-20 hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
							<Button 
								variant="ghost" 
								size="icon" 
								className="h-6 w-6 text-muted-foreground hover:text-primary" 
								onClick={() => onCopy(msg.content, index)}
							>
								{copiedIndex === index ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
							</Button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
