export const DJIWA_PAY_SPLASH_FALLBACK_LABEL = "Menyiapkan halaman";

/**
 * Short, human label shown under the brand mark during a page transition.
 * Mirrors the destination page so the splash never feels like an anonymous
 * loading screen.
 */
export function djiwaPaySplashLabel(path: string): string {
  const pathname = path.split("?")[0] || "";
  if (pathname === "/wallet/topup") return "Membuka Isi Saldo";
  if (pathname === "/wallet/transfer") {
    return path.includes("mode=scan") ? "Membuka Pemindai QR" : "Membuka Kirim Saldo";
  }
  if (pathname === "/wallet/receive") return "Membuka Terima Saldo";
  if (pathname.startsWith("/wallet/history/")) return "Membuka Detail Transaksi";
  if (pathname === "/wallet/history") return "Membuka Riwayat";
  if (pathname === "/wallet/help") return "Membuka Bantuan";
  if (pathname.startsWith("/ppob/") && pathname.includes("/produk/")) {
    return pathname.endsWith("/struk") ? "Menyiapkan Struk" : "Menyiapkan Pembayaran";
  }
  if (pathname.startsWith("/ppob")) return "Membuka Pembayaran PPOB";
  return "Kembali ke Djiwa Pay";
}
