import React from "react";
import { Send, ScanLine, Camera, Trash2, Loader2, Sparkles, AlertTriangle, Lightbulb, Settings, TrendingUp, Wallet, Target, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ToolCall, ChatMode } from "./types";
import { TOOL_LABELS, CASIER_TEMPLATES } from "./utils";

interface ChatInputProps {
	mode: ChatMode;
	input: string;
	setInput: (val: string) => void;
	isLoading: boolean;
	isScanning: boolean;
	isScanMode: boolean;
	setIsScanMode: (val: boolean) => void;
	selectedImages: string[];
	onRemoveImage: () => void;
	onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
	onSendMessage: (text: string) => void;
	onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	toolCalls: ToolCall[];
	fileInputRef: React.RefObject<HTMLInputElement | null>;
	inputRef: React.RefObject<HTMLTextAreaElement | null>;
	showTemplates: boolean;
}

const ADMIN_TEMPLATES = [
	{ label: "Rekap Hari Ini", message: "Berikan rekap lengkap bisnis hari ini", icon: <TrendingUp className="h-3.5 w-3.5" /> },
	{ label: "Stok Rendah", message: "Produk apa saja yang stoknya rendah?", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
	{ label: "Top Produk", message: "Apa produk terlaris saat ini?", icon: <Sparkles className="h-3.5 w-3.5" /> },
	{ label: "Keuangan", message: "Ringkas kondisi keuangan saat ini", icon: <Settings className="h-3.5 w-3.5" /> },
	{ label: "Laba Rugi", message: "Buatkan laporan laba rugi bulan ini", icon: <TrendingUp className="h-3.5 w-3.5" /> },
	{ label: "Arus Kas", message: "Analisis arus kas bulan ini", icon: <Wallet className="h-3.5 w-3.5" /> },
	{ label: "Hitung HPP", message: "Tampilkan ringkasan kalkulasi HPP semua produk", icon: <Target className="h-3.5 w-3.5" /> },
];

export const ChatInput = ({
	mode,
	input,
	setInput,
	isLoading,
	isScanning,
	isScanMode,
	setIsScanMode,
	selectedImages,
	onRemoveImage,
	onFileSelect,
	onSendMessage,
	onKeyDown,
	toolCalls,
	fileInputRef,
	inputRef,
	showTemplates
}: ChatInputProps) => {
	const templates = mode === "admin" ? ADMIN_TEMPLATES : CASIER_TEMPLATES;

	return (
		<div className="p-2 bg-background/80 backdrop-blur-md border-t border-border shadow-lg relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
			{/* Templates */}
			{showTemplates && !isScanMode && (
				<div className="mb-2 flex flex-nowrap overflow-x-auto gap-2 pb-1.5 custom-scrollbar scroll-smooth no-scrollbar">
					{templates.map((template, i) => (
						<button
							key={i}
							onClick={() => onSendMessage(template.message)}
							className="flex items-center gap-1.5 rounded-xl bg-muted/60 px-2 py-1 text-[10px] font-semibold hover:bg-primary/10 hover:text-primary transition-all active:scale-95 whitespace-nowrap border border-border/40 shadow-sm"
						>
							<span className="text-primary">{typeof template.icon === 'string' ? template.icon : template.icon}</span>
							<span className="text-foreground">{template.label}</span>
						</button>
					))}
				</div>
			)}

			{/* Tool Calls UI */}
			{toolCalls.length > 0 && (
				<div className="mb-2 p-2 border border-border/60 rounded-xl bg-muted/30 shadow-inner">
					<p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Eksekusi Tool</p>
					<div className="flex flex-wrap gap-2">
						{toolCalls.map((tool, i) => (
							<div key={i} className="flex items-center gap-1.5 text-[10px] bg-background border border-border/60 rounded-lg px-2 py-1 shadow-sm">
								{tool.status === "executing" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
								{tool.status === "success" && <span className="text-green-500">✅</span>}
								{tool.status === "error" && <span className="text-destructive">❌</span>}
								<span className="font-semibold text-foreground">{TOOL_LABELS[tool.name] || tool.name}</span>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Selected Images Preview */}
			{selectedImages.length > 0 && (
				<div className="mb-2 p-2 border border-border/60 rounded-xl bg-muted/10 shadow-inner relative group">
					<div className="flex items-center justify-between mb-1.5">
						<p className="text-[9px] font-bold text-primary uppercase tracking-widest px-1.5 py-0.5 bg-primary/5 rounded-full ring-1 ring-primary/20">
							Lampiran ({selectedImages.length})
						</p>
						<button 
							className="h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" 
							onClick={onRemoveImage}
							title="Hapus semua"
						>
							<Trash2 className="h-3.5 w-3.5" />
						</button>
					</div>
					<div className="flex gap-3 overflow-x-auto pb-1 custom-scrollbar scroll-smooth">
						{selectedImages.map((img, i) => (
							<div key={i} className="relative group/img flex-shrink-0">
								<img src={img} className="h-24 w-24 object-cover rounded-xl border border-border/60 shadow-sm" alt={`Preview ${i}`} />
								<div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
									<ScanLine className="h-5 w-5 text-white" />
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			<div className="flex items-end gap-2.5 max-w-5xl mx-auto">
				<div className="relative flex-1 flex flex-col min-h-[44px] rounded-[20px] border border-border/80 shadow-md transition-all bg-muted/30 focus-within:bg-background focus-within:shadow-xl focus-within:border-primary/40 group">
					<div className="absolute left-2.5 bottom-1.5 flex items-center gap-1 opacity-80 transition-opacity focus-within:opacity-100 pb-0.5">
						<Button 
							variant={isScanMode ? "default" : "ghost"} 
							size="icon" 
							className={`h-8 w-8 rounded-full transition-all duration-300 ${isScanMode ? "bg-emerald-600 hover:bg-emerald-700 shadow-md scale-105" : "text-muted-foreground hover:text-primary hover:bg-primary/10"}`} 
							onClick={() => setIsScanMode(!isScanMode)}
							title={isScanMode ? "Mode Scan Aktif" : "Aktifkan Mode Scan Gambar"}
						>
							<ScanLine className="h-4 w-4" />
						</Button>
						<Button 
							variant="ghost" 
							size="icon" 
							className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all" 
							onClick={() => fileInputRef.current?.click()}
							title="Unggah Gambar"
						>
							<Camera className="h-4 w-4" />
						</Button>
						<input
							type="file"
							ref={fileInputRef}
							className="hidden"
							accept="image/*"
							multiple
							onChange={onFileSelect}
						/>
					</div>
					
					<textarea
						ref={inputRef}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={onKeyDown}
						placeholder={isScanMode ? "Instruksi analisis..." : "Tanya Yumi AI..."}
						className="w-full resize-none bg-transparent py-2.5 pl-[72px] pr-[44px] text-xs focus:outline-none scroll-m-1 min-h-[44px] max-h-[30vh]"
						rows={1}
						onInput={(e) => {
							const target = e.target as HTMLTextAreaElement;
							target.style.height = 'auto';
							target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
						}}
					/>
					
					<div className="absolute right-2 bottom-1.5 opacity-80 focus-within:opacity-100">
						<Button
							type="submit"
							size="icon"
							className={`h-8 w-8 rounded-full transition-all duration-300 ${
								input.trim() || selectedImages.length > 0
									? (isScanMode ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg scale-105" : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg scale-105")
									: "bg-muted/50 text-muted-foreground cursor-not-allowed"
							}`}
							onClick={() => onSendMessage(input)}
							disabled={isLoading || isScanning || (!input.trim() && selectedImages.length === 0)}
						>
							{isLoading || isScanning ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Send className="h-4 w-4 translate-x-0.5" />
							)}
						</Button>
					</div>
				</div>
			</div>
			
			<div className="mt-1.5 text-center">
				<p className="text-[9px] text-muted-foreground/60 font-medium tracking-tight">
					Yumi AI dapat membuat kesalahan. Periksa informasi penting.
				</p>
			</div>
		</div>
	);
};
