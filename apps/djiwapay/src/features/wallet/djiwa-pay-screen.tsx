import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, Bell, Car, CheckCheck, CreditCard, Droplets, Eye, EyeOff, Gamepad2, HeartPulse, HelpCircle, House, ReceiptText, RefreshCw, ScanLine, Smartphone, Tv, UserRound, Wallet, Wifi, X, Zap } from "lucide-react";
import { checkPpobStatus, checkTopupStatus, checkPostpaidStatus, createPpobInvoice, inquirePostpaid, markAllWalletNotificationsRead, markWalletNotificationRead, payPostpaid, ppobProductName, purchasePpob, readPpobCatalog, readPostpaidCatalog, readWalletNotifications, type PpobProduct, type PpobPurchaseResult, type PostpaidInquiry, type PostpaidProduct, type WalletNotification, type WalletResponse, type WalletTransaction, transactionMethodLine } from "../../lib/wallet-adapter";
import { Djiwa3DIcon } from "@djiwaapps/web-shared";
import type { CustomerProfile, PayNavigationContext } from "../../lib/identity-adapter";
import { readPayFrameContext } from "../../lib/embed-context";
import { CheckoutActionBar, CheckoutSection, OrderSummary, PaymentMethodCard } from "@djiwaapps/djiwa-checkout-ui";
import { DjiwaPayCheckout, DjiwaPaySuccess } from "./djiwa-pay-checkout";
import { DjiwaPayTopup } from "./djiwa-pay-topup";
import { isSettledPpob, preferredPaymentMethod, validateCustomerNumber } from "../../lib/djiwa-pay-checkout";
import { parseCheckoutDraft, serializeCheckoutDraft, type CheckoutDraft } from "../../lib/djiwa-pay-draft";
import { checkoutCustomerNumberHint, parsePpobPath, parseWalletPath, postpaidServiceForCategory } from "../../lib/djiwa-pay-routes";
import { djiwaPaySplashLabel, isDjiwaPayPageReady } from "../../lib/djiwa-pay-splash";
import { DjiwaPayWalletAction } from "./djiwa-pay-wallet-actions";
import { AccountPage, AllServicesSheet, CardSheet, ComingSoonSheet, HelpPage, HistoryTab, HomeTab, NotificationsPage, PaySheet, ServicesTab, SummaryPage, TabBar, WalletTab, type Nav } from "../shell/dpx-pages";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { Btn, Header, I3, Ic, Screen, Sky, SuccessMark, serviceIcon, serviceTone, spring } from "../shell/dpx-ui";
import { detectOperator } from "../../lib/djiwa-pay-operator";
import { walletQuickActionState } from "../../lib/djiwa-pay-availability";
import { postpaidTotal, validatePostpaidCustomerNumber } from "../../lib/djiwa-pay-postpaid";

