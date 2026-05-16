import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type SignaturePadProps = {
	value?: string;
	onChange: (value: string) => void;
};

export function SignaturePad({ value, onChange }: SignaturePadProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [drawing, setDrawing] = useState(false);

	/* init canvas with device pixel ratio */
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ratio = window.devicePixelRatio || 1;
		const rect = canvas.getBoundingClientRect();
		canvas.width = Math.max(1, Math.floor(rect.width * ratio));
		canvas.height = Math.max(1, Math.floor(rect.height * ratio));
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.scale(ratio, ratio);
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.lineWidth = 2;
		ctx.strokeStyle = "#0f172a";
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, rect.width, rect.height);
		if (value) {
			const img = new Image();
			img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
			img.src = value;
		}
	}, [value]);

	/* pointer helpers */
	function point(e: React.PointerEvent<HTMLCanvasElement>) {
		const canvas = canvasRef.current;
		if (!canvas) return { x: 0, y: 0 };
		const rect = canvas.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function begin(e: React.PointerEvent<HTMLCanvasElement>) {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		canvas.setPointerCapture(e.pointerId);
		const p = point(e);
		ctx.beginPath();
		ctx.moveTo(p.x, p.y);
		setDrawing(true);
	}

	function move(e: React.PointerEvent<HTMLCanvasElement>) {
		if (!drawing) return;
		const ctx = canvasRef.current?.getContext("2d");
		if (!ctx) return;
		const p = point(e);
		ctx.lineTo(p.x, p.y);
		ctx.stroke();
	}

	function end() {
		setDrawing(false);
		const canvas = canvasRef.current;
		if (canvas) onChange(canvas.toDataURL("image/png"));
	}

	function clear() {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		const rect = canvas.getBoundingClientRect();
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, rect.width, rect.height);
		onChange("");
	}

	return (
		<div className="space-y-2 sm:space-y-3">
			<div className="rounded-xl border bg-white p-2 shadow-inner sm:rounded-2xl">
				<canvas
					ref={canvasRef}
					className="h-[140px] w-full touch-none rounded-lg sm:h-[180px] sm:rounded-xl"
					onPointerDown={begin}
					onPointerLeave={end}
					onPointerMove={move}
					onPointerUp={end}
				/>
			</div>
			<div className="flex items-center justify-between gap-2">
				<p className="flex-1 text-xs text-muted-foreground sm:text-sm">
					Tanda tangan di area putih menggunakan sentuhan / mouse.
				</p>
				<Button size="sm" onClick={clear} type="button" variant="outline" className="h-8 text-xs sm:h-9 sm:text-sm">
					Hapus
				</Button>
			</div>
		</div>
	);
}
