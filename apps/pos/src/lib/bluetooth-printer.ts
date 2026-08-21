import EscPosEncoder from "esc-pos-encoder";
import { formatDateTimeWIB } from "@/lib/wib-utils";

const RECEIPT_LINE_WIDTH = 32;
const RECEIPT_HEADER_WIDTH = 24;
const RECEIPT_SEPARATOR_WIDTH = 28;
const BLUETOOTH_PRINTER_DEVICE_ID_KEY = "pos_bluetooth_printer_device_id";
const LEGACY_BLUETOOTH_PRINTER_DEVICE_ID_KEY = "bluetooth_printer_device_id";
const BLE_UUID_SUFFIX = "-0000-1000-8000-00805f9b34fb";
const normalizeBluetoothUuid = (uuid: string) => uuid.toLowerCase();
const expandBluetoothUuid = (uuid: string) =>
	uuid.length === 4 ? `0000${uuid}${BLE_UUID_SUFFIX}` : normalizeBluetoothUuid(uuid);
const getCharacteristicWriteMode = (characteristic: BluetoothRemoteGATTCharacteristic) =>
	characteristic.properties.writeWithoutResponse
		? "writeWithoutResponse"
		: characteristic.properties.write
			? "write"
			: null;

const formatReceiptCurrency = (value: number) =>
	new Intl.NumberFormat("id-ID").format(Math.round(value || 0));

const formatReceiptAmount = (value: number) => {
	const amount = Math.abs(value || 0);
	const prefix = value < 0 ? "-RP " : "RP ";
	return `${prefix}${formatReceiptCurrency(amount)}`;
};

const normalizeReceiptText = (value?: string | null) =>
	(value || "")
		.replace(/\r\n/g, "\n")
		.replace(/\s+/g, " ")
		.trim();

const wrapReceiptText = (value: string, width: number) => {
	const text = normalizeReceiptText(value);
	if (!text) return [];

	const words = text.split(" ");
	const lines: string[] = [];
	let currentLine = "";

	for (const word of words) {
		if (word.length > width) {
			if (currentLine) {
				lines.push(currentLine);
				currentLine = "";
			}

			for (let i = 0; i < word.length; i += width) {
				lines.push(word.slice(i, i + width));
			}
			continue;
		}

		const candidate = currentLine ? `${currentLine} ${word}` : word;
		if (candidate.length <= width) {
			currentLine = candidate;
			continue;
		}

		if (currentLine) {
			lines.push(currentLine);
		}
		currentLine = word;
	}

	if (currentLine) {
		lines.push(currentLine);
	}

	return lines;
};

const buildKeyValueLine = (
	label: string,
	value: string,
	width = RECEIPT_LINE_WIDTH
) => {
	const safeLabel = normalizeReceiptText(label);
	const safeValue = normalizeReceiptText(value);

	if (!safeLabel) return safeValue;
	if (!safeValue) return safeLabel;

	if (safeLabel.length + safeValue.length + 1 <= width) {
		return `${safeLabel}${" ".repeat(width - safeLabel.length - safeValue.length)}${safeValue}`;
	}

	const allowedLabelWidth = Math.max(8, width - safeValue.length - 1);
	const trimmedLabel =
		safeLabel.length > allowedLabelWidth
			? `${safeLabel.slice(0, Math.max(0, allowedLabelWidth - 3))}...`
			: safeLabel;

	return `${trimmedLabel}${" ".repeat(Math.max(1, width - trimmedLabel.length - safeValue.length))}${safeValue}`;
};

export interface OrderItem {
	productId: string;
	name: string;
	variant?: string;
	price: number;
	originalPrice?: number;
	quantity: number;
}

export type ReceiptPrintMode = "open_bill" | "paid" | "kitchen";

export interface ReceiptAdjustmentLine {
	label: string;
	amount: number;
}

export interface ReceiptMeta {
	promotionLabels?: string[];
	adjustmentLines?: ReceiptAdjustmentLine[];
}

