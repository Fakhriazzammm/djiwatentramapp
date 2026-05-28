import { toast } from "sonner";

export type SaveToastStatus = "idle" | "saving" | "saved" | "error";

export type SaveToastOptions = {
	/** Toast text saat loading (default: "Menyimpan...") */
	loading?: string;
	/** Toast text saat sukses (default: "Tersimpan") */
	success?: string;
	/** Prefix toast text saat error (default: "Gagal") */
	error?: string;
	/** Callback untuk update status per-row (opsional) */
	onStatusChange?: (status: SaveToastStatus) => void;
};

export type SaveToastResult<T = unknown> = {
	success: boolean;
	data: T | null;
	error: string | null;
};

/**
 * Utility untuk menjalankan action async dengan toast notifikasi otomatis:
 * 1. Loading toast ("Menyimpan...") selama proses berjalan
 * 2. Success toast ("Tersimpan") setelah await selesai
 * 3. Error toast ("Gagal: [pesan]") jika throw
 *
 * @example
 * const result = await withSaveToast(
 *   () => updateItemMutation({ id, name: "Gula" }),
 *   { success: "Data tersimpan" }
 * );
 * if (result.success) refreshData();
 */
export async function withSaveToast<T = unknown>(
	action: () => Promise<T>,
	options: SaveToastOptions = {},
): Promise<SaveToastResult<T>> {
	const {
		loading = "Menyimpan...",
		success = "Tersimpan",
		error: errorPrefix = "Gagal",
	} = options;

	options.onStatusChange?.("saving");
	const id = toast.loading(loading, { duration: Infinity });

	try {
		const data = await action();
		toast.success(success, { id, duration: 2000 });
		options.onStatusChange?.("saved");
		return { success: true, data, error: null };
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Terjadi kesalahan";
		toast.error(`${errorPrefix}: ${message}`, { id, duration: 5000 });
		options.onStatusChange?.("error");
		return { success: false, data: null, error: message };
	}
}
