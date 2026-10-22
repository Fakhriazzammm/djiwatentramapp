import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, Bell, Car, CreditCard, Droplets, Eye, EyeOff, Gamepad2, HeartPulse, HelpCircle, House, ReceiptText, RefreshCw, ScanLine, Smartphone, Tv, UserRound, Wallet, Wifi, X, Zap } from "lucide-react";
import { checkPpobStatus, checkTopupStatus, checkPostpaidStatus, createPpobInvoice, inquirePostpaid, payPostpaid, purchasePpob, readPpobCatalog, readPostpaidCatalog, type PpobProduct, type PpobPurchaseResult, type PostpaidInquiry, type PostpaidProduct, type WalletResponse } from "../../lib/wallet-adapter";
import { Djiwa3DIcon } from "@yumipos/web-shared";
import type { CustomerProfile, PayNavigationContext } from "../../lib/identity-adapter";
import type { WalletLedgerEntry } from "@yumipos/djiwapay-core";
import { CheckoutActionBar, CheckoutSection, OrderSummary, PaymentMethodCard } from "@yumipos/djiwa-checkout-ui";
import { DjiwaPayCheckout, DjiwaPaySuccess } from "./djiwa-pay-checkout";
import { isSettledPpob, preferredPaymentMethod, validateCustomerNumber } from "../../lib/djiwa-pay-checkout";
import { parseCheckoutDraft, serializeCheckoutDraft, type CheckoutDraft } from "../../lib/djiwa-pay-draft";
import { checkoutCustomerNumberHint, parsePpobPath } from "../../lib/djiwa-pay-routes";
import { DjiwaPayWalletAction } from "./djiwa-pay-wallet-actions";
import { walletQuickActionState } from "../../lib/djiwa-pay-availability";
import { applyTopupKey, normalizeTopupAmount } from "../../lib/djiwa-pay-topup";
import { postpaidTotal, validatePostpaidCustomerNumber } from "../../lib/djiwa-pay-postpaid";

const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const date = (value: string) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const labels: Record<string, string> = { topup_completed: "Top up", manual_credit: "Credit saldo", order_debit: "Pembayaran pesanan", wallet_hold: "Saldo ditahan", wallet_release: "Saldo dikembalikan", wallet_transfer_sent: "Transfer terkirim", wallet_transfer_received: "Transfer diterima", refund: "Refund pesanan", adjustment: "Penyesuaian saldo" };
const scanAction = walletQuickActionState("scan");
const withdrawAction = walletQuickActionState("withdraw");
const actions = [
  ["topup", "Isi Saldo", "topup.webp", true, "", ""], ["send", "Kirim", "send.webp", true, "", ""], ["receive", "Terima", "receive.webp", true, "", ""], ["scan", "Scan QR", "scan-qr.webp", scanAction.supported, scanAction.badge, "cyan"],
  ["history", "Riwayat", "history.webp", true, "", ""], ["card", "Kartu", "card.webp", true, "", ""], ["withdraw", "Tarik Dana", "withdraw.webp", withdrawAction.supported, withdrawAction.badge, "orange"], ["help", "Bantuan", "help.webp", true, "", ""],
] as const;

const ppobServices = [
  ["pulsa", "Pulsa", "Isi pulsa semua operator", Smartphone, "blue"],
  ["data", "Paket Data", "Internet dan kuota", Wifi, "violet"],
  ["pln-token", "Token PLN", "Beli token listrik", Zap, "amber"],
  ["pln-bill", "Tagihan PLN", "Bayar listrik bulanan", ReceiptText, "orange"],
  ["pdam", "PDAM", "Tagihan air", Droplets, "cyan"],
  ["bpjs", "BPJS", "Kesehatan dan ketenagakerjaan", HeartPulse, "rose"],
  ["tv", "TV & Streaming", "Bayar langganan", Tv, "indigo"],
  ["game", "Voucher Game", "Top up game favorit", Gamepad2, "emerald"],
  ["multifinance", "Cicilan", "Bayar pembiayaan", Car, "slate"],
] as const;

type Props = { profile: CustomerProfile; wallet: WalletResponse | null; loading: boolean; error: string | null; busy: boolean; onRefresh: () => void; onTopup: (amount: number) => Promise<{ invoiceUrl: string; invoiceId?: string }>; navigationContext: PayNavigationContext };

function PpobReceipt({ product, number, serialNumber, reference, onDone }: { product: PpobProduct; number: string; serialNumber?: string; reference?: string; onDone: () => void }) {
  const [stage, setStage] = useState<"processing" | "printing" | "complete">("processing");
  useEffect(() => { const printTimer = window.setTimeout(() => setStage("printing"), 450); const doneTimer = window.setTimeout(() => setStage("complete"), 2100); return () => { window.clearTimeout(printTimer); window.clearTimeout(doneTimer); }; }, []);
  const operator = product.product_description.toLowerCase().includes("by.u") || product.product_code.toLowerCase().includes("byu") ? "by.U" : product.product_description.split(" ")[0];
  return <div className="ppob-receipt-backdrop"><section className="ppob-receipt-shell" role="dialog" aria-modal="true" aria-labelledby="ppob-receipt-title"><div className="ppob-receipt-brand"><span>D</span><strong>Djiwa Pay</strong><small>{stage === "complete" ? "Pembayaran berhasil" : stage === "printing" ? "Menyiapkan struk" : "Memproses pembayaran"}</small></div><div className={`ppob-receipt-paper ${stage}`}><div className="ppob-receipt-check">{stage === "complete" ? "✓" : "·"}</div><h2 id="ppob-receipt-title">Pembayaran Berhasil</h2><p className="ppob-receipt-caption">Struk digital transaksi PPOB</p><div className="ppob-receipt-rows"><span>Operator <b>{operator}</b></span><span>Produk <b>{product.product_description}</b></span><span>Nomor tujuan <b>{number}</b></span><span>Total <b>{money(product.product_price)}</b></span><span>Metode <b>Saldo Djiwa Pay</b></span>{serialNumber ? <span>Serial Number <b>{serialNumber}</b></span> : null}{reference ? <span>Referensi <b>{reference}</b></span> : null}</div><div className="ppob-receipt-status">{stage === "complete" ? "Transaksi selesai dan saldo telah dipotong." : stage === "printing" ? "Menyiapkan struk digital..." : "Memverifikasi transaksi..."}</div></div>{stage === "complete" ? <button className="primary-action" onClick={onDone}>Selesai</button> : <div className="ppob-receipt-progress" aria-live="polite">{stage === "printing" ? "Menyiapkan struk..." : "Memproses..."}</div>}</section></div>;
}