export interface ReceiptOrderPayload {
	orderNumber: string;
	items: OrderItem[];
	totalAmount: number;
	paymentMethod: string;
	createdAt: number;
	customerName?: string;
	notes?: string;
	orderType?: string;
	tableNumber?: string;
	subtotal?: number;
	discountAmount?: number;
	taxAmount?: number;
	serviceChargeAmount?: number;
	cashReceived?: number;
	changeAmount?: number;
	cashierName?: string;
	shiftName?: string;
	receiptMode?: ReceiptPrintMode;
	paymentStatusLabel?: string;
	receiptMeta?: ReceiptMeta;
	dailyReceiptNo?: number;
	receiptKind?: string;
}

export interface ReceiptSettings {
	storeName?: string;
	storeAddress?: string;
	storePhone?: string;
	receiptFooter?: string;
	receiptLogo?: string;
	receiptHeader?: string;
	receiptShowLogo?: boolean;
	receiptShowAddress?: boolean;
	receiptShowPhone?: boolean;
	receiptShowOrderNumber?: boolean;
	receiptShowCustomerName?: boolean;
	receiptShowNotes?: boolean;
	receiptShowCashierName?: boolean;
	receiptFontSize?: string;
	tableNumber?: string;
	orderType?: string;
	notes?: string;
}

export class BluetoothPrinterService {
	private device: BluetoothDevice | null = null;
	private server: BluetoothRemoteGATTServer | null = null;
	private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
	private autoConnectPromise: Promise<string | null> | null = null;
	private lastAutoConnectAttemptAt = 0;
	private lastPrintedPayload:
		| {
				order: ReceiptOrderPayload;
				settings: ReceiptSettings;
		  }
		| null = null;
	private optionalServices = [
		"18f0",
		"18f1",
		"ff00",
		"af00",
		"4953",
		"ffe0",
		"ffe1",
		"18a0",
		"18a1",
		"dfb0",
		"a001",
		"18fb",
		"e7e11001-49d2-4cc3-a291-0016260c533c",
		"e7810a71-73ae-499d-8c15-faa9aef0c3f2",
	].map(expandBluetoothUuid);
	private preferredWriteCharacteristicUuids = new Set([
		"2af1",
		"2af0",
		"ff01",
		"ff02",
		"ff03",
		"ffe1",
		"dfb1",
		"a002",
		"49535343-8841-43f4-a8d4-ecbe34729bb3",
		"49535343-1e4d-4bd9-ba61-23c647249616",
		"bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
	].map(expandBluetoothUuid));

	/** 🔍 Kumpulkan info diagnostik lengkap — panggil dari DevTools Console */
	debugInfo(): Record<string, unknown> {
		const storedId = this.getPersistedDeviceId();
		const info: Record<string, unknown> = {
			timestamp: new Date().toISOString(),
			browser: navigator.userAgent,
			platform: navigator.platform,
			// ⚠️ Web Bluetooth HANYA berfungsi di secure context (HTTPS / localhost)
			isSecureContext: typeof window !== 'undefined' && window.isSecureContext,
			protocol: typeof location !== 'undefined' ? location.protocol : null,
			hostname: typeof location !== 'undefined' ? location.hostname : null,
			port: typeof location !== 'undefined' ? location.port : null,
			// status API Bluetooth
			bluetoothAvailable: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
			// status koneksi
			hasDevice: this.device !== null,
			hasServer: this.server !== null,
			hasCharacteristic: this.characteristic !== null,
			isConnected: this.server?.connected ?? false,
			// device ID tersimpan
			storedDeviceId: storedId || null,
			storedDeviceIdLength: storedId ? storedId.length : 0,
		};

		if (this.device) {
			info.deviceName = this.device.name || '(tanpa nama)';
			info.deviceId = this.device.id;
		}

		// cek permission API (beberapa browser)
		if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
			(navigator as any).permissions.query({ name: 'bluetooth' }).then((status: any) => {
				console.log('🔍 [BluetoothDebug] Permission status:', status.state);
			}).catch(() => {
				console.log('🔍 [BluetoothDebug] Permission API tidak support query bluetooth');
			});
		}