const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const date = (value: string) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const labels: Record<string, string> = { topup_completed: "Top up", manual_credit: "Credit saldo", order_debit: "Pembayaran pesanan", wallet_hold: "Saldo ditahan", wallet_release: "Saldo dikembalikan", wallet_transfer_sent: "Transfer terkirim", wallet_transfer_received: "Transfer diterima", refund: "Refund pesanan", adjustment: "Penyesuaian saldo" };
const scanAction = walletQuickActionState("scan");
const withdrawAction = walletQuickActionState("withdraw");
const actions = [
  ["topup", "Isi Saldo", "topup.webp", true, "", ""], ["send", "Kirim", "send.webp", true, "", ""], ["receive", "Terima", "receive.webp", true, "", ""], ["scan", "Scan QR", "scan-qr.webp", scanAction.supported, scanAction.badge, "cyan"],
  ["history", "Riwayat", "history.webp", true, "", ""], ["card", "Kartu", "card.webp", false, "Soon", "indigo"], ["withdraw", "Tarik Dana", "withdraw.webp", withdrawAction.supported, withdrawAction.badge, "orange"], ["help", "Bantuan", "help.webp", true, "", ""],
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

type Props = { profile: CustomerProfile; wallet: WalletResponse | null; loading: boolean; error: string | null; busy: boolean; onRefresh: () => void; onTopup: (amount: number) => Promise<{ invoiceUrl: string; invoiceId?: string }>; navigationContext: PayNavigationContext; onNavigate: (label?: string) => void; onPageReady: () => void; transitionId: number; previewOnly?: boolean };

function PpobReceipt({ product, number, serialNumber, reference, onDone }: { product: PpobProduct; number: string; serialNumber?: string; reference?: string; onDone: () => void }) {
  const [stage, setStage] = useState<"processing" | "printing" | "complete">("processing");
  useEffect(() => { const printTimer = window.setTimeout(() => setStage("printing"), 450); const doneTimer = window.setTimeout(() => setStage("complete"), 2100); return () => { window.clearTimeout(printTimer); window.clearTimeout(doneTimer); }; }, []);
  const operator = product.product_description.toLowerCase().includes("by.u") || product.product_code.toLowerCase().includes("byu") ? "by.U" : product.product_description.split(" ")[0];
  return <div className="ppob-receipt-backdrop"><section className="ppob-receipt-shell" role="dialog" aria-modal="true" aria-labelledby="ppob-receipt-title"><div className="ppob-receipt-brand"><span>D</span><strong>Djiwa Pay</strong><small>{stage === "complete" ? "Pembayaran berhasil" : stage === "printing" ? "Menyiapkan struk" : "Memproses pembayaran"}</small></div><div className={`ppob-receipt-paper ${stage}`}><div className="ppob-receipt-check">{stage === "complete" ? "✓" : "·"}</div><h2 id="ppob-receipt-title">Pembayaran Berhasil</h2><p className="ppob-receipt-caption">Struk digital transaksi PPOB</p><div className="ppob-receipt-rows"><span>Operator <b>{operator}</b></span><span>Produk <b>{product.product_description}</b></span><span>Nomor tujuan <b>{number}</b></span><span>Total <b>{money(product.product_price)}</b></span><span>Metode <b>Saldo Djiwa Pay</b></span>{serialNumber ? <span>Serial Number <b>{serialNumber}</b></span> : null}{reference ? <span>Referensi <b>{reference}</b></span> : null}</div><div className="ppob-receipt-status">{stage === "complete" ? "Transaksi selesai dan saldo telah dipotong." : stage === "printing" ? "Menyiapkan struk digital..." : "Memverifikasi transaksi..."}</div></div>{stage === "complete" ? <button className="primary-action" onClick={onDone}>Selesai</button> : <div className="ppob-receipt-progress" aria-live="polite">{stage === "printing" ? "Menyiapkan struk..." : "Memproses..."}</div>}</section></div>;
}

export function DjiwaPayScreen({ profile, wallet, loading, error, busy, onRefresh, onTopup, navigationContext, onNavigate, onPageReady, transitionId, previewOnly = false }: Props) {
  // Host apps (Djiwa Travel) already draw a bottom tab bar around the iframe.
  const [frame] = useState(readPayFrameContext);
  const [visible, setVisible] = useState(() => { try { return window.localStorage.getItem("djiwa-pay-balance-visible") !== "0"; } catch { return true; } });
  const toggleVisible = () => setVisible((value) => { const next = !value; try { window.localStorage.setItem("djiwa-pay-balance-visible", next ? "1" : "0"); } catch { /* best effort */ } return next; });
  const [shell, setShell] = useState<"pay" | "all" | "card" | "soon" | null>(null);
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
  const [postpaidRetry, setPostpaidRetry] = useState(0);
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
  const [activityFilter, setActivityFilter] = useState<"all" | "credit" | "debit" | "transfer">("all");
  const [walletNotifications, setWalletNotifications] = useState<WalletNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(!previewOnly);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const recentNumbersKey = `djiwa-pay-recent-numbers:${profile.source_id}`;
  const [recentCustomerNumbers, setRecentCustomerNumbers] = useState<string[]>(() => {
    try { const parsed = JSON.parse(window.localStorage.getItem(`djiwa-pay-recent-numbers:${profile.source_id}`) || "[]"); return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 5) : []; } catch { return []; }
  });
  const favoritesKey = `djiwa-pay-favorite-numbers:${profile.source_id}`;
  const [favoriteCustomerNumbers, setFavoriteCustomerNumbers] = useState<string[]>(() => {
    try { const parsed = JSON.parse(window.localStorage.getItem(`djiwa-pay-favorite-numbers:${profile.source_id}`) || "[]"); return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 5) : []; } catch { return []; }
  });
  const refreshWalletNotifications = async () => {
    setNotificationsLoading(true);
    try { setWalletNotifications(await readWalletNotifications()); } catch { /* wallet remains usable when notification service is unavailable */ }
    finally { setNotificationsLoading(false); }
  };
  useEffect(() => { if (!previewOnly) void refreshWalletNotifications(); }, [profile.source_id, previewOnly]);
  const goPpobRoute = (path: string, silent = false) => { if (!silent) onNavigate(djiwaPaySplashLabel(path)); window.history.pushState({ ppob: true }, "", path); setRoutePath(path); };
  const goPayRoute = (path: string) => { onNavigate(djiwaPaySplashLabel(path)); window.history.pushState({ wallet: true }, "", path); setRoutePath(window.location.pathname); window.scrollTo({ top: 0, behavior: "auto" }); };
  const walletRoute = parseWalletPath(routePath);
  const paySearchParams = new URLSearchParams(window.location.search);
  const transferInitialMode: "phone" | "scan" = paySearchParams.get("mode") === "scan" ? "scan" : "phone";
  const transferInitialRecipient = paySearchParams.get("phone") ?? "";
  const closePpob = () => { setPpobOpen(false); setPpobFilter("all"); setSelectedPpobProduct(null); setPostpaidService(null); setPostpaidCatalog(null); setPostpaidInquiry(null); setPostpaidProductCode(""); setPostpaidCustomerNumber(""); setPostpaidStage("detail"); setPostpaidMessage(null); setPpobQuery(""); setPpobOperator("all"); setPpobSort("default"); setPpobCustomerNumber(""); setPpobPaymentMessage(null); setPpobReviewOpen(false); setPpobPaymentMethod("wallet"); setPpobSuccess(null); goPpobRoute("/"); };
  const rememberCustomerNumber = (value: string) => { const next = [value, ...recentCustomerNumbers.filter((item) => item !== value)].slice(0, 5); setRecentCustomerNumbers(next); try { window.localStorage.setItem(recentNumbersKey, JSON.stringify(next)); } catch { /* best effort */ } };
  const toggleFavoriteCustomerNumber = (value: string) => { const next = favoriteCustomerNumbers.includes(value) ? favoriteCustomerNumbers.filter((item) => item !== value) : [value, ...favoriteCustomerNumbers].slice(0, 5); setFavoriteCustomerNumbers(next); try { window.localStorage.setItem(favoritesKey, JSON.stringify(next)); } catch { /* best effort */ } };
  const ppobProductRoute = (stage: string, product = selectedPpobProduct) => product ? `/ppob/${encodeURIComponent(ppobFilter)}/produk/${encodeURIComponent(product.product_code)}/${stage}` : `/ppob/${encodeURIComponent(ppobFilter)}`;
  const draftKey = `djiwa-pay-checkout:${profile.source_id}`;
  const saveDraft = (draft: CheckoutDraft) => { try { window.sessionStorage.setItem(draftKey, serializeCheckoutDraft(draft)); } catch { /* storage is best effort */ } };
  const clearDraft = () => { try { window.sessionStorage.removeItem(draftKey); } catch { /* storage is best effort */ } };
  useEffect(() => {
    const onPopState = () => { onNavigate(djiwaPaySplashLabel(window.location.pathname)); setTopupOpen(false); setRoutePath(window.location.pathname); };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [onNavigate]);
  useEffect(() => {
    if (!ppobOpen && !soon) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (soon) setSoon(null);
      else if (ppobOpen) closePpob();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePpob, ppobOpen, soon]);
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
        goPpobRoute(draft.returnTo, true);
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
    setPpobFilter(route.category);
    setPostpaidService(postpaidServiceForCategory(route.category));
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
  const legacyTransactions: WalletTransaction[] = (wallet?.ledger ?? []).map((entry) => ({ id: Number(entry.id) || 0, transfer_id: null, direction: entry.direction, category: "adjustment", type: entry.transaction_type, amount: entry.amount, balance_after: 0, status: entry.status, counterparty_name: null, counterparty_phone: null, reference_type: null, reference_id: null, note: entry.note, created_at: entry.created_at }));
  const transactions: WalletTransaction[] = wallet?.transactions?.length ? wallet.transactions : legacyTransactions;
  const visibleTransactions = activityFilter === "all" ? transactions : activityFilter === "transfer" ? transactions.filter((entry) => entry.category === "transfer") : transactions.filter((entry) => entry.direction === activityFilter && !entry.direct);
  const entries = wallet?.ledger ?? [];
  const incoming = wallet?.wallet.total_credited ?? entries.filter((entry) => entry.direction === "credit").reduce((total, entry) => total + entry.amount, 0);
  const outgoing = wallet?.wallet.total_debited ?? entries.filter((entry) => entry.direction === "debit").reduce((total, entry) => total + entry.amount, 0);
  const userId = visible ? profile.source_id : `••••••••${profile.source_id.slice(-4)}`;
  const status = wallet?.wallet.status === "blocked" ? "DIBLOKIR" : "AKTIF";
  const customerHome = navigationContext?.source === "customer" ? `https://djiwatentram.web.id/${encodeURIComponent(navigationContext.username)}` : "https://djiwatentram.web.id/";
  const customerOrder = navigationContext?.source === "customer" ? `${customerHome}/order?step=table` : customerHome;
  const customerCommunity = navigationContext?.source === "customer" ? `${customerHome}/komunitas` : customerHome;
  const customerProfile = navigationContext?.source === "customer" ? `${customerHome}/profile` : customerHome;
  const actionClick = (key: string) => {
    if (previewOnly && key !== "history" && key !== "help") { setSoon("Aksi transaksi dinonaktifkan pada pratinjau lokal."); return; }
    if (key === "topup") { setTopupStage("detail"); setTopupStatus("idle"); setTopupPending(false); setTopupInvoiceId(null); setTopupOpen(true); goPayRoute("/wallet/topup"); }
    else if (key === "send") goPayRoute("/wallet/transfer");
    else if (key === "receive") goPayRoute("/wallet/receive");
    else if (key === "scan") goPayRoute("/wallet/transfer?mode=scan");
    else if (key === "history") goPayRoute("/wallet/history");
    else if (key === "help") goPayRoute("/wallet/help");
  };
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
  const leaveTopup = () => {
    const destination = returnToPpob;
    setTopupOpen(false);
    setTopupStage("detail");
    setTopupStatus("idle");
    setTopupPending(false);
    setTopupInvoiceId(null);
    setReturnToPpob(null);
    clearDraft();
    if (destination) { setPpobOpen(true); setPpobReviewOpen(true); goPpobRoute(destination); }
    else goPayRoute("/");
  };
  const goBackInTopup = () => {
    if (topupStage === "payment") {
      if (topupPending) { setTopupPending(false); setTopupStatus("idle"); clearDraft(); }
      setTopupStage("detail");
      return;
    }
    leaveTopup();
  };
  const openTopupForPpob = () => {
    if (!selectedPpobProduct) return;
    const returnTo = ppobProductRoute("konfirmasi");
    setReturnToPpob(returnTo);
    saveDraft({ kind: "ppob", productCode: selectedPpobProduct.product_code, category: ppobFilter, customerNumber: ppobCustomerNumber, amount: selectedPpobProduct.product_price, topupAmount: Number(amount) || 50000, paymentMethod: ppobPaymentMethod, returnTo });
    setPpobOpen(false); setTopupStage("detail"); setTopupStatus("idle"); setTopupPending(false); setTopupInvoiceId(null); setTopupOpen(true); goPayRoute("/wallet/topup");
  };
  useEffect(() => {
    if (!ppobOpen || postpaidService || ["all", "bpjs", "tv", "multifinance"].includes(ppobFilter) || ppobCatalog || ppobCatalogLoading || ppobCatalogError) return;
    setPpobCatalogLoading(true); setPpobCatalogError(null);
    readPpobCatalog().then(setPpobCatalog).catch((cause) => setPpobCatalogError(cause instanceof Error ? cause.message : "Katalog PPOB gagal dimuat")).finally(() => setPpobCatalogLoading(false));
  }, [ppobOpen, ppobFilter, ppobCatalog, ppobCatalogLoading, ppobCatalogError, postpaidService]);
  useEffect(() => {
    if (!ppobOpen || !postpaidService || postpaidCatalog) return;
    let active = true;
    setPostpaidBusy(true); setPostpaidMessage(null);
    readPostpaidCatalog(postpaidService).then((items) => { if (active) { setPostpaidCatalog(items); if (items[0]) setPostpaidProductCode(items[0].code); } }).catch(() => { if (active) setPostpaidMessage("Katalog pascabayar belum dapat dimuat."); }).finally(() => { if (active) setPostpaidBusy(false); });
    return () => { active = false; };
  }, [ppobOpen, postpaidService, postpaidCatalog, postpaidRetry]);
  useEffect(() => {
    if (!selectedPpobProduct || !ppobReviewOpen) return;
    setPpobPaymentMethod((current) => preferredPaymentMethod("ppob", current, wallet?.wallet.available_balance ?? 0, selectedPpobProduct.product_price));
  }, [ppobReviewOpen, selectedPpobProduct?.product_code, selectedPpobProduct?.product_price, wallet?.wallet.available_balance]);
  const payPpob = async () => {
    if (ppobPaymentBusy || ppobPaymentStatus === "pending") return;
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
  // The splash follows the URL rather than `ppobOpen` because a deep link only
  // sets that flag in an effect, after the first render.
  const ppobRoute = parsePpobPath(routePath);
  const ppobCategory = ppobRoute?.category ?? ppobFilter;
  const routePostpaidService = postpaidServiceForCategory(ppobCategory);
  const pageReady = isDjiwaPayPageReady({
    offline: typeof navigator !== "undefined" && navigator.onLine === false,
    walletLoading: loading,
    walletPage: walletRoute?.page ?? null,
    notificationsOpen,
    notificationsLoading,
    ppobSuccess: Boolean(ppobSuccess),
    ppobPageActive: ppobRoute !== null,
    ppobCategory,
    ppobCatalogReady: ppobCatalog !== null || ppobCatalogError !== null,
    postpaidActive: Boolean(routePostpaidService || postpaidService),
    postpaidCatalogReady: postpaidCatalog !== null || postpaidMessage !== null,
    selectedPpobProduct:
      Boolean(selectedPpobProduct) ||
      (Boolean(ppobRoute?.productCode) && (ppobCatalog !== null || ppobCatalogError !== null)),
  });
  // `release` is idempotent; re-running it on state changes is harmless. The
  // transition id makes sure each new splash can release its own page.
  useEffect(() => {
    if (pageReady) onPageReady();
  }, [onPageReady, pageReady, transitionId]);
  const submitPostpaidInquiry = async () => {
    if (!postpaidService || !postpaidProductCode || !postpaidNumberValidation.valid) return;
    setPostpaidBusy(true); setPostpaidMessage(null);
    try { const result = await inquirePostpaid(postpaidService, postpaidProductCode, postpaidCustomerNumber); setPostpaidInquiry(result); setPostpaidStage(result.status === "success" ? "confirmation" : "failed"); if (result.status !== "success") setPostpaidMessage(result.message || "Tagihan belum dapat dipastikan. Silakan coba lagi."); }
    catch (cause) { setPostpaidStage("failed"); setPostpaidMessage(cause instanceof Error ? cause.message : "Inquiry tagihan gagal."); }
    finally { setPostpaidBusy(false); }
  };
  const submitPostpaidPayment = async () => {
    if (postpaidBusy || !postpaidInquiry || postpaidInquiry.status !== "success") return;
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
  const visibleProducts = (ppobCatalog ?? []).filter((product) => ppobFilter !== "all" && product.product_type.toLowerCase() === ppobFilter && (ppobOperator === "all" || ppobOperator === "all-products" || operatorName(product) === ppobOperator) && `${product.product_description} ${product.product_nominal} ${product.product_code}`.toLowerCase().includes(ppobQuery.toLowerCase())).sort((a, b) => ppobSort === "price-asc" ? a.product_price - b.product_price : ppobSort === "price-desc" ? b.product_price - a.product_price : ppobSort === "name" ? a.product_description.localeCompare(b.product_description) : 0).slice(0, 40);
  const ppobValidation = validateCustomerNumber(ppobCustomerNumber);
  const ppobBalance = wallet?.wallet.available_balance ?? 0;
  const ppobPaymentNotice = ppobPaymentStatus === "pending" && ppobPaymentMessage
    ? <div className="djiwa-payment-notice is-warning" role="status"><strong>Transaksi masih diproses</strong><small>{ppobPaymentMessage} Jangan kirim ulang sampai status provider berubah.</small><button type="button" className="djiwa-payment-notice-action" onClick={() => void refreshPpobPayment()} disabled={ppobPaymentBusy}>{ppobPaymentBusy ? "Memeriksa..." : ppobInvoiceId ? "Periksa status" : "Perbarui saldo"}</button></div>
    : ppobReviewOpen && selectedPpobProduct && ppobPaymentMethod === "mayar" && ppobBalance < selectedPpobProduct.product_price
      ? <div className="djiwa-payment-notice is-info" role="status"><strong>QRIS dipilih otomatis</strong><small>Saldo Djiwa Pay belum mencukupi, jadi pembayaran dialihkan ke QRIS.</small></div>
      : null;
  if (Boolean(ppobSuccess)) return (
    <main className="dpx dpx-checkout djiwa-checkout-page">
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
  const ppobTitle = ppobFilter === "all" ? "Layanan digital" : ppobFilter === "bpjs" ? "BPJS" : ppobFilter === "tv" ? "TV & Streaming" : ppobFilter === "multifinance" ? "Cicilan" : ppobFilter === "pln" ? "Token PLN" : ppobFilter === "data" ? "Paket Data" : ppobFilter === "game" ? "Voucher Game" : ppobFilter === "pdam" ? "PDAM" : ppobFilter === "pln-bill" ? "Tagihan PLN" : ppobFilter.charAt(0).toUpperCase() + ppobFilter.slice(1);
  if (ppobOpen && ["bpjs", "tv", "multifinance"].includes(ppobFilter)) return (
    <Screen><Sky><div className="dpx-pad dpx-nobar">
      <Header title={ppobTitle} onBack={closePpob} />
      <div className="dpx-empty" role="status"><I3 name="restaurant-cafe" px={112} /><b>Belum tersedia</b><p>Layanan ini belum tersedia di Djiwa Pay. Saldo dan transaksi Anda tidak akan berubah.</p><Btn type="button" className="dpx-btn dpx-inline" style={{ marginTop: 14 }} onClick={closePpob}>Pilih layanan lain</Btn></div>
    </div></Sky></Screen>
  );
  if (ppobOpen && postpaidService) return (
    <Screen><Sky>
      <div className="dpx-pad dpx-nobar" style={{ paddingBottom: 150 }}>
        <Header title={`Tagihan ${postpaidService.toUpperCase()}`} onBack={closePpob} />
        {postpaidStage === "success" ? <div className="dpx-center" style={{ marginTop: 24 }} role="status"><SuccessMark /><h1 className="dpx-title">Pembayaran berhasil</h1><p className="dpx-sub" style={{ margin: "8px auto 0", maxWidth: 290 }}>Tagihan {postpaidService.toUpperCase()} sudah dibayar. Ref: {postpaidInquiry?.refId}</p><div className="dpx-sticky"><Btn className="dpx-btn" onClick={closePpob}>Selesai</Btn></div></div> : <>
          <p className="dpx-sub" style={{ margin: "0 6px 6px" }}>Masukkan nomor pelanggan untuk melihat rincian tagihan sebelum membayar.</p>
          {postpaidBusy && !postpaidCatalog ? <div className="dpx-skel" style={{ height: 120 }} role="status" aria-label="Memuat pilihan tagihan" /> : null}
          {!postpaidBusy && postpaidMessage && !postpaidCatalog ? <div role="alert" className="dpx-note dpx-danger"><Ic n="warn" /><div><b>Katalog belum dapat dimuat</b>Periksa koneksi lalu coba muat ulang.<br /><Btn type="button" className="dpx-linkbtn" style={{ marginTop: 8, fontWeight: 600 }} onClick={() => { setPostpaidMessage(null); setPostpaidRetry((value) => value + 1); }}>Muat ulang katalog</Btn></div></div> : null}
          {!postpaidBusy && postpaidCatalog?.length === 0 ? <div className="dpx-note dpx-info" role="status"><Ic n="info" /><div>Produk tagihan belum tersedia untuk layanan ini.</div></div> : null}
          {postpaidCatalog?.length ? <label className="dpx-field"><span>Jenis layanan</span><div className="dpx-input"><select value={postpaidProductCode} onChange={(event) => { setPostpaidProductCode(event.target.value); setPostpaidInquiry(null); setPostpaidStage("detail"); setPostpaidMessage(null); }} disabled={postpaidBusy || postpaidStage === "pending"}>{postpaidCatalog.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></div></label> : null}
          <label className="dpx-field"><span>Nomor pelanggan</span><div className="dpx-input"><Ic n="receipt" size="sm" /><input inputMode="numeric" autoComplete="off" value={postpaidCustomerNumber} onChange={(event) => { setPostpaidCustomerNumber(event.target.value.replace(/\D/g, "").slice(0, 20)); setPostpaidInquiry(null); setPostpaidStage("detail"); setPostpaidMessage(null); }} disabled={postpaidBusy || postpaidStage === "pending"} placeholder={postpaidService === "pln" ? "11–13 digit ID pelanggan" : "Nomor pelanggan PDAM"} /></div>{!postpaidNumberValidation.valid && postpaidCustomerNumber ? <div className="dpx-hint dpx-err">{postpaidNumberValidation.message}</div> : <div className="dpx-hint">{postpaidService === "pln" ? "Masukkan 11–13 digit nomor pelanggan." : "Masukkan nomor pelanggan PDAM."}</div>}</label>
          {postpaidInquiry && postpaidStage !== "detail" ? <><div className="dpx-glabel">Detail tagihan</div><div className="dpx-group dpx-white"><div className="dpx-kv"><span>Nama pelanggan</span><b>{postpaidInquiry.customerName || "-"}</b></div><div className="dpx-kv"><span>Periode</span><b>{postpaidInquiry.period || "-"}</b></div><div className="dpx-kv"><span>Tagihan</span><b>{money(postpaidInquiry.billAmount)}</b></div><div className="dpx-kv"><span>Biaya admin</span><b>{money(postpaidInquiry.adminFee)}</b></div><div className="dpx-kv dpx-total"><span>Total pembayaran</span><b>{money(postpaidTotal(postpaidInquiry.billAmount, postpaidInquiry.adminFee))}</b></div></div></> : null}
          {postpaidMessage && (postpaidCatalog !== null || postpaidStage !== "detail") ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div>{postpaidMessage}</div></div> : null}
          {postpaidStage === "pending" ? <div className="dpx-note" role="status"><Ic n="clock" /><div><b>Pembayaran sedang diproses</b>Saldo tetap ditahan sampai provider memberi hasil definitif.<br /><Btn className="dpx-linkbtn" style={{ marginTop: 8, fontWeight: 600 }} onClick={() => void refreshPostpaidStatus()} disabled={postpaidBusy}>{postpaidBusy ? "Memeriksa..." : "Periksa status"}</Btn></div></div> : null}
        </>}
      </div>
      {postpaidStage !== "success" ? <div className="dpx-sticky">
        {postpaidStage === "confirmation" ? <><Btn className="dpx-btn" onClick={() => void submitPostpaidPayment()} disabled={postpaidBusy}>{postpaidBusy ? "Memproses..." : `Bayar ${money(postpaidInquiry?.totalAmount || 0)}`}</Btn><Btn className="dpx-btn dpx-soft" style={{ marginTop: 10 }} onClick={() => setPostpaidStage("detail")}>Ubah data</Btn></> : postpaidStage !== "pending" ? <Btn className={`dpx-btn ${postpaidBusy || !postpaidProductCode || !postpaidNumberValidation.valid ? "dpx-off" : ""}`} onClick={() => void submitPostpaidInquiry()} disabled={postpaidBusy || !postpaidProductCode || !postpaidNumberValidation.valid}>{postpaidBusy ? "Memeriksa..." : "Lihat tagihan"}</Btn> : null}
      </div> : null}
    </Sky></Screen>
  );
  if (ppobOpen && selectedPpobProduct) return (
    <main className="dpx dpx-checkout djiwa-checkout-page">
      <DjiwaPayCheckout
        kind="ppob"
        stage={ppobReviewOpen ? "payment" : "detail"}
        amount={selectedPpobProduct.product_price}
        productId={selectedPpobProduct.product_code}
        productName={ppobProductName(selectedPpobProduct)}
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
  if (ppobOpen) {
    const isPhoneCategory = ppobFilter === "pulsa" || ppobFilter === "data";
    const detected = isPhoneCategory ? detectOperator(ppobCustomerNumber) : null;
    const activeOperator = ppobOperator === "all" && detected && (ppobOperators as string[]).includes(detected) ? detected : ppobOperator;
    const shownProducts = (ppobCatalog ?? []).filter((product) => product.product_type.toLowerCase() === ppobFilter && (activeOperator === "all" || operatorName(product) === activeOperator) && `${product.product_description} ${product.product_nominal} ${product.product_code}`.toLowerCase().includes(ppobQuery.toLowerCase())).sort((a, b) => ppobSort === "price-asc" ? a.product_price - b.product_price : ppobSort === "price-desc" ? b.product_price - a.product_price : ppobSort === "name" ? a.product_description.localeCompare(b.product_description) : a.product_price - b.product_price).slice(0, 60);
    const numberLabel = isPhoneCategory ? "Nomor HP tujuan" : ppobFilter === "pln" ? "Nomor meter / ID pelanggan" : "Nomor atau ID tujuan";
    return <Screen><Sky><div className="dpx-pad dpx-nobar" style={{ paddingBottom: 60 }}>
      <Header title={ppobTitle} onBack={closePpob} />
      {ppobFilter === "all" ? <><p className="dpx-sub" style={{ margin: "0 6px 12px" }}>Pilih layanan yang ingin dibayar dengan saldo Djiwa Pay.</p><div className="dpx-group dpx-white"><div className="dpx-tile3" style={{ gap: "6px 8px" }}>{ppobServices.map(([key, label]) => <Btn key={key} type="button" className="dpx-q" style={{ padding: "8px 0" }} onClick={() => { openPpob(key, label); setPpobOperator("all"); setSelectedPpobProduct(null); }}><span className={`dpx-qi dpx-c-${serviceTone[key]}`} style={{ width: 56, height: 56, borderRadius: 20, display: "grid", placeItems: "center" }}><Ic n={serviceIcon[key]} size="lg" /></span><span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span></Btn>)}</div></div></> : <>
        <label className="dpx-field" style={{ marginTop: 6 }}><span>{numberLabel}</span><div className="dpx-input"><Ic n={isPhoneCategory ? "phone" : ppobFilter === "pln" ? "flash" : "game"} size="sm" /><input id="ppob-number" inputMode="numeric" autoComplete="tel" value={ppobCustomerNumber} onChange={(event) => setPpobCustomerNumber(event.target.value.replace(/\D/g, "").slice(0, 20))} placeholder={isPhoneCategory ? "0812 3456 7890" : "Masukkan nomor"} />{detected ? <span className="dpx-tag dpx-info">{detected}</span> : null}{ppobCustomerNumber ? <Btn type="button" onClick={() => setPpobCustomerNumber("")} aria-label="Hapus nomor"><Ic n="close" size="sm" /></Btn> : null}</div>{isPhoneCategory ? <div className="dpx-hint">Operator terdeteksi otomatis dari awalan nomor.</div> : null}</label>
        {recentCustomerNumbers.length ? <div className="dpx-chips dpx-mt8" aria-label="Nomor terakhir dipakai">{recentCustomerNumbers.map((number) => <Btn key={number} type="button" className="dpx-chip" onClick={() => setPpobCustomerNumber(number)}>{number}</Btn>)}</div> : null}
        {ppobCatalogLoading ? <div style={{ marginTop: 18 }} role="status" aria-label="Memuat produk"><div className="dpx-skel" style={{ height: 70 }} /><div style={{ height: 10 }} /><div className="dpx-skel" style={{ height: 70 }} /></div>
          : ppobCatalogError ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div><b>Katalog belum dapat dimuat</b>{ppobCatalogError}<br /><Btn type="button" className="dpx-linkbtn" style={{ marginTop: 8, fontWeight: 600 }} onClick={() => setPpobCatalogError(null)}>Coba lagi</Btn></div></div>
          : <>
            {ppobOperators.length > 1 ? <div className="dpx-chips" style={{ marginTop: 12 }} role="group" aria-label="Pilih operator"><Btn type="button" className={`dpx-chip ${activeOperator === "all" ? "dpx-on" : ""}`} onClick={() => setPpobOperator("all")}>Semua</Btn>{ppobOperators.map((operator) => <Btn key={operator} type="button" className={`dpx-chip ${activeOperator === operator ? "dpx-on" : ""}`} onClick={() => setPpobOperator(operator)}>{operator}</Btn>)}</div> : null}
            <div className="dpx-flex" style={{ marginTop: 10 }}><label className="dpx-search" style={{ flex: 1, height: 44 }}><Ic n="search" size="sm" /><input value={ppobQuery} onChange={(event) => setPpobQuery(event.target.value)} placeholder="Cari produk atau kode" aria-label="Cari produk" /></label><select className="dpx-chip" value={ppobSort} onChange={(event) => setPpobSort(event.target.value as typeof ppobSort)} aria-label="Urutkan produk"><option value="default">Termurah</option><option value="price-asc">Harga terendah</option><option value="price-desc">Harga tertinggi</option><option value="name">Nama</option></select></div>
            <div className="dpx-glabel">{ppobFilter === "pulsa" ? "Pilih nominal" : "Pilih produk"} <span>{shownProducts.length} produk</span></div>
            {shownProducts.length ? <div className="dpx-prodlist">{shownProducts.map((product) => <Btn type="button" key={product.product_code} className={`dpx-prod ${selectedPpobProduct?.product_code === product.product_code ? "dpx-on" : ""}`} onClick={() => { setSelectedPpobProduct(product); goPpobRoute(ppobProductRoute("detail", product)); }}><span><b>{ppobProductName(product)}</b><span>{operatorName(product)}</span></span><span className="dpx-price">{money(product.product_price)}</span></Btn>)}</div> : <div className="dpx-empty"><I3 name="restaurant-cafe" px={96} /><b>Produk tidak ditemukan</b><p>Coba ubah operator atau kata kunci.</p></div>}
          </>}
      </>}
    </div></Sky></Screen>;
  }
  if (topupOpen || walletRoute?.page === "topup") return (
    <DjiwaPayTopup
      stage={topupStage}
      status={topupStatus}
      amount={amount}
      balance={wallet?.wallet.available_balance ?? 0}
      busy={busy}
      pending={topupPending}
      returningToPpob={Boolean(returnToPpob)}
      onAmountChange={setAmount}
      onBack={goBackInTopup}
      onPrimary={submitTopup}
      onCheckStatus={() => void refreshTopupPayment()}
      onRestart={() => { setTopupStatus("idle"); setTopupPending(false); setTopupInvoiceId(null); setTopupStage("detail"); clearDraft(); }}
      onDone={leaveTopup}
    />
  );
  const unreadCount = walletNotifications.filter((item) => item.unread).length;
  const hasWallet = Boolean(wallet);
  const balance = wallet?.wallet.available_balance ?? 0;
  const embedded = frame.hideBottomNav;
  const openTx = (id: string) => goPayRoute(`/wallet/history/${encodeURIComponent(id)}`);
  const openNotifications = () => { onNavigate("Membuka Notifikasi"); setNotificationsOpen(true); };
  const payNav: Nav = {
    go: (path) => {
      if (previewOnly && (path.startsWith("/wallet/topup") || path.startsWith("/wallet/transfer") || path.startsWith("/wallet/receive"))) { setSoon("Aksi transaksi dinonaktifkan pada pratinjau lokal."); return; }
      if (path === "/wallet/topup") { actionClick("topup"); return; }
      goPayRoute(path);
    },
    openService: (key, label) => { if (previewOnly && key !== "pulsa") { /* catalog calls are read-only; allow browsing */ } openPpob(key, label); },
    openSheet: (name) => setShell(name),
  };
  const sheets = <AnimatePresence>
    {shell === "pay" ? <PaySheet key="pay" nav={payNav} onClose={() => setShell(null)} withdrawSupported={withdrawAction.supported} /> : null}
    {shell === "all" ? <AllServicesSheet key="all" nav={payNav} onClose={() => setShell(null)} /> : null}
    {shell === "card" ? <CardSheet key="card" onClose={() => setShell(null)} /> : null}
    {soon ? <ComingSoonSheet key="soon" message={soon} onClose={() => setSoon(null)} /> : null}
  </AnimatePresence>;
  const frameShell = (content: ReactNode, active: "home" | "services" | "history" | "wallet" | null) => <MotionConfig reducedMotion="user"><div className={`dpx ${embedded ? "dpx-embedded" : ""}`}><motion.div key={`${routePath}|${notificationsOpen ? "n" : ""}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.34, ease: [0.32, 0.72, 0, 1] }}>{content}</motion.div>{embedded || !active ? null : <TabBar active={active} go={(path) => goPayRoute(path)} openPay={() => setShell("pay")} />}{sheets}</div></MotionConfig>;
  if (!wallet && error && walletRoute?.page !== "help") return frameShell(
    <Sky><div className="dpx-pad"><div className="dpx-empty" role="alert" style={{ paddingTop: 80 }}><I3 name="payment-wallet" px={112} /><b>Saldo belum dapat dimuat</b><p>{error}</p><Btn type="button" className="dpx-btn" style={{ maxWidth: 260 }} onClick={onRefresh} disabled={loading}>{loading ? "Mencoba lagi…" : "Coba lagi"}</Btn></div></div></Sky>, null);
  if (walletRoute?.page === "history") {
    const selectedTransaction = walletRoute.transactionId ? transactions.find((entry) => String(entry.id) === walletRoute.transactionId || String(entry.transfer_id ?? "") === walletRoute.transactionId) ?? null : null;
    return frameShell(<HistoryTab transactions={transactions} loading={loading} nav={payNav} selected={selectedTransaction} onOpenTx={openTx} onCloseTx={() => goPayRoute("/riwayat")} />, "history");
  }
  if (walletRoute?.page === "transfer" || walletRoute?.page === "receive") return <DjiwaPayWalletAction mode={walletRoute.page === "transfer" ? "send" : "receive"} profile={profile} balance={balance} initialMode={transferInitialMode} initialRecipient={transferInitialRecipient} onClose={() => goPayRoute("/")} onSuccess={() => { goPayRoute("/"); onRefresh(); if (!previewOnly) void refreshWalletNotifications(); }} />;
  if (walletRoute?.page === "help") return frameShell(<HelpPage onBack={() => goPayRoute("/")} nav={payNav} />, null);
  if (walletRoute?.page === "summary") return frameShell(<SummaryPage transactions={transactions} onBack={() => goPayRoute("/riwayat")} />, null);
  if (walletRoute?.page === "account") return frameShell(<AccountPage profile={profile} unread={unreadCount} customerHome={customerHome} embedded={embedded} onBack={() => goPayRoute("/")} nav={payNav} onOpenNotifications={openNotifications} />, null);
  if (notificationsOpen) return frameShell(<NotificationsPage items={walletNotifications} loading={notificationsLoading} busy={notificationsBusy} onBack={() => { onNavigate("Kembali ke Saldo Djiwa Pay"); setNotificationsOpen(false); }} onRead={async (notification) => { if (notification.unread) { await markWalletNotificationRead(notification.id); await refreshWalletNotifications(); } }} onReadAll={async () => { setNotificationsBusy(true); try { await markAllWalletNotificationsRead(); await refreshWalletNotifications(); } finally { setNotificationsBusy(false); } }} />, null);
  if (walletRoute?.page === "services") return frameShell(<ServicesTab nav={payNav} focusSearch={paySearchParams.get("cari") === "1"} recentNumbers={recentCustomerNumbers} />, "services");
  if (walletRoute?.page === "wallet") return frameShell(<WalletTab balance={balance} visible={visible} onToggleVisible={toggleVisible} incoming={incoming} outgoing={outgoing} transactions={transactions} nav={payNav} loading={loading} />, "wallet");
  return frameShell(<HomeTab profile={profile} balance={balance} loading={loading} error={error} hasWallet={hasWallet} visible={visible} onToggleVisible={toggleVisible} onRefresh={onRefresh} transactions={transactions} unread={unreadCount} nav={payNav} onOpenNotifications={openNotifications} onOpenTx={openTx} previewOnly={previewOnly} />, "home");
}
