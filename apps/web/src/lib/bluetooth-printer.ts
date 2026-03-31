import EscPosEncoder from "esc-pos-encoder";

const RECEIPT_LINE_WIDTH = 32;
const RECEIPT_HEADER_WIDTH = 24;

const formatReceiptCurrency = (value: number) =>
	new Intl.NumberFormat("id-ID").format(Math.round(value || 0));

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

const buildKeyValueLine = (label: string, value: string, width = RECEIPT_LINE_WIDTH) => {
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
			? `${safeLabel.slice(0, Math.max(0, allowedLabelWidth - 1))}…`
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
	private lastPrintedPayload:
		| {
				order: {
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
				};
				settings: ReceiptSettings;
		  }
		| null = null;
	private optionalServices = [
		"000018f0-0000-1000-8000-00805f9b34fb", // Generic POS service
		"000018f1-0000-1000-8000-00805f9b34fb",
		"e7e11001-49d2-4cc3-a291-0016260c533c", // Some printers
		"0000ff00-0000-1000-8000-00805f9b34fb", // Custom
		"0000af00-0000-1000-8000-00805f9b34fb", // Custom
		"00004953-0000-1000-8000-00805f9b34fb", // Custom
	];

	async connect(): Promise<string> {
		if (!navigator.bluetooth) {
			throw new Error("Browser ini tidak mendukung Bluetooth.");
		}

		try {
			this.device = await navigator.bluetooth.requestDevice({
				acceptAllDevices: true,
				optionalServices: this.optionalServices,
			});

			return await this.establishConnection();
		} catch (error) {
			console.error("Bluetooth connection error:", error);
			throw error;
		}
	}

	async autoConnect(): Promise<string | null> {
		if (!navigator.bluetooth || !navigator.bluetooth.getDevices) {
			return null;
		}

		try {
			const devices = await navigator.bluetooth.getDevices();
			if (devices.length === 0) return null;

			// Try to connect to the first available previously paired device
			// Usually, for a POS system, there's only one printer.
			this.device = devices[0];
			
			// If it's already connected, just return the name
			if (this.device.gatt?.connected && this.characteristic) {
				return this.device.name || "Bluetooth Printer";
			}

			return await this.establishConnection();
		} catch (error) {
			console.warn("Auto-connect failed:", error);
			this.device = null;
			this.server = null;
			this.characteristic = null;
			return null;
		}
	}

	private async establishConnection(): Promise<string> {
		if (!this.device?.gatt) {
			throw new Error("Gagal menghubungkan ke perangkat.");
		}

		this.server = await this.device.gatt.connect();

		// Try to find the printer service and characteristic
		const services = await this.server.getPrimaryServices();
		let writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

		// Priority for characteristics: writeWithoutResponse > write
		for (const service of services) {
			const characteristics = await service.getCharacteristics();
			
			// First pass: look for writeWithoutResponse
			for (const char of characteristics) {
				if (char.properties.writeWithoutResponse) {
					writeCharacteristic = char;
					break;
				}
			}
			
			// Second pass: if not found, look for write
			if (!writeCharacteristic) {
				for (const char of characteristics) {
					if (char.properties.write) {
						writeCharacteristic = char;
						break;
					}
				}
			}
			
			if (writeCharacteristic) {
				break;
			}
		}

		if (!writeCharacteristic) {
			throw new Error("Karakteristik printer tidak ditemukan. Pastikan perangkat adalah printer thermal bluetooth.");
		}

		this.characteristic = writeCharacteristic;
		
		// Add disconnect listener to handle manual disconnects or out of range
		this.device.addEventListener('gattserverdisconnected', () => {
			console.warn("Bluetooth printer disconnected.");
			this.server = null;
			this.characteristic = null;
			// Don't null the device so autoConnect can try again
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

	getStatus() {
		return {
			connected: this.isConnected(),
			deviceName: this.getDeviceName(),
			canReconnect: typeof navigator !== "undefined" && !!navigator.bluetooth?.getDevices,
			hasReprintData: !!this.lastPrintedPayload,
		};
	}

	getDeviceName(): string | null {
		return this.device?.name || null;
	}

	private async _loadImage(url: string): Promise<ImageData> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = "anonymous";
			img.onload = () => {
				const canvas = document.createElement("canvas");
				// Thermal printers usually have 384 or 576 dots width. 
				// Let's scale to a reasonable width like 128 or 192.
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
				const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
				resolve(imageData);
			};
			img.onerror = reject;
			img.src = url;
		});
	}

	async print(
		order: {
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
		},
		settings: ReceiptSettings
	) {
		if (!(this.isConnected() && this.characteristic)) {
			await this.autoConnect();
		}

		if (!(this.isConnected() && this.characteristic)) {
			throw new Error("Printer tidak terhubung.");
		}

		const encoder = new EscPosEncoder();
		const result = encoder.initialize();
		const separator = "-".repeat(RECEIPT_LINE_WIDTH);
		const headerSeparator = "=".repeat(RECEIPT_LINE_WIDTH);
		const printWrappedLines = (text: string, width = RECEIPT_LINE_WIDTH) => {
			for (const line of wrapReceiptText(text, width)) {
				result.line(line);
			}
		};
		const printCenteredLines = (text: string, width = RECEIPT_HEADER_WIDTH) => {
			for (const line of wrapReceiptText(text, width)) {
				result.line(line);
			}
		};
		const printKeyValue = (label: string, value: string) => {
			result.line(buildKeyValueLine(label, value));
		};

		result.align("center");

		if (settings.receiptShowLogo && settings.receiptLogo) {
			try {
				const imageData = await this._loadImage(settings.receiptLogo);
				result.image(imageData, imageData.width, imageData.height, "atkinson", 128);
			} catch (err) {
				console.error("Failed to print logo:", err);
			}
		}

		const headerText = settings.receiptHeader || settings.storeName || "YUMI POS";
		const fontSize = settings.receiptFontSize || "normal";
		if (fontSize === "large") {
			(result as any).size("double");
		} else {
			result.size("normal");
		}

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

		result.line(headerSeparator);
		result.align("left");

		if (settings.receiptShowOrderNumber) {
			printKeyValue("ID", order.orderNumber.toUpperCase());
		}

		if (order.cashierName && settings.receiptShowCashierName !== false) {
			printKeyValue("KASIR", order.cashierName.toUpperCase());
		}
		if (order.shiftName && settings.receiptShowCashierName !== false) {
			printKeyValue("SHIFT", order.shiftName.toUpperCase());
		}

		const dateStr = new Date(order.createdAt).toLocaleString("id-ID", {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
		printKeyValue("WAKTU", dateStr);
		printKeyValue("BAYAR", order.paymentMethod.toUpperCase());

		const orderType = order.orderType || settings.orderType;
		const tableNumber = order.tableNumber || settings.tableNumber;

		if (orderType) {
			const typeLabel = orderType === "dine_in" ? "MAKAN DI SINI" : "BAWA PULANG";
			printKeyValue("TIPE", typeLabel);
		}

		if (tableNumber) {
			printKeyValue("MEJA", tableNumber);
		}

		if (settings.receiptShowCustomerName && order.customerName) {
			printKeyValue("PELANGGAN", order.customerName.toUpperCase());
		}

		result.line(separator);
		printKeyValue("ITEM", "TOTAL");
		result.line(separator);

		for (const item of order.items) {
			const totalStr = formatReceiptCurrency(item.price * item.quantity);
			const nameLines = wrapReceiptText(item.name.toUpperCase(), RECEIPT_LINE_WIDTH - totalStr.length - 1);
			const firstNameLine = nameLines.shift() || item.name.toUpperCase().slice(0, RECEIPT_LINE_WIDTH);
			result.bold(true).line(buildKeyValueLine(firstNameLine, totalStr)).bold(false);
			for (const extraLine of nameLines) {
				result.line(extraLine);
			}

			const qtyDetail = `${item.quantity} x ${formatReceiptCurrency(item.price)}`;
			result.line(`  ${qtyDetail}`);

			const variantText = normalizeReceiptText(item.variant);
			if (variantText) {
				for (const line of wrapReceiptText(variantText, RECEIPT_LINE_WIDTH - 4)) {
					result.line(`  + ${line}`);
				}
			}
		}

		result.line(separator);

		if (order.subtotal !== undefined) {
			printKeyValue("SUBTOTAL", formatReceiptCurrency(order.subtotal));
		}

		if (order.discountAmount && order.discountAmount > 0) {
			printKeyValue("DISKON", `-${formatReceiptCurrency(order.discountAmount)}`);
		}

		if (order.taxAmount && order.taxAmount > 0) {
			printKeyValue("PAJAK", formatReceiptCurrency(order.taxAmount));
		}

		if (order.serviceChargeAmount && order.serviceChargeAmount > 0) {
			printKeyValue("SERVICE", formatReceiptCurrency(order.serviceChargeAmount));
		}

		result
			.line(separator)
			.bold(true)
			.line(buildKeyValueLine("TOTAL", `RP ${formatReceiptCurrency(order.totalAmount)}`))
			.bold(false);

		if (order.cashReceived !== undefined && order.cashReceived > 0) {
			printKeyValue("TUNAI", formatReceiptCurrency(order.cashReceived));
			if (order.changeAmount !== undefined && order.changeAmount > 0) {
				result
					.bold(true)
					.line(buildKeyValueLine("KEMBALI", formatReceiptCurrency(order.changeAmount)))
					.bold(false);
			}
		}

		if (settings.receiptShowNotes && order.notes) {
			result.line(separator);
			result.bold(true).line("CATATAN").bold(false);
			printWrappedLines(order.notes);
		}

		result.align("center");
		result
			.line(separator)
			.bold(true);
		printCenteredLines(settings.receiptFooter || "TERIMA KASIH ATAS KUNJUNGAN ANDA!", RECEIPT_HEADER_WIDTH);
		result
			.bold(false)
			.line(" ")
			.cut();

		const buffer = result.encode();
		const chunkSize = 20;

		for (let i = 0; i < buffer.length; i += chunkSize) {
			const chunk = buffer.slice(i, i + chunkSize);
			let attempts = 0;
			let sent = false;

			while (!sent && attempts < 3) {
				try {
					if (this.characteristic.properties.writeWithoutResponse) {
						await this.characteristic.writeValueWithoutResponse(chunk);
					} else {
						await this.characteristic.writeValue(chunk);
					}
					sent = true;
				} catch (error) {
					attempts++;
					if (attempts >= 3) {
						throw error;
					}
					await new Promise((resolve) => setTimeout(resolve, 150));
				}
			}

			await new Promise((resolve) => setTimeout(resolve, 10));
		}

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