		// cek service worker
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.getRegistrations().then((regs) => {
				console.log('🔍 [BluetoothDebug] Service workers:', regs.length, regs.map(r => r.scope));
			});
		}

		return info;
	}

	async connect(): Promise<string> {
		console.log('🔌 [BluetoothPrinter] connect() dipanggil');
		console.log('🔌 [BluetoothPrinter] isSecureContext:', window.isSecureContext, 'protocol:', location.protocol, 'host:', location.hostname);
		if (!navigator.bluetooth) {
			console.error('❌ [BluetoothPrinter] navigator.bluetooth tidak tersedia — pastikan HTTPS/localhost!');
			throw new Error("Browser ini tidak mendukung Bluetooth.");
		}

		try {
			console.log('🔌 [BluetoothPrinter] Meminta device... (user harus pilih printer)');
			this.device = await navigator.bluetooth.requestDevice({
				acceptAllDevices: true,
				optionalServices: this.optionalServices,
			});
			console.log('✅ [BluetoothPrinter] Device dipilih:', this.device.name, '| id:', this.device.id);
			this.persistDeviceId(this.device.id);
			return await this.establishConnection();
		} catch (error) {
			console.error('❌ [BluetoothPrinter] Gagal koneksi:', error);
			throw error;
		}
	}

	async autoConnect(): Promise<string | null> {
		if (!navigator.bluetooth || !navigator.bluetooth.getDevices) {
			return null;
		}

		if (this.autoConnectPromise) {
			return this.autoConnectPromise;
		}

		this.lastAutoConnectAttemptAt = Date.now();
		this.autoConnectPromise = this.performAutoConnect();

		try {
			return await this.autoConnectPromise;
		} finally {
			this.autoConnectPromise = null;
		}
	}

	async autoReconnectIfNeeded(minIntervalMs = 2500): Promise<boolean> {
		if (this.isConnected()) return true;
		if (Date.now() - this.lastAutoConnectAttemptAt < minIntervalMs) {
			return this.isConnected();
		}
		await this.autoConnect();
		return this.isConnected();
	}

	private async performAutoConnect(): Promise<string | null> {
		if (!navigator.bluetooth || !navigator.bluetooth.getDevices) {
			console.log('🔌 [BluetoothPrinter] getDevices() tidak tersedia — browser tidak support auto-connect');
			return null;
		}

		try {
			const devices = await navigator.bluetooth.getDevices();
			console.log('🔌 [BluetoothPrinter] autoConnect: ditemukan', devices.length, 'known devices');
			if (devices.length === 0) {
				console.log('🔌 [BluetoothPrinter] autoConnect: tidak ada known device — user harus pairing manual');
				return null;
			}

			const preferredDeviceId = this.getPersistedDeviceId();
			console.log('🔌 [BluetoothPrinter] autoConnect: preferredId =', preferredDeviceId || '(tidak ada)');
			this.device =
				(preferredDeviceId
					? devices.find((device) => device.id === preferredDeviceId)
					: null) ?? devices[0];

			if (this.device.gatt?.connected && this.characteristic) {
				this.persistDeviceId(this.device.id);
				return this.device.name || "Bluetooth Printer";
			}

			const name = await this.establishConnection();
			this.persistDeviceId(this.device.id);
			return name;
		} catch (error) {
			console.warn("Auto-connect failed:", error);
			this.device = null;
			this.server = null;
			this.characteristic = null;
			return null;
		}
	}

	private getPersistedDeviceId(): string | null {
		if (typeof window === "undefined") return null;
		return (
			window.localStorage.getItem(BLUETOOTH_PRINTER_DEVICE_ID_KEY) ||
			window.localStorage.getItem(LEGACY_BLUETOOTH_PRINTER_DEVICE_ID_KEY)
		);
	}

	private persistDeviceId(deviceId?: string | null) {
		if (typeof window === "undefined" || !deviceId) return;
		window.localStorage.setItem(BLUETOOTH_PRINTER_DEVICE_ID_KEY, deviceId);
		window.localStorage.removeItem(LEGACY_BLUETOOTH_PRINTER_DEVICE_ID_KEY);
	}

	private async establishConnection(): Promise<string> {
		console.log('🔌 [BluetoothPrinter] establishConnection: connecting GATT...');
		if (!this.device?.gatt) {
			throw new Error("Gagal menghubungkan ke perangkat.");
		}

		this.server = await this.device.gatt.connect();
		console.log('🔌 [BluetoothPrinter] GATT connected, scanning characteristics...');
		const services = await this.server.getPrimaryServices();
		let writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
		const writeCandidates: BluetoothRemoteGATTCharacteristic[] = [];

		for (const service of services) {
			const characteristics = await service.getCharacteristics();
			console.log(
				'🔎 [BluetoothPrinter] Service',
				service.uuid,
				'characteristics:',
				characteristics.map((char) => ({
					uuid: char.uuid,
					write: char.properties.write,
					writeWithoutResponse: char.properties.writeWithoutResponse,
				}))
			);

			for (const char of characteristics) {
				if (getCharacteristicWriteMode(char)) {
					writeCandidates.push(char);
				}
			}
		}

		writeCharacteristic =
			writeCandidates.find((char) =>
				this.preferredWriteCharacteristicUuids.has(normalizeBluetoothUuid(char.uuid))
			) ??
			writeCandidates.find((char) => char.properties.writeWithoutResponse) ??
			writeCandidates.find((char) => char.properties.write) ??
			null;

		if (writeCharacteristic) {
			console.log(
				'✅ [BluetoothPrinter] Selected write char:',
				writeCharacteristic.uuid,
				'mode:',
				getCharacteristicWriteMode(writeCharacteristic)
			);
		}

		if (!writeCharacteristic) {
			throw new Error(
				"Karakteristik printer tidak ditemukan. Pastikan perangkat adalah printer thermal bluetooth."
			);
		}

		this.characteristic = writeCharacteristic;

		this.device.addEventListener("gattserverdisconnected", () => {
			console.warn("Bluetooth printer disconnected.");
			this.server = null;
			this.characteristic = null;
			setTimeout(() => {
				void this.autoReconnectIfNeeded(0);
			}, 600);
		});

		return this.device.name || "Bluetooth Printer";
	}

	disconnect() {
		if (this.server?.connected) {
			this.server.disconnect();
		}
		this.device = null;
		this.server = null;
		this.characteristic = null;
	}

	isConnected(): boolean {
		return !!(this.server?.connected && this.characteristic);
	}

	/** 🔍 Cek apakah ada known device di cache browser (tanpa attempt reconnect) */
	hasKnownDevices(): boolean {
		if (typeof navigator === "undefined" || !navigator.bluetooth?.getDevices) {
			return false;
		}
		const storedId = this.getPersistedDeviceId();
		return storedId !== null;
	}

	getStatus() {
		return {
			connected: this.isConnected(),
			deviceName: this.getDeviceName(),
			canReconnect:
				typeof navigator !== "undefined" && !!navigator.bluetooth?.getDevices,
			hasReprintData: !!this.lastPrintedPayload,
		};
	}

	getDeviceName(): string | null {
		return this.device?.name || null;
	}

	private async loadImage(url: string): Promise<ImageData> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = "anonymous";
			img.onload = () => {
				const canvas = document.createElement("canvas");
				const scale = 192 / img.width;
				canvas.width = 192;
				canvas.height = img.height * scale;
				const ctx = canvas.getContext("2d");
				if (!ctx) {
					reject(new Error("Could not get canvas context"));
					return;
				}
				ctx.fillStyle = "white";
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.filter = "grayscale(100%)";
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
				resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
			};
			img.onerror = reject;
			img.src = url;
		});
	}

	private async writeBuffer(buffer: Uint8Array) {
		console.log(`📤 [BluetoothPrinter] writeBuffer: mengirim ${buffer.length} bytes dalam chunk 20-byte...`);
		if (!this.characteristic) {
			throw new Error("Printer tidak terhubung.");
		}

		const chunkSize = 20;
		let bytesSent = 0;

		for (let i = 0; i < buffer.length; i += chunkSize) {
			const chunk = buffer.slice(i, i + chunkSize);
			let attempts = 0;
			let sent = false;

			while (!sent && attempts < 3) {
				try {
					const mode = getCharacteristicWriteMode(this.characteristic);
					if (mode === "writeWithoutResponse") {
						await this.characteristic.writeValueWithoutResponse(chunk);
					} else if (mode === "write") {
						if (typeof this.characteristic.writeValueWithResponse === "function") {
							await this.characteristic.writeValueWithResponse(chunk);
						} else {
							await this.characteristic.writeValue(chunk);
						}
					} else {
						throw new Error("Characteristic printer tidak mendukung mode tulis.");
					}
					sent = true;
					bytesSent += chunk.length;
				} catch (error) {
					attempts++;
					if (attempts >= 3) {
						console.error(`❌ [BluetoothPrinter] Gagal kirim chunk di offset ${i} setelah 3x retry:`, error);
						throw error;
					}
					console.warn(`⚠️ [BluetoothPrinter] Retry chunk offset ${i}, attempt ${attempts}`);
					await new Promise((resolve) => setTimeout(resolve, 150));
				}
			}

			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		console.log(`✅ [BluetoothPrinter] writeBuffer selesai: ${bytesSent}/${buffer.length} bytes terkirim`);
	}

	async print(order: ReceiptOrderPayload, settings: ReceiptSettings) {
		console.log('🖨️ [BluetoothPrinter] print() dipanggil');
		// Gunakan autoReconnectIfNeeded agar ter-dedup kalau caller sudah reconnect
		if (!(this.isConnected() && this.characteristic)) {
			console.log('🔌 [BluetoothPrinter] Tidak connected — mencoba reconnect...');
			await this.autoReconnectIfNeeded(0);
		}

		if (!(this.isConnected() && this.characteristic)) {
			console.error('❌ [BluetoothPrinter] Masih tidak connected setelah reconnect');
			// Cek apakah ada known devices sama sekali — kasih hint yang tepat
			const hasDevices = this.hasKnownDevices();
			if (!hasDevices) {
				throw new Error(
					"Printer belum dikenali browser.\nKlik tombol 'Hubungkan Printer' di sidebar lalu pilih printer dari dialog."
				);
			}
			throw new Error(
				"Tidak bisa menyambung ke printer.\nPastikan printer menyala dan dalam jangkauan, lalu klik 'Hubungkan Printer'."
			);
		}
		console.log('✅ [BluetoothPrinter] Printer connected — membangun receipt...');

		const encoder = new EscPosEncoder();
		const result = encoder.initialize();
		const separator = "-".repeat(RECEIPT_SEPARATOR_WIDTH);
		const headerSeparator = "=".repeat(RECEIPT_SEPARATOR_WIDTH);
		const mode = order.receiptMode ?? "paid";
		const footerText =
			settings.receiptFooter || "TERIMA KASIH ATAS KUNJUNGAN ANDA!";

		const printWrappedLines = (text: string, width = RECEIPT_LINE_WIDTH) => {
			for (const line of wrapReceiptText(text, width)) {
				result.line(line);
			}
		};

		const printCenteredLines = (
			text: string,
			width = RECEIPT_HEADER_WIDTH
		) => {
			for (const line of wrapReceiptText(text, width)) {
				result.line(line);
			}
		};

		const printKeyValue = (label: string, value: string) => {
			result.line(buildKeyValueLine(label, value));
		};

		const printSeparator = (char: "-" | "=" = "-", nextAlign: "left" | "center" = "left") => {
			result.align("left");
			result.line(char === "=" ? headerSeparator : separator);
			result.align(nextAlign);
		};

		result.align("center");

		if (settings.receiptShowLogo && settings.receiptLogo) {
			try {
				const imageData = await this.loadImage(settings.receiptLogo);
				result.image(imageData, imageData.width, imageData.height, "atkinson", 128);
			} catch (error) {
				console.error("Failed to print logo:", error);
			}
		}

		const headerText = settings.receiptHeader || settings.storeName || "Djiwa Tentram";
		const fontSize = settings.receiptFontSize || "normal";
		if (fontSize === "large") {
			result.width(2).height(2);
		}
		// v3 EscPosEncoder: width/height untuk ukuran font, size() string sudah deprecated

		result.bold(true);
		printCenteredLines(headerText.toUpperCase(), RECEIPT_HEADER_WIDTH);
		result.bold(false);
		result.size("normal");

		if (settings.receiptShowAddress && settings.storeAddress) {
			printCenteredLines(settings.storeAddress, RECEIPT_HEADER_WIDTH);
		}
		if (settings.receiptShowPhone && settings.storePhone) {
			printCenteredLines(settings.storePhone, RECEIPT_HEADER_WIDTH);
		}

		printSeparator("=", "center");
		result.bold(true);

		if (mode === "open_bill") {
			printCenteredLines("OPEN BILL", RECEIPT_HEADER_WIDTH);
			printCenteredLines("BELUM LUNAS", RECEIPT_HEADER_WIDTH);
		} else if (mode === "kitchen") {
			printCenteredLines("TIKET KITCHEN", RECEIPT_HEADER_WIDTH);
			printCenteredLines("PRODUK YANG HARUS DIBUAT", RECEIPT_HEADER_WIDTH);
		} else {
			printCenteredLines(order.paymentStatusLabel || "LUNAS", RECEIPT_HEADER_WIDTH);
		}

		result.bold(false);
		result.align("left");
		printSeparator("=");

		if (settings.receiptShowOrderNumber !== false) {
			printKeyValue("ORDER", order.orderNumber.toUpperCase());
		}

		if (order.dailyReceiptNo) {
			const receiptKindLabel = order.receiptKind
				? order.receiptKind === "dine_in" ? " / DINE IN"
				: order.receiptKind === "takeaway" ? " / BUNGKUS"
				: " / ONLINE"
				: "";
			printKeyValue("STRUK", `#${order.dailyReceiptNo}${receiptKindLabel}`);
		}

		if (order.cashierName && settings.receiptShowCashierName !== false) {
			printKeyValue("KASIR", order.cashierName.toUpperCase());
		}
		if (order.shiftName && settings.receiptShowCashierName !== false) {
			printKeyValue("SHIFT", order.shiftName.toUpperCase());
		}

		const dateStr = formatDateTimeWIB(order.createdAt);
		printKeyValue("WAKTU", dateStr);

		if (mode === "paid") {
			printKeyValue("BAYAR", order.paymentMethod.toUpperCase());
		} else if (mode === "open_bill") {
			printKeyValue("STATUS", "OPEN BILL");
		}

		const orderType = order.orderType || settings.orderType;
		const tableNumber = order.tableNumber || settings.tableNumber;

		if (orderType) {
			printKeyValue(
				"TIPE",
				orderType === "dine_in" ? "MAKAN DI SINI" : "BAWA PULANG"
			);
		}

		if (tableNumber) {
			printKeyValue("MEJA", tableNumber);
		}

		if (settings.receiptShowCustomerName && order.customerName) {
			printKeyValue("PELANGGAN", order.customerName.toUpperCase());
		}

		if (settings.receiptShowNotes && order.notes) {
			printSeparator("-");
			result.bold(true).line("CATATAN").bold(false);
			printWrappedLines(order.notes);
		}

		if (mode !== "kitchen" && order.receiptMeta?.promotionLabels?.length) {
			printSeparator("-");
			result.align("center");
			result.bold(true);
			for (const label of order.receiptMeta.promotionLabels) {
				printCenteredLines(label.toUpperCase(), RECEIPT_HEADER_WIDTH);
			}
			result.bold(false);
			result.align("left");
		}

		printSeparator("-");

		if (mode === "kitchen") {
			result.bold(true).line("ITEM YANG DIBUAT").bold(false);
			printSeparator("-");

			for (const item of order.items) {
				const itemLabel = `${item.quantity}x ${item.name.toUpperCase()}`;
				for (const line of wrapReceiptText(itemLabel, RECEIPT_LINE_WIDTH)) {
					result.bold(true).line(line).bold(false);
				}

				const variantText = normalizeReceiptText(item.variant);
				if (variantText) {
					for (const line of wrapReceiptText(variantText, RECEIPT_LINE_WIDTH - 3)) {
						result.line(`- ${line}`);
					}
				}

				result.line(" ");
			}
		} else {
			printKeyValue("ITEM", "TOTAL");
			printSeparator("-");

			for (const item of order.items) {
				const hasDiscount = item.originalPrice != null && item.originalPrice > item.price;
				const itemTotal = item.price * item.quantity;
				const totalStr = formatReceiptCurrency(itemTotal);

				// Item name line (bold)
				const nameLines = wrapReceiptText(
					item.name.toUpperCase(),
					RECEIPT_LINE_WIDTH - totalStr.length - 1
				);
				const firstNameLine =
					nameLines.shift() || item.name.toUpperCase().slice(0, RECEIPT_LINE_WIDTH);

				result.bold(true).line(buildKeyValueLine(firstNameLine, totalStr)).bold(false);
				for (const extraLine of nameLines) {
					result.line(extraLine);
				}

				// Quantity, price, and discount info
				let detailLine = `  ${item.quantity} x ${formatReceiptCurrency(item.price)}`;
				if (hasDiscount) {
					const originalTotal = (item.originalPrice ?? item.price) * item.quantity;
					detailLine += ` ~~${formatReceiptCurrency(originalTotal)}~~`;
				}
				result.line(detailLine);

				const variantText = normalizeReceiptText(item.variant);
				if (variantText) {
					for (const line of wrapReceiptText(variantText, RECEIPT_LINE_WIDTH - 4)) {
						result.line(`  + ${line}`);
					}
				}
			}

			printSeparator("-");

			// Subtotal (before discounts)
			if (order.subtotal !== undefined) {
				printKeyValue("SUBTOTAL", formatReceiptAmount(order.subtotal));
			}

			// Adjustment lines (e.g. promo discounts, voucher)
			let hasAdjustments = false;
			for (const adjustment of order.receiptMeta?.adjustmentLines || []) {
				printKeyValue(adjustment.label.toUpperCase(), formatReceiptAmount(adjustment.amount));
				hasAdjustments = true;
			}

			// Generic discount (if not covered by adjustments)
			if (
				!hasAdjustments &&
				(order.discountAmount ?? 0) > 0
			) {
				printKeyValue("DISKON", formatReceiptAmount(-(order.discountAmount ?? 0)));
			}

			// Tax & service charge
			if (order.taxAmount != null && order.taxAmount > 0) {
				printKeyValue("PAJAK", formatReceiptAmount(order.taxAmount));
			}
			if (order.serviceChargeAmount != null && order.serviceChargeAmount > 0) {
				printKeyValue("SERVICE", formatReceiptAmount(order.serviceChargeAmount));
			}

			printSeparator("-");
			result.bold(true).line(buildKeyValueLine("TOTAL", formatReceiptAmount(order.totalAmount))).bold(false);

			if (mode === "paid" && order.cashReceived !== undefined && order.cashReceived > 0) {
				printKeyValue("TUNAI", formatReceiptAmount(order.cashReceived));
				if (order.changeAmount !== undefined && order.changeAmount > 0) {
					result
						.bold(true)
						.line(buildKeyValueLine("KEMBALI", formatReceiptAmount(order.changeAmount)))
						.bold(false);
				}
			}
		}

		result.align("center");
		printSeparator("-", "center");
		result.bold(true);
		printCenteredLines(footerText.toUpperCase(), RECEIPT_HEADER_WIDTH);
		if (mode === "kitchen") {
			printCenteredLines("TANPA HARGA - UNTUK PRODUKSI", RECEIPT_HEADER_WIDTH);
		}
		result.bold(false).line(" ").cut();

		const buffer = result.encode();
		await this.writeBuffer(buffer);

		this.lastPrintedPayload = {
			order: structuredClone(order),
			settings: structuredClone(settings),
		};
	}

	async reprintLastReceipt() {
		if (!this.lastPrintedPayload) {
			throw new Error("Belum ada struk terakhir untuk dicetak ulang.");
		}

		await this.print(this.lastPrintedPayload.order, this.lastPrintedPayload.settings);
	}
}

export const bluetoothPrinter = new BluetoothPrinterService();

// 🔍 Expose debug info to DevTools Console — ketik __bluetoothDebug() di console
if (typeof window !== 'undefined') {
	(window as any).__bluetoothDebug = () => {
		const storedId = bluetoothPrinter.debugInfo().storedDeviceId;
		console.group('🔍 Bluetooth Printer Diagnostics');
		console.log('isSecureContext:', window.isSecureContext);
		console.log('Protocol:', location.protocol);
		console.log('Host:', location.hostname);
		console.log('navigator.bluetooth:', !!navigator.bluetooth);
		console.log('navigator.bluetooth.getDevices:', !!(navigator.bluetooth && navigator.bluetooth.getDevices));
		console.log('Saved device ID:', storedId || '(none)');
		console.log('Service status:', bluetoothPrinter.getStatus());
		console.log('Service debugInfo:', bluetoothPrinter.debugInfo());
		console.groupEnd();
	};
}
