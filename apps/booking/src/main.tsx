import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, CalendarHeart, Check, ChevronRight, CircleAlert, Clock3, Copy, CreditCard, ExternalLink, GraduationCap, Handshake, HeartHandshake, Minus, Plus, Search, Sparkles, Users, UsersRound, UtensilsCrossed } from "lucide-react";
import { BOOKING_STEPS, type BookingOption, type BookingStep } from "./lib/booking-constants";
import { currency, formatDate, todayIso } from "./lib/booking-formatters";
import { type BookingCustomField, type BookingDraft, type BookingResult, type Capacity, type Category, type Product, type BookingSettings, createBooking, createBookingPayment, loadBookingData, lookupBooking } from "./lib/client";
import { validateCustomer, type CustomerForm } from "./lib/booking-validation";
import { EMPTY_CUSTOMER, normalizeBookingDraft, type BookingCart, type BookingDraftState, type BookingScreen } from "./lib/booking-state";
import { tableCount as sharedTableCount } from "@yumipos/web-shared/booking/capacity";
import "./index.css";
import { OwnerFooter } from "@yumipos/web-shared";
import { installNumberInputBehavior } from "@yumipos/web-shared";
import { AppUpdatePrompt } from "./components/app-update-prompt";
import { checkForAppUpdate, notifyAppUpdateAvailable, setAppUpdateHandler, startAppUpdatePolling } from "./lib/app-update";
import { registerSW } from "virtual:pwa-register";
import { redirectToBookingLogin, useBookingCustomerAuth } from "./lib/customer-auth";
import { CheckoutSection } from "./components/checkout-section";
import "@yumipos/djiwa-checkout-ui/styles.css";


installNumberInputBehavior();
type Screen = BookingScreen;
type Cart = BookingCart;
type DraftState = BookingDraftState;

