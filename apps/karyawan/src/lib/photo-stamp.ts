/** Cap waktu pada foto absen (menyatu di piksel) agar foto lama tidak bisa dipakai ulang dan atasan melihat kapan diambil. */
export function stampCanvas(ctx: CanvasRenderingContext2D, w: number, h: number, name?: string) {
	const now = new Date();
	const date = now.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Jakarta" });
	const time = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" }).replace(/\./g, ":");
	const text = `${date} ${time} WIB${name ? ` · ${name}` : ""}`;
	const size = Math.max(13, Math.round(w / 26));
	ctx.font = `600 ${size}px -apple-system, "SF Pro Text", system-ui, sans-serif`;
	const pad = Math.round(size * 0.6);
	ctx.fillStyle = "rgba(0,0,0,.55)";
	ctx.fillRect(0, h - size - pad * 2, w, size + pad * 2);
	ctx.fillStyle = "#fff";
	ctx.textBaseline = "middle";
	ctx.fillText(text, pad, h - (size + pad * 2) / 2);
}

/** Ambil JPEG (maks lebar 480) dari elemen video yang sedang menyala, lengkap dengan cap waktu. */
export function captureVideoJpeg(video: HTMLVideoElement, name?: string, mirror = false): string | null {
	try {
		if (!video.videoWidth) return null;
		const w = 480, h = Math.round((video.videoHeight / video.videoWidth) * w);
		const c = document.createElement("canvas");
		c.width = w; c.height = h;
		const ctx = c.getContext("2d");
		if (!ctx) return null;
		if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
		ctx.drawImage(video, 0, 0, w, h);
		if (mirror) ctx.setTransform(1, 0, 0, 1, 0, 0);
		stampCanvas(ctx, w, h, name);
		return c.toDataURL("image/jpeg", 0.72);
	} catch { return null; }
}
