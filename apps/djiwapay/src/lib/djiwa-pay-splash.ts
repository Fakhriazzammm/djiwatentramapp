export const DJIWA_PAY_SESSION_SPLASH_LABEL = "Menyiapkan sesi Djiwa Pay";
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

export type DjiwaPayWalletPage = "topup" | "transfer" | "receive" | "history" | "help" | null;

export type DjiwaPayPageData = {
  /** Waiting for data is pointless without a connection. */
  offline?: boolean;
  walletLoading: boolean;
  walletPage?: DjiwaPayWalletPage;
  notificationsOpen: boolean;
  notificationsLoading: boolean;
  ppobSuccess: boolean;
  /** True when the URL or state is showing a PPOB page. */
  ppobPageActive: boolean;
  ppobCategory: string;
  /** Catalog loaded, failed, or not needed (category picker). */
  ppobCatalogReady: boolean;
  postpaidActive: boolean;
  /** Postpaid catalog loaded or failed with a message. */
  postpaidCatalogReady: boolean;
  selectedPpobProduct: boolean;
};

const unavailablePpobCategories = new Set(["bpjs", "tv", "multifinance"]);

/**
 * True when the visible page has all the data it needs. The splash gate holds
 * until this flips, so a page never appears half-empty behind the brand mark.
 * Failure states count as ready: an error with a retry action is still a page
 * the customer can act on.
 */
export function isDjiwaPayPageReady(data: DjiwaPayPageData): boolean {
  if (data.offline) return true;
  if (data.ppobSuccess) return true;

  if (data.ppobPageActive) {
    if (data.ppobCategory === "all") return true;
    if (unavailablePpobCategories.has(data.ppobCategory)) return true;
    if (data.postpaidActive) return data.postpaidCatalogReady;
    if (data.selectedPpobProduct) return !data.walletLoading;
    return data.ppobCatalogReady;
  }

  if (data.walletPage === "help") return true;
  if (data.notificationsOpen) return !data.notificationsLoading;
  return !data.walletLoading;
}
