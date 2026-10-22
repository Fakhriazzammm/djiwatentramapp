import { validateCustomerNumber } from "./djiwa-pay-checkout";

export type PpobRouteStage = "detail" | "konfirmasi" | "struk";
export type PpobRoute = { category: string; productCode?: string; stage?: PpobRouteStage };

const categoryPattern = "[^/]+";
const productPattern = "[^/]+";
const stagePattern = "(?:detail|konfirmasi|struk)";
const ppobPattern = new RegExp(`^/ppob(?:/(${categoryPattern})(?:/produk/(${productPattern})/(${stagePattern}))?)?/?$`);
const supportedCategories = new Set(["pulsa", "data", "game", "pln"]);

export function parsePpobPath(pathname: string): PpobRoute | null {
  const match = ppobPattern.exec(pathname);
  if (!match) return null;
  if (match[1] && !supportedCategories.has(decodeURIComponent(match[1]))) return null;
  return { category: match[1] ? decodeURIComponent(match[1]) : "all", ...(match[2] ? { productCode: decodeURIComponent(match[2]) } : {}), ...(match[3] ? { stage: match[3] as PpobRouteStage } : {}) };
}

export function isKnownPayPath(pathname: string) {
  return pathname === "/" || pathname === "/wallet" || parsePpobPath(pathname) !== null;
}

export function checkoutCustomerNumberHint(value: string) {
  const validation = validateCustomerNumber(value);
  return validation.valid ? null : value ? validation.message : "Masukkan nomor tujuan untuk melanjutkan.";
}
