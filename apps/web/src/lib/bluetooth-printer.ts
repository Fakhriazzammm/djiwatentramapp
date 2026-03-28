import EscPosEncoder from "esc-pos-encoder";

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
				result.line(" "); // Extra line after logo
			} catch (err) {
				console.error("Failed to print logo:", err);
			}
		}

		// Header / Store Name
		const headerText = settings.receiptHeader || settings.storeName || "YUMI POS";
		
		// Font Size handling
		const fontSize = settings.receiptFontSize || "normal";
		if (fontSize === "large") {
			result.size("double");
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

		result.line("--------------------------------");
		
		// Order Summary Row (Order No & Date)
		result.align("left");
		if (settings.receiptShowOrderNumber) {
			result.line(`ID: ${order.orderNumber}`);
		}
		
		const dateStr = new Date(order.createdAt).toLocaleString("id-ID", {
			day: "2-digit",
			month: "2-digit",
			year: "2-digit",
			hour: "2-digit",
			minute: "2-digit"
		});
		
		result.line(`TGL: ${dateStr}`);
		result.line(`METODE: ${order.paymentMethod.toUpperCase()}`);

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

		result.line("--------------------------------");

		// Items Header (Optional but makes it look pro)
		// result.line("QTY  ITEM                TOTAL");

		// Items
		for (const item of order.items) {
			const qtyStr = `${item.quantity}x`.padEnd(4);
			const priceStr = new Intl.NumberFormat("id-ID").format(item.price * item.quantity);
			
			// Compact multi-line for items
			result.bold(true).line(item.name.toUpperCase()).bold(false);
			
			// Details line: "1x @15.000             15.000"
			const unitPrice = `@${new Intl.NumberFormat("id-ID").format(item.price)}`;
			const detailsLine = `${qtyStr} ${unitPrice.padEnd(10)} ${priceStr.padStart(15)}`;
			result.line(detailsLine);
		}

		result.line("--------------------------------");

		// Breakdown (Subtotal, Discount, Tax, etc.)
		const formatCurrency = (val: number) => new Intl.NumberFormat("id-ID").format(val);
		const padLabel = (label: string, val: string) => {
			const spaces = 32 - label.length - val.length;
			return label + " ".repeat(Math.max(1, spaces)) + val;
		};

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
			.line("--------------------------------")
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
			.line(" ")
			.align("center")
			.line("--------------------------------")
			.line(settings.receiptFooter || "TERIMA KASIH ATAS KUNJUNGAN ANDA!")
			.line(" ")
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
