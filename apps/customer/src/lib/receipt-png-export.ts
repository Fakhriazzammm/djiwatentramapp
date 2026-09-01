export type ReceiptPngLine = { label: string; value: string };

type ReceiptSvgOptions = {
	title: string;
	storeName: string;
	orderReference: string;
	status: string;
	payment: string;
	total: string;
	lines: ReceiptPngLine[];
	note?: string;
};

const escapeXml = (value: string) =>
	value.replace(/[&<>\"']/g, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&apos;",
	})[character] ?? character);

const wrapText = (value: string, maxChars: number) => {
	const words = value.trim().split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		if (!current) current = word;
		else if (`${current} ${word}`.length <= maxChars) current += ` ${word}`;
		else {
			lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines.length ? lines : ["—"];
};

const renderTextLines = (lines: string[], x: number, y: number, className: string, lineHeight: number, anchor = "start") =>
	lines.map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}" class="${className}">${escapeXml(line)}</text>`).join("");

export function buildReceiptSvg(options: ReceiptSvgOptions) {
	const width = 1080;
	const outer = 36;
	const padding = 78;
	const contentWidth = width - padding * 2;
	const bodyLineHeight = 34;
	const itemRows = options.lines.map((line) => ({
		label: wrapText(line.label, 38),
		value: wrapText(line.value, 30),
	}));
	const noteLines = options.note ? wrapText(options.note, 72) : [];
	const itemHeight = itemRows.reduce((sum, row) => sum + Math.max(row.label.length, row.value.length) * bodyLineHeight + 28, 0);
	const noteHeight = noteLines.length ? 74 + noteLines.length * 30 : 0;
	const height = Math.max(1040, 930 + itemHeight + noteHeight);
	const itemStartY = 690;
	let itemCursorY = itemStartY;
	const itemMarkup = itemRows.map((row) => {
		const rowHeight = Math.max(row.label.length, row.value.length) * bodyLineHeight + 28;
		const markup = [
			`<line x1="${padding}" y1="${itemCursorY - 21}" x2="${width - padding}" y2="${itemCursorY - 21}" class="rule"/>`,
			renderTextLines(row.label, padding, itemCursorY + 12, "body", bodyLineHeight),
			renderTextLines(row.value, width - padding, itemCursorY + 12, "price", bodyLineHeight, "end"),
		].join("");
		itemCursorY += rowHeight;
		return markup;
	}).join("");
	const noteY = itemCursorY + 16;
	const noteMarkup = noteLines.length
		? `<rect x="${padding}" y="${noteY}" width="${contentWidth}" height="${noteHeight - 16}" rx="22" class="noteBox"/><text x="${padding + 24}" y="${noteY + 34}" class="noteTitle">CATATAN</text>${renderTextLines(noteLines, padding + 24, noteY + 68, "note", 30)}`
		: "";
	const footerY = height - 82;
	const statusIsOpen = /open|pending|belum|kasir/i.test(options.status);
	const statusColor = statusIsOpen ? "#a16207" : "#39705b";
	const statusFill = statusIsOpen ? "#fff4d6" : "#e5f4ec";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
	<rect width="100%" height="100%" fill="#f7f9fc"/>
	<rect x="${outer}" y="${outer}" width="${width - outer * 2}" height="${height - outer * 2}" rx="42" fill="#ffffff" stroke="#e4e7eb" stroke-width="3"/>
	<path d="M${outer + 2} 150V78Q${outer + 2} ${outer + 2} ${outer + 78} ${outer + 2}H${width - outer - 78}Q${width - outer - 2} ${outer + 2} ${width - outer - 2} 78V150Z" fill="#1a5dc6"/>
	<style>
		.brand{font:800 22px Arial,sans-serif;letter-spacing:4px;fill:#ffffff}
		.store{font:700 25px Arial,sans-serif;fill:#ffffff}
		.title{font:800 42px Arial,sans-serif;fill:#1a2332}
		.kicker{font:700 18px Arial,sans-serif;letter-spacing:3px;fill:#7c8290}
		.order{font:800 29px Arial,sans-serif;letter-spacing:2px;fill:#1a2332}
		.metaLabel{font:700 17px Arial,sans-serif;letter-spacing:2px;fill:#7c8290}
		.metaValue{font:700 24px Arial,sans-serif;fill:#1a2332}
		.totalLabel{font:700 18px Arial,sans-serif;letter-spacing:2px;fill:#1a5dc6}
		.total{font:900 52px Arial,sans-serif;fill:#1a5dc6}
		.section{font:800 18px Arial,sans-serif;letter-spacing:3px;fill:#1a5dc6}
		.body{font:500 25px Arial,sans-serif;fill:#334155}
		.price{font:800 25px Arial,sans-serif;fill:#1a2332}
		.noteTitle{font:800 16px Arial,sans-serif;letter-spacing:2px;fill:#0d2d54}
		.note{font:500 21px Arial,sans-serif;fill:#334155}
		.footer{font:500 19px Arial,sans-serif;fill:#7c8290}
		.rule{stroke:#e4e7eb;stroke-width:2}
		.noteBox{fill:#eef5fd;stroke:#d6e2f5;stroke-width:2}
	</style>
	<text x="${padding}" y="92" class="brand">DJIWA TENTRAM</text>
	<text x="${padding}" y="130" class="store">${escapeXml(options.storeName)}</text>
	<text x="${padding}" y="222" class="title">${escapeXml(options.title)}</text>
	<text x="${padding}" y="270" class="kicker">NOMOR ORDER</text>
	<text x="${padding}" y="316" class="order">${escapeXml(options.orderReference)}</text>
	<line x1="${padding}" y1="360" x2="${width - padding}" y2="360" class="rule"/>
	<text x="${padding}" y="415" class="metaLabel">STATUS PESANAN</text>
	<rect x="${padding}" y="438" width="300" height="48" rx="24" fill="${statusFill}"/>
	<circle cx="${padding + 27}" cy="462" r="8" fill="${statusColor}"/>
	<text x="${padding + 50}" y="470" class="metaValue" style="fill:${statusColor}">${escapeXml(options.status)}</text>
	<text x="${padding + 360}" y="415" class="metaLabel">PEMBAYARAN</text>
	<text x="${padding + 360}" y="470" class="metaValue">${escapeXml(options.payment)}</text>
	<rect x="${padding}" y="530" width="${contentWidth}" height="108" rx="26" fill="#eef5fd" stroke="#d6e2f5" stroke-width="2"/>
	<text x="${padding + 28}" y="570" class="totalLabel">TOTAL PEMBAYARAN</text>
	<text x="${width - padding - 28}" y="603" text-anchor="end" class="total">${escapeXml(options.total)}</text>
	<text x="${padding}" y="${itemStartY - 52}" class="section">RINCIAN PESANAN</text>
	${itemMarkup}
	${noteMarkup}
	<line x1="${padding}" y1="${footerY - 22}" x2="${width - padding}" y2="${footerY - 22}" class="rule"/>
	<text x="${padding}" y="${footerY + 18}" class="footer">Djiwa Tentram • Bukti digital</text>
	<text x="${width - padding}" y="${footerY + 18}" text-anchor="end" class="footer">Terima kasih</text>
	</svg>`;
}

type ReceiptExportOptions = {
	fallbackWindow?: Window | null;
};

const isIosBrowser = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const prepareReceiptExportWindow = () => isIosBrowser() ? window.open("about:blank", "_blank") : null;

const triggerPngDownload = (png: Blob, filename: string, fallbackWindow?: Window | null) => {
	const downloadUrl = URL.createObjectURL(png);
	if (fallbackWindow && !fallbackWindow.closed) {
		fallbackWindow.location.href = downloadUrl;
		window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
		return;
	}
	const anchor = document.createElement("a");
	anchor.href = downloadUrl;
	anchor.download = filename;
	anchor.style.display = "none";
	document.body.appendChild(anchor);
	anchor.click();
	window.setTimeout(() => { anchor.remove(); URL.revokeObjectURL(downloadUrl); }, 1000);
};

export async function downloadSvgAsPng(svg: string, filename: string, scale = 3): Promise<{ width: number; height: number }> {
	if (typeof window === "undefined") throw new Error("Export hanya tersedia di browser");
	const match = svg.match(/width="(\d+)" height="(\d+)"/);
	const sourceWidth = Number(match?.[1] ?? 1080);
	const sourceHeight = Number(match?.[2] ?? 1200);
	const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	try {
		const image = new Image();
		image.decoding = "async";
		image.src = url;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = sourceWidth * scale;
		canvas.height = sourceHeight * scale;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Canvas tidak tersedia");
		context.setTransform(scale, 0, 0, scale, 0, 0);
		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = "high";
		context.drawImage(image, 0, 0, sourceWidth, sourceHeight);
		const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("PNG gagal dibuat")), "image/png"));
		triggerPngDownload(png, filename);
		return { width: canvas.width, height: canvas.height };
	} finally {
		URL.revokeObjectURL(url);
	}
}

export async function captureReceiptElementAsPng(element: HTMLElement, filename: string, mutate?: (clone: HTMLElement) => void, options?: ReceiptExportOptions): Promise<{ width: number; height: number }> {
	if (typeof document === "undefined") throw new Error("Export hanya tersedia di browser");
	const html2canvasModule = await import("html2canvas");
	const html2canvas = (html2canvasModule.default ?? html2canvasModule) as typeof import("html2canvas").default;
	await document.fonts?.ready;
	const clone = element.cloneNode(true) as HTMLElement;
	clone.removeAttribute("data-receipt-export-root");
	clone.style.transform = "none";
	clone.style.minHeight = "0";
	clone.style.height = "auto";
	clone.style.width = `${Math.ceil(element.getBoundingClientRect().width)}px`;
	clone.style.clipPath = "none";
	clone.style.boxShadow = "none";
	clone.style.margin = "0";
	mutate?.(clone);
	const host = document.createElement("div");
	host.setAttribute("aria-hidden", "true");
	host.style.cssText = "position:fixed;left:0;top:0;z-index:-1;pointer-events:none;background:#fff;";
	host.appendChild(clone);
	document.body.appendChild(host);
	try {
		await Promise.all(Array.from(clone.querySelectorAll("img")).map(async (image) => {
			if (image.complete) return;
			await new Promise<void>((resolve) => {
				const done = () => { window.clearTimeout(timeout); resolve(); };
				const timeout = window.setTimeout(done, 3000);
				image.addEventListener("load", done, { once: true });
				image.addEventListener("error", done, { once: true });
			});
		}));
		const canvas = await html2canvas(clone, { scale: 3, backgroundColor: "#ffffff", useCORS: true, logging: false, removeContainer: true });
		const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("PNG gagal dibuat")), "image/png"));
		triggerPngDownload(png, filename, options?.fallbackWindow);
		return { width: canvas.width, height: canvas.height };
	} finally {
		host.remove();
	}
}
