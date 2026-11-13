/** Jalankan `worker` untuk setiap item dengan batas jumlah yang berjalan bersamaan. Item dimulai sesuai urutan. */
export async function mapWithConcurrency<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
	const cap = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1;
	const lanes = Math.min(cap, items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: lanes }, async () => {
			while (next < items.length) {
				const item = items[next++];
				await worker(item);
			}
		}),
	);
}

/** Pecah daftar menjadi potongan berukuran `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
	if (!(size >= 1)) throw new RangeError("size harus >= 1");
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}
