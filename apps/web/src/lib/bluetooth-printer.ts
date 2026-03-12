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

	async print(
		order: {
			orderNumber: string;
			items: OrderItem[];
			totalAmount: number;
			paymentMethod: string;
			createdAt: number;
		},
		settings: ReceiptSettings
	) {
		if (!(this.isConnected() && this.characteristic)) {
			throw new Error("Printer tidak terhubung.");
		}

		const encoder = new EscPosEncoder();
		const result = encoder
			.initialize()
			.align("center")
			.line(settings.storeName || "YUMI POS")
			.size("normal")
			.line(settings.storeAddress || "")
			.line(settings.storePhone || "")
			.line("--------------------------------")
			.align("left")
			.line(`No. Antrian: ${order.orderNumber}`)
			.line(`Tgl: ${new Date(order.createdAt).toLocaleString("id-ID")}`)
			.line(`Metode: ${order.paymentMethod.toUpperCase()}`)
			.line("--------------------------------");

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
