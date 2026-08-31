export type ReceiptPngLine = { label: string; value: string };

const escapeXml = (value: string) => value.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&apos;" })[character] ?? character);

const wrapText = (value: string, maxChars: number) => {
	const words = value.split(/\s+/);
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		if (!current) current = word;
		else if (`${current} ${word}`.length <= maxChars) current += ` ${word}`;
		else { lines.push(current); current = word; }
	}
	if (current) lines.push(current);
	return lines.length ? lines : ["—"];
};

export function buildReceiptSvg(options: {
	title: string;
	storeName: string;
	orderReference: string;
	status: string;
	payment: string;
	total: string;
	lines: ReceiptPngLine[];
	note?: string;
}) {
	const width = 1080;
	const padding = 72;
	const lineHeight = 38;
	const wrapped = options.lines.flatMap((line) => wrapText(`${line.label}: ${line.value}`, 54));
	const noteLines = options.note ? wrapText(options.note, 58) : [];
	const height = Math.max(980, 390 + (wrapped.length + noteLines.length) * lineHeight + 130);
	const lineMarkup = wrapped.map((line, index) => `<text x="${padding}" y="${590 + index * lineHeight}" class="body">${escapeXml(line)}</text>`).join("");
	const noteMarkup = noteLines.map((line, index) => `<text x="${padding}" y="${650 + wrapped.length * lineHeight + index * lineHeight}" class="muted">${escapeXml(line)}</text>`).join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
	<rect width="100%" height="100%" fill="#fffaf3"/>
	<rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="38" fill="#ffffff" stroke="#eadfd2" stroke-width="3"/>
	<style>.title{font:900 42px Arial,sans-serif;fill:#152238}.store{font:700 25px Arial,sans-serif;fill:#ef6f61}.body{font:600 25px Arial,sans-serif;fill:#263449}.muted{font:500 22px Arial,sans-serif;fill:#738096}.label{font:700 21px Arial,sans-serif;fill:#738096}.value{font:900 27px Arial,sans-serif;fill:#152238}.total{font:900 39px Arial,sans-serif;fill:#ef6f61}</style>
	<text x="${padding}" y="105" class="store">${escapeXml(options.storeName)}</text>
	<text x="${padding}" y="165" class="title">${escapeXml(options.title)}</text>
	<text x="${padding}" y="230" class="label">NOMOR ORDER</text>
	<text x="${padding}" y="275" class="value">${escapeXml(options.orderReference)}</text>
	<line x1="${padding}" y1="320" x2="${width - padding}" y2="320" stroke="#eadfd2" stroke-width="3"/>
	<text x="${padding}" y="375" class="label">STATUS</text><text x="${padding}" y="415" class="value">${escapeXml(options.status)}</text>
	<text x="${width / 2}" y="375" class="label">PEMBAYARAN</text><text x="${width / 2}" y="415" class="value">${escapeXml(options.payment)}</text>
	<rect x="${padding}" y="455" width="${width - padding * 2}" height="84" rx="20" fill="#fff0ec"/>
	<text x="${padding + 24}" y="508" class="total">${escapeXml(options.total)}</text>
	${lineMarkup}${noteMarkup}
	<line x1="${padding}" y1="${height - 120}" x2="${width - padding}" y2="${height - 120}" stroke="#eadfd2" stroke-width="3"/>
	<text x="${padding}" y="${height - 72}" class="muted">Djiwa Tentram • Bukti digital</text>
	</svg>`;
}

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
		const downloadUrl = URL.createObjectURL(png);
		const anchor = document.createElement("a");
		anchor.href = downloadUrl;
		anchor.download = filename;
		anchor.click();
		window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
		return { width: canvas.width, height: canvas.height };
	} finally {
		URL.revokeObjectURL(url);
	}
}
