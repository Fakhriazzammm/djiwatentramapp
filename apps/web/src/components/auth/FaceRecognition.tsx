import React, { useEffect, useRef, useState, useCallback } from "react";
import * as faceapi from "face-api.js";
import Webcam from "react-webcam";
import { Loader2, Camera, CheckCircle2, XCircle, ScanFace, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface FaceRecognitionProps {
	onMatch?: (descriptor: number[]) => void;
	onCapture?: (descriptor: number[]) => void;
	onModelError?: (error: string) => void;
	targetDescriptor?: number[];
	mode: "enroll" | "verify";
	className?: string;
}

const MODEL_CDN_URL = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";

const MODEL_PATH_CANDIDATES = (() => {
	const baseUrl = import.meta.env.BASE_URL || "/";
	const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
	const paths = [
		`${normalizedBase}/models`,
		"/models",
		"./models",
		MODEL_CDN_URL,
	];
	return [...new Set(paths.map((path) => path.replace(/\/{2,}/g, "/").replace("https:/", "https://")))];
})();

async function canReachModelManifest(path: string) {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 1500);
		
		const response = await fetch(
			`${path}/tiny_face_detector_model-weights_manifest.json`,
			{ method: "GET", cache: "force-cache", signal: controller.signal }
		);
		clearTimeout(timeoutId);
		return response.ok;
	} catch (err) {
		return false;
	}
}

function LoadTimer({ startMs }: { startMs: number }) {
	const [sec, setSec] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setSec(parseFloat(((Date.now() - startMs) / 1000).toFixed(1))), 100);
		return () => clearInterval(id);
	}, [startMs]);
	return <p className="mt-2 text-xs font-mono text-white/40">{sec}d</p>;
}

