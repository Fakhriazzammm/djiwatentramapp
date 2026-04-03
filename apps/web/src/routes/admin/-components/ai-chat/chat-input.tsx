import React, { useState, useEffect, useCallback, useRef } from "react";
import { ArrowUp, ScanLine, Camera, Trash2, Loader2, Sparkles, AlertTriangle, Settings, TrendingUp, Wallet, Target, Mic, MicOff, Paperclip } from "lucide-react";
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

const SpeechRecognition = (typeof window !== "undefined")
	? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) as any
	: null;

export const ChatInput = ({
	mode, input, setInput, isLoading, isScanning, isScanMode, setIsScanMode,
	selectedImages, onRemoveImage, onFileSelect, onSendMessage, onKeyDown,
	toolCalls, fileInputRef, inputRef, showTemplates
}: ChatInputProps) => {
	const templates = mode === "admin" ? ADMIN_TEMPLATES : CASIER_TEMPLATES;
	const [isListening, setIsListening] = useState(false);
	const [speechSupported, setSpeechSupported] = useState(false);
	const recognitionRef = useRef<any>(null);
	const cameraInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => { setSpeechSupported(!!SpeechRecognition); }, []);

	const startListening = useCallback(() => {
		if (!SpeechRecognition || isListening) return;
		const recognition = new SpeechRecognition();
		recognition.lang = "id-ID";
		recognition.continuous = false;
		recognition.interimResults = true;
		recognition.onresult = (event: any) => {
			let transcript = "";
			for (let i = event.resultIndex; i < event.results.length; i++) {
				transcript += event.results[i][0].transcript;
			}
			setInput(transcript);
		};
		recognition.onend = () => setIsListening(false);
		recognition.onerror = () => setIsListening(false);
		recognitionRef.current = recognition;
		recognition.start();
		setIsListening(true);
	}, [isListening, setInput]);

	const stopListening = useCallback(() => {
		if (recognitionRef.current) recognitionRef.current.stop();
		setIsListening(false);
	}, []);

	const canSend = input.trim() || selectedImages.length > 0;

	return (
		<div className="mx-auto w-full max-w-3xl pb-[max(0.5rem,env(safe-area-inset-bottom))]">
			{showTemplates && !isScanMode && (
				<div className="mb-3 flex flex-wrap gap-2 justify-center">
					{templates.map((template, i) => (
						<button
							key={i}
							onClick={() => onSendMessage(template.message)}
							className="flex items-center gap-1.5 rounded-full border border-border/50 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors active:scale-[0.97]"
							type="button"
						>
							{template.icon}
							{template.label}
						</button>
					))}
				</div>
			)}

			<div className={`rounded-2xl border shadow-lg overflow-hidden transition-all bg-background ${
				isScanMode ? "border-emerald-300 shadow-emerald-50" : "border-border/60"
			} focus-within:shadow-xl focus-within:border-primary/20`}>
				{isScanMode && (
					<div className="border-b border-emerald-200 bg-emerald-50 px-4 py-1.5 flex items-center gap-2">
						<ScanLine className="h-3.5 w-3.5 text-emerald-600" />
						<span className="text-xs font-medium text-emerald-700">Mode Scan — Unggah struk atau faktur untuk dianalisis</span>
					</div>
				)}

				{toolCalls.length > 0 && (
					<div className="border-b border-border/40 px-4 py-2.5 bg-muted/20">
						<div className="flex flex-wrap gap-2">
							{toolCalls.map((tool, i) => (
								<div key={i} className="flex items-center gap-1.5 text-xs bg-background rounded-full px-3 py-1 border border-border/40">
									{tool.status === "executing" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
									{tool.status === "success" && <span className="text-green-500 text-xs">✓</span>}
									{tool.status === "error" && <span className="text-destructive text-xs">✗</span>}
									<span className="font-medium">{TOOL_LABELS[tool.name] || tool.name}</span>
								</div>
							))}
						</div>
					</div>
				)}

				{selectedImages.length > 0 && (
					<div className="border-b border-border/40 px-4 py-2.5">
						<div className="flex items-center justify-between mb-2">
							<span className="text-[11px] font-medium text-muted-foreground">{selectedImages.length} lampiran</span>
							<button onClick={onRemoveImage} className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" type="button">
								<Trash2 className="h-3.5 w-3.5" />
							</button>
						</div>
						<div className="flex gap-2 overflow-x-auto pb-1">
							{selectedImages.map((img, i) => (
								<div key={i} className="relative flex-shrink-0">
									<img src={img} className="h-16 w-16 object-cover rounded-xl border border-border/40" alt="" />
								</div>
							))}
						</div>
					</div>
				)}

				<textarea
					ref={inputRef}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={onKeyDown}
					placeholder={isListening ? "Mendengarkan..." : isScanMode ? "Instruksi analisis gambar..." : "Tanya Yumi AI..."}
					className="w-full resize-none bg-transparent px-4 py-3 text-sm focus:outline-none min-h-[24px] max-h-[200px] placeholder:text-muted-foreground/50"
					rows={1}
					onInput={(e) => {
						const target = e.target as HTMLTextAreaElement;
						target.style.height = 'auto';
						target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
					}}
				/>

				<div className="flex items-center justify-between px-3 pb-3">
					<div className="flex items-center gap-0.5">
						<Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" onClick={() => fileInputRef.current?.click()} title="Upload file" type="button">
							<Paperclip className="h-[18px] w-[18px]" />
						</Button>
						<Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" onClick={() => cameraInputRef.current?.click()} title="Ambil foto" type="button">
							<Camera className="h-[18px] w-[18px]" />
						</Button>
						<Button variant="ghost" size="icon" className={`h-8 w-8 rounded-full transition-colors ${isScanMode ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setIsScanMode(!isScanMode)} title={isScanMode ? "Nonaktifkan mode scan" : "Mode scan"} type="button">
							<ScanLine className="h-[18px] w-[18px]" />
						</Button>
						<input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={onFileSelect} />
						<input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={onFileSelect} />
					</div>
					<div className="flex items-center gap-0.5">
						{speechSupported && (
							<Button variant="ghost" size="icon" className={`h-8 w-8 rounded-full transition-all ${isListening ? "text-red-500 bg-red-50 scale-110" : "text-muted-foreground hover:text-foreground"}`} onClick={isListening ? stopListening : startListening} title={isListening ? "Berhenti mendengarkan" : "Input suara"} type="button">
								{isListening ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
							</Button>
						)}
						<Button
							size="icon"
							className={`h-8 w-8 rounded-full transition-all ${
								canSend && !isLoading && !isScanning
									? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm cursor-pointer"
									: "bg-muted text-muted-foreground cursor-not-allowed"
							}`}
							onClick={() => onSendMessage(input)}
							disabled={isLoading || isScanning || !canSend}
							type="button"
						>
							{isLoading || isScanning ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.5} />}
						</Button>
					</div>
				</div>
			</div>

			<p className="mt-1.5 text-center text-[11px] text-muted-foreground/40">
				Yumi AI dapat membuat kesalahan. Periksa informasi penting.
			</p>
		</div>
	);
};
