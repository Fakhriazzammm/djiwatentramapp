import { api } from "@tkmpos/backend/convex/_generated/api";
import { useAction } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	BarChart3,
	Camera,
	Check,
	Loader2,
	Plus,
	RefreshCw,
	ShoppingCart,
	Sparkles,
	TrendingUp,
	Wallet,
	X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

interface ScanResult {
	type: "order" | "transaction" | "product" | "expense" | "unknown";
	data?: {
		amount?: number;
		items?: Array<{ name: string; quantity: number; price?: number }>;
		category?: string;
		description?: string;
		paymentMethod?: string;
		notes?: string;
	};
	confidence: number;
	rawText: string;
}

interface ImageScannerProps {
	isOpen: boolean;
	onClose: () => void;
	onDataGenerated?: (type: string, data: any) => void;
}

type ScanMode = "single" | "batch";

export function ImageScanner({
	isOpen,
	onClose,
	onDataGenerated,
}: ImageScannerProps) {
	const [mode, setMode] = useState<ScanMode>("single");
	const [images, setImages] = useState<string[]>([]);
	const [currentImageIndex, setCurrentImageIndex] = useState(0);
	const [scanResults, setScanResults] = useState<(ScanResult | null)[]>([]);
	const [isScanning, setIsScanning] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [generatedResults, setGeneratedResults] = useState<any[]>([]);
	const [showCamera, setShowCamera] = useState(false);
	const [showReport, setShowReport] = useState(false);
	const [reportData, setReportData] = useState<any>(null);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const streamRef = useRef<MediaStream | null>(null);

	const processReceiptMutation = useAction(api.ai.processReceipt);
	const processAndGenerateMutation = useAction(api.ai.processImageAndGenerate);
	const batchProcessMutation = useAction(api.ai.batchProcessReceipts);
	const batchGenerateMutation = useAction(api.ai.batchGenerateTransactions);
	const generateScanReportMutation = useAction(api.ai.generateScanReport);

	// File input handler for single/multiple files
	const handleFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const files = Array.from(e.target.files || []);
			if (files.length === 0) {
				return;
			}

			const validFiles = files.filter((file) => {
				if (!file.type.startsWith("image/")) {
					toast.error(`${file.name} bukan file gambar`);
					return false;
				}
				if (file.size > 10 * 1024 * 1024) {
					toast.error(`${file.name} terlalu besar (maks 10MB)`);
					return false;
				}
				return true;
			});

			if (validFiles.length === 0) {
				return;
			}

			// Read all files
			const promises = validFiles.map((file) => {
				return new Promise<string>((resolve) => {
					const reader = new FileReader();
					reader.onload = (e) => resolve(e.target?.result as string);
					reader.readAsDataURL(file);
				});
			});

			Promise.all(promises).then((imageDataUrls) => {
				setImages(imageDataUrls);
				setScanResults(new Array(imageDataUrls.length).fill(null));
				setGeneratedResults([]);
				setCurrentImageIndex(0);

				// Auto switch to batch mode if multiple files
				if (imageDataUrls.length > 1) {
					setMode("batch");
				}
			});
		},
		[]
	);

	// Camera capture handlers
	const startCamera = useCallback(async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: "environment" },
				audio: false,
			});
			streamRef.current = stream;
			if (videoRef.current) {
				videoRef.current.srcObject = stream;
			}
			setShowCamera(true);
		} catch (_error) {
			toast.error(
				"Tidak dapat mengakses kamera. Pastikan izin kamera diberikan."
			);
		}
	}, []);

	const stopCamera = useCallback(() => {
		if (streamRef.current) {
			streamRef.current.getTracks().forEach((track) => track.stop());
			streamRef.current = null;
		}
		setShowCamera(false);
	}, []);

	const capturePhoto = useCallback(() => {
		if (!(videoRef.current && canvasRef.current)) {
			return;
		}

		const video = videoRef.current;
		const canvas = canvasRef.current;
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;

		const ctx = canvas.getContext("2d");
		if (!ctx) {
			return;
		}

		ctx.drawImage(video, 0, 0);
		const imageData = canvas.toDataURL("image/jpeg", 0.8);

		setImages((prev) => [...prev, imageData]);
		setScanResults((prev) => [...prev, null]);
		stopCamera();
	}, [stopCamera]);

	// Scan handlers
	const handleScan = async (index?: number) => {
		const idx = index ?? currentImageIndex;
		if (!images[idx]) {
			return;
		}

		setIsScanning(true);
		try {
			const result = await processReceiptMutation({ image: images[idx] });
			setScanResults((prev) => {
				const newResults = [...prev];
				newResults[idx] = result as ScanResult;
				return newResults;
			});
			toast.success(`Gambar ${idx + 1} berhasil diproses!`);
		} catch (error) {
			console.error(error);
			toast.error(`Gagal memproses gambar ${idx + 1}`);
		} finally {
			setIsScanning(false);
		}
	};

	const handleScanAll = async () => {
		setIsScanning(true);
		try {
			const result = await batchProcessMutation({ images });
			setScanResults(result.results as ScanResult[]);
			toast.success(
				`Berhasil memproses ${result.summary.totalProcessed} gambar!`
			);
		} catch (error) {
			console.error(error);
			toast.error("Gagal memproses gambar. Silakan coba lagi.");
		} finally {
			setIsScanning(false);
		}
	};

	// Generate handlers
	const handleAutoGenerate = async (
		type: "auto" | "expense" | "order" | "income" = "auto",
		index?: number
	) => {
		if (isGenerating) {
			return;
		}

		// Single image generate
		if (index !== undefined) {
			setIsGenerating(true);
			try {
				const result = await processAndGenerateMutation({
					image: images[index],
					generateType: type,
				});

				if (result.success && result.generated) {
					setGeneratedResults((prev) => [...prev, result.generated]);
					toast.success(result.message);

					if (onDataGenerated) {
						onDataGenerated(result.generated.type, result.generated);
					}
				} else {
					toast.error(result.message || "Gagal generate data");
				}
			} catch (error) {
				console.error(error);
				toast.error("Gagal generate data");
			} finally {
				setIsGenerating(false);
			}
			return;
		}

		// Batch generate
		setIsGenerating(true);
		try {
			const result = await batchGenerateMutation({
				images,
				generateType: type,
			});

			if (result.summary.totalGenerated > 0) {
				setGeneratedResults(result.generated);
				toast.success(
					`Berhasil generate ${result.summary.totalGenerated} transaksi, total Rp${result.summary.totalAmount.toLocaleString(
						"id-ID"
					)}`
				);

				if (onDataGenerated) {
					result.generated.forEach((g: any) => {
						onDataGenerated(g.type, g);
					});
				}
			}

			if (result.summary.totalFailed > 0) {
				toast.error(`${result.summary.totalFailed} gambar gagal diproses`);
			}
		} catch (error) {
			console.error(error);
			toast.error("Gagal batch generate. Silakan coba lagi.");
		} finally {
			setIsGenerating(false);
		}
	};

	// Report handler
	const handleGenerateReport = async (
		period: "daily" | "weekly" | "monthly"
	) => {
		try {
			const result = await generateScanReportMutation({ period });
			setReportData(result);
			setShowReport(true);
		} catch (_error) {
			toast.error("Gagal generate laporan");
		}
	};

	// Reset
	const handleReset = () => {
		setImages([]);
		setScanResults([]);
		setGeneratedResults([]);
		setCurrentImageIndex(0);
		setMode("single");
		setShowReport(false);
		setReportData(null);
	};

	// Remove specific image
	const handleRemoveImage = (index: number) => {
		setImages((prev) => prev.filter((_, i) => i !== index));
		setScanResults((prev) => prev.filter((_, i) => i !== index));
		setGeneratedResults((prev) => prev.filter((_, i) => i !== index));

		if (currentImageIndex >= images.length - 1) {
			setCurrentImageIndex(Math.max(0, images.length - 2));
		}

		if (images.length === 1) {
			setMode("single");
		}
	};

	const currentImage = images[currentImageIndex];
	const currentResult = scanResults[currentImageIndex];

	if (!isOpen) {
		return null;
	}

	return (
		<AnimatePresence>
			{isOpen && (
				<>
					{/* Backdrop */}
					<motion.div
						animate={{ opacity: 1 }}
						className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
						exit={{ opacity: 0 }}
						initial={{ opacity: 0 }}
						onClick={onClose}
					/>

					{/* Modal */}
					<motion.div
						animate={{ opacity: 1, scale: 1, y: 0 }}
						className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
						exit={{ opacity: 0, scale: 0.95, y: 20 }}
						initial={{ opacity: 0, scale: 0.95, y: 20 }}
						onClick={(e) => e.stopPropagation()}
					>
						<div
							className="my-8 w-full max-w-lg"
							onClick={(e) => e.stopPropagation()}
						>
							{/* Header */}
							<div className="mb-4 flex items-center justify-between">
								<div>
									<h3 className="font-bold text-foreground text-lg">
										{showReport
											? "Laporan Scan Struk"
											: mode === "batch"
												? "Multi-Struk Scanner"
												: "Scan Struk dengan AI"}
									</h3>
									{mode === "batch" && !showReport && (
										<p className="text-muted-foreground text-xs">
											{images.length} gambar dipilih
										</p>
									)}
								</div>
								<div className="flex items-center gap-2">
									{!showReport && images.length === 0 && (
										<button
											className="text-primary text-xs hover:underline"
											onClick={() => handleGenerateReport("weekly")}
											type="button"
										>
											<BarChart3 className="mr-1 inline h-4 w-4" />
											Laporan
										</button>
									)}
									<button
										className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
										onClick={() => {
											handleReset();
											stopCamera();
											if (showReport) {
												setShowReport(false);
											}
										}}
										type="button"
									>
										<X className="h-5 w-5" />
									</button>
								</div>
							</div>

							{/* Report View */}
							{showReport && reportData ? (
								<div className="space-y-4 rounded-xl border border-border bg-card p-4">
									{/* Period Tabs */}
									<div className="flex gap-2">
										{(["daily", "weekly", "monthly"] as const).map((p) => (
											<button
												className={`rounded-full px-3 py-1 font-medium text-xs ${
													reportData.period === p
														? "bg-primary text-primary-foreground"
														: "bg-muted text-muted-foreground"
												}`}
												key={p}
												onClick={() => handleGenerateReport(p)}
											>
												{p === "daily"
													? "Harian"
													: p === "weekly"
														? "Mingguan"
														: "Bulanan"}
											</button>
										))}
									</div>

									{/* Summary */}
									<div className="grid grid-cols-3 gap-3">
										<div className="rounded-lg bg-muted/50 p-3 text-center">
											<p className="text-muted-foreground text-xs">
												Total Pengeluaran
											</p>
											<p className="font-bold text-foreground">
												Rp
												{reportData.summary.totalExpense.toLocaleString(
													"id-ID"
												)}
											</p>
										</div>
										<div className="rounded-lg bg-muted/50 p-3 text-center">
											<p className="text-muted-foreground text-xs">Transaksi</p>
											<p className="font-bold text-foreground">
												{reportData.summary.transactionCount}
											</p>
										</div>
										<div className="rounded-lg bg-muted/50 p-3 text-center">
											<p className="text-muted-foreground text-xs">Rata-rata</p>
											<p className="font-bold text-foreground">
												Rp
												{Math.round(
													reportData.summary.avgPerTransaction
												).toLocaleString("id-ID")}
											</p>
										</div>
									</div>

									{/* Top Categories */}
									<div>
										<p className="mb-2 text-muted-foreground text-xs">
											Kategori Teratas
										</p>
										<div className="space-y-2">
											{reportData.topCategories.map((cat: any) => (
												<div
													className="flex items-center gap-2"
													key={cat.category}
												>
													<div className="flex-1">
														<div className="mb-1 flex justify-between text-xs">
															<span className="capitalize">
																{cat.category.replace("_", " ")}
															</span>
															<span className="text-muted-foreground">
																Rp{cat.total.toLocaleString("id-ID")}
															</span>
														</div>
														<div className="h-2 overflow-hidden rounded-full bg-muted">
															<div
																className="h-full rounded-full bg-primary"
																style={{ width: `${cat.percentage}%` }}
															/>
														</div>
													</div>
													<span className="w-10 text-right text-muted-foreground text-xs">
														{cat.percentage}%
													</span>
												</div>
											))}
										</div>
									</div>

									<button
										className="w-full rounded-lg border border-border bg-muted/30 py-2 font-medium text-sm hover:bg-muted/50"
										onClick={() => setShowReport(false)}
										type="button"
									>
										Kembali ke Scanner
									</button>
								</div>
							) : showCamera ? (
								/* Camera View */
								<div className="overflow-hidden rounded-xl border border-border bg-card">
									<div className="relative aspect-video bg-black">
										<video
											autoPlay
											className="h-full w-full object-cover"
											muted
											onLoadedMetadata={() => videoRef.current?.play()}
											ref={videoRef}
										/>
										<canvas className="hidden" ref={canvasRef} />
									</div>
									<div className="flex gap-3 p-4">
										<button
											className="flex-1 rounded-lg bg-primary py-3 font-semibold text-primary-foreground"
											onClick={capturePhoto}
											type="button"
										>
											<Camera className="mx-auto mb-1 h-5 w-5" />
											Ambil Foto
										</button>
										<button
											className="rounded-lg border border-border bg-muted px-4"
											onClick={stopCamera}
											type="button"
										>
											<X className="h-5 w-5" />
										</button>
									</div>
								</div>
							) : images.length === 0 ? (
								/* Upload Area */
								<div className="space-y-4">
									<div
										className="cursor-pointer rounded-2xl border-2 border-border border-dashed bg-muted/30 p-8 text-center transition-colors hover:border-primary/50"
										onClick={() => fileInputRef.current?.click()}
									>
										<input
											accept="image/*"
											className="hidden"
											multiple
											onChange={handleFileSelect}
											ref={fileInputRef}
											type="file"
										/>
										<div className="flex flex-col items-center gap-3">
											<div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
												<Camera className="h-8 w-8 text-primary" />
											</div>
											<div>
												<p className="font-semibold text-foreground">
													Upload Foto Struk/Kwitansi
												</p>
												<p className="text-muted-foreground text-sm">
													Klik untuk pilih file atau seret ke sini
												</p>
											</div>
											<div className="flex gap-2">
												<button
													className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 font-medium text-accent-foreground text-sm"
													onClick={(e) => {
														e.stopPropagation();
														startCamera();
													}}
													type="button"
												>
													<Camera className="h-4 w-4" />
													Buka Kamera
												</button>
											</div>
										</div>
									</div>

									{/* Quick Actions */}
									<div className="grid grid-cols-3 gap-3">
										<button
											className="rounded-lg border border-border bg-muted/30 p-3 text-center transition-colors hover:bg-muted/50"
											onClick={() => handleGenerateReport("daily")}
											type="button"
										>
											<BarChart3 className="mx-auto mb-1 h-5 w-5 text-primary" />
											<p className="font-medium text-xs">Harian</p>
										</button>
										<button
											className="rounded-lg border border-border bg-muted/30 p-3 text-center transition-colors hover:bg-muted/50"
											onClick={() => handleGenerateReport("weekly")}
											type="button"
										>
											<BarChart3 className="mx-auto mb-1 h-5 w-5 text-primary" />
											<p className="font-medium text-xs">Mingguan</p>
										</button>
										<button
											className="rounded-lg border border-border bg-muted/30 p-3 text-center transition-colors hover:bg-muted/50"
											onClick={() => handleGenerateReport("monthly")}
											type="button"
										>
											<BarChart3 className="mx-auto mb-1 h-5 w-5 text-primary" />
											<p className="font-medium text-xs">Bulanan</p>
										</button>
									</div>
								</div>
							) : (
								/* Image/Results View */
								<div className="space-y-4">
									{/* Image Preview with Thumbnails (for batch) */}
									{mode === "batch" && images.length > 1 ? (
										<div className="flex gap-2 overflow-x-auto pb-2">
											{images.map((img, idx) => (
												<div
													className={`relative flex-shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 ${
														currentImageIndex === idx
															? "border-primary"
															: "border-border"
													}`}
													key={idx}
													onClick={() => setCurrentImageIndex(idx)}
												>
													<img
														alt={`Preview ${idx + 1}`}
														className="h-16 w-16 object-cover"
														src={img}
													/>
													{scanResults[idx] && (
														<div className="absolute inset-0 flex items-center justify-center bg-green-500/30">
															<Check className="h-4 w-4 text-white" />
														</div>
													)}
													<button
														className="absolute -top-1 -right-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
														onClick={(e) => {
															e.stopPropagation();
															handleRemoveImage(idx);
														}}
														type="button"
													>
														<X className="h-3 w-3" />
													</button>
												</div>
											))}
											{images.length < 10 && (
												<button
													className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border-2 border-border border-dashed transition-colors hover:border-primary"
													onClick={() => fileInputRef.current?.click()}
													type="button"
												>
													<Plus className="h-5 w-5 text-muted-foreground" />
												</button>
											)}
										</div>
									) : (
										/* Single Image Preview */
										<div className="relative overflow-hidden rounded-xl border border-border bg-card">
											<img
												alt="Preview"
												className="h-48 w-full bg-muted object-contain"
												src={currentImage}
											/>
											<button
												className="absolute top-2 right-2 rounded-full bg-destructive/10 p-1 text-destructive transition-colors hover:bg-destructive/20"
												onClick={handleReset}
												type="button"
											>
												<X className="h-4 w-4" />
											</button>
										</div>
									)}

									{/* Scan Result */}
									{currentResult ? (
										<div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
											<div className="flex items-center gap-2">
												<div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
													<Check className="h-3 w-3 text-primary" />
												</div>
												<p className="font-semibold text-foreground text-sm">
													Selesai Diproses!
												</p>
											</div>

											{/* Extracted Data */}
											<div className="space-y-2 rounded-lg bg-background p-3">
												<div className="flex items-center justify-between">
													<span className="text-muted-foreground text-xs">
														Terdeteksi:
													</span>
													<span className="font-medium text-primary text-xs">
														{currentResult.type === "expense"
															? "Pengeluaran"
															: currentResult.type === "order"
																? "Pesanan"
																: "Lainnya"}
													</span>
												</div>
												{currentResult.data?.amount && (
													<div className="flex justify-between">
														<span className="text-xs">Total:</span>
														<span className="font-semibold text-sm">
															Rp
															{currentResult.data.amount.toLocaleString(
																"id-ID"
															)}
														</span>
													</div>
												)}
												{currentResult.data?.category && (
													<div className="flex justify-between">
														<span className="text-xs">Kategori:</span>
														<span className="text-xs">
															{currentResult.data.category}
														</span>
													</div>
												)}
											</div>

											{/* Generate Button */}
											{generatedResults[currentImageIndex] ? (
												<div className="text-center text-sm text-success">
													<Check className="mr-1 inline h-4 w-4" />
													Sudah di-generate
												</div>
											) : (
												<button
													className="w-full rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground text-sm disabled:opacity-50"
													disabled={isGenerating}
													onClick={() =>
														handleAutoGenerate("auto", currentImageIndex)
													}
													type="button"
												>
													{isGenerating ? (
														<Loader2 className="mx-auto h-4 w-4 animate-spin" />
													) : (
														<>
															<Sparkles className="mr-2 inline h-4 w-4" />
															Generate
														</>
													)}
												</button>
											)}
										</div>
									) : (
										/* Scan Button(s) */
										<div className="space-y-2">
											<button
												className="w-full rounded-lg bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50"
												disabled={isScanning}
												onClick={() =>
													mode === "batch" ? handleScanAll() : handleScan()
												}
												type="button"
											>
												{isScanning ? (
													<>
														<Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
														{mode === "batch" ? "Memproses..." : "Memindai..."}
													</>
												) : (
													<>
														<RefreshCw className="mr-2 inline h-4 w-4" />
														{mode === "batch"
															? "Scan Semua Struk"
															: "Scan dengan AI"}
													</>
												)}
											</button>

											{/* Batch Generate All (for batch mode) */}
											{mode === "batch" &&
												scanResults.filter((r) => r).length > 0 && (
													<>
														<button
															className="w-full rounded-lg bg-accent py-3 font-semibold text-accent-foreground disabled:opacity-50"
															disabled={
																isGenerating || generatedResults.length > 0
															}
															onClick={() => handleAutoGenerate("auto")}
															type="button"
														>
															{isGenerating ? (
																<Loader2 className="mx-auto h-4 w-4 animate-spin" />
															) : (
																<>
																	<Sparkles className="mr-2 inline h-4 w-4" />
																	Generate Semua (
																	{scanResults.filter((r) => r).length})
																</>
															)}
														</button>

														{/* Category Selection for Batch */}
														<div className="grid grid-cols-3 gap-2">
															<button
																className="rounded-lg border border-border bg-muted/30 py-2 font-medium text-xs hover:bg-expense/10 disabled:opacity-50"
																disabled={isGenerating}
																onClick={() => handleAutoGenerate("expense")}
																type="button"
															>
																<Wallet className="mr-1 inline h-3 w-3" />
																Expense
															</button>
															<button
																className="rounded-lg border border-border bg-muted/30 py-2 font-medium text-xs hover:bg-primary/10 disabled:opacity-50"
																disabled={isGenerating}
																onClick={() => handleAutoGenerate("order")}
																type="button"
															>
																<ShoppingCart className="mr-1 inline h-3 w-3" />
																Order
															</button>
															<button
																className="rounded-lg border border-border bg-muted/30 py-2 font-medium text-xs hover:bg-income/10 disabled:opacity-50"
																disabled={isGenerating}
																onClick={() => handleAutoGenerate("income")}
																type="button"
															>
																<TrendingUp className="mr-1 inline h-3 w-3" />
																Income
															</button>
														</div>
													</>
												)}
										</div>
									)}

									{/* Add More Button (for batch mode) */}
									{mode === "single" && images.length > 0 && (
										<button
											className="w-full rounded-lg border border-border border-dashed py-2 text-muted-foreground text-sm transition-colors hover:border-primary hover:text-primary"
											onClick={() => {
												setMode("batch");
												fileInputRef.current?.click();
											}}
											type="button"
										>
											<Plus className="mr-2 inline h-4 w-4" />
											Tambah Struk Lain (Multi)
										</button>
									)}
								</div>
							)}
						</div>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
}
