import React, { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import Webcam from "react-webcam";
import { Loader2, Camera, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FaceRecognitionProps {
	onMatch?: (descriptor: number[]) => void;
	onCapture?: (descriptor: number[]) => void;
	targetDescriptor?: number[]; // For matching 1:1
	mode: "enroll" | "verify";
	className?: string;
}

const MODEL_URL = "/models"; // User needs to put models here

export function FaceRecognition({
	onMatch,
	onCapture,
	targetDescriptor,
	mode,
	className = "",
}: FaceRecognitionProps) {
	const webcamRef = useRef<Webcam>(null);
	const [modelsLoaded, setModelsLoaded] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [matchStatus, setMatchStatus] = useState<"idle" | "matching" | "success" | "fail">("idle");

	useEffect(() => {
		const loadModels = async () => {
			try {
				await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
				await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
				await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
				setModelsLoaded(true);
			} catch (err) {
				console.error("Failed to load face-api models:", err);
				setError("Gagal memuat model pendeteksi wajah. Pastikan file model ada di /public/models");
			}
		};
		loadModels();
	}, []);

	const capture = async () => {
		if (!webcamRef.current || !modelsLoaded) return;

		setIsProcessing(true);
		setError(null);
		setMatchStatus("matching");

		try {
			const video = webcamRef.current.video;
			if (!video) throw new Error("Video not available");

			const detections = await faceapi
				.detectSingleFace(video)
				.withFaceLandmarks()
				.withFaceDescriptor();

			if (!detections) {
				setError("Wajah tidak terdeteksi. Pastikan wajah terlihat jelas dan pencahayaan cukup.");
				setMatchStatus("fail");
				setIsProcessing(false);
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

				// Common threshold is 0.6. Lower is stricter.
				if (distance < 0.5) {
					setMatchStatus("success");
					onMatch?.(descriptor);
				} else {
					setError("Wajah tidak cocok. Silakan coba lagi.");
					setMatchStatus("fail");
				}
			}
		} catch (err) {
			console.error("Face detection error:", err);
			setError("Terjadi kesalahan saat memproses wajah.");
			setMatchStatus("fail");
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<div className={`flex flex-col items-center gap-4 ${className}`}>
			<div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-muted shadow-inner ring-1 ring-border">
				{!modelsLoaded && !error && (
					<div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
						<Loader2 className="h-8 w-8 animate-spin text-primary" />
						<p className="mt-2 text-sm font-medium text-muted-foreground">Memuat model AI...</p>
					</div>
				)}

				{error && (
					<div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-destructive/10 p-6 text-center backdrop-blur-sm">
						<XCircle className="h-10 w-10 text-destructive" />
						<p className="mt-2 font-semibold text-destructive">{error}</p>
						<Button className="mt-4" onClick={() => window.location.reload()} variant="outline">
							Coba Lagi
						</Button>
					</div>
				)}

				<Webcam
					audio={false}
					className="h-full w-full object-cover"
					mirrored
					ref={webcamRef}
					screenshotFormat="image/jpeg"
					videoConstraints={{
						width: 1280,
						height: 720,
						facingMode: "user",
					}}
				/>

				{matchStatus === "success" && (
					<div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-emerald-500/20 backdrop-blur-[2px]">
						<CheckCircle2 className="h-20 w-20 text-emerald-500" />
						<p className="mt-2 font-bold text-emerald-600">Terverifikasi!</p>
					</div>
				)}

				{isProcessing && (
					<div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center bg-background/50 py-2 backdrop-blur-md">
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						<span className="text-xs font-bold uppercase tracking-wider">Memproses...</span>
					</div>
				)}
			</div>

			<Button
				className="h-12 w-full max-w-xs rounded-xl shadow-lg ring-offset-2 transition-all hover:scale-[1.02] active:scale-95"
				disabled={!modelsLoaded || isProcessing || matchStatus === "success"}
				onClick={capture}
				size="lg"
			>
				{isProcessing ? (
					<>
						<Loader2 className="mr-2 h-5 w-5 animate-spin" />
						Memindai...
					</>
				) : (
					<>
						<Camera className="mr-2 h-5 w-5" />
						{mode === "enroll" ? "Daftarkan Wajah" : "Verifikasi Wajah"}
					</>
				)}
			</Button>
		</div>
	);
}
