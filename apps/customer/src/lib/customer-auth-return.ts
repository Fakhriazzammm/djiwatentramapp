const customerReturnOrigins = new Set([
  "https://merchandise.djiwatentram.web.id",
  "https://ordermieyamin.djiwatentram.web.id",
  "https://booking.djiwatentram.web.id",
  "http://localhost:3010",
  "http://localhost:5174",
]);

function isAllowedPayPath(pathname: string) {
  return pathname === "/"
    || pathname === "/wallet"
    || /^\/[^/]+\/wallet\/?$/.test(pathname)
    || /^\/wallet\/(topup|transfer|receive|history|help)(?:\/[^/]+)?\/?$/.test(pathname)
    || /^\/ppob(?:\/[^/]+(?:\/produk\/[^/]+\/(detail|konfirmasi|struk))?)?\/?$/.test(pathname);
}

export function getSafeCustomerReturnUrl(search: string) {
  const params = new URLSearchParams(search);
  if (params.get("sso") !== "1") return null;
  const raw = params.get("returnTo");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const isPay = url.origin === "https://djiwapay.web.id";
    const isAllowedPath = isPay
      ? isAllowedPayPath(url.pathname)
      : /^\/[^/]+\/order$/.test(url.pathname) || url.pathname === "/";
    const isAllowedOrigin = isPay || customerReturnOrigins.has(url.origin);
    const isAllowedQuery = isPay
      ? [...url.searchParams.entries()].every(([key, value]) => key === "sso" && value === "1")
      : [...url.searchParams.keys()].every((key) => key === "step" || key === "stage");
    const step = url.searchParams.get("step");
    const stage = url.searchParams.get("stage");
    const isAllowedStep = step === null || step === "checkout" || step === "shipping" || step === "payment";
    const isAllowedStage = stage === null || stage === "order";
    if (!isAllowedOrigin || !isAllowedPath || !isAllowedQuery || (!isPay && (!isAllowedStep || !isAllowedStage)) || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}
