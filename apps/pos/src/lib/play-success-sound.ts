/**
 * Memainkan sound notifikasi transaksi berhasil (paid/completed).
 * Diputar 2x berturut-turut dengan jeda durasi audio.
 * Aman terhadap autoplay policy browser (silent catch).
 */
export function playSuccessSound(): void {
	try {
		const audio = new Audio("/sounds/transaction-success.mp3");
		audio.volume = 0.6;
		audio.play().catch(() => {
			/* autoplay policy — abaikan */
		});

		// Putar kedua kalinya setelah audio selesai (kira2 durasinya)
		audio.addEventListener("ended", () => {
			const audio2 = new Audio("/sounds/transaction-success.mp3");
			audio2.volume = 0.6;
			audio2.play().catch(() => {
				/* autoplay policy — abaikan */
			});
		});
	} catch {
		/* fallback diam */
	}
}