const emptyCustomer = EMPTY_CUSTOMER;
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
  const [data, setData] = useState<{ settings: BookingSettings | null; capacities: Capacity[]; products: Product[]; categories: Category[] } | null>(null);
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
  const stepNumber = (step: BookingStep) => String(flowSteps.indexOf(step) + 1).padStart(2, "0");
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

  if (screen === "success") return <Shell settings={settings} onBack={() => navigate("landing")}><Success code={statusCode} onStatus={() => navigate("status")} /></Shell>;
  if (screen === "status") return <Shell settings={settings} onBack={() => navigate("landing")}><Status code={statusCode} setCode={setStatusCode} result={statusResult} error={statusError} loading={statusLoading} onLookup={async () => { setStatusLoading(true); setStatusError(null); setStatusResult(null); try { setStatusResult(await lookupBooking(statusCode.trim())); } catch (error: unknown) { setStatusError(error instanceof Error ? error.message : "Status tidak tersedia."); } finally { setStatusLoading(false); } }} /></Shell>;
  if (!data) {
    return <Shell settings={settings} onBack={() => navigate("landing")}><section className="flow"><StateCard text={loadError || "Memuat data booking…"} loading={!loadError} error={Boolean(loadError)} action={loadError ? "Coba lagi" : undefined} onAction={() => { setLoadError(null); loadBookingData().then(setData).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Data booking tidak dapat dimuat.")); }} /></section></Shell>;
  }
  const backScreen = screen === "landing" ? undefined : screen === "type" ? "landing" : screen === "event-type" ? "type" : screen === "date" ? (requiresEvent ? "event-type" : hasBookingType ? "type" : "landing") : screen === "menu" ? "date" : screen === "review" ? (hasMenu ? "menu" : "date") : "review";
  return <Shell settings={settings} menu={screen !== "landing"} progressStep={screen === "landing" ? undefined : screen} progressHasType={hasBookingType} progressHasEvent={requiresEvent} progressHasMenu={hasMenu} menuItemCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)} onBack={backScreen ? () => navigate(backScreen) : undefined}>
    {screen === "landing" && <Landing settings={settings} loading={!data && !loadError} error={loadError} retry={() => { setLoadError(null); loadBookingData().then(setData).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Data booking tidak dapat dimuat.")); }} onStart={() => navigate(hasBookingType ? "type" : "date")} onStatus={() => navigate("status")} showCustomerPromo={customerSlugPath} />}
    {screen === "type" && <BookingTypeStep settings={settings} number={stepNumber("type")} selected={draft.bookingType} onSelect={(key) => updateDraft({ bookingType: key })} onNext={nextFromType} />}
    {screen === "event-type" && <EventTypeStep settings={settings} number={stepNumber("event-type")} selected={draft.eventType} customText={draft.eventTypeOther} onSelect={(key) => updateDraft({ eventType: key })} onCustomText={(value) => updateDraft({ eventTypeOther: value })} onNext={nextFromEvent} />}
    {screen === "date" && <DateStep settings={settings} number={stepNumber("date")} capacities={capacities} bookingType={selectedType} eventType={selectedEvent} selectedDate={draft.selectedDate} setSelectedDate={(value) => updateDraft({ selectedDate: value })} arrivalTime={draft.arrivalTime} setArrivalTime={(value) => updateDraft({ arrivalTime: value })} guests={draft.guests} setGuests={(value) => updateDraft({ guests: value })} onNext={nextFromDate} />}
    {screen === "menu" && <MenuStep products={products} categories={data?.categories ?? []} bookingType={selectedType} eventType={selectedEvent} date={draft.selectedDate} guests={draft.guests} cart={draft.cart} setQuantity={setQuantity} onNext={nextFromMenu} />}
    {screen === "review" && <Review number={stepNumber("review")} bookingType={selectedType} eventType={selectedEvent} eventTypeOther={draft.eventTypeOther} date={draft.selectedDate} arrivalTime={draft.arrivalTime} guests={draft.guests} tableCount={tableCount} items={cartItems} total={total} onEdit={(step) => navigate(step)} onNext={() => navigate("checkout")} />}
    {screen === "checkout" && <CheckoutSection step={Number(stepNumber("checkout"))} totalSteps={flowSteps.length} settings={settings} bookingType={selectedType} eventType={selectedEvent} date={draft.selectedDate} arrivalTime={draft.arrivalTime} guests={draft.guests} tableCount={tableCount} items={cartItems} total={total} customer={draft.customer} setCustomer={(customer) => updateDraft({ customer })} customAnswers={draft.customAnswers} setCustomAnswers={(customAnswers) => updateDraft({ customAnswers })} error={submitError} submitting={submitting} onNext={nextFromCheckout} onBack={() => navigate("review")} />}
  </Shell>;
}

function Shell({ settings, children, onBack, menu = false, progressStep, progressHasType = true, progressHasEvent = true, progressHasMenu = true, menuItemCount = 0 }: { settings?: BookingSettings | null; children: React.ReactNode; onBack?: () => void; menu?: boolean; progressStep?: BookingStep; progressHasType?: boolean; progressHasEvent?: boolean; progressHasMenu?: boolean; menuItemCount?: number }) {
  const configuredAccent = settings?.themeColor?.trim().toLowerCase();
  const accent = configuredAccent && configuredAccent !== "#000000" && /^#[0-9a-f]{6}$/i.test(configuredAccent) ? configuredAccent : "#1a5dc6";
  const progressLabels: Record<BookingStep, string> = { type: "BOOKING", "event-type": "JENIS ACARA", date: "TANGGAL", menu: "MENU", review: "REVIEW", checkout: "CHECKOUT" };
  const progressSteps = BOOKING_STEPS.filter((step) => (step !== "type" || progressHasType) && (step !== "event-type" || progressHasEvent) && (step !== "menu" || progressHasMenu));
  const progressIndex = progressStep ? progressSteps.indexOf(progressStep) : -1;
  return <div className={`app-shell ${menu ? "menu-shell" : ""}`} style={{ "--booking-accent": accent } as React.CSSProperties}><header className="topbar"><div className="brand">{onBack && <button className="menu-back-button" aria-label="Kembali" onClick={onBack}><ArrowLeft size={28} /></button>}{settings?.logoUrl ? <img src={settings.logoUrl} alt="" className="brand-logo" /> : <div className="brand-mark"><CalendarDays size={19} /></div>}<div>{progressStep && <span className="menu-eyebrow">{progressLabels[progressStep]}</span>}<strong>{settings?.title || "Booking Djiwa Tentram"}</strong><span>Djiwa Tentram</span></div></div>{menu && <div className="menu-item-count"><strong>{menuItemCount}</strong><span>ITEM</span></div>}{!menu && onBack && <button className="icon-button" aria-label="Kembali" onClick={onBack}><ArrowLeft size={20} /></button>}</header>{progressStep && <div className="header-progress" aria-label={`Langkah ${progressIndex + 1} dari ${progressSteps.length}`}><span className="header-progress-label">Langkah {progressIndex + 1} dari {progressSteps.length}</span><div className="progress">{progressSteps.map((step, index) => <span className={index <= progressIndex ? "active" : ""} key={step} />)}</div></div>}<main>{children}</main><OwnerFooter compact twoLine /></div>;
}
function Landing({ settings, loading, error, retry, onStart, onStatus, showCustomerPromo }: { settings?: BookingSettings | null; loading: boolean; error: string | null; retry: () => void; onStart: () => void; onStatus: () => void; showCustomerPromo: boolean }) { const inactive = settings != null && !settings.isActive; return <section className="landing"><div className="hero"><div className="eyebrow"><Clock3 size={15} /> Booking langsung dari sumber resmi</div><h1>Rencanakan acaramu, <em>tanpa ribet.</em></h1><p>{settings?.description || "Pilih kebutuhan booking, tanggal, jumlah tamu, dan menu sebelum datang."}</p><div className="hero-actions"><button className="button primary" disabled={inactive || loading} onClick={onStart}>{inactive ? "Booking sedang ditutup" : "Mulai booking"} {!inactive && !loading && <ChevronRight size={18} />}</button><button className="button secondary" onClick={onStatus}>Cek booking <Search size={17} /></button></div><div className="payment-note"><CreditCard size={16} /><span>Pembayaran dilakukan setelah review melalui QRIS atau virtual account Djiwa Tentram.</span></div></div>{showCustomerPromo && <a className="booking-promo" href="https://booking.yumme.id/" aria-label="Booking acara dan kolaborasi di Djiwa Tentram"><img src="/booking-collaboration-banner.png" alt="Booking acara dan kolaborasi di Djiwa Tentram — mulai booking di booking.yumme.id" loading="lazy" /></a>}<div className="info-grid"><Info icon={<CalendarDays />} title="Tanggal fleksibel" text="Pilih hari yang masih tersedia." /><Info icon={<Users />} title="Kapasitas jelas" text="Kami hitungkan kebutuhan mejamu." /><Info icon={<UtensilsCrossed />} title="Menu siap saat datang" text="Pilih menu lebih awal agar persiapan lebih cepat." /></div>{loading && <StateCard text="Memuat pengaturan booking…" loading />}{error && <StateCard text={error} action="Coba lagi" onAction={retry} error />}{inactive && <StateCard text="Booking sedang tidak aktif. Silakan cek kembali nanti." error />}</section>; }
function Info({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="info-card"><span className="info-icon">{icon}</span><strong>{title}</strong><span>{text}</span></div>; }
function StateCard({ text, loading, error, action, onAction }: { text: string; loading?: boolean; error?: boolean; action?: string; onAction?: () => void }) { return <div className={`state-card ${error ? "error" : ""}`}>{loading ? <div className="spinner" /> : <CircleAlert size={19} />}<span>{text}</span>{action && <button className="text-button" onClick={onAction}>{action}</button>}</div>; }
function Progress({ active, hasType = true, hasEvent = true, hasMenu = true }: { active: BookingStep; hasType?: boolean; hasEvent?: boolean; hasMenu?: boolean }) { const steps = BOOKING_STEPS.filter((step) => (step !== "type" || hasType) && (step !== "event-type" || hasEvent) && (step !== "menu" || hasMenu)); const index = steps.indexOf(active); return <div className="progress-wrap"><div className="progress-label">Langkah {index + 1} dari {steps.length}</div><div className="progress">{steps.map((step, stepIndex) => <span className={step === active ? "active" : index > stepIndex ? "done" : ""} key={step}>{index > stepIndex ? <Check size={13} /> : stepIndex + 1}</span>)}</div></div>; }
function StepHeader({ number, title, detail }: { number: string; title: string; detail: string }) { return <div className="step-heading"><span className="step-number">{number}</span><div><h2>{title}</h2><p>{detail}</p></div></div>; }
function StepGuide({ steps }: { steps: Array<{ label: string; done?: boolean; active?: boolean }> }) { return <div className="step-guide" aria-label="Panduan langkah ini"><div className="step-guide-heading"><Sparkles size={15} /><strong>Mulai dari sini</strong><span>Ikuti urutannya</span></div><div className="step-guide-list">{steps.map((step, index) => <div className={`step-guide-item ${step.done ? "done" : step.active ? "active" : ""}`} key={step.label}><span className="step-guide-marker">{step.done ? <Check size={12} /> : index + 1}</span><span>{step.label}</span></div>)}</div></div>; }
function iconFor(name?: string) { const icons: Record<string, React.ReactNode> = { users: <Users />, "calendar-heart": <CalendarHeart />, "heart-handshake": <HeartHandshake />, "users-round": <UsersRound />, "graduation-cap": <GraduationCap />, handshake: <Handshake />, sparkles: <Sparkles /> }; return icons[name || ""] || <CalendarDays />; }
function BookingTypeStep({ settings, number, selected, onSelect, onNext }: { settings?: BookingSettings | null; number: string; selected: string; onSelect: (key: string) => void; onNext: () => void }) { const options = settings?.bookingTypes ?? []; return <section className="flow"><StepHeader number={number} title="Untuk kebutuhan apa?" detail="Pilih tipe booking yang paling sesuai." /><StepGuide steps={[{ label: "Pilih kebutuhan booking", done: Boolean(selected), active: !selected }, { label: "Lanjutkan ke detail booking", active: Boolean(selected) }]} />{options.length === 0 ? <StateCard text="Tipe booking belum dikonfigurasi di Supabase. Silakan hubungi admin." error /> : <div className="choice-list">{options.map((option) => <button key={option.key} className={`choice-card ${selected === option.key ? "selected" : ""}`} onClick={() => onSelect(option.key)}><span className="choice-icon">{iconFor(option.icon)}</span><span><strong>{option.label}</strong><small>{option.description}</small></span><ChevronRight size={20} /></button>)}</div>}<StickyAction disabled={!selected || options.length === 0} onClick={onNext}>Lanjutkan <ChevronRight size={18} /></StickyAction></section>; }
function EventTypeStep({ settings, number, selected, customText, onSelect, onCustomText, onNext }: { settings?: BookingSettings | null; number: string; selected: string; customText: string; onSelect: (key: string) => void; onCustomText: (value: string) => void; onNext: () => void }) { const options = settings?.eventTypes ?? []; const active = options.find((option) => option.key === selected); return <section className="flow"><StepHeader number={number} title="Jenis acara apa?" detail="Pilih jenis acara agar booking lebih sesuai." /><StepGuide steps={[{ label: "Pilih jenis acara", done: Boolean(active) }, { label: active?.requiresCustomText ? "Tulis nama acara" : "Lanjut ke tanggal", done: Boolean(active?.requiresCustomText ? customText.trim() : active), active: Boolean(active) }]} />{options.length === 0 ? <StateCard text="Jenis acara belum dikonfigurasi di Supabase. Silakan hubungi admin." error /> : <div className="choice-list compact">{options.map((option) => <button key={option.key} className={`choice-card ${selected === option.key ? "selected" : ""}`} onClick={() => onSelect(option.key)}><span className="choice-icon">{iconFor(option.icon)}</span><span><strong>{option.label}</strong><small>{option.description}</small></span><ChevronRight size={20} /></button>)}</div>}{active?.requiresCustomText && <label className="form-field">Tulis jenis acara<sup>*</sup><input value={customText} onChange={(event) => onCustomText(event.target.value)} placeholder="Contoh: buka bersama kantor" maxLength={120} /></label>}<StickyAction disabled={!active || (active.requiresCustomText && !customText.trim()) || options.length === 0} onClick={onNext}>Lanjut ke tanggal <ChevronRight size={18} /></StickyAction></section>; }
function ContextSummary({ bookingType, eventType, date, guests }: { bookingType?: BookingOption; eventType?: BookingOption; date?: string; guests?: number }) { return <div className="context-summary"><span>{bookingType?.label || "Booking"}</span>{eventType && <><b>·</b><span>{eventType.label}</span></>}{date && <><b>·</b><span>{formatDate(date)}</span></>}{guests && <><b>·</b><span>{guests} tamu</span></>}</div>; }
function DateStep({ settings, number, capacities, bookingType, eventType, selectedDate, setSelectedDate, arrivalTime, setArrivalTime, guests, setGuests, onNext }: { settings?: BookingSettings | null; number: string; capacities: Capacity[]; bookingType?: BookingOption; eventType?: BookingOption; selectedDate: string; setSelectedDate: (v: string) => void; arrivalTime: string; setArrivalTime: (v: string) => void; guests: number; setGuests: (v: number) => void; onNext: () => void }) {
  const today = todayIso();
  const available = capacities.filter((entry) => entry.date >= today && !entry.isClosed);
  const availableMonths = [...new Set(available.map((entry) => entry.date.slice(0, 7)))].sort();
  const currentMonth = today.slice(0, 7);
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate ? selectedDate.slice(0, 7) : availableMonths.find((month) => month >= currentMonth) ?? currentMonth);
  const selectedCapacity = capacities.find((item) => item.date === selectedDate);
  const tooMany = selectedCapacity ? overCapacity(guests, selectedCapacity) : false;
  const monthIndex = availableMonths.indexOf(visibleMonth);
  const monthDate = new Date(`${visibleMonth}-01T12:00:00`);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const leadingDays = monthDate.getDay();
  const monthEntries = available.filter((entry) => entry.date.slice(0, 7) === visibleMonth);
  const capacityByDate = new Map(monthEntries.map((entry) => [entry.date, entry]));
  const calendarCells = Array.from({ length: leadingDays + daysInMonth }, (_, index) => {
    if (index < leadingDays) return null;
    const day = index - leadingDays + 1;
    const date = `${visibleMonth}-${String(day).padStart(2, "0")}`;
    return { date, entry: capacityByDate.get(date) };
  });
  const monthLabel = monthDate.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const moveMonth = (direction: -1 | 1) => { const nextMonth = availableMonths[monthIndex + direction]; if (nextMonth) setVisibleMonth(nextMonth); };
  const capacityState = (entry?: Capacity) => !entry ? "full" : overCapacity(guests, entry) ? "full" : entry.maxPeople > 0 && entry.maxPeople - guests <= Math.max(1, Math.ceil(entry.maxPeople * 0.2)) ? "limited" : "available";
  const selectedDateLabel = selectedDate ? formatDate(selectedDate) : "Belum dipilih";

  return <section className="flow">
    <StepHeader number={number} title="Kapan kamu datang?" detail="Pilih tanggal, jumlah tamu, dan perkiraan jam kedatangan." />
    <StepGuide steps={[{ label: "Pilih tanggal", done: Boolean(selectedDate) }, { label: "Atur jumlah tamu", done: Boolean(selectedDate && guests > 0), active: Boolean(selectedDate) }, { label: "Pilih jam kedatangan", done: Boolean(arrivalTime), active: Boolean(selectedDate && !arrivalTime) }]} />
    <ContextSummary bookingType={bookingType} eventType={eventType} />
    {available.length === 0 ? <StateCard text={`Belum ada tanggal booking aktif dalam ${settings?.bookingWindowDays ?? 0} hari ke depan.`} error /> : <>
      <div className="calendar-card">
        <div className="calendar-toolbar">
          <button className="month-arrow" aria-label="Bulan sebelumnya" disabled={monthIndex <= 0} onClick={() => moveMonth(-1)}><ArrowLeft size={17} /></button>
          <div><strong>{monthLabel}</strong><button className="today-button" onClick={() => { const target = availableMonths.includes(currentMonth) ? currentMonth : availableMonths[0]; if (target) setVisibleMonth(target); }}>Hari ini</button></div>
          <button className="month-arrow next" aria-label="Bulan berikutnya" disabled={monthIndex < 0 || monthIndex >= availableMonths.length - 1} onClick={() => moveMonth(1)}><ChevronRight size={17} /></button>
        </div>
        <div className="weekday-row">{["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">{calendarCells.map((cell, index) => cell ? <button key={cell.date} className={`calendar-day ${selectedDate === cell.date ? "selected" : ""} ${cell.date === today ? "today" : ""} ${capacityState(cell.entry)}`} disabled={!cell.entry} onClick={() => cell.entry && setSelectedDate(cell.date)}><span>{new Date(`${cell.date}T12:00:00`).getDate()}</span><small>{capacityState(cell.entry) === "available" ? "Tersedia" : capacityState(cell.entry) === "limited" ? "Terbatas" : "Penuh"}</small></button> : <span className="calendar-empty" key={`empty-${index}`} />)}</div>
        {monthEntries.length === 0 && <p className="calendar-empty-state">Belum ada tanggal booking di bulan ini. Pilih bulan berikutnya.</p>}
        <div className="availability-legend"><span><i className="available" /> Tersedia</span><span><i className="limited" /> Terbatas</span><span><i className="full" /> Penuh</span></div>
      </div>
      <div className={`arrival-details ${selectedDate ? "has-date" : ""}`}>
        <div className="arrival-summary"><span className="field-label">Tanggal kedatangan</span><strong>{selectedDateLabel}</strong>{!selectedDate && <small>Pilih tanggal pada kalender terlebih dahulu.</small>}</div>
        <div className="arrival-fields">
          <div className="guest-field"><label className="field-label">Jumlah tamu</label><div className="stepper"><button aria-label="Kurangi tamu" disabled={!selectedDate} onClick={() => setGuests(Math.max(1, guests - 1))}><Minus /></button><strong>{guests}<small> tamu</small></strong><button aria-label="Tambah tamu" disabled={!selectedDate} onClick={() => setGuests(Math.min(100, guests + 1))}><Plus /></button></div><p className="helper">Perkiraan meja: <strong>{sharedTableCount(guests, selectedCapacity?.peoplePerTable ?? settings?.defaultPeoplePerTable ?? 4)} meja</strong></p></div>
          <label className="arrival-time-field"><span className="field-label"><Clock3 size={15} /> Jam kedatangan <sup>*</sup></span><div className="time-input-shell"><Clock3 className="time-input-icon" size={20} aria-hidden="true" /><input id="booking-arrival-time" className="time-input" type="time" value={arrivalTime} disabled={!selectedDate} onChange={(event) => setArrivalTime(event.target.value)} /><span className="time-zone">WIB</span></div><small>Pilih perkiraan waktu tiba di lokasi.</small></label>
        </div>
        {tooMany && <p className="form-error">Jumlah tamu atau meja melebihi kapasitas tanggal ini.</p>}
      </div>
      <StickyAction disabled={!selectedDate || !arrivalTime || !selectedCapacity || tooMany} onClick={onNext}>Lanjut ke menu <ChevronRight size={18} /></StickyAction>
    </>}
  </section>;
}
function overCapacity(guests: number, capacity: Capacity) { return Boolean((capacity.maxPeople > 0 && guests > capacity.maxPeople) || (capacity.maxTables > 0 && sharedTableCount(guests, capacity.peoplePerTable) > capacity.maxTables)); }
function MenuStep({ products, categories, bookingType, eventType, date, guests, cart, setQuantity, onNext }: { products: Product[]; categories: Category[]; bookingType?: BookingOption; eventType?: BookingOption; date: string; guests: number; cart: Cart; setQuantity: (id: string, quantity: number) => void; onNext: () => void }) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const roots = categories.filter((category) => !category.parentId).sort((a, b) => a.displayOrder - b.displayOrder);
  const children = categories.filter((category) => category.parentId).sort((a, b) => a.displayOrder - b.displayOrder);
  const visibleSubcategories = categoryFilter === "all" ? children : children.filter((category) => category.parentId === categoryFilter);
  const categoryTree = (categoryId: string) => {
    const ids = new Set([categoryId]);
    let changed = true;
    while (changed) {
      changed = false;
      categories.forEach((category) => {
        if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) { ids.add(category.id); changed = true; }
      });
    }
    return ids;
  };
  const selectedCategoryIds = categoryFilter === "all" ? null : categoryTree(categoryFilter);
  const selectedSubcategoryIds = subcategoryFilter === "all" ? null : categoryTree(subcategoryFilter);
  const filtered = products.filter((item) => {
    const matchesQuery = item.name.toLowerCase().includes(query.toLowerCase()) || String(item.menuNumber ?? "").includes(query);
    const matchesCategory = !selectedCategoryIds || (item.categoryId != null && selectedCategoryIds.has(item.categoryId));
    const matchesSubcategory = !selectedSubcategoryIds || (item.categoryId != null && selectedSubcategoryIds.has(item.categoryId));
    return matchesQuery && matchesCategory && matchesSubcategory;
  });
  const itemCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const addOne = (id: string) => setQuantity(id, (cart[id] ?? 0) + 1);
  const stopCardClick = (event: React.MouseEvent) => event.stopPropagation();
  const selectCategory = (value: string) => { setCategoryFilter(value); setSubcategoryFilter("all"); };

  return <section className={`flow menu-flow${itemCount > 0 ? " has-cart" : ""}`}>
    <div className="menu-intro">Pilih makanan dan minuman dari katalog.</div><StepGuide steps={[{ label: "Cari atau pilih kategori menu", done: itemCount > 0 }, { label: "Tambah menu yang diinginkan", done: itemCount > 0, active: itemCount === 0 }, { label: "Lanjut ke review", active: itemCount > 0 }]} />
    <div className="menu-catalog-panel">
      <h2><span className="catalog-icon"><UtensilsCrossed size={20} /></span>Katalog produk</h2>
      <div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau nomor menu" /></div>
      <div className="category-chips" aria-label="Kategori menu">
        <button className={categoryFilter === "all" ? "active" : ""} onClick={() => selectCategory("all")} type="button">Semua</button>
        {roots.map((category) => <button className={categoryFilter === category.id ? "active" : ""} key={category.id} onClick={() => selectCategory(category.id)} type="button">{category.name}</button>)}
      </div>
      {children.length > 0 && <div className="subcategory-chips" aria-label="Subkategori menu">
        <button className={subcategoryFilter === "all" ? "active" : ""} onClick={() => setSubcategoryFilter("all")} type="button">Semua subkategori</button>
        {(categoryFilter === "all" ? children : visibleSubcategories).map((category) => <button className={subcategoryFilter === category.id ? "active" : ""} key={category.id} onClick={() => setSubcategoryFilter(category.id)} type="button">{category.name}</button>)}
      </div>}
    </div>
    <div className="menu-filters" aria-label="Filter menu">
      <label><span>Kategori</span><select value={categoryFilter} onChange={(event) => selectCategory(event.target.value)}><option value="all">Semua kategori</option>{roots.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label><span>Subkategori</span><select value={subcategoryFilter} onChange={(event) => setSubcategoryFilter(event.target.value)}><option value="all">Semua subkategori</option>{visibleSubcategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
    </div>
    {(categoryFilter !== "all" || subcategoryFilter !== "all") && <button className="clear-filter" onClick={() => { setCategoryFilter("all"); setSubcategoryFilter("all"); }} type="button">Reset filter</button>}
    {products.length === 0 ? <StateCard text="Menu belum tersedia dari Supabase. Booking belum dapat dilanjutkan." error /> : filtered.length === 0 ? <StateCard text="Menu tidak ditemukan pada filter ini." /> : <div className="product-grid">
      {filtered.map((item) => { const quantity = cart[item.id] ?? 0; return <article className={`product-card ${quantity ? "selected" : ""}`} key={item.id} onClick={() => addOne(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); addOne(item.id); } }} role="button" tabIndex={0} aria-label={`${item.name}, ${quantity ? `jumlah ${quantity}` : "belum dipilih"}. Klik untuk tambah satu`}>
        {item.imageUrl ? <img src={item.imageUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <div className="product-image"><UtensilsCrossed /></div>}
        <div className="product-body"><span className="menu-number">{item.menuNumber ? `#${item.menuNumber}` : "Menu"}</span><h3>{item.name}</h3>{item.description && <p className="product-description">{item.description}</p>}<strong>{currency(item.promoPrice ?? item.price)}</strong><div className="quantity-control" onClick={stopCardClick}>{quantity > 0 ? <><button aria-label={`Kurangi ${item.name}`} onClick={() => setQuantity(item.id, quantity - 1)}><Minus size={15} /></button><b aria-live="polite">{quantity}</b><button aria-label={`Tambah ${item.name}`} onClick={() => setQuantity(item.id, quantity + 1)}><Plus size={15} /></button></> : <button className="add-button" aria-label={`Tambah ${item.name}`} onClick={() => addOne(item.id)}><Plus size={24} /></button>}</div></div>
      </article>; })}
    </div>}
    {itemCount > 0 && <StickyAction onClick={onNext}>{`Lihat review · ${itemCount} item`}<ChevronRight size={18} /></StickyAction>}
  </section>;
}
function Review({ number, bookingType, eventType, eventTypeOther, date, arrivalTime, guests, tableCount, items, total, onEdit, onNext }: { number: string; bookingType?: BookingOption; eventType?: BookingOption; eventTypeOther: string; date: string; arrivalTime: string; guests: number; tableCount: number; items: Array<Product & { quantity: number }>; total: number; onEdit: (step: BookingStep) => void; onNext: () => void }) { return <section className="flow"><StepHeader number={number} title="Review pesanan" detail="Pastikan detail booking dan menu sudah benar." /><StepGuide steps={[{ label: "Periksa tipe dan tanggal booking", done: Boolean(bookingType && date) }, { label: "Periksa jumlah tamu dan menu", done: Boolean(guests > 0 && items.length >= 0), active: true }, { label: "Lanjut ke data pemesan", active: Boolean(bookingType && date) }]} /><div className="review-card"><ReviewRow label="Tipe booking" value={eventType ? `${bookingType?.label || "Acara"} · ${eventType.label}${eventTypeOther ? ` · ${eventTypeOther}` : ""}` : bookingType?.label || "-"} edit={() => onEdit("type")} /><ReviewRow label="Tanggal & kedatangan" value={`${formatDate(date)} · ${arrivalTime || "Jam belum diisi"} · ${guests} orang · ${tableCount} meja`} edit={() => onEdit("date")} /><div className="review-section"><span>Menu pre-order</span>{items.length === 0 ? <p className="helper">Tidak ada menu pre-order untuk alur booking ini.</p> : items.map((item) => <div className="line" key={item.id}><span>{item.quantity} × {item.name}</span><strong>{currency((item.promoPrice ?? item.price) * item.quantity)}</strong></div>)}{items.length > 0 && <><div className="total"><span>Total menu</span><strong>{currency(total)}</strong></div><button className="text-button review-edit" onClick={() => onEdit("menu")}>Ubah menu</button></>}</div></div><StickyAction onClick={onNext}>Lanjut ke checkout <ChevronRight size={18} /></StickyAction></section>; }
function ReviewRow({ label, value, edit }: { label: string; value: string; edit: () => void }) { return <div className="review-row"><div><span>{label}</span><strong>{value}</strong></div><button className="text-button" onClick={edit}>Ubah</button></div>; }
function requiredFieldErrors(fields: BookingCustomField[], values: Record<string, unknown>) { return fields.filter((field) => field.required && !field.isBookingEventOption && !String(values[field.id] ?? "").trim()).reduce<Record<string, string>>((errors, field) => { errors[field.id] = `${field.label} wajib diisi.`; return errors; }, {}); }
function StickyAction({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) { return <div className="sticky-action"><button className="button primary" disabled={disabled} onClick={onClick}>{children}</button></div>; }
function Success({ code, onStatus }: { code: string; onStatus: () => void }) { const [copied, setCopied] = useState(false); return <section className="success"><div className="success-icon"><Check size={30} /></div><span className="eyebrow">Booking dibuat</span><h1>Lanjutkan,<br /><em>selesaikan pembayaran.</em></h1><p>Simpan kode ini untuk cek status booking.</p><div className="code-card"><span>Kode booking</span><strong>{code || "-"}</strong><button onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); }}><Copy size={16} /> {copied ? "Tersalin" : "Salin kode"}</button></div><button className="button primary full" onClick={onStatus}>Cek status booking <ChevronRight size={18} /></button></section>; }
function Status({ code, setCode, result, error, loading, onLookup }: { code: string; setCode: (value: string) => void; result: BookingResult | null; error: string | null; loading: boolean; onLookup: () => void }) { return <section className="flow status"><div className="status-hero"><div className="info-icon"><Search /></div><h1>Cek booking</h1><p>Masukkan kode booking untuk melihat status terbaru.</p></div><div className="form-card"><label className="form-field">Kode booking<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Contoh: BK-1234" /></label><button className="button primary full" disabled={!code.trim() || loading} onClick={onLookup}>{loading ? "Mencari…" : "Cari booking"} {!loading && <Search size={18} />}</button></div>{error && <StateCard text={error} error />}{result && <div className="success status-result"><span className="eyebrow">Booking: {result.status}</span><h2>{result.bookingCode}</h2><p><strong>Status booking:</strong> {result.status}</p><p><strong>Status pembayaran:</strong> {result.paymentStatus}</p><p>{formatDate(result.date)} · {result.guests} tamu · {result.tableCount} meja</p></div>}</section>; }

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() { notifyAppUpdateAvailable(); },
});
setAppUpdateHandler(updateSW);
startAppUpdatePolling();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void checkForAppUpdate();
});

createRoot(document.getElementById("root")!).render(<><App /><AppUpdatePrompt /></>);
