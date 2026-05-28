/**
 * Shared image compression utility.
 * Automatically compresses images to fit within the 5MB upload limit.
 */

// 5MB limit in bytes
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Base64 is ~4/3 the size of binary, so 5MB file ≈ 6.67MB base64 string.
// We target slightly below that to stay safe.
const MAX_BASE64_LENGTH = Math.floor(MAX_FILE_BYTES * (4 / 3));

/**
 * Compress a base64 dataURL so it fits within the 5MB limit.
 * If already under the limit, returns the original unchanged.
 * Progressively reduces JPEG quality and image dimensions as needed.
 */
export function compressImageDataUrl(
	dataUrl: string,
	maxBase64Length = MAX_BASE64_LENGTH
): Promise<string> {
	if (dataUrl.length <= maxBase64Length) {
		return Promise.resolve(dataUrl);
	}

	return new Promise((resolve) => {
		const img = new Image();

		img.onload = () => {
			const canvas = document.createElement("canvas");
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				resolve(dataUrl);
				return;
			}

			const naturalW = img.naturalWidth;
			const naturalH = img.naturalHeight;

			let maxDim = 1920;
			let quality = 0.85;

			const renderAndEncode = (): string => {
				let w = naturalW;
				let h = naturalH;
				if (w > maxDim || h > maxDim) {
					if (w > h) {
						h = Math.round((h * maxDim) / w);
						w = maxDim;
					} else {
						w = Math.round((w * maxDim) / h);
						h = maxDim;
					}
				}
				canvas.width = w;
				canvas.height = h;
				ctx.clearRect(0, 0, w, h);
				ctx.drawImage(img, 0, 0, w, h);
				return canvas.toDataURL("image/jpeg", quality);
			};

			let result = renderAndEncode();

			// Iteratively reduce quality then dimensions until we're within limit
			while (result.length > maxBase64Length) {
				if (quality > 0.3) {
					quality = Math.round((quality - 0.1) * 10) / 10;
				} else if (maxDim > 400) {
					// Quality bottomed out — shrink dimensions and reset quality
					maxDim = Math.round(maxDim * 0.75);
					quality = 0.7;
				} else {
					// Cannot compress further
					break;
				}
				result = renderAndEncode();
			}

			resolve(result);
		};

		img.onerror = () => resolve(dataUrl);
		img.src = dataUrl;
	});
}

/**
 * Read a File as a base64 dataURL and compress it if it exceeds 5MB.
 */
export async function compressFileToLimit(file: File): Promise<string> {
	const dataUrl = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (e) => resolve(e.target?.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});

	return compressImageDataUrl(dataUrl);
}

/** Returns true when the raw file size exceeds the 5MB limit. */
export function isOversized(file: File): boolean {
	return file.size > MAX_FILE_BYTES;
}

/**
 * Convert a base64 dataURL to a Blob synchronously.
 * More reliable than `fetch(dataUrl).then(r => r.blob())` on iOS Safari.
 */
export function dataURLtoBlob(dataUrl: string): Blob {
	const [header, data] = dataUrl.split(",");
	const mime = header.match(/:(.*?);/)![1];
	const binaryStr = atob(data);
	const bytes = new Uint8Array(binaryStr.length);
	for (let i = 0; i < binaryStr.length; i++) {
		bytes[i] = binaryStr.charCodeAt(i);
	}
	return new Blob([bytes], { type: mime });
}
