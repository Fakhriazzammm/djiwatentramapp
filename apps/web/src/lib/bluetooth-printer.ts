import EscPosEncoder from "esc-pos-encoder";

const RECEIPT_LINE_WIDTH = 28; // Safest for 58mm printers. Reduced from 30 to prevent any wrapping.

export interface OrderItem {
	productId: string;
	name: string;
	variant?: string;
	price: number;
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
			throw new Error("Printer tidak terhubung.");
		}

		const encoder = new EscPosEncoder();
		const result = encoder.initialize();

		// Alignment and Logo
		result.align("center");

		if (settings.receiptShowLogo && settings.receiptLogo) {
			try {
				const imageData = await this._loadImage(settings.receiptLogo);
				result.image(imageData, imageData.width, imageData.height, "atkinson", 128);
				// Extra line removed for compactness
			} catch (err) {
				console.error("Failed to print logo:", err);
			}
		}

		// Header / Store Name
		const headerText = settings.receiptHeader || settings.storeName || "YUMI POS";
		
		// Font Size handling
		const fontSize = settings.receiptFontSize || "normal";
		if (fontSize === "large") {
			(result as any).size("double");
		} else {
			result.size("normal");
		}

		result.bold(true).line(headerText).bold(false);
		result.size("normal"); // Reset size for rest of receipt

		// Address & Phone
		if (settings.receiptShowAddress && settings.storeAddress) {
			result.line(settings.storeAddress);
		}
		if (settings.receiptShowPhone && settings.storePhone) {
			result.line(settings.storePhone);
		}

		const separator = "-".repeat(RECEIPT_LINE_WIDTH);
		result.line(separator);
		
		// ID, Date, Method combined for compactness
		if (settings.receiptShowOrderNumber) {
			const cashierPart = order.cashierName && (settings.receiptShowCashierName !== false) 
				? ` | KASIR: ${order.cashierName.toUpperCase()}`
				: "";
			
			const idLine = `ID: ${order.orderNumber}${cashierPart}`;
			if (idLine.length <= RECEIPT_LINE_WIDTH) {
				result.line(idLine);
			} else {
				result.line(`ID: ${order.orderNumber}`);
				if (cashierPart) result.line(`KASIR: ${order.cashierName?.toUpperCase()}`);
			}
		} else if (order.cashierName && (settings.receiptShowCashierName !== false)) {
			result.line(`KASIR: ${order.cashierName.toUpperCase()}`);
		}
		
		const dateStr = new Date(order.createdAt).toLocaleString("id-ID", {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit"
		});
		
		const metaLine = `${dateStr} | ${order.paymentMethod.toUpperCase()}`;
		if (metaLine.length <= RECEIPT_LINE_WIDTH) {
			result.line(metaLine);
		} else {
			result.line(dateStr);
			result.line(`METODE: ${order.paymentMethod.toUpperCase()}`);
		}

		// Order Type & Table
		const orderType = order.orderType || settings.orderType;
		const tableNumber = order.tableNumber || settings.tableNumber;
		
		if (orderType) {
			const typeLabel = orderType === "dine_in" ? "MAKAN DI SINI" : "BAWA PULANG";
			result.bold(true).line(typeLabel).bold(false);
		}
		
		if (tableNumber) {
			result.line(`MEJA: ${tableNumber}`);
		}

		// Customer Name
		if (settings.receiptShowCustomerName && order.customerName) {
			result.line(`PELANGGAN: ${order.customerName.toUpperCase()}`);
		}

		result.line(separator);

		// Items Header (Optional but makes it look pro)
		// result.line("QTY  ITEM                TOTAL");

		// Items
		for (const item of order.items) {
			const qtyStr = `${item.quantity}x`;
			const priceStr = new Intl.NumberFormat("id-ID").format(item.price * item.quantity);
			const itemName = item.name.toUpperCase();
			const variantText = item.variant?.trim();
			
			// Responsive 1-line or 2-line layout
			const totalReservedWidth = qtyStr.length + priceStr.length + 2; // qtx + space + name + space + price
			if (itemName.length + totalReservedWidth <= RECEIPT_LINE_WIDTH) {
				const spaces = RECEIPT_LINE_WIDTH - qtyStr.length - itemName.length - priceStr.length;
				result.line(`${qtyStr} ${itemName}${" ".repeat(Math.max(1, spaces))}${priceStr}`);
			} else {
				// 2-line layout for long names
				result.bold(true).line(itemName.substring(0, RECEIPT_LINE_WIDTH)).bold(false);
				const leftPart = `${qtyStr} @${new Intl.NumberFormat("id-ID").format(item.price)}`;
				const spaces = RECEIPT_LINE_WIDTH - leftPart.length - priceStr.length;
				result.line(`${leftPart}${" ".repeat(Math.max(1, spaces))}${priceStr}`);
			}

			if (variantText) {
				const variantLines = variantText.toUpperCase().match(new RegExp(`.{1,${Math.max(8, RECEIPT_LINE_WIDTH - 4)}}`, "g")) || [];
				for (const line of variantLines) {
					result.line(`   > ${line}`);
				}
			}
		}

		// Breakdown (Subtotal, Discount, Tax, etc.)
		const formatCurrency = (val: number) => new Intl.NumberFormat("id-ID").format(val);
		
		// Utility function to pad label and value so they fit in exactly the line width
		// If label is too long, it will be truncated.
		const padLabel = (label: string, val: string) => {
			const MAX_WIDTH = RECEIPT_LINE_WIDTH;
			let safeLabel = label;
			
			// If total length exceeds MAX_WIDTH, we must truncate the label
			if (label.length + val.length + 1 > MAX_WIDTH) {
				safeLabel = label.substring(0, MAX_WIDTH - val.length - 1);
			}
			
			const spaces = MAX_WIDTH - safeLabel.length - val.length;
			return safeLabel + " ".repeat(Math.max(1, spaces)) + val;
		};

		result.line(separator);

		if (order.subtotal !== undefined) {
			result.line(padLabel("SUBTOTAL", formatCurrency(order.subtotal)));
		}

		if (order.discountAmount && order.discountAmount > 0) {
			result.line(padLabel("DISKON", `-${formatCurrency(order.discountAmount)}`));
		}

		if (order.taxAmount && order.taxAmount > 0) {
			result.line(padLabel("PAJAK", formatCurrency(order.taxAmount)));
		}

		if (order.serviceChargeAmount && order.serviceChargeAmount > 0) {
			result.line(padLabel("SERVICE CHARGE", formatCurrency(order.serviceChargeAmount)));
		}

		// Final Total
		result
			.line(separator)
			.bold(true)
			.line(padLabel("TOTAL", `Rp ${formatCurrency(order.totalAmount)}`))
			.bold(false);

		// Cash & Change Details
		if (order.cashReceived !== undefined && order.cashReceived > 0) {
			result.line(padLabel("BAYAR TUNAI", formatCurrency(order.cashReceived)));
			if (order.changeAmount !== undefined && order.changeAmount > 0) {
				result.bold(true).line(padLabel("KEMBALIAN", formatCurrency(order.changeAmount))).bold(false);
			}
		}

		// Notes
		if (settings.receiptShowNotes && order.notes) {
			result.line(" ");
			result.bold(true).line("CATATAN:").bold(false);
			result.line(order.notes);
		}

		// Footer
		result
			.line(separator)
			.line(settings.receiptFooter || "TERIMA KASIH ATAS KUNJUNGAN ANDA!")
			.line(" ")
			.cut();

		const buffer = result.encode();
		const chunkSize = 20;

		for (let i = 0; i < buffer.length; i += chunkSize) {
			const chunk = buffer.slice(i, i + chunkSize);
			
			if (this.characteristic.properties.writeWithoutResponse) {
				await this.characteristic.writeValueWithoutResponse(chunk);
			} else {
				await this.characteristic.writeValue(chunk);
			}
			
			// Small delay to prevent buffer overflow on slower printers
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
	}
}

export const bluetoothPrinter = new BluetoothPrinterService();
