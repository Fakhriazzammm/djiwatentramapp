import { describe, expect, it } from "bun:test";
import { chunk, mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
	it("memproses semua item dan tidak pernah melebihi batas", async () => {
		let running = 0;
		let peak = 0;
		const seen: number[] = [];
		await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async (n) => {
			running++;
			peak = Math.max(peak, running);
			await new Promise((resolve) => setTimeout(resolve, 2));
			seen.push(n);
			running--;
		});
		expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		expect(peak <= 3).toBe(true);
		expect(peak > 1).toBe(true);
	});

	it("aman untuk daftar kosong", async () => {
		let calls = 0;
		await mapWithConcurrency([], 8, async () => {
			calls++;
		});
		expect(calls).toBe(0);
	});

	it("batas tidak valid dianggap satu jalur (berurutan)", async () => {
		let running = 0;
		let peak = 0;
		const order: number[] = [];
		await mapWithConcurrency([1, 2, 3], Number.NaN, async (n) => {
			running++;
			peak = Math.max(peak, running);
			order.push(n);
			running--;
		});
		expect(peak).toBe(1);
		expect(order).toEqual([1, 2, 3]);
	});
});

describe("chunk", () => {
	it("memecah daftar sesuai ukuran, potongan terakhir boleh lebih kecil", () => {
		expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
		expect(chunk([], 2)).toEqual([]);
	});
});
