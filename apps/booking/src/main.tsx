import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MotionConfig } from "framer-motion";
import { BOOKING_STEPS, type BookingOption, type BookingStep } from "./lib/booking-constants";
import { type BookingDraft, type BookingResult, type Capacity, type ScheduleEntry, type Category, type Product, type BookingSettings, createBooking, createBookingPayment, loadBookingData, lookupBooking } from "./lib/client";
import { validateCustomer } from "./lib/booking-validation";
import { EMPTY_CUSTOMER, normalizeBookingDraft, type BookingCart, type BookingDraftState, type BookingScreen } from "./lib/booking-state";
import { BookingTypeStep, Checkout, DateStep, EventTypeStep, Landing, MenuStep, Review, Status, Success, overCapacity, requiredFieldErrors } from "./screens";
import { Loading, Note, Shell, stepsOf } from "./ui";
import { tableCount as sharedTableCount } from "@djiwaapps/web-shared/booking/capacity";
import "./index.css";
import { installNumberInputBehavior } from "@djiwaapps/web-shared";
import { AppUpdatePrompt } from "./components/app-update-prompt";
import { checkForAppUpdate, notifyAppUpdateAvailable, setAppUpdateHandler, startAppUpdatePolling } from "./lib/app-update";
import { registerSW } from "virtual:pwa-register";
import { redirectToBookingLogin, useBookingCustomerAuth } from "./lib/customer-auth";


installNumberInputBehavior();
type Screen = BookingScreen;
type Cart = BookingCart;
type DraftState = BookingDraftState;

const DRAFT_STORAGE_KEY = "booking-draft-v2";