export function FaceRecognition({
	onMatch,
	onCapture,
	onModelError,
	targetDescriptor,
	mode,
	className = "",
}: FaceRecognitionProps) {
	const webcamRef = useRef<Webcam>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const autoCaptureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [modelsLoaded, setModelsLoaded] = useState(false);
	const [loadingStep, setLoadingStep] = useState<string>("Inisialisasi...");
	const [modelPath, setModelPath] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [matchStatus, setMatchStatus] = useState<"idle" | "detecting" | "scanning" | "success" | "fail">("idle");
	const [faceDetected, setFaceDetected] = useState(false);
	const [scanProgress, setScanProgress] = useState(0);
	const [autoCaptureReady, setAutoCaptureReady] = useState(false);
	const [retryCount, setRetryCount] = useState(0);
	const [scanLineY, setScanLineY] = useState(0);
	const [elapsedMs, setElapsedMs] = useState(0);
	const [scanStartMs, setScanStartMs] = useState(0);
	const [loadStartMs, setLoadStartMs] = useState(Date.now());
	const [loadElapsedSec, setLoadElapsedSec] = useState(0);

	useEffect(() => {
		let cancelled = false;

		const loadModels = async () => {
			setError(null);
			setModelsLoaded(false);
			setMatchStatus("idle");
			setLoadStartMs(Date.now());
			
			// Global timeout for entire loading process
			const globalTimeout = setTimeout(() => {
				if (!cancelled && !modelsLoaded) {
					const errorMsg = "Waktu pemuatan habis. Jaringan mungkin sedang sibuk.";
					setError(errorMsg);
					onModelError?.(errorMsg);
				}
			}, 20000);

			for (const candidatePath of MODEL_PATH_CANDIDATES) {
				const isCDN = candidatePath.startsWith("http");
				if (!isCDN) {
					const manifestExists = await canReachModelManifest(candidatePath);
					if (!manifestExists) continue;
				}

				try {
					setLoadingStep("Memuat Detektor (1/3)...");
					setLoadingStep(`Memuat Detektor (1/3)... ${((Date.now() - loadStartMs) / 1000).toFixed(1)}d`);
					await faceapi.nets.tinyFaceDetector.loadFromUri(candidatePath);
					
					setLoadingStep(`Memuat Landmark (2/3)... ${((Date.now() - loadStartMs) / 1000).toFixed(1)}d`);
					await faceapi.nets.faceLandmark68Net.loadFromUri(candidatePath);
					
					setLoadingStep(`Memuat Pengenalan (3/3)... ${((Date.now() - loadStartMs) / 1000).toFixed(1)}d`);
					await faceapi.nets.faceRecognitionNet.loadFromUri(candidatePath);
					
					if (!cancelled) {
						clearTimeout(globalTimeout);
						setModelPath(candidatePath);
						setModelsLoaded(true);
						setLoadElapsedSec(parseFloat(((Date.now() - loadStartMs) / 1000).toFixed(1)));
					}
					return;
				} catch (err) {
					console.error(`Failed to load face-api models from ${candidatePath}:`, err);
					// Continue to next candidate
				}
			}

			if (!cancelled) {
				clearTimeout(globalTimeout);
				const errorMsg = "Gagal memuat sistem biometrik. Gunakan PIN jika terus berlanjut.";
				setError(errorMsg);
				onModelError?.(errorMsg);
			}
		};

		loadModels();
		return () => { cancelled = true; };
	}, [retryCount]);

	// Scan line animation
	useEffect(() => {
		if (matchStatus !== "scanning") {
			return;
		}
		const interval = setInterval(() => {
			setScanLineY((prev) => (prev >= 100 ? 0 : prev + 2));
		}, 30);
		return () => clearInterval(interval);
	}, [matchStatus]);

	// Auto-detect face continuously when idle
	useEffect(() => {
		if (!modelsLoaded || matchStatus !== "idle") return;

		const detectLoop = async () => {
			if (!webcamRef.current?.video || matchStatus !== "idle") return;
			const video = webcamRef.current.video;

			try {
				const detection = await faceapi
					.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 128, scoreThreshold: 0.4 }))
					.withFaceLandmarks();

				if (detection) {
					setFaceDetected(true);
					setAutoCaptureReady(true);
				} else {
					setFaceDetected(false);
					setAutoCaptureReady(false);
				}
			} catch {
				// Silently retry
			}
		};

		scanIntervalRef.current = setInterval(detectLoop, 200);
		return () => {
			if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
		};
	}, [modelsLoaded, matchStatus]);

	const performCapture = useCallback(async () => {
		if (!webcamRef.current || !modelsLoaded) return;
		if (matchStatus === "scanning" || matchStatus === "success") return;

		// Clear auto-detect interval
		if (scanIntervalRef.current) {
			clearInterval(scanIntervalRef.current);
			scanIntervalRef.current = null;
		}

		setMatchStatus("scanning");
		setScanProgress(0);
		setAutoCaptureReady(false);
		setScanStartMs(Date.now());

		const progressInterval = setInterval(() => {
			setScanProgress((prev) => {
				if (prev >= 90) {
					clearInterval(progressInterval);
					return 90;
				}
				return prev + Math.random() * 20;
			});
			setElapsedMs(Date.now() - scanStartMs);
		}, 100);

		try {
			const video = webcamRef.current.video;
			if (!video) throw new Error("Video not available");

			const detections = await faceapi
				.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 128, scoreThreshold: 0.4 }))
				.withFaceLandmarks()
				.withFaceDescriptor();

			clearInterval(progressInterval);
			setScanProgress(100);
			setElapsedMs(Date.now() - scanStartMs);

			if (!detections) {
				setTimeout(() => {
					setMatchStatus("fail");
					setFaceDetected(false);
				}, 500);
				return;
			}

			const descriptor = Array.from(detections.descriptor);



			if (mode === "enroll") {
				onCapture?.(descriptor);
				setMatchStatus("success");
			} else if (mode === "verify" && targetDescriptor) {
				const distance = faceapi.euclideanDistance(
					new Float32Array(descriptor),
					new Float32Array(targetDescriptor)
				);

				if (distance < 0.6) {
					setMatchStatus("success");
					onMatch?.(descriptor);
				} else {
					setMatchStatus("fail");
				}
			}
		} catch (err) {
			console.error("Face detection error:", err);
			clearInterval(progressInterval);
			setMatchStatus("fail");
		}
	}, [modelsLoaded, matchStatus, mode, targetDescriptor, onMatch, onCapture]);

	// Auto-capture when face is stable
	useEffect(() => {
		if (autoCaptureReady && matchStatus === "idle" && modelsLoaded) {
			autoCaptureTimeoutRef.current = setTimeout(() => {
				if (autoCaptureReady) {
					performCapture();
				}
			}, 800);
		}
		return () => {
			if (autoCaptureTimeoutRef.current) clearTimeout(autoCaptureTimeoutRef.current);
		};
	}, [autoCaptureReady, matchStatus, modelsLoaded, performCapture]);

	const handleRetry = () => {
		setMatchStatus("idle");
		setFaceDetected(false);
		setAutoCaptureReady(false);
		setScanProgress(0);
		setScanLineY(0);
	};

	const handleReloadModels = () => {
		setError(null);
		setModelsLoaded(false);
		setRetryCount((c) => c + 1);
	};

	return (
		<div className={`flex flex-col items-center gap-4 ${className}`}>
			<div className="relative w-full overflow-hidden rounded-3xl bg-black shadow-2xl ring-2 ring-border/30"
				style={{ aspectRatio: "3/4" }}
			>
				{/* Loading overlay */}
				<AnimatePresence>
					{!modelsLoaded && !error && (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm"
						>
							<div className="relative">
								<div className="absolute -inset-4 rounded-full bg-primary/20 blur-xl animate-pulse" />
								<Loader2 className="relative h-12 w-12 animate-spin text-primary" />
							</div>
							<p className="mt-4 text-sm font-bold text-white">{loadingStep}</p>
							<p className="mt-1 text-center text-xs text-white/50">
								Menyiapkan sistem biometrik
							</p>
							<LoadTimer startMs={loadStartMs} />
						</motion.div>
					)}
				</AnimatePresence>

				{/* Error overlay */}
				<AnimatePresence>
					{error && (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-red-950/90 p-6 text-center backdrop-blur-sm"
						>
							<XCircle className="h-14 w-14 text-red-400" />
							<p className="mt-3 font-bold text-red-300">{error}</p>
							<Button
								className="mt-5 rounded-2xl"
								onClick={handleReloadModels}
								variant="outline"
							>
								<RefreshCw className="mr-2 h-4 w-4" />
								Muat Ulang
							</Button>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Webcam */}
				<Webcam
					audio={false}
					className="absolute inset-0 h-full w-full object-cover scale-x-[-1]"
					mirrored={false}
					ref={webcamRef}
					screenshotFormat="image/jpeg"
					videoConstraints={{
						width: { ideal: 640 },
						height: { ideal: 960 },
						facingMode: "user",
					}}
				/>

				{/* Hidden canvas for detections */}
				<canvas ref={canvasRef} className="hidden" />

				{/* Dark vignette overlay */}
				<div className="absolute inset-0 z-10 pointer-events-none"
					style={{
						background: "radial-gradient(ellipse 55% 60% at 50% 45%, transparent 0%, transparent 60%, rgba(0,0,0,0.7) 100%)",
					}}
				/>

				{/* Dashed Oval Overlay */}
				<div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
					<svg
						className="w-full h-full"
						viewBox="0 0 300 400"
						preserveAspectRatio="xMidYMid meet"
					>
						<defs>
							<filter id="oval-glow">
								<feGaussianBlur stdDeviation="3" result="blur" />
								<feMerge>
									<feMergeNode in="blur" />
									<feMergeNode in="SourceGraphic" />
								</feMerge>
							</filter>
						</defs>
						{/* Outer glow oval */}
						<ellipse
							cx="150"
							cy="185"
							rx="95"
							ry="125"
							fill="none"
							stroke={faceDetected ? "#10b981" : matchStatus === "scanning" ? "#3b82f6" : "rgba(255,255,255,0.3)"}
							strokeWidth="3"
							strokeDasharray="12 8"
							opacity={0.6}
							filter="url(#oval-glow)"
						>
							{matchStatus === "scanning" && (
								<animate
									attributeName="stroke-dashoffset"
									from="0"
									to="40"
									dur="1s"
									repeatCount="indefinite"
								/>
							)}
						</ellipse>
						{/* Inner oval */}
						<ellipse
							cx="150"
							cy="185"
							rx="90"
							ry="120"
							fill="none"
							stroke={faceDetected ? "#10b981" : matchStatus === "scanning" ? "#3b82f6" : "rgba(255,255,255,0.5)"}
							strokeWidth="2"
							strokeDasharray="8 6"
							opacity={0.8}
						>
							{matchStatus === "scanning" && (
								<animate
									attributeName="stroke-dashoffset"
									from="0"
									to="-28"
									dur="0.8s"
									repeatCount="indefinite"
								/>
							)}
						</ellipse>
						{/* Corner markers */}
						{/* Top-left */}
						<line x1="70" y1="80" x2="85" y2="80" stroke="white" strokeWidth="2" opacity="0.6" />
						<line x1="70" y1="80" x2="70" y2="95" stroke="white" strokeWidth="2" opacity="0.6" />
						{/* Top-right */}
						<line x1="230" y1="80" x2="215" y2="80" stroke="white" strokeWidth="2" opacity="0.6" />
						<line x1="230" y1="80" x2="230" y2="95" stroke="white" strokeWidth="2" opacity="0.6" />
						{/* Bottom-left */}
						<line x1="70" y1="290" x2="85" y2="290" stroke="white" strokeWidth="2" opacity="0.6" />
						<line x1="70" y1="290" x2="70" y2="275" stroke="white" strokeWidth="2" opacity="0.6" />
						{/* Bottom-right */}
						<line x1="230" y1="290" x2="215" y2="290" stroke="white" strokeWidth="2" opacity="0.6" />
						<line x1="230" y1="290" x2="230" y2="275" stroke="white" strokeWidth="2" opacity="0.6" />
					</svg>
				</div>

				{/* Scanner line animation */}
				<AnimatePresence>
					{matchStatus === "scanning" && (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className="absolute inset-0 z-15 pointer-events-none overflow-hidden"
						>
							<motion.div
								className="absolute left-0 right-0 h-1"
								style={{
									background: "linear-gradient(90deg, transparent, #3b82f6, #8b5cf6, #3b82f6, transparent)",
									boxShadow: "0 0 20px 4px rgba(59,130,246,0.4), 0 0 60px 10px rgba(139,92,246,0.2)",
									top: `${scanLineY}%`,
								}}
								transition={{ duration: 0.1 }}
							/>
							{/* Scan glow under the line */}
							<div
								className="absolute left-0 right-0 h-20 pointer-events-none"
								style={{
									top: `${scanLineY}%`,
									transform: "translateY(-50%)",
									background: "linear-gradient(180deg, transparent, rgba(59,130,246,0.1), transparent)",
								}}
							/>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Auto-capture countdown indicator */}
				<AnimatePresence>
					{autoCaptureReady && matchStatus === "idle" && (
						<motion.div
							initial={{ opacity: 0, scale: 0.8 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.8 }}
							className="absolute top-6 left-1/2 -translate-x-1/2 z-20"
						>
							<div className="flex items-center gap-2 rounded-full bg-emerald-500/20 px-4 py-2 backdrop-blur-md border border-emerald-500/30">
								<div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
								<span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
									Wajah Terdeteksi — Otomatis Memindai...
								</span>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Face not detected hint */}
				<AnimatePresence>
					{!faceDetected && matchStatus === "idle" && modelsLoaded && (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
						>
							<div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 backdrop-blur-md border border-white/20">
								<ScanFace className="h-4 w-4 text-white/70" />
								<span className="text-xs font-medium text-white/70">
									Posisikan wajah di dalam area oval
								</span>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Scanning progress bar */}
				<AnimatePresence>
					{matchStatus === "scanning" && (
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 20 }}
							className="absolute bottom-0 left-0 right-0 z-20"
						>
							<div className="p-4 bg-gradient-to-t from-black/80 to-transparent">
								<div className="flex items-center gap-3 mb-2">
									<Loader2 className="h-4 w-4 animate-spin text-blue-400" />
									<span className="text-xs font-bold text-white uppercase tracking-wider">
										Memindai Wajah...
									</span>
									<span className="text-xs font-mono text-blue-300 ml-auto">
										{(elapsedMs / 1000).toFixed(1)}d
									</span>
								</div>
								<div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
									<motion.div
										className="h-full rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500"
										initial={{ width: "0%" }}
										animate={{ width: `${Math.min(scanProgress, 100)}%` }}
										transition={{ duration: 0.3 }}
									/>
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				{/* SUCCESS overlay */}
				<AnimatePresence>
					{matchStatus === "success" && (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className="absolute inset-0 z-20 flex flex-col items-center justify-center"
						>
							<div className="absolute inset-0 bg-emerald-500/20 backdrop-blur-[3px]" />
							<motion.div
								initial={{ scale: 0 }}
								animate={{ scale: 1 }}
								transition={{ type: "spring", stiffness: 200, damping: 15 }}
								className="relative"
							>
								<div className="absolute -inset-6 rounded-full bg-emerald-500/30 blur-2xl animate-pulse" />
								<motion.div
									className="relative flex h-28 w-28 items-center justify-center rounded-full bg-emerald-500 shadow-2xl shadow-emerald-500/40"
									initial={{ rotate: -180, scale: 0 }}
									animate={{ rotate: 0, scale: 1 }}
									transition={{ type: "spring", stiffness: 150, damping: 12, delay: 0.2 }}
								>
									<CheckCircle2 className="h-16 w-16 text-white" strokeWidth={2.5} />
								</motion.div>
							</motion.div>
							<motion.div
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.4 }}
								className="relative mt-6 text-center"
							>
								<p className="text-2xl font-black text-white uppercase tracking-wide">Terverifikasi!</p>
								<p className="mt-1 text-sm text-emerald-200">
									{mode === "enroll" ? "Wajah berhasil didaftarkan" : "Identitas terkonfirmasi"}
								</p>
								<p className="mt-1 text-xs font-mono text-emerald-300/70">
									{(elapsedMs / 1000).toFixed(2)} detik
								</p>
							</motion.div>
							{/* Confetti-like particles */}
							{Array.from({ length: 8 }).map((_, i) => (
								<motion.div
									key={i}
									className="absolute h-2 w-2 rounded-full bg-emerald-400"
									initial={{
										top: "50%", left: "50%", opacity: 1, scale: 1,
									}}
									animate={{
										top: `${30 + Math.random() * 40}%`,
										left: `${20 + Math.random() * 60}%`,
										opacity: 0, scale: 0,
									}}
									transition={{ duration: 1.5, delay: 0.3 + i * 0.1 }}
								/>
							))}
						</motion.div>
					)}
				</AnimatePresence>

				{/* FAIL overlay */}
				<AnimatePresence>
					{matchStatus === "fail" && (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className="absolute inset-0 z-20 flex flex-col items-center justify-center"
						>
							<div className="absolute inset-0 bg-red-500/20 backdrop-blur-[3px]" />
							<motion.div
								initial={{ scale: 0 }}
								animate={{ scale: 1, x: [0, -10, 10, -10, 10, 0] }}
								transition={{ scale: { type: "spring", stiffness: 200, damping: 15 }, x: { duration: 0.5, delay: 0.3 } }}
								className="relative"
							>
								<div className="absolute -inset-6 rounded-full bg-red-500/30 blur-2xl" />
								<div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-red-500 shadow-2xl shadow-red-500/40">
									<XCircle className="h-16 w-16 text-white" strokeWidth={2.5} />
								</div>
							</motion.div>
							<motion.div
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.4 }}
								className="relative mt-6 text-center"
							>
								<p className="text-2xl font-black text-white uppercase tracking-wide">
									{faceDetected ? "Wajah Tidak Cocok" : "Wajah Tidak Terdeteksi"}
								</p>
								<p className="mt-1 text-sm text-red-200">
									{faceDetected
										? "Wajah tidak sesuai dengan data terdaftar."
										: "Pastikan wajah terlihat jelas dan pencahayaan cukup."}
								</p>
							</motion.div>
							<motion.div
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.7 }}
								className="relative mt-6"
							>
								<Button
									onClick={handleRetry}
									className="rounded-2xl bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur-md h-12 px-8"
								>
									<RefreshCw className="mr-2 h-4 w-4" />
									Coba Lagi
								</Button>
							</motion.div>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Mode badge */}
				<div className="absolute top-4 left-4 z-20">
					<div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 backdrop-blur-md border text-[10px] font-bold uppercase tracking-wider ${
						mode === "enroll"
							? "bg-amber-500/20 border-amber-500/30 text-amber-300"
							: "bg-blue-500/20 border-blue-500/30 text-blue-300"
					}`}>
						<Camera className="h-3 w-3" />
						{mode === "enroll" ? "Pendaftaran" : "Verifikasi"}
					</div>
				</div>
			</div>

			{/* Manual capture button */}
			{matchStatus === "idle" && (
				<motion.div
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					className="flex flex-col items-center gap-3 w-full"
				>
					<Button
						className="h-14 w-14 rounded-full shadow-xl shadow-primary/20 transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
						disabled={!modelsLoaded || !faceDetected}
						onClick={performCapture}
						size="icon"
					>
						<Camera className="h-6 w-6" />
					</Button>
					<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
						{faceDetected ? "Ketuk untuk memindai" : "Menunggu wajah..."}
					</p>
				</motion.div>
			)}

			{/* Retry button during failure */}
			{matchStatus === "fail" && (
				<div className="w-full">
					<Button
						onClick={handleRetry}
						variant="outline"
						className="w-full h-12 rounded-2xl"
					>
						<RefreshCw className="mr-2 h-4 w-4" />
						Pindai Ulang Wajah
					</Button>
				</div>
			)}
		</div>
	);
}
