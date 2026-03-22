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
}

export class BluetoothPrinterService {
	private device: BluetoothDevice | null = null;
	private server: BluetoothRemoteGATTServer | null = null;
	private characteristic: BluetoothRemoteGATTCharacteristic | null = null;

	async connect(): Promise<string> {
		if (!navigator.bluetooth) {
			throw new Error("Browser ini tidak mendukung Bluetooth.");
		}

		try {
			this.device = await navigator.bluetooth.requestDevice({
				filters: [
					{ services: ["000018f0-0000-1000-8000-00805f9b34fb"] }, // Generic POS service
					{ services: ["e7e11001-49d2-4cc3-a291-0016260c533c"] }, // Some printers
				],
				optionalServices: [
					"000018f0-0000-1000-8000-00805f9b34fb",
					"e7e11001-49d2-4cc3-a291-0016260c533c",
				],
			});

			if (!this.device?.gatt) {
				throw new Error("Gagal menghubungkan ke perangkat.");
			}

			this.server = await this.device.gatt.connect();

			// Try to find the printer service and characteristic
			const services = await this.server.getPrimaryServices();
			let writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

			for (const service of services) {
				const characteristics = await service.getCharacteristics();
				for (const char of characteristics) {
					if (char.properties.write || char.properties.writeWithoutResponse) {
						writeCharacteristic = char;
						break;
					}
				}
				if (writeCharacteristic) {
					break;
				}
			}

			if (!writeCharacteristic) {
				throw new Error("Printer characteristic tidak ditemukan.");
			}

			this.characteristic = writeCharacteristic;
			return this.device.name || "Bluetooth Printer";
		} catch (error) {
			console.error("Bluetooth connection error:", error);
			throw error;
		}
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
		} else if (fontSize === "small") {
			result.size("normal"); // esc-pos-encoder doesn't have "small" size easily via size()
		} else {
			result.size("normal");
		}

		result.line(headerText);
		result.size("normal"); // Reset size for rest of receipt

		// Address & Phone
		if (settings.receiptShowAddress && settings.storeAddress) {
			result.line(settings.storeAddress);
		}
		if (settings.receiptShowPhone && settings.storePhone) {
			result.line(settings.storePhone);
		}

		result.line("--------------------------------");
		result.align("left");

		// Order Info
		if (settings.receiptShowOrderNumber) {
			result.line(`No. Antrian: ${order.orderNumber}`);
		}
		
		result.line(`Tgl: ${new Date(order.createdAt).toLocaleString("id-ID")}`);
		result.line(`Metode: ${order.paymentMethod.toUpperCase()}`);

		// Customer Name
		if (settings.receiptShowCustomerName && order.customerName) {
			result.line(`Pelanggan: ${order.customerName}`);
		}

		result.line("--------------------------------");

		// Items
		for (const item of order.items) {
			const name =
				item.name.length > 20 ? `${item.name.substring(0, 17)}...` : item.name;
			const priceStr = new Intl.NumberFormat("id-ID").format(item.price);
			const totalStr = new Intl.NumberFormat("id-ID").format(
				item.price * item.quantity
			);

			result.line(`${name}`);
			result.line(
				`${item.quantity} x ${priceStr.padStart(10)}    ${totalStr.padStart(10)}`
			);
		}

		// Notes
		if (settings.receiptShowNotes && order.notes) {
			result.line("--------------------------------");
			result.line(`Catatan: ${order.notes}`);
		}

		result
			.line("--------------------------------")
			.align("right")
			.bold(true)
			.line(
				`TOTAL: Rp ${new Intl.NumberFormat("id-ID").format(order.totalAmount)}`
			)
			.bold(false)
			.align("center")
			.line(" ")
			.line(settings.receiptFooter || "Terima Kasih!")
			.line(" ")
			.line(" ")
			.cut()
			.encode();

		// Split the buffer into chunks of 20 bytes (standard BLE MTU)
		const buffer = result.encode();
		const chunkSize = 20;
		for (let i = 0; i < buffer.length; i += chunkSize) {
			const chunk = buffer.slice(i, i + chunkSize);
			await this.characteristic.writeValue(chunk);
		}
	}
}

export const bluetoothPrinter = new BluetoothPrinterService();