function go(path: string) { window.history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate")); }
function validStep(value: string | null): value is BookingStep { return Boolean(value && (BOOKING_STEPS as readonly string[]).includes(value)); }
function canonicalizeLegacyPath() {
  const path = window.location.pathname;
  const legacySteps: Record<string, string> = { "/booking/menu": "menu", "/booking/customer": "checkout", "/booking/review": "review", "/booking/date": "date" };
  const params = new URLSearchParams(window.location.search);
  if (path === "/booking") {
    const step = params.get("step");
    window.history.replaceState({}, "", step && validStep(step) ? `/?step=${encodeURIComponent(step)}` : "/");
  } else if (legacySteps[path]) {
    window.history.replaceState({}, "", `/?step=${legacySteps[path]}`);
  } else if (path === "/booking/status" || path === "/booking/success") {
    window.history.replaceState({}, "", `${path.replace("/booking", "")}${window.location.search}`);
  }
}
function isCustomerSlugPath() {
  const path = window.location.pathname;
  return /^\/[^/]+$/.test(path) && path !== "/status" && path !== "/success";
}
function readScreen(): Screen {
  const path = window.location.pathname;
  const search = new URLSearchParams(window.location.search);
  if (path === "/status" || path === "/booking/status") return "status";
  if (path === "/success" || path === "/booking/success") return "success";
  if (path === "/booking/menu") return "menu";
  if (path === "/booking/customer") return "checkout";
  if (path === "/booking/review") return "review";
  if (path === "/booking/date") return "date";
  if (path === "/booking") return validStep(search.get("step")) ? search.get("step") as BookingStep : "type";
  return validStep(search.get("step")) ? search.get("step") as BookingStep : "landing";
}
function loadDraft(): DraftState {
  try {
    return normalizeBookingDraft(JSON.parse(sessionStorage.getItem(DRAFT_STORAGE_KEY) || "null"));
  } catch { /* reset malformed draft */ }
  return normalizeBookingDraft(null);
}

export default function App() {
  const customerSlugPath = isCustomerSlugPath();
  const [screen, setScreen] = useState<Screen>(readScreen);
  const [data, setData] = useState<{ settings: BookingSettings | null; capacities: Capacity[]; schedule: ScheduleEntry[]; products: Product[]; categories: Category[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(loadDraft);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingBooking, setPendingBooking] = useState<BookingResult | null>(() => {
    try {
      const raw = sessionStorage.getItem("booking-pending-result");
      return raw ? JSON.parse(raw) as BookingResult : null;
    } catch { return null; }
  });
  const [statusCode, setStatusCode] = useState(() => new URLSearchParams(window.location.search).get("code") || localStorage.getItem("booking-last-code") || "");
  const [statusResult, setStatusResult] = useState<BookingResult | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const { isAuthenticated, customer } = useBookingCustomerAuth();

  useEffect(() => {
    canonicalizeLegacyPath();
    const onPop = () => setScreen(readScreen());
    window.addEventListener("popstate", onPop);
    loadBookingData().then(setData).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Data booking tidak dapat dimuat."));
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (!customer) return;
    setDraft((current) => ({
      ...current,
      customer: {
        ...current.customer,
        name: current.customer.name || customer.name,
        email: current.customer.email || customer.email,
        phone: current.customer.phone || customer.phone,
      },
    }));
  }, [customer]);
  useEffect(() => { sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft)); }, [draft]);

  const settings = data?.settings;
  const capacities = data?.capacities ?? [];
  const products = data?.products ?? [];
  const selectedCapacity = capacities.find((entry) => entry.date === draft.selectedDate);
  const tableCount = sharedTableCount(draft.guests, selectedCapacity?.peoplePerTable ?? 4);
  const cartItems = useMemo(() => products.filter((product) => draft.cart[product.id]).map((product) => ({ ...product, quantity: draft.cart[product.id]! })), [draft.cart, products]);
  const total = cartItems.reduce((sum, item) => sum + (item.promoPrice ?? item.price) * item.quantity, 0);
  const selectedType = settings?.bookingTypes.find((item) => item.key === draft.bookingType);
  const selectedEvent = settings?.eventTypes.find((item) => item.key === draft.eventType);
  const hasBookingType = (settings?.bookingTypes.length ?? 0) > 0;
  const hasEventOptions = (settings?.eventTypes.length ?? 0) > 0;
  const requiresEvent = selectedType?.key === "event" && hasEventOptions;
  const hasMenu = products.length > 0;
  const flowSteps = useMemo(() => BOOKING_STEPS.filter((step) => step !== "event-type" || requiresEvent).filter((step) => step !== "menu" || hasMenu), [hasMenu, requiresEvent]);
  const updateDraft = (patch: Partial<DraftState>) => setDraft((current) => ({ ...current, ...patch }));
  const navigate = (next: Screen) => go(next === "landing" ? "/" : next === "status" ? "/status" : next === "success" ? "/success" : `/?step=${encodeURIComponent(next)}`);
  const setQuantity = (id: string, quantity: number) => updateDraft({ cart: (() => { const next = { ...draft.cart }; if (quantity <= 0) delete next[id]; else next[id] = quantity; return next; })() });
  const nextFromType = () => { if (!selectedType) return; if (requiresEvent) navigate("event-type"); else { updateDraft({ eventType: "", eventTypeOther: "" }); navigate("date"); } };
  const nextFromEvent = () => { if (!requiresEvent || !selectedEvent || (selectedEvent.requiresCustomText && !draft.eventTypeOther.trim())) return; navigate("date"); };
  const nextFromDate = () => { if (!draft.selectedDate || !draft.arrivalTime || !selectedCapacity || overCapacity(draft.guests, selectedCapacity)) return; navigate(hasMenu ? "menu" : "review"); };
  const nextFromMenu = () => { if (cartItems.length > 0) navigate("review"); };
  useEffect(() => {
    if (!data) return;
    if (screen === "type" && !hasBookingType) navigate("date");
    else if (screen === "event-type" && !requiresEvent) navigate("date");
    else if (screen === "menu" && !hasMenu) navigate("review");
  }, [data, hasBookingType, hasMenu, requiresEvent, screen]);
  const nextFromCheckout = async () => {
    if (!isAuthenticated || !customer) {
      redirectToBookingLogin();
      return;
    }
    const customerErrors = validateCustomer(draft.customer);
    const customErrors = requiredFieldErrors(settings?.customFields ?? [], draft.customAnswers);
    if (Object.keys(customerErrors).length || Object.keys(customErrors).length) return;
    setSubmitting(true); setSubmitError(null);
    try {
      const bookingDraft: BookingDraft = { customerSourceId: customer.sourceId, bookingType: draft.bookingType, bookingTypeLabel: selectedType?.label || draft.bookingType, eventType: draft.eventType || undefined, eventTypeLabel: selectedEvent?.label, eventTypeOther: draft.eventTypeOther || undefined, date: draft.selectedDate, arrivalTime: draft.arrivalTime, guests: draft.guests, tableCount, items: cartItems.map((item) => ({ productId: item.id, name: item.name, price: item.promoPrice ?? item.price, quantity: item.quantity })), customer: draft.customer, customAnswers: { ...draft.customAnswers, "Tipe booking": draft.bookingType, "Tipe booking label": selectedType?.label || draft.bookingType, "Jenis acara": draft.eventType || null, "Jenis acara label": selectedEvent?.label || null, "Jenis acara lainnya": draft.eventTypeOther || null, "Jam kedatangan": draft.arrivalTime } };
      const created = pendingBooking ?? await createBooking(bookingDraft);
      setPendingBooking(created);
      sessionStorage.setItem("booking-pending-result", JSON.stringify(created));
      const payment = await createBookingPayment(created, bookingDraft);
      sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      sessionStorage.removeItem("booking-pending-result");
      if (!payment.invoiceUrl) throw new Error("Link pembayaran tidak tersedia.");
      window.location.assign(payment.invoiceUrl);
    } catch (error: unknown) { setSubmitError(error instanceof Error ? error.message : "Pembayaran belum berhasil disiapkan. Data booking tetap tersimpan untuk dicoba lagi."); } finally { setSubmitting(false); }
  };

  const reload = () => { setLoadError(null); loadBookingData().then(setData).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Data booking tidak dapat dimuat.")); };
  const lookup = async () => { setStatusLoading(true); setStatusError(null); setStatusResult(null); try { setStatusResult(await lookupBooking(statusCode.trim())); } catch (error: unknown) { setStatusError(error instanceof Error ? error.message : "Status tidak tersedia."); } finally { setStatusLoading(false); } };
  const backScreen: Screen | undefined = screen === "landing" ? undefined : screen === "type" ? "landing" : screen === "event-type" ? "type" : screen === "date" ? (requiresEvent ? "event-type" : hasBookingType ? "type" : "landing") : screen === "menu" ? "date" : screen === "review" ? (hasMenu ? "menu" : "date") : screen === "checkout" ? "review" : "landing";
  const order: Screen[] = ["landing", "type", "event-type", "date", "menu", "review", "checkout"];
  const rank = (value: Screen) => { const index = order.indexOf(value); return index < 0 ? 0 : index; };
  const previous = useRef(rank(screen));
  const direction = rank(screen) >= previous.current ? 1 : -1;
  useEffect(() => { previous.current = rank(screen); window.scrollTo({ top: 0 }); }, [screen]);
  const steps = stepsOf(hasBookingType, requiresEvent, hasMenu);
  const stepIndex = steps.indexOf(screen as BookingStep);
  const progress = stepIndex >= 0 ? { index: stepIndex, total: steps.length, label: screen as BookingStep } : undefined;
  const shell = (children: React.ReactNode, footer = true) => <Shell settings={settings} pageKey={screen} direction={direction} progress={progress} footer={footer} dock={!!progress} onBack={backScreen ? () => navigate(backScreen) : undefined}>{children}</Shell>;

  if (screen === "success") return shell(<Success code={statusCode} onStatus={() => navigate("status")} />);
  if (screen === "status") return shell(<Status code={statusCode} setCode={setStatusCode} result={statusResult} error={statusError} loading={statusLoading} onLookup={lookup} />);
  if (!data) return shell(<section>{loadError ? <Note tone="err" action="Coba lagi" onAction={reload}>{loadError}</Note> : <Loading text="Memuat data booking…" />}</section>);
  return shell(<>
    {screen === "landing" && <Landing settings={settings} loading={false} error={loadError} retry={reload} onStart={() => navigate(hasBookingType ? "type" : "date")} onStatus={() => navigate("status")} showCustomerPromo={customerSlugPath} />}
    {screen === "type" && <BookingTypeStep settings={settings} selected={draft.bookingType} onSelect={(key) => updateDraft({ bookingType: key })} onNext={nextFromType} />}
    {screen === "event-type" && <EventTypeStep settings={settings} selected={draft.eventType} customText={draft.eventTypeOther} onSelect={(key) => updateDraft({ eventType: key })} onCustomText={(value) => updateDraft({ eventTypeOther: value })} onNext={nextFromEvent} />}
    {screen === "date" && <DateStep settings={settings} capacities={capacities} schedule={data.schedule} bookingType={selectedType} eventType={selectedEvent} selectedDate={draft.selectedDate} setSelectedDate={(value) => updateDraft({ selectedDate: value })} arrivalTime={draft.arrivalTime} setArrivalTime={(value) => updateDraft({ arrivalTime: value })} guests={draft.guests} setGuests={(value) => updateDraft({ guests: value })} onNext={nextFromDate} />}
    {screen === "menu" && <MenuStep products={products} categories={data.categories} cart={draft.cart} setQuantity={setQuantity} total={total} onNext={nextFromMenu} />}
    {screen === "review" && <Review hasType={hasBookingType} bookingType={selectedType} eventType={selectedEvent} eventTypeOther={draft.eventTypeOther} date={draft.selectedDate} arrivalTime={draft.arrivalTime} guests={draft.guests} tableCount={tableCount} items={cartItems} total={total} onEdit={(step) => navigate(step)} onNext={() => navigate("checkout")} />}
    {screen === "checkout" && <Checkout settings={settings} bookingType={selectedType} eventType={selectedEvent} date={draft.selectedDate} arrivalTime={draft.arrivalTime} guests={draft.guests} items={cartItems} total={total} customer={draft.customer} setCustomer={(next) => updateDraft({ customer: next })} customAnswers={draft.customAnswers} setCustomAnswers={(customAnswers) => updateDraft({ customAnswers })} error={submitError} submitting={submitting} signedIn={isAuthenticated} onNext={nextFromCheckout} />}
  </>);
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() { notifyAppUpdateAvailable(); },
});
setAppUpdateHandler(updateSW);
startAppUpdatePolling();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void checkForAppUpdate();
});

createRoot(document.getElementById("root")!).render(<MotionConfig reducedMotion="user"><App /><AppUpdatePrompt /></MotionConfig>);