export function DjiwaPayScreen({ profile, wallet, loading, error, busy, onRefresh, onTopup, navigationContext }: Props) {
  const [visible, setVisible] = useState(false);
  const [amount, setAmount] = useState("50000");
  const [soon, setSoon] = useState<string | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupStage, setTopupStage] = useState<"detail" | "payment">("detail");
  const [topupPending, setTopupPending] = useState(false);
  const [topupStatus, setTopupStatus] = useState<"idle" | "pending" | "success" | "expired">("idle");
  const [topupInvoiceId, setTopupInvoiceId] = useState<string | null>(null);
  const [ppobOpen, setPpobOpen] = useState(false);
  const [ppobFilter, setPpobFilter] = useState("all");
  const [selectedPpobProduct, setSelectedPpobProduct] = useState<PpobProduct | null>(null);
  const [ppobQuery, setPpobQuery] = useState("");
  const [ppobOperator, setPpobOperator] = useState("all");
  const [ppobSort, setPpobSort] = useState<"default" | "price-asc" | "price-desc" | "name">("default");
  const [ppobCustomerNumber, setPpobCustomerNumber] = useState("");
  const [ppobPaymentBusy, setPpobPaymentBusy] = useState(false);
  const [ppobPaymentMessage, setPpobPaymentMessage] = useState<string | null>(null);
  const [ppobPaymentStatus, setPpobPaymentStatus] = useState<"idle" | "pending" | "failed">("idle");
  const [ppobReviewOpen, setPpobReviewOpen] = useState(false);
  const [ppobPaymentMethod, setPpobPaymentMethod] = useState<"wallet" | "mayar">("wallet");
  const [ppobInvoiceId, setPpobInvoiceId] = useState<string | null>(null);
  const [ppobSuccess, setPpobSuccess] = useState<{ product: PpobProduct; number: string; serialNumber?: string; reference?: string } | null>(null);
  const [ppobCatalog, setPpobCatalog] = useState<PpobProduct[] | null>(null);
  const [ppobCatalogLoading, setPpobCatalogLoading] = useState(false);
  const [ppobCatalogError, setPpobCatalogError] = useState<string | null>(null);
  const [postpaidService, setPostpaidService] = useState<"pln" | "pdam" | null>(null);
  const [postpaidCatalog, setPostpaidCatalog] = useState<PostpaidProduct[] | null>(null);
  const [postpaidProductCode, setPostpaidProductCode] = useState("");
  const [postpaidCustomerNumber, setPostpaidCustomerNumber] = useState("");
  const [postpaidInquiry, setPostpaidInquiry] = useState<PostpaidInquiry | null>(null);
  const [postpaidStage, setPostpaidStage] = useState<"detail" | "confirmation" | "pending" | "success" | "failed">("detail");
  const [postpaidBusy, setPostpaidBusy] = useState(false);
  const [postpaidMessage, setPostpaidMessage] = useState<string | null>(null);
  const [returnToPpob, setReturnToPpob] = useState<string | null>(null);
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const [ppobReceiptDraft, setPpobReceiptDraft] = useState<CheckoutDraft["receipt"] | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [activityFilter, setActivityFilter] = useState<"all" | "credit" | "debit">("all");
  const [selectedEntry, setSelectedEntry] = useState<WalletLedgerEntry | null>(null);
  const [walletAction, setWalletAction] = useState<"send" | "receive" | null>(null);
  const [transferRecipient, setTransferRecipient] = useState("");
  const recentNumbersKey = `djiwa-pay-recent-numbers:${profile.source_id}`;
  const [recentCustomerNumbers, setRecentCustomerNumbers] = useState<string[]>(() => {
    try { const parsed = JSON.parse(window.localStorage.getItem(`djiwa-pay-recent-numbers:${profile.source_id}`) || "[]"); return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 5) : []; } catch { return []; }
  });
  const favoritesKey = `djiwa-pay-favorite-numbers:${profile.source_id}`;
  const [favoriteCustomerNumbers, setFavoriteCustomerNumbers] = useState<string[]>(() => {
    try { const parsed = JSON.parse(window.localStorage.getItem(`djiwa-pay-favorite-numbers:${profile.source_id}`) || "[]"); return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 5) : []; } catch { return []; }
  });
  const goPpobRoute = (path: string) => { window.history.pushState({ ppob: true }, "", path); setRoutePath(path); };
  const closePpob = () => { setPpobOpen(false); setPpobFilter("all"); setSelectedPpobProduct(null); setPostpaidService(null); setPostpaidCatalog(null); setPostpaidInquiry(null); setPostpaidProductCode(""); setPostpaidCustomerNumber(""); setPostpaidStage("detail"); setPostpaidMessage(null); setPpobQuery(""); setPpobOperator("all"); setPpobSort("default"); setPpobCustomerNumber(""); setPpobPaymentMessage(null); setPpobReviewOpen(false); setPpobPaymentMethod("wallet"); setPpobSuccess(null); goPpobRoute("/"); };
  const rememberCustomerNumber = (value: string) => { const next = [value, ...recentCustomerNumbers.filter((item) => item !== value)].slice(0, 5); setRecentCustomerNumbers(next); try { window.localStorage.setItem(recentNumbersKey, JSON.stringify(next)); } catch { /* best effort */ } };
  const toggleFavoriteCustomerNumber = (value: string) => { const next = favoriteCustomerNumbers.includes(value) ? favoriteCustomerNumbers.filter((item) => item !== value) : [value, ...favoriteCustomerNumbers].slice(0, 5); setFavoriteCustomerNumbers(next); try { window.localStorage.setItem(favoritesKey, JSON.stringify(next)); } catch { /* best effort */ } };
  const ppobProductRoute = (stage: string, product = selectedPpobProduct) => product ? `/ppob/${encodeURIComponent(ppobFilter)}/produk/${encodeURIComponent(product.product_code)}/${stage}` : `/ppob/${encodeURIComponent(ppobFilter)}`;
  const draftKey = `djiwa-pay-checkout:${profile.source_id}`;
  const saveDraft = (draft: CheckoutDraft) => { try { window.sessionStorage.setItem(draftKey, serializeCheckoutDraft(draft)); } catch { /* storage is best effort */ } };
  const clearDraft = () => { try { window.sessionStorage.removeItem(draftKey); } catch { /* storage is best effort */ } };
  useEffect(() => {
    const onPopState = () => setRoutePath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (!topupOpen && !ppobOpen && !soon) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (soon) setSoon(null);
      else if (topupOpen && !busy) setTopupOpen(false);
      else if (ppobOpen) closePpob();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, closePpob, ppobOpen, soon, topupOpen]);
  useEffect(() => {
    if (draftRestored) return;
    setDraftRestored(true);
    try {
      const draft = parseCheckoutDraft(window.sessionStorage.getItem(draftKey));
      if (!draft) return;
      setAmount(String(draft.topupAmount ?? draft.amount));
      if (draft.kind === "ppob" && draft.topupAmount) {
        setPpobFilter(draft.category);
        setPpobCustomerNumber(draft.customerNumber);
        setPpobPaymentMethod(draft.paymentMethod);
        setPpobInvoiceId(draft.invoiceId ?? null);
        setPpobReceiptDraft(draft.receipt ?? null);
        setReturnToPpob(draft.returnTo);
        setTopupStage("payment");
        setTopupPending(true);
        setTopupOpen(true);
      } else if (draft.kind === "ppob") {
        setPpobFilter(draft.category);
        setPpobCustomerNumber(draft.customerNumber);
        setPpobPaymentMethod(draft.paymentMethod);
        setPpobInvoiceId(draft.invoiceId ?? null);
        setPpobReceiptDraft(draft.receipt ?? null);
        setPpobOpen(true);
        setPpobReviewOpen(draft.returnTo.endsWith("/konfirmasi"));
        setPpobPaymentStatus(draft.pending ? "pending" : "idle");
        setPpobPaymentMessage(draft.pending ? "Invoice QRIS masih menunggu konfirmasi provider." : null);
        setReturnToPpob(draft.returnTo);
        goPpobRoute(draft.returnTo);
      } else {
        setTopupStage("payment");
        setTopupInvoiceId(draft.invoiceId ?? null);
        setTopupStatus(draft.status === "expired" ? "expired" : "pending");
        setTopupPending(draft.status !== "expired");
        setTopupOpen(true);
      }
    } catch { /* malformed session state is ignored safely */ }
  }, [draftKey, draftRestored]);
  useEffect(() => {
    const route = parsePpobPath(routePath);
    if (!route) { setPpobOpen(false); return; }
    setPpobOpen(true);
    setPpobFilter(route.category as typeof ppobFilter);
    if (route.productCode && ppobCatalog) {
      const product = ppobCatalog.find((item) => item.product_code === route.productCode) ?? null;
      setSelectedPpobProduct(product);
      setPpobReviewOpen(route.stage === "konfirmasi");
      if (route.stage === "struk" && product && ppobReceiptDraft) {
        setPpobSuccess({ product, number: ppobCustomerNumber, serialNumber: ppobReceiptDraft.serialNumber, reference: ppobReceiptDraft.reference });
      }
    } else if (!route.productCode) {
      setSelectedPpobProduct(null);
      setPpobReviewOpen(false);
    }
  }, [ppobCatalog, ppobReceiptDraft, routePath]);
  const [reduceMotion] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const entries = wallet?.ledger ?? [];
  const visibleEntries = activityFilter === "all" ? entries : entries.filter((entry) => entry.direction === activityFilter);
  const incoming = wallet?.wallet.total_credited ?? entries.filter((entry) => entry.direction === "credit").reduce((total, entry) => total + entry.amount, 0);
  const outgoing = wallet?.wallet.total_debited ?? entries.filter((entry) => entry.direction === "debit").reduce((total, entry) => total + entry.amount, 0);
  const userId = visible ? profile.source_id : `••••••••${profile.source_id.slice(-4)}`;
  const status = wallet?.wallet.status === "blocked" ? "DIBLOKIR" : "AKTIF";
  const customerHome = navigationContext?.source === "customer" ? `https://djiwatentram.web.id/${encodeURIComponent(navigationContext.username)}` : "https://djiwatentram.web.id/";
  const customerOrder = navigationContext?.source === "customer" ? `${customerHome}/order?step=table` : customerHome;
  const customerCommunity = navigationContext?.source === "customer" ? `${customerHome}/komunitas` : customerHome;
  const customerProfile = navigationContext?.source === "customer" ? `${customerHome}/profile` : customerHome;
  const actionClick = (key: string, label: string) => {
    if (key === "topup") { setTopupStage("detail"); setTopupOpen(true); }
    else if (key === "send" || key === "receive") setWalletAction(key);
    else if (key === "scan") setSoon("Scan QR Djiwa Pay sedang kami siapkan.");
    else if (key === "withdraw") setSoon("Fitur pencairan saldo sedang kami siapkan.");
    else if (key === "history") document.getElementById("activity")?.scrollIntoView({ behavior: "smooth" });
    else if (key === "card") document.querySelector(".wallet-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    else if (key === "help") setSoon("Bantuan Djiwa Pay tersedia melalui customer service.");
    else setSoon(`Fitur ${label} sedang kami siapkan untuk Djiwa Pay.`);
  };
  const presetAmounts = useMemo(() => [50000, 100000, 500000, 1000000], []);
  const submitTopup = async () => {
    if (topupStage === "detail") { setTopupStage("payment"); return; }
    const topupAmount = Number(amount);
    if (!Number.isSafeInteger(topupAmount) || topupAmount < 1000) return;
    if (selectedPpobProduct && returnToPpob) {
      saveDraft({ kind: "ppob", productCode: selectedPpobProduct.product_code, category: ppobFilter, customerNumber: ppobCustomerNumber, amount: selectedPpobProduct.product_price, topupAmount, paymentMethod: ppobPaymentMethod, returnTo: returnToPpob });
    } else {
    saveDraft({ kind: "topup", productCode: "djiwa-pay-topup", category: "topup", customerNumber: "", amount: topupAmount, topupAmount, paymentMethod: "mayar", status: "pending", createdAt: Date.now(), returnTo: "/" });
    }
    setTopupPending(true);
    setTopupStatus("pending");
    try {
      const invoice = await onTopup(topupAmount);
      setTopupInvoiceId(invoice.invoiceId ?? null);
      saveDraft({ kind: "topup", productCode: "djiwa-pay-topup", category: "topup", customerNumber: "", amount: topupAmount, topupAmount, invoiceId: invoice.invoiceId, invoiceUrl: invoice.invoiceUrl, paymentMethod: "mayar", status: "pending", createdAt: Date.now(), returnTo: "/" });
      window.location.assign(invoice.invoiceUrl);
    } catch {
      clearDraft();
      setTopupPending(false);
      setTopupStatus("idle");
    }
  };
  const openTopupForPpob = () => {
    if (!selectedPpobProduct) return;
    const returnTo = ppobProductRoute("konfirmasi");
    setReturnToPpob(returnTo);
    saveDraft({ kind: "ppob", productCode: selectedPpobProduct.product_code, category: ppobFilter, customerNumber: ppobCustomerNumber, amount: selectedPpobProduct.product_price, topupAmount: Number(amount) || 50000, paymentMethod: ppobPaymentMethod, returnTo });
    setPpobOpen(false); setTopupStage("detail"); setTopupOpen(true);
  };
  useEffect(() => {
    if (!ppobOpen || postpaidService || String(ppobFilter) === "all" || ppobCatalog || ppobCatalogLoading) return;
    setPpobCatalogLoading(true); setPpobCatalogError(null);
    readPpobCatalog().then(setPpobCatalog).catch((cause) => setPpobCatalogError(cause instanceof Error ? cause.message : "Katalog PPOB gagal dimuat")).finally(() => setPpobCatalogLoading(false));
  }, [ppobOpen, ppobFilter, ppobCatalog, ppobCatalogLoading, postpaidService]);
  useEffect(() => {
    if (!ppobOpen || !postpaidService || postpaidCatalog) return;
    setPostpaidBusy(true); setPostpaidMessage(null);
    readPostpaidCatalog(postpaidService).then((items) => { setPostpaidCatalog(items); if (items[0]) setPostpaidProductCode(items[0].code); }).catch((cause) => setPostpaidMessage(cause instanceof Error ? cause.message : "Katalog pascabayar gagal dimuat")).finally(() => setPostpaidBusy(false));
  }, [ppobOpen, postpaidService, postpaidCatalog]);
  useEffect(() => {
    if (!selectedPpobProduct || !ppobReviewOpen) return;
    setPpobPaymentMethod((current) => preferredPaymentMethod("ppob", current, wallet?.wallet.available_balance ?? 0, selectedPpobProduct.product_price));
  }, [ppobReviewOpen, selectedPpobProduct?.product_code, selectedPpobProduct?.product_price, wallet?.wallet.available_balance]);
  const payPpob = async () => {
    if (!selectedPpobProduct || !validateCustomerNumber(ppobCustomerNumber).valid) { setPpobPaymentStatus("failed"); setPpobPaymentMessage(validateCustomerNumber(ppobCustomerNumber).message); return; }
    saveDraft({ kind: "ppob", productCode: selectedPpobProduct.product_code, category: ppobFilter, customerNumber: ppobCustomerNumber, amount: selectedPpobProduct.product_price, pending: ppobPaymentMethod === "mayar", invoiceId: ppobPaymentMethod === "mayar" ? ppobInvoiceId ?? undefined : undefined, paymentMethod: ppobPaymentMethod, returnTo: ppobProductRoute("konfirmasi") });
    setPpobPaymentBusy(true); setPpobPaymentStatus("idle"); setPpobPaymentMessage(null);
    try {
      if (ppobPaymentMethod === "mayar") {
        setPpobPaymentStatus("pending");
        setPpobPaymentMessage("Invoice QRIS dibuat. Selesaikan pembayaran di halaman provider.");
        const invoice = await createPpobInvoice(selectedPpobProduct.product_code, ppobCustomerNumber);
        setPpobInvoiceId(invoice.invoiceId ?? null);
        saveDraft({ kind: "ppob", productCode: selectedPpobProduct.product_code, category: ppobFilter, customerNumber: ppobCustomerNumber, amount: selectedPpobProduct.product_price, pending: true, invoiceId: invoice.invoiceId, paymentMethod: ppobPaymentMethod, returnTo: ppobProductRoute("konfirmasi") });
        window.location.assign(invoice.invoiceUrl!);
        return;
      }
      const result = await purchasePpob(selectedPpobProduct.product_code, ppobCustomerNumber);
      applyPpobResult(result);
    } catch (cause) { if (ppobPaymentMethod === "mayar") clearDraft(); setPpobPaymentStatus("failed"); setPpobPaymentMessage(cause instanceof Error ? cause.message : "Pembayaran gagal diproses."); }
    finally { setPpobPaymentBusy(false); }
  };
  const applyPpobResult = (result: PpobPurchaseResult) => {
    setPpobPaymentStatus(result.status === "pending" ? "pending" : result.status === "success" ? "idle" : "failed");
    setPpobPaymentMessage(result.status === "success" ? `Pembayaran berhasil.${result.serialNumber ? ` SN: ${result.serialNumber}` : ""}` : result.status === "pending" ? `Transaksi sedang diproses.${result.refId ? ` Ref: ${result.refId}` : ""}` : (result.error || "Pembayaran gagal."));
    if (result.status === "failed") clearDraft();
    if (selectedPpobProduct && isSettledPpob(result)) {
      const receipt = { serialNumber: result.serialNumber ?? undefined, reference: result.refId ?? undefined };
      saveDraft({ kind: "ppob", productCode: selectedPpobProduct.product_code, category: ppobFilter, customerNumber: ppobCustomerNumber, amount: selectedPpobProduct.product_price, receipt, paymentMethod: ppobPaymentMethod, returnTo: ppobProductRoute("struk") });
      setPpobReceiptDraft(receipt); setPpobInvoiceId(null); goPpobRoute(ppobProductRoute("struk")); setPpobSuccess({ product: selectedPpobProduct, number: ppobCustomerNumber, ...receipt }); setSelectedPpobProduct(null); onRefresh();
    }
  };
  const refreshPpobPayment = async () => {
    if (!ppobInvoiceId || ppobPaymentBusy) { onRefresh(); return; }
    setPpobPaymentBusy(true); setPpobPaymentMessage(null);
    try { applyPpobResult(await checkPpobStatus(ppobInvoiceId)); }
    catch (cause) { setPpobPaymentStatus("failed"); setPpobPaymentMessage(cause instanceof Error ? cause.message : "Status pembayaran belum dapat diperiksa."); }
    finally { setPpobPaymentBusy(false); }
  };
  const refreshTopupPayment = async () => {
    if (!topupInvoiceId || busy) { onRefresh(); return; }
    setTopupStatus("pending");
    try {
      const result = await checkTopupStatus(topupInvoiceId);
      if (result.status === "success") {
        setTopupPending(false);
        setTopupStatus("success");
        clearDraft();
        onRefresh();
      } else if (result.status === "expired") {
        setTopupPending(false);
        setTopupStatus("expired");
        clearDraft();
      }
    } catch {
      setTopupStatus("pending");
    }
  };
  useEffect(() => {
    if (!topupPending || !topupInvoiceId) return;
    const timer = window.setInterval(() => { void refreshTopupPayment(); }, 5000);
    return () => window.clearInterval(timer);
  }, [topupInvoiceId, topupPending, busy]);
  useEffect(() => {
    if (!ppobPaymentStatus || ppobPaymentStatus !== "pending" || !ppobInvoiceId) return;
    const timer = window.setInterval(() => { void refreshPpobPayment(); }, 5000);
    return () => window.clearInterval(timer);
  }, [ppobInvoiceId, ppobPaymentStatus, ppobPaymentBusy]);
  const openPpob = (key: string, label: string) => {
    if (key === "pln-bill" || key === "pdam") {
      const service = key === "pdam" ? "pdam" : "pln";
      setPostpaidService(service); setPostpaidCatalog(null); setPostpaidInquiry(null); setPostpaidProductCode(""); setPostpaidCustomerNumber(""); setPostpaidStage("detail"); setPostpaidMessage(null); setPpobOpen(true); setPpobFilter(key); goPpobRoute(`/ppob/${encodeURIComponent(key)}`); return;
    }
    const providerType = key === "game" ? "game" : ["pln-token", "pln-bill"].includes(key) ? "pln" : key;
    setPpobFilter(providerType);
    setPpobOpen(true);
    goPpobRoute(`/ppob/${encodeURIComponent(providerType)}`);
  };
  const postpaidNumberValidation = postpaidService ? validatePostpaidCustomerNumber(postpaidService, postpaidCustomerNumber) : { valid: false, message: null };
  const submitPostpaidInquiry = async () => {
    if (!postpaidService || !postpaidProductCode || !postpaidNumberValidation.valid) return;
    setPostpaidBusy(true); setPostpaidMessage(null);
    try { const result = await inquirePostpaid(postpaidService, postpaidProductCode, postpaidCustomerNumber); setPostpaidInquiry(result); setPostpaidStage(result.status === "failed" ? "failed" : "confirmation"); }
    catch (cause) { setPostpaidStage("failed"); setPostpaidMessage(cause instanceof Error ? cause.message : "Inquiry tagihan gagal."); }
    finally { setPostpaidBusy(false); }
  };
  const submitPostpaidPayment = async () => {
    if (!postpaidInquiry || postpaidInquiry.status === "failed") return;
    setPostpaidBusy(true); setPostpaidStage("pending"); setPostpaidMessage(null);
    try { const result = await payPostpaid(postpaidInquiry.refId); if (result.status === "success") { setPostpaidStage("success"); setPostpaidInquiry((current) => current ? { ...current, status: "success", message: result.data?.message } : current); onRefresh(); } else if (result.status === "failed") { setPostpaidStage("failed"); setPostpaidMessage(result.error || result.data?.message || "Pembayaran gagal."); } else { setPostpaidStage("pending"); setPostpaidMessage(result.data?.message || "Pembayaran sedang diproses."); } }
    catch (cause) { setPostpaidStage("pending"); setPostpaidMessage(cause instanceof Error ? cause.message : "Status pembayaran belum tersedia."); }
    finally { setPostpaidBusy(false); }
  };
  const refreshPostpaidStatus = async () => {
    if (!postpaidInquiry || postpaidBusy) return;
    setPostpaidBusy(true);
    try { const result = await checkPostpaidStatus(postpaidInquiry.refId); if (result.status === "success") setPostpaidStage("success"); else if (result.status === "failed") { setPostpaidStage("failed"); setPostpaidMessage(result.error || result.data?.message || "Pembayaran gagal."); } else setPostpaidStage("pending"); }
    finally { setPostpaidBusy(false); }
  };
  const operatorName = (product: PpobProduct) => { const source = `${product.product_description} ${product.product_code} ${product.icon_url}`.toLowerCase(); if (source.includes("axis")) return "AXIS"; if (source.includes("indosat") || source.includes("isat")) return "Indosat"; if (source.includes("byu") || source.includes("by.u")) return "by.U"; if (source.includes("telkomsel") || source.includes("tsel")) return "Telkomsel"; if (source.includes("tri") || source.includes("three")) return "Tri"; if (source.includes("smartfren")) return "Smartfren"; return "Lainnya"; };
  const ppobOperatorProducts = (ppobCatalog ?? []).filter((product) => product.product_type.toLowerCase() === ppobFilter);
  const ppobOperators = Array.from(new Set(ppobOperatorProducts.map(operatorName))).sort();
  const operatorLogo = (operator: string) => ppobOperatorProducts.find((product) => operatorName(product) === operator)?.icon_url || null;
  const visibleProducts = (ppobCatalog ?? []).filter((product) => ppobFilter !== "all" && product.product_type.toLowerCase() === ppobFilter && (ppobOperator === "all" || operatorName(product) === ppobOperator) && `${product.product_description} ${product.product_nominal} ${product.product_code}`.toLowerCase().includes(ppobQuery.toLowerCase())).sort((a, b) => ppobSort === "price-asc" ? a.product_price - b.product_price : ppobSort === "price-desc" ? b.product_price - a.product_price : ppobSort === "name" ? a.product_description.localeCompare(b.product_description) : 0).slice(0, 40);
  const ppobValidation = validateCustomerNumber(ppobCustomerNumber);
  const ppobBalance = wallet?.wallet.available_balance ?? 0;
  const ppobPaymentNotice = ppobPaymentStatus === "pending" && ppobPaymentMessage
    ? <div className="djiwa-payment-notice is-warning" role="status"><strong>Transaksi masih diproses</strong><small>{ppobPaymentMessage} Jangan kirim ulang sampai status provider berubah.</small><button type="button" className="djiwa-payment-notice-action" onClick={() => void refreshPpobPayment()} disabled={ppobPaymentBusy}>{ppobPaymentBusy ? "Memeriksa..." : ppobInvoiceId ? "Periksa status" : "Perbarui saldo"}</button></div>
    : ppobReviewOpen && selectedPpobProduct && ppobPaymentMethod === "mayar" && ppobBalance < selectedPpobProduct.product_price
      ? <div className="djiwa-payment-notice is-info" role="status"><strong>QRIS dipilih otomatis</strong><small>Saldo Djiwa Pay belum mencukupi, jadi pembayaran dialihkan ke QRIS.</small></div>
      : null;
  if (Boolean(ppobSuccess)) return (
    <main className="pay-page djiwa-checkout-page">
      <DjiwaPaySuccess
        productName={ppobSuccess!.product.product_description}
        operator={operatorName(ppobSuccess!.product)}
        customerNumber={ppobSuccess!.number}
        amount={ppobSuccess!.product.product_price}
        serialNumber={ppobSuccess!.serialNumber}
        reference={ppobSuccess!.reference}
        onDone={() => { setPpobReceiptDraft(null); clearDraft(); closePpob(); }}
      />
    </main>
  );
  if (ppobOpen && postpaidService) return (
    <main className="pay-page ppob-page djiwa-checkout-page ppob-detail-active"><section className="ppob-page-card postpaid-checkout-card">
      <button className="ppob-step-back" onClick={closePpob} aria-label="Kembali">← Kembali</button><span className="ppob-step-label">PEMBAYARAN {postpaidService === "pln" ? "PLN" : "PDAM"}</span><h1>{postpaidService === "pln" ? "Tagihan PLN" : "Tagihan PDAM"}</h1><p>Masukkan nomor pelanggan untuk melihat tagihan terbaru sebelum membayar.</p>
      {postpaidStage === "success" ? <div className="djiwa-payment-notice is-success" role="status"><strong>Pembayaran berhasil</strong><small>Tagihan {postpaidService.toUpperCase()} sudah dibayar. Ref: {postpaidInquiry?.refId}</small><button className="primary-action" onClick={closePpob}>Selesai</button></div> : <>
        {postpaidBusy && !postpaidCatalog ? <div className="ppob-page-empty">Memuat produk tagihan...</div> : null}
        {postpaidCatalog?.length ? <label className="djiwa-checkout-field"><span className="djiwa-checkout-label">Jenis layanan</span><select className="ppob-customer-input" value={postpaidProductCode} onChange={(event) => setPostpaidProductCode(event.target.value)}>{postpaidCatalog.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label> : null}
        <label className="djiwa-checkout-field"><span className="djiwa-checkout-label">Nomor pelanggan <em>*</em></span><input className="ppob-customer-input" inputMode="numeric" value={postpaidCustomerNumber} onChange={(event) => setPostpaidCustomerNumber(event.target.value.replace(/\D/g, "").slice(0, 20))} placeholder={postpaidService === "pln" ? "11–13 digit ID pelanggan" : "Nomor pelanggan PDAM"} /></label>
        {!postpaidNumberValidation.valid && postpaidCustomerNumber ? <small className="djiwa-checkout-hint">{postpaidNumberValidation.message}</small> : null}
        {postpaidInquiry && postpaidStage !== "detail" ? <div className="ppob-customer-summary"><div><span>Nama pelanggan</span><strong>{postpaidInquiry.customerName || "-"}</strong></div><div><span>Periode</span><strong>{postpaidInquiry.period || "-"}</strong></div><div><span>Tagihan</span><strong>{money(postpaidInquiry.billAmount)}</strong></div><div><span>Biaya admin</span><strong>{money(postpaidInquiry.adminFee)}</strong></div><div className="is-total"><span>Total pembayaran</span><strong>{money(postpaidTotal(postpaidInquiry.billAmount, postpaidInquiry.adminFee))}</strong></div></div> : null}
        {postpaidMessage ? <div className="ppob-payment-message" role="alert">{postpaidMessage}</div> : null}
        {postpaidStage === "pending" ? <div className="djiwa-payment-notice is-warning" role="status"><strong>Pembayaran sedang diproses</strong><small>Saldo tetap ditahan sampai provider memberi hasil definitif.</small><button className="djiwa-payment-notice-action" onClick={() => void refreshPostpaidStatus()} disabled={postpaidBusy}>{postpaidBusy ? "Memeriksa..." : "Periksa status"}</button></div> : null}
        <div className="checkout-actions"><button className="ppob-checkout-back" onClick={() => postpaidStage === "confirmation" ? setPostpaidStage("detail") : closePpob()}>Kembali</button>{postpaidStage === "confirmation" ? <button className="primary-action" onClick={() => void submitPostpaidPayment()} disabled={postpaidBusy}>{postpaidBusy ? "Memproses..." : `Bayar ${money(postpaidInquiry?.totalAmount || 0)}`}</button> : <button className="primary-action" onClick={() => void submitPostpaidInquiry()} disabled={postpaidBusy || !postpaidProductCode || !postpaidNumberValidation.valid}>{postpaidBusy ? "Memeriksa..." : "Lihat tagihan"}</button>}</div>
      </>}
    </section></main>
  );
  if (ppobOpen && selectedPpobProduct) return (
    <main className="pay-page ppob-page djiwa-checkout-page ppob-detail-active">
      <DjiwaPayCheckout
        kind="ppob"
        stage={ppobReviewOpen ? "payment" : "detail"}
        amount={selectedPpobProduct.product_price}
        productId={selectedPpobProduct.product_code}
        productName={`Paket ${Number(selectedPpobProduct.product_nominal).toLocaleString("id-ID")}`}
        productDescription={operatorName(selectedPpobProduct)}
        customerNumber={ppobCustomerNumber}
        onCustomerNumberChange={setPpobCustomerNumber}
        recentCustomerNumbers={recentCustomerNumbers}
        onSelectCustomerNumber={setPpobCustomerNumber}
        favoriteCustomerNumbers={favoriteCustomerNumbers}
        onToggleFavoriteCustomerNumber={toggleFavoriteCustomerNumber}
        paymentMethod={ppobPaymentMethod}
        onPaymentMethodChange={setPpobPaymentMethod}
        walletBalance={ppobBalance}
        fieldError={checkoutCustomerNumberHint(ppobCustomerNumber)}
        error={ppobPaymentStatus === "failed" ? ppobPaymentMessage : null}
        notice={ppobPaymentNotice}
        busy={ppobPaymentBusy}
        pending={ppobPaymentStatus === "pending"}
        onTopup={openTopupForPpob}
        onBack={() => { if (ppobReviewOpen) { setPpobReviewOpen(false); goPpobRoute(ppobProductRoute("detail")); } else { setSelectedPpobProduct(null); goPpobRoute(`/ppob/${encodeURIComponent(ppobFilter)}`); } }}
        onPrimary={() => { if (!ppobReviewOpen) { if (ppobValidation.valid) { rememberCustomerNumber(ppobCustomerNumber); setPpobPaymentMethod(preferredPaymentMethod("ppob", ppobPaymentMethod, ppobBalance, selectedPpobProduct.product_price)); setPpobReviewOpen(true); goPpobRoute(ppobProductRoute("konfirmasi")); } return; } void payPpob(); }}
      />
    </main>
  );
  if (ppobOpen) return (<main className={`pay-page ppob-page djiwa-checkout-page ${selectedPpobProduct ? "ppob-detail-active" : ""}`}><header className="ppob-page-header"><button className="ppob-page-back" onClick={closePpob} aria-label="Kembali">←</button><div><span className="eyebrow">DJIWA PAY</span><h1>Pembayaran PPOB</h1><p>{String(ppobFilter) === "all" ? "Pilih layanan PPOB yang ingin dibayar." : `Pilih brand/operator untuk ${ppobFilter.toUpperCase()}.`}</p></div></header>{String(ppobFilter) === "all" ? <section className="ppob-page-card"><div className="ppob-page-label">1. PILIH KATEGORI</div><div className="ppob-category-row">{ppobServices.map(([key, label, description, Icon, color]) => <button key={key} className={`ppob-category ${ppobFilter === (key === "game" ? "game" : key === "pln-token" ? "pln" : key) ? "selected" : ""}`} onClick={() => { openPpob(key, label); setPpobOperator("all"); setSelectedPpobProduct(null); }}><span className={`ppob-tile-icon ${color}`}><Icon size={18} /></span><strong>{label}</strong><small>{description}</small></button>)}</div></section> : null}{String(ppobFilter) === "all" ? <div className="ppob-page-empty"><strong>Pilih kategori terlebih dahulu</strong><span>Produk tidak ditampilkan sebelum kategori dipilih.</span></div> : ppobCatalogLoading ? <div className="ppob-page-empty">Memuat brand/operator dari IAK...</div> : ppobCatalogError ? <div className="ppob-page-empty error">{ppobCatalogError}</div> : ppobOperator === "all" ? <section className="ppob-page-card"><div className="ppob-products-heading"><div><div className="ppob-page-label">2. PILIH BRAND / OPERATOR</div><strong>Operator {ppobFilter.toUpperCase()}</strong></div><span>{ppobOperators.length} brand</span></div><div className="ppob-operator-grid"><button className="ppob-operator-card" onClick={() => setPpobOperator("all")}><span className="operator-fallback">ALL</span><strong>Semua brand</strong><small>Lihat seluruh operator</small></button>{ppobOperators.map((operator) => <button key={operator} className="ppob-operator-card" onClick={() => setPpobOperator(operator)}>{operatorLogo(operator) && operatorLogo(operator) !== "-" ? <img src={operatorLogo(operator) ?? undefined} alt="" /> : <span className="operator-fallback">{operator.slice(0, 1)}</span>}<strong>{operator}</strong><small>Pilih produk</small></button>)}</div></section> : <section className="ppob-page-card"><div className="ppob-products-heading"><div><button className="ppob-change-operator" onClick={() => { setPpobOperator("all"); setSelectedPpobProduct(null); }}>← Ganti operator</button><div className="ppob-page-label">3. PILIH PRODUK</div><strong>{ppobOperator} · {ppobFilter.toUpperCase()}</strong></div><span>{visibleProducts.length} produk</span></div><label className="ppob-search"><span>⌕</span><input value={ppobQuery} onChange={(event) => setPpobQuery(event.target.value)} placeholder="Cari produk atau kode" /></label><div className="ppob-sort-row"><span>Daftar produk</span><select value={ppobSort} onChange={(event) => setPpobSort(event.target.value as typeof ppobSort)}><option value="default">Default</option><option value="price-asc">Harga terendah</option><option value="price-desc">Harga tertinggi</option><option value="name">Nama produk</option></select></div><div className="ppob-product-table" role="table"><div className="ppob-product-table-head" role="row"><span>PRODUK</span><span>HARGA</span></div>{visibleProducts.length ? visibleProducts.map((product) => <button className={`ppob-product-table-row ${selectedPpobProduct?.product_code === product.product_code ? "selected" : ""}`} key={product.product_code} onClick={() => { setSelectedPpobProduct(product); goPpobRoute(ppobProductRoute("detail", product)); }}><span className="ppob-product-name"><strong>Paket {Number(product.product_nominal).toLocaleString("id-ID")}</strong></span><b>{money(product.product_price)}</b><span className="ppob-buy-button">Beli</span></button>) : <div className="ppob-page-empty">Produk tidak ditemukan.</div>}</div>{selectedPpobProduct ? <div className="ppob-selection ppob-step-page">
        <button className="ppob-step-back" onClick={() => { setSelectedPpobProduct(null); setPpobReviewOpen(false); goPpobRoute(`/ppob/${encodeURIComponent(ppobFilter)}`); }} aria-label="Kembali ke daftar produk">← Produk</button>
        {!ppobReviewOpen ? <>
          <span className="ppob-step-label">LANGKAH 2 DARI 3</span>
          <strong>Detail Pembelian</strong>
          <span>{operatorName(selectedPpobProduct)} · {selectedPpobProduct.product_description.toLowerCase() === operatorName(selectedPpobProduct).toLowerCase() ? selectedPpobProduct.product_nominal : selectedPpobProduct.product_description}</span>
          <b>{money(selectedPpobProduct.product_price)}</b>
          <small>Nomor ini dipakai sebagai tujuan pengiriman pulsa/data.</small>
          <input className="ppob-customer-input" inputMode="numeric" value={ppobCustomerNumber} onChange={(event) => setPpobCustomerNumber(event.target.value.replace(/\D/g, "").slice(0, 20))} placeholder="08xxxxxxxxxx" aria-label="Nomor pelanggan" autoFocus />
          <button className="primary-action ppob-pay-button" onClick={() => { setPpobPaymentMethod("wallet"); setPpobReviewOpen(true); goPpobRoute(ppobProductRoute("konfirmasi")); }} disabled={!/^[0-9]{8,20}$/.test(ppobCustomerNumber)}>Lanjutkan</button>
        </> : <>
          <div className="ppob-customer-checkout-header">
            <div className="ppob-customer-checkout-icon"><Wallet size={16} /></div>
            <div>
              <p>Langkah 2 dari 3 · Pembayaran</p>
              <h2>Pilih metode pembayaran</h2>
            </div>
          </div>
          <div className="ppob-checkout-card ppob-customer-checkout-card">
            <CheckoutSection className="ppob-customer-payment-card">
              <div className="ppob-customer-section-heading"><CreditCard size={14} /><h3>Pilih pembayaran</h3></div>
              <div className="ppob-customer-payment-methods" role="radiogroup" aria-label="Metode pembayaran">
                <PaymentMethodCard>
                  <div className={ppobPaymentMethod === "wallet" && (wallet?.wallet.available_balance ?? 0) >= selectedPpobProduct.product_price ? "ppob-customer-payment-option is-selected" : (wallet?.wallet.available_balance ?? 0) < selectedPpobProduct.product_price ? "ppob-customer-payment-option is-insufficient" : "ppob-customer-payment-option"}>
                    <button type="button" role="radio" aria-checked={ppobPaymentMethod === "wallet" && (wallet?.wallet.available_balance ?? 0) >= selectedPpobProduct.product_price} aria-disabled={(wallet?.wallet.available_balance ?? 0) < selectedPpobProduct.product_price} disabled={(wallet?.wallet.available_balance ?? 0) < selectedPpobProduct.product_price} onClick={() => setPpobPaymentMethod("wallet")}>
                      <span><strong>Djiwa Pay</strong><small>{(wallet?.wallet.available_balance ?? 0) < selectedPpobProduct.product_price ? `Saldo tersedia ${money(wallet?.wallet.available_balance ?? 0)}, masih kurang ${money(selectedPpobProduct.product_price - (wallet?.wallet.available_balance ?? 0))}.` : "Bayar langsung dari saldo Djiwa Pay"}</small></span>
                      <span aria-hidden="true" className={`ppob-customer-radio${ppobPaymentMethod === "wallet" && (wallet?.wallet.available_balance ?? 0) >= selectedPpobProduct.product_price ? " is-checked" : ""}`}>{ppobPaymentMethod === "wallet" && (wallet?.wallet.available_balance ?? 0) >= selectedPpobProduct.product_price ? <span className="ppob-customer-radio-dot" /> : null}</span>
                    </button>
                    {(wallet?.wallet.available_balance ?? 0) < selectedPpobProduct.product_price ? <div className="ppob-customer-insufficient-row"><p>Isi saldo Djiwa Pay dulu sebelum menggunakan metode ini.</p><button type="button" onClick={() => { setPpobOpen(false); setTopupOpen(true); }}>Top up</button></div> : null}
                  </div>
                </PaymentMethodCard>
                <PaymentMethodCard>
                  <div className={ppobPaymentMethod === "mayar" ? "ppob-customer-payment-option is-selected" : "ppob-customer-payment-option"}>
                    <button type="button" role="radio" aria-checked={ppobPaymentMethod === "mayar"} onClick={() => setPpobPaymentMethod("mayar")}>
                      <span><strong>QRIS</strong><small>Bayar cepat dan cashierless dengan QRIS</small></span>
                      <span aria-hidden="true" className={`ppob-customer-radio${ppobPaymentMethod === "mayar" ? " is-checked" : ""}`}>{ppobPaymentMethod === "mayar" ? <span className="ppob-customer-radio-dot" /> : null}</span>
                    </button>
                  </div>
                </PaymentMethodCard>
              </div>
            </CheckoutSection>
            {ppobPaymentMessage ? <div className="ppob-payment-message" role="alert">{ppobPaymentMessage}</div> : null}
            <OrderSummary className="ppob-customer-order-summary">
              <div className="ppob-customer-summary-rows">
                <div><span>Operator</span><strong>{operatorName(selectedPpobProduct)}</strong></div>
                <div><span>Produk</span><strong>Paket {Number(selectedPpobProduct.product_nominal).toLocaleString("id-ID")}</strong></div>
                <div><span>Nomor tujuan</span><strong>{ppobCustomerNumber}</strong></div>
                <div className="is-total"><span>Total pembayaran</span><strong>{money(selectedPpobProduct.product_price)}</strong></div>
              </div>
              <div className={`ppob-reward-note ppob-customer-reward-note ${ppobPaymentMethod === "wallet" ? "is-wallet" : ""}`}>{ppobPaymentMethod === "wallet" ? "Bayar dengan Djiwa Pay dan dapatkan saldo Djiwa Pay +Rp1.000 setelah transaksi berhasil." : "Reward +Rp1.000 saldo Djiwa Pay diberikan setelah transaksi berhasil."}</div>
              <CheckoutActionBar className="ppob-customer-action-bar">
                <button type="button" className="ppob-checkout-back" onClick={() => { setPpobReviewOpen(false); goPpobRoute(ppobProductRoute("detail")); }}>← Kembali</button>
                <button type="button" className="primary-action ppob-pay-button" onClick={payPpob} disabled={ppobPaymentBusy || (ppobPaymentMethod === "wallet" && (wallet?.wallet.available_balance ?? 0) < selectedPpobProduct.product_price)}>{ppobPaymentBusy ? "Memproses..." : `Bayar ${money(selectedPpobProduct.product_price)}`}</button>
              </CheckoutActionBar>
            </OrderSummary>
          </div>
        </>}
      </div> : null}</section>}</main>);
  if (topupOpen) return (
    <main className="pay-page djiwa-checkout-page">
      <DjiwaPayCheckout
        kind="topup"
        stage={topupStage}
        amount={Number(amount) || 0}
        productId="djiwa-pay-topup"
        productName="Isi saldo Djiwa Pay"
        productDescription="QRIS Mayar"
        amountEditor={<div className="djiwa-checkout-field"><span className="djiwa-checkout-label">Nominal isi saldo</span><div className="djiwa-amount-presets">{presetAmounts.map((value) => <button key={value} type="button" className={Number(amount) === value ? "is-selected" : ""} onClick={() => setAmount(String(value))}>{money(value)}</button>)}</div><label className="djiwa-amount-input"><span>Rp</span><input aria-label="Nominal isi saldo" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.currentTarget.value.replace(/\D/g, "").slice(0, 8))} placeholder="1000" /></label><small className="djiwa-checkout-hint">Minimal top-up Rp1.000. Saldo masuk setelah pembayaran QRIS terkonfirmasi.</small></div>}
        paymentMethod="mayar"
        onPaymentMethodChange={() => undefined}
        walletBalance={wallet?.wallet.available_balance ?? 0}
        busy={busy}
        pending={topupPending}
        notice={topupStatus === "success" ? <div className="djiwa-payment-notice is-success" role="status"><strong>Top up berhasil</strong><small>Saldo Djiwa Pay sudah diperbarui.</small></div> : topupStatus === "expired" ? <div className="djiwa-payment-notice is-warning" role="alert"><strong>Invoice top up kedaluwarsa</strong><small>Buat invoice baru untuk mencoba pembayaran lagi.</small></div> : topupPending ? <div className="djiwa-payment-notice is-warning" role="status"><strong>Invoice top-up masih menunggu konfirmasi</strong><small>Status akan diperiksa otomatis. Anda juga dapat memeriksanya sekarang.</small><button type="button" className="djiwa-payment-notice-action" onClick={() => void refreshTopupPayment()} disabled={busy}>{busy ? "Memeriksa..." : "Periksa status"}</button></div> : null}
        onBack={() => { if (topupStage === "payment" && topupPending) { setTopupPending(false); setTopupStatus("idle"); clearDraft(); setTopupStage("detail"); return; } if (topupStage === "payment") setTopupStage("detail"); else { setTopupOpen(false); clearDraft(); if (returnToPpob) { setPpobOpen(true); setPpobReviewOpen(true); goPpobRoute(returnToPpob); } setReturnToPpob(null); } }}
        onPrimary={submitTopup}
      />
    </main>
  );
  if (!wallet && error) return (
    <main className="pay-page">
      <section className="surface wallet-unavailable" role="alert">
        <span className="eyebrow">DJIWA PAY</span>
        <h1>Saldo belum dapat dimuat</h1>
        <p>{error}</p>
        <button type="button" className="primary-action" onClick={onRefresh} disabled={loading}>{loading ? "Mencoba lagi…" : "Coba lagi"}</button>
      </section>
    </main>
  );
  return <main className="pay-page">
    <header className="pay-header"><button className="round-control" onClick={() => window.location.assign(customerHome)} aria-label="Kembali ke Djiwa Tentram">‹</button><div><h1>Saldo Djiwa Pay</h1><small>Digital wallet</small></div><button className="round-control" onClick={onRefresh} disabled={loading} aria-label="Segarkan saldo"><RefreshCw size={16} className={loading ? "spin" : ""} /></button></header>
    <motion.section className="wallet-card" aria-label="Ringkasan saldo Djiwa Pay" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}><img src="/assets/djiwa-pay-abstract-3d.png" alt="" aria-hidden="true" className="wallet-art" /><div className="wallet-overlay" />{!reduceMotion ? <motion.div className="wallet-shine" aria-hidden="true" animate={{ x: [0, 360, 720] }} transition={{ duration: 4.8, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }} /> : null}<div className="wallet-content"><div className="wallet-card-top"><div className="wallet-brand"><span className="wallet-brand-mark"><Wallet size={15} /></span><span>DJIWA PAY<small>Digital wallet</small></span></div><span className="wallet-status">{status}</span></div><div className="wallet-balance-label">Saldo tersedia</div><motion.strong className="wallet-balance" initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }} animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }} transition={{ delay: 0.12, duration: 0.32, ease: [0.32, 0.72, 0, 1] }}>{loading ? "••••••" : visible ? money(wallet?.wallet.available_balance ?? 0) : "••••••"}</motion.strong><div className="wallet-card-bottom"><div className="wallet-identity"><b>{profile.name ?? profile.email ?? "Customer"}</b><small title={userId}><span>USER ID</span><strong>{userId}</strong></small></div><div className="wallet-controls"><button className="wallet-card-icon" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Sembunyikan saldo" : "Tampilkan saldo"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button><button className="wallet-card-icon" onClick={onRefresh} aria-label="Segarkan saldo"><RefreshCw size={16} /></button></div></div></div></motion.section>
    <section className="surface ppob-section" aria-labelledby="ppob-title">
      <div className="section-heading ppob-heading"><div><span className="eyebrow">LAYANAN DIGITAL</span><h2 id="ppob-title">Pembayaran PPOB</h2><p>Bayar kebutuhan harian dari satu saldo.</p></div><button className="ppob-more" onClick={() => { setPpobOpen(true); goPpobRoute("/ppob"); }}>Lihat semua</button></div>
      <div className="ppob-grid">{ppobServices.slice(0, 8).map(([key, label, description, Icon, color]) => <button key={key} className="ppob-tile" onClick={() => openPpob(key, label)} aria-label={`${label}, ${description}`}><span className={`ppob-tile-icon ${color}`}><Icon size={19} strokeWidth={2.2} /></span><strong>{label}</strong><small>{description}</small></button>)}</div>
    </section>
    {error ? <section className="inline-error" role="alert">{error}</section> : null}
    <section className="surface quick-actions" aria-labelledby="quick-actions-title"><div className="section-heading"><div><span className="eyebrow">DJIWA PAY</span><h2 id="quick-actions-title">Aksi cepat</h2></div><Wallet size={17} /></div><div className="action-grid">{actions.map(([key, label, asset, supported, badge, color]) => <button key={key} className="action-item" onClick={() => actionClick(key, label)} aria-label={supported ? label : `${label}, segera hadir`}><span className={`action-badge ${color}`}>{badge}</span><span className="action-icon"><img src={`/assets/djiwa-pay-actions/${asset}`} alt="" aria-hidden="true" loading="lazy" decoding="async" /></span><span>{label}</span></button>)}</div></section>
    <div className="summary-grid"><section className="summary-card"><span>Total masuk</span><strong className="credit-text">{money(incoming)}</strong></section><section className="summary-card"><span>Total digunakan</span><strong className="debit-text">{money(outgoing)}</strong></section></div>
    <section id="activity" className="surface activity-card"><div className="section-heading"><div><span className="eyebrow">AKTIVITAS</span><h2>Riwayat Djiwa Pay</h2></div><select className="month-control activity-filter" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as typeof activityFilter)} aria-label="Filter riwayat transaksi"><option value="all">Semua transaksi</option><option value="credit">Saldo masuk</option><option value="debit">Saldo keluar</option></select></div>{loading ? <div className="activity-empty">Memuat transaksi...</div> : entries.length === 0 ? <div className="activity-empty"><strong>Belum ada transaksi</strong><span>Transaksi top up dan pembayaran akan muncul di sini.</span></div> : visibleEntries.length === 0 ? <div className="activity-empty">Tidak ada transaksi pada filter ini.</div> : <div className="activity-list">{visibleEntries.map((entry) => <button type="button" className="activity-row activity-row-button" key={entry.id} onClick={() => setSelectedEntry(entry)}><span className={`activity-icon ${entry.direction}`} >{entry.direction === "credit" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span><span className="activity-copy"><b>{labels[entry.transaction_type] ?? "Transaksi saldo"}</b><small>{date(entry.created_at)}{entry.note ? ` · ${entry.note}` : ""}</small></span><strong className={entry.direction === "credit" ? "credit-text" : "debit-text"}>{entry.direction === "credit" ? "+" : "-"}{money(entry.amount)}</strong></button>)}</div>}</section>
    {selectedEntry ? <div className="activity-detail-backdrop" role="presentation" onClick={() => setSelectedEntry(null)}><section className="activity-detail" role="dialog" aria-modal="true" aria-labelledby="activity-detail-title" onClick={(event) => event.stopPropagation()}><button type="button" className="activity-detail-close" onClick={() => setSelectedEntry(null)} aria-label="Tutup detail transaksi">×</button><span className={`activity-icon ${selectedEntry.direction}`}>{selectedEntry.direction === "credit" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span><h2 id="activity-detail-title">{labels[selectedEntry.transaction_type] ?? "Transaksi saldo"}</h2><strong className={selectedEntry.direction === "credit" ? "credit-text" : "debit-text"}>{selectedEntry.direction === "credit" ? "+" : "-"}{money(selectedEntry.amount)}</strong><p>{date(selectedEntry.created_at)}</p>{selectedEntry.note ? <small>{selectedEntry.note}</small> : null}<button type="button" className="primary-action" onClick={() => { void navigator.clipboard?.writeText(String(selectedEntry.id)); }}>Salin ID transaksi</button></section></div> : null}
    {walletAction === "send" || walletAction === "receive" ? <DjiwaPayWalletAction mode={walletAction} profile={profile} balance={wallet?.wallet.available_balance ?? 0} initialRecipient={transferRecipient} onClose={() => { setTransferRecipient(""); setWalletAction(null); }} onSuccess={(message) => { setTransferRecipient(""); setWalletAction(null); if (message) setSoon(message); onRefresh(); }} /> : null}
    <section id="topup" className="topup-panel" aria-hidden="true" />
    {topupOpen ? <div className="sheet-backdrop" role="presentation" onClick={() => !busy && setTopupOpen(false)}><section className="topup-sheet" role="dialog" aria-modal="true" aria-labelledby="topup-title" onClick={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-header"><button className="sheet-close" onClick={() => setTopupOpen(false)} disabled={busy} aria-label="Tutup isi saldo">‹</button><h2 id="topup-title">Isi Saldo</h2><span className="sheet-spacer" /></div><div className="sheet-transfer"><div className="sheet-transfer-party"><div><small>Dari</small><b>Customer{profile.name ? ` · ${profile.name}` : ""}</b></div><Wallet size={20} aria-hidden="true" /></div><div className="sheet-transfer-divider" /><div className="sheet-transfer-party"><div><small>Ke</small><b>Saldo Djiwa Pay</b></div><Wallet size={20} aria-hidden="true" /></div></div><span className="sheet-eyebrow">NOMINAL CEPAT</span><div className="amount-options">{presetAmounts.map((value) => <button key={value} className={Number(amount) === value ? "selected" : ""} onClick={() => setAmount(String(value))}>{money(value)}</button>)}</div><div className="sheet-amount"><span>NOMINAL ISI SALDO</span><strong>{money(Number(amount) || 0)}</strong><small>Minimum isi saldo Rp1.000</small></div><div className="keypad" aria-label="Keypad nominal isi saldo">{["1","2","3","4","5","6","7","8","9","","0","delete"].map((key,index) => key ? <button key={key} type="button" onClick={() => setAmount((value) => applyTopupKey(value, key))} aria-label={key === "delete" ? "Hapus satu angka" : `Angka ${key}`}>{key === "delete" ? "⌫" : key}</button> : <span key={`empty-${index}`} aria-hidden="true" />)}</div><button className="primary-action sheet-submit" onClick={() => onTopup(Number(amount))} disabled={busy || !normalizeTopupAmount(amount).valid}>{busy ? "Menyiapkan QRIS Mayar..." : "Lanjutkan"}</button></section></div> : null}
    {ppobOpen ? <div className="ppob-backdrop" role="presentation" onClick={closePpob}><section className="ppob-sheet" role="dialog" aria-modal="true" aria-labelledby="ppob-sheet-title" onClick={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-header"><button className="sheet-close" onClick={closePpob} aria-label="Tutup daftar PPOB"><X size={18} /></button><h2 id="ppob-sheet-title">Semua layanan PPOB</h2><span className="sheet-spacer" /></div><p className="ppob-sheet-copy">Pilih layanan yang ingin dibayar dengan saldo Djiwa Pay.</p><div className="ppob-grid ppob-grid-sheet">{ppobServices.map(([key, label, description, Icon, color]) => <button key={key} className={`ppob-tile ${ppobFilter === (key === "game" ? "game" : key === "pln-token" ? "pln" : key) ? "selected" : ""}`} onClick={() => openPpob(key, label)}><span className={`ppob-tile-icon ${color}`}><Icon size={19} strokeWidth={2.2} /></span><strong>{label}</strong><small>{description}</small></button>)}</div>{String(ppobFilter) === "all" ? <div className="ppob-catalog-state">Pilih kategori terlebih dahulu untuk melihat produk.</div> : ppobCatalogLoading ? <div className="ppob-catalog-state">Memuat katalog dari IAK...</div> : ppobCatalogError ? <div className="ppob-catalog-state error">{ppobCatalogError}</div> : ppobCatalog ? <div className="ppob-products"><div className="ppob-products-heading"><strong>{String(ppobFilter) === "all" ? "Produk aktif" : `Produk ${ppobFilter.toUpperCase()}`}</strong><span>{visibleProducts.length} ditampilkan / {ppobCatalog.length} total</span></div>{visibleProducts.length ? visibleProducts.map((product) => <button className="ppob-product" key={product.product_code} onClick={() => { setSelectedPpobProduct(product); goPpobRoute(ppobProductRoute("detail", product)); }}><span className="ppob-product-name"><strong>Paket {Number(product.product_nominal).toLocaleString("id-ID")}</strong></span><b>{money(product.product_price)}</b><span className="ppob-buy-button">Beli</span></button>) : <div className="ppob-catalog-state">Belum ada produk pada kategori ini.</div>}</div> : null}</section></div> : null}
    {ppobSuccess ? <main className="pay-page djiwa-checkout-page"><DjiwaPaySuccess productName={ppobSuccess.product.product_description} operator={operatorName(ppobSuccess.product)} customerNumber={ppobSuccess.number} amount={ppobSuccess.product.product_price} serialNumber={ppobSuccess.serialNumber} reference={ppobSuccess.reference} onDone={() => { setPpobSuccess(null); setPpobOpen(false); goPpobRoute("/"); }} /></main> : null}{soon ? <div className="soon-backdrop" role="presentation" onClick={() => setSoon(null)}><section className="soon-dialog" role="dialog" aria-modal="true" aria-labelledby="soon-title" onClick={(event) => event.stopPropagation()}><button className="soon-close" onClick={() => setSoon(null)} aria-label="Tutup"><X size={16} /></button><HelpCircle size={28} /><h2 id="soon-title">Segera hadir</h2><p>{soon}</p></section></div> : null}
    <footer className="pay-footer">Djiwa Pay · Wallet digital Djiwa Tentram</footer><nav className="bottom-nav" aria-label="Navigasi utama"><a href={customerHome}><Djiwa3DIcon name="navigation-home" size="micro" alt="" /><span>Home</span></a><a href={customerOrder}><Djiwa3DIcon name="navigation-order" size="micro" alt="" /><span>Pesan</span></a><a href={customerCommunity}><Djiwa3DIcon name="navigation-community" size="micro" alt="" /><span>Komunitas</span></a><button className="active"><Djiwa3DIcon name="navigation-wallet" size="micro" alt="" /><span>Saldo</span></button><a href={customerProfile}><Djiwa3DIcon name="navigation-profile" size="micro" alt="" /><span>Profil</span></a></nav>
  </main>;
}
