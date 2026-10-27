import { validateCustomerNumber } from "./djiwa-pay-checkout";

export type PpobRouteStage = "detail" | "konfirmasi" | "struk";
export type PpobRoute = { category: string; productCode?: string; stage?: PpobRouteStage };

const categoryPattern = "[^/]+";
const productPattern = "[^/]+";
const stagePattern = "(?:detail|konfirmasi|struk)";
const ppobPattern = new RegExp(`^/ppob(?:/(${categoryPattern})(?:/produk/(${productPattern})/(${stagePattern}))?)?/?$`);
const supportedCategories = new Set(["pulsa", "data", "game", "pln", "pln-bill", "pdam", "bpjs", "tv", "multifinance"]);

export function parsePpobPath(pathname: string): PpobRoute | null {
  const match = ppobPattern.exec(pathname);
  if (!match) return null;
  if (match[1] && !supportedCategories.has(decodeURIComponent(match[1]))) return null;
  return { category: match[1] ? decodeURIComponent(match[1]) : "all", ...(match[2] ? { productCode: decodeURIComponent(match[2]) } : {}), ...(match[3] ? { stage: match[3] as PpobRouteStage } : {}) };
}

export type WalletRoute = {
  page: "topup" | "transfer" | "receive" | "history" | "help";
  transactionId?: string;
};

const walletPagePattern = /^\/wallet\/(topup|transfer|receive|history|help)\/?$/;
const walletTransactionPattern = /^\/wallet\/history\/([^/]+)\/?$/;
const customerWalletPattern = /^\/([^/]+)\/wallet\/?$/;

export function parseCustomerWalletUsername(pathname: string): string | null {
  const match = customerWalletPattern.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function parseWalletPath(pathname: string): WalletRoute | null {
  const transactionMatch = walletTransactionPattern.exec(pathname);
  if (transactionMatch) return { page: "history", transactionId: decodeURIComponent(transactionMatch[1]) };
  const pageMatch = walletPagePattern.exec(pathname);
  return pageMatch ? { page: pageMatch[1] as WalletRoute["page"] } : null;
}

export function isKnownPayPath(pathname: string) {
  return pathname === "/" || pathname === "/wallet" || parseCustomerWalletUsername(pathname) !== null || parseWalletPath(pathname) !== null || parsePpobPath(pathname) !== null;
}

export function checkoutCustomerNumberHint(value: string) {
  const validation = validateCustomerNumber(value);
  return validation.valid ? null : value ? validation.message : "Masukkan nomor tujuan untuk melanjutkan.";
}

export function postpaidServiceForCategory(category: string): "pln" | "pdam" | null {
  if (category === "pln-bill") return "pln";
  if (category === "pdam") return "pdam";
  return null;
}
