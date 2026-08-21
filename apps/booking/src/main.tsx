import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Check, ChevronRight, CircleAlert, Clock3, Copy, CreditCard, ExternalLink, Minus, Plus, Search, ShoppingBag, Users, UtensilsCrossed } from "lucide-react";
import { BOOKING_STEPS, type BookingStep } from "./lib/booking-constants";
import { currency, estimatedTables, formatDate, todayIso } from "./lib/booking-formatters";
import { type BookingDraft, type BookingResult, type Capacity, type Product, type BookingSettings, createBooking, createBookingPayment, loadBookingData, lookupBooking } from "./lib/client";
import { validateCustomer, type CustomerForm } from "./lib/booking-validation";
import "./index.css";

type Screen = "landing" | BookingStep | "success" | "status";
type Cart = Record<string, number>;

const emptyCustomer: CustomerForm = { name: "", phone: "", email: "", notes: "" };

function go(path: string) { window.history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate")); }
function readScreen(): Screen {
  const path = window.location.pathname;
  if (path === "/booking" || path === "/booking/date") return "date";
  if (path === "/booking/menu") return "menu";
  if (path === "/booking/customer") return "customer";
  if (path === "/booking/review") return "review";
  if (path === "/booking/success") return "success";
  if (path === "/booking/status") return "status";
  return "landing";
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(readScreen);
  const [data, setData] = useState<{ settings: BookingSettings | null; capacities: Capacity[]; products: Product[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [guests, setGuests] = useState(2);
  const [cart, setCart] = useState<Cart>({});
  const [customer, setCustomer] = useState<CustomerForm>(emptyCustomer);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [statusCode, setStatusCode] = useState(() => new URLSearchParams(window.location.search).get("code") || localStorage.getItem("booking-last-code") || "");
  const [statusResult, setStatusResult] = useState<BookingResult | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    const onPop = () => setScreen(readScreen());
    window.addEventListener("popstate", onPop);
    loadBookingData().then(setData).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Data booking tidak dapat dimuat."));
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const settings = data?.settings;
  const capacities = data?.capacities ?? [];
  const products = data?.products ?? [];
  const capacity = capacities.find((entry) => entry.date === selectedDate);
  const tableCount = estimatedTables(guests, capacity?.peoplePerTable ?? 4);
  const cartItems = useMemo(() => products.filter((product) => cart[product.id]).map((product) => ({ ...product, quantity: cart[product.id]! })), [cart, products]);
  const total = cartItems.reduce((sum, item) => sum + (item.promoPrice ?? item.price) * item.quantity, 0);

  const navigate = (next: Screen) => go(next === "landing" ? "/" : next === "date" ? "/booking" : `/booking/${next}`);
  const setQuantity = (id: string, quantity: number) => setCart((current) => { const next = { ...current }; if (quantity <= 0) delete next[id]; else next[id] = quantity; return next; });
  const nextFromDate = () => { if (!selectedDate || !capacity || guests > capacity.maxPeople) return; navigate("menu"); };
  const nextFromCustomer = () => { const errors = validateCustomer(customer); if (Object.keys(errors).length === 0) navigate("review"); };
  const submit = async () => {
    setSubmitting(true); setSubmitError(null);
    const draft: BookingDraft = { date: selectedDate, guests, tableCount, items: cartItems.map((item) => ({ productId: item.id, name: item.name, price: item.promoPrice ?? item.price, quantity: item.quantity })), customer };
    try { const created = await createBooking(draft); const payment = await createBookingPayment(created, draft); window.location.assign(payment.invoiceUrl); }
    catch (error: unknown) { setSubmitError(error instanceof Error ? error.message : "Pembayaran belum berhasil disiapkan."); }
    finally { setSubmitting(false); }
  };

  if (screen === "success" && result) return <Shell settings={settings} onBack={() => navigate("landing")}><Success result={result} onStatus={() => { setStatusCode(result.bookingCode); navigate("status"); }} /></Shell>;
  if (screen === "status") return <Shell settings={settings} onBack={() => navigate("landing")}><Status code={statusCode} setCode={setStatusCode} result={statusResult} error={statusError} loading={statusLoading} onLookup={async () => { setStatusLoading(true); setStatusError(null); setStatusResult(null); try { setStatusResult(await lookupBooking(statusCode.trim())); } catch (error: unknown) { setStatusError(error instanceof Error ? error.message : "Status tidak tersedia."); } finally { setStatusLoading(false); } }} /></Shell>;

  return <Shell settings={settings} onBack={screen === "landing" ? undefined : () => navigate(screen === "date" ? "landing" : screen === "menu" ? "date" : screen === "customer" ? "menu" : "customer")}>
    {screen === "landing" && <Landing settings={settings} loading={!data && !loadError} error={loadError} retry={() => { setLoadError(null); loadBookingData().then(setData).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Data booking tidak dapat dimuat.")); }} onStart={() => navigate("date")} onStatus={() => navigate("status")} />}
    {screen === "date" && <DateStep capacities={capacities} selectedDate={selectedDate} setSelectedDate={setSelectedDate} guests={guests} setGuests={setGuests} onNext={nextFromDate} />}
    {screen === "menu" && <MenuStep products={products} cart={cart} setQuantity={setQuantity} onNext={() => navigate("customer")} />}
    {screen === "customer" && <CustomerStep customer={customer} setCustomer={setCustomer} onNext={nextFromCustomer} />}
    {screen === "review" && <Review draft={{ date: selectedDate, guests, tableCount, items: cartItems, customer, total }} error={submitError} submitting={submitting} onEdit={(step) => navigate(step)} onSubmit={submit} />}
  </Shell>;
}

function Shell({ settings, children, onBack }: { settings?: BookingSettings | null; children: React.ReactNode; onBack?: () => void }) {
  const configuredAccent = settings?.themeColor?.trim().toLowerCase();
  const accent = configuredAccent && configuredAccent !== "#000000" && /^#[0-9a-f]{6}$/i.test(configuredAccent) ? configuredAccent : "#1a5dc6";
  return <div className="app-shell" style={{ "--booking-accent": accent } as React.CSSProperties}><header className="topbar"><div className="brand"><div className="brand-mark"><CalendarDays size={19} /></div><div><strong>{settings?.title || "Booking Djiwa Tentram"}</strong><span>Djiwa Tentram</span></div></div>{onBack && <button className="icon-button" aria-label="Kembali" onClick={onBack}><ArrowLeft size={20} /></button>}</header><main>{children}</main></div>;
}

function Landing({ settings, loading, error, retry, onStart, onStatus }: { settings?: BookingSettings | null; loading: boolean; error: string | null; retry: () => void; onStart: () => void; onStatus: () => void }) {
  const inactive = settings != null && !settings.isActive;
  return <section className="landing"><div className="hero"><div className="eyebrow"><Clock3 size={15} /> Booking langsung dari sumber resmi</div><h1>Atur kunjunganmu,<br /><em>tanpa antre.</em></h1><p>{settings?.description || "Pilih tanggal, jumlah tamu, dan menu favorit sebelum datang."}</p><div className="hero-actions"><button className="button primary" disabled={inactive} onClick={onStart}>{inactive ? "Booking sedang ditutup" : "Pilih tanggal & menu"} {!inactive && <ChevronRight size={18} />}</button><button className="button secondary" onClick={onStatus}>Cek Booking <Search size={17} /></button></div><div className="payment-note"><CreditCard size={16} /><span>Bayar dulu via QRIS — QRIS, virtual account, dan metode pembayaran lainnya.</span></div></div><div className="info-grid"><Info icon={<CalendarDays />} title="Tanggal fleksibel" text="Pilih hari yang masih tersedia." /><Info icon={<Users />} title="Kapasitas jelas" text="Jumlah meja dihitung otomatis." /><Info icon={<UtensilsCrossed />} title="Pre-order menu" text="Pesanan siap saat kamu tiba." /></div>{loading && <StateCard text="Memuat pengaturan booking…" loading />}{error && <StateCard text={error} action="Coba lagi" onAction={retry} error />}{inactive && <StateCard text="Booking sedang tidak aktif. Silakan cek kembali nanti." error />}</section>;
}
function Info({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="info-card"><span className="info-icon">{icon}</span><strong>{title}</strong><span>{text}</span></div>; }
function StateCard({ text, loading, error, action, onAction }: { text: string; loading?: boolean; error?: boolean; action?: string; onAction?: () => void }) { return <div className={`state-card ${error ? "error" : ""}`}>{loading ? <div className="spinner" /> : <CircleAlert size={19} />}<span>{text}</span>{action && <button className="text-button" onClick={onAction}>{action}</button>}</div>; }

function StepHeader({ number, title, detail }: { number: string; title: string; detail: string }) { return <div className="step-heading"><span className="step-number">{number}</span><div><h2>{title}</h2><p>{detail}</p></div></div>; }
function DateStep({ capacities, selectedDate, setSelectedDate, guests, setGuests, onNext }: { capacities: Capacity[]; selectedDate: string; setSelectedDate: (v: string) => void; guests: number; setGuests: (v: number) => void; onNext: () => void }) {
  const today = todayIso();
  const available = capacities.filter((entry) => entry.date >= today && !entry.isClosed);
  const availableMonths = [...new Set(available.map((entry) => entry.date.slice(0, 7)))].sort();
  const currentMonth = today.slice(0, 7);
  const [visibleMonth, setVisibleMonth] = useState(() => (selectedDate ? selectedDate.slice(0, 7) : availableMonths.find((month) => month >= currentMonth) ?? currentMonth));
  const selectedCapacity = capacities.find((item) => item.date === selectedDate);
  const overPeopleCapacity = Boolean(selectedCapacity && selectedCapacity.maxPeople > 0 && guests > selectedCapacity.maxPeople);
  const overTableCapacity = Boolean(selectedCapacity && selectedCapacity.maxTables > 0 && estimatedTables(guests, selectedCapacity.peoplePerTable) > selectedCapacity.maxTables);
  const overCapacity = overPeopleCapacity || overTableCapacity;
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
  const moveMonth = (direction: -1 | 1) => {
    const nextMonth = availableMonths[monthIndex + direction];
    if (nextMonth) setVisibleMonth(nextMonth);
  };
  const capacityState = (entry?: Capacity) => {
    if (!entry) return "full";
    if (entry.maxPeople > 0 && entry.maxPeople <= guests) return "limited";
    return "available";
  };
  return <section className="flow"><Progress active="date" /><StepHeader number="01" title="Kapan kamu datang?" detail="Pilih tanggal dan jumlah tamu." />{available.length === 0 ? <StateCard text="Belum ada tanggal booking aktif setelah hari ini. Admin perlu menambahkan kapasitas tanggal dari Pengaturan Booking." /> : <>
    <div className="calendar-card">
      <div className="calendar-toolbar"><button className="month-arrow" aria-label="Bulan sebelumnya" disabled={monthIndex <= 0} onClick={() => moveMonth(-1)}><ArrowLeft size={17} /></button><div><strong>{monthLabel}</strong><button className="today-button" onClick={() => { const target = availableMonths.includes(currentMonth) ? currentMonth : availableMonths[0]; if (target) setVisibleMonth(target); }}>Hari ini</button></div><button className="month-arrow next" aria-label="Bulan berikutnya" disabled={monthIndex < 0 || monthIndex >= availableMonths.length - 1} onClick={() => moveMonth(1)}><ChevronRight size={17} /></button></div>
      <div className="weekday-row">{["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">{calendarCells.map((cell, index) => cell ? <button key={cell.date} className={`calendar-day ${selectedDate === cell.date ? "selected" : ""} ${cell.date === today ? "today" : ""} ${capacityState(cell.entry)}`} disabled={!cell.entry} onClick={() => cell.entry && setSelectedDate(cell.date)}><span>{new Date(`${cell.date}T12:00:00`).getDate()}</span><small>{capacityState(cell.entry) === "available" ? "Tersedia" : capacityState(cell.entry) === "limited" ? "Terbatas" : "Penuh"}</small></button> : <span className="calendar-empty" key={`empty-${index}`} />)}</div>
      {monthEntries.length === 0 && <p className="calendar-empty-state">Belum ada tanggal booking di bulan ini. Pilih bulan berikutnya.</p>}
      <div className="availability-legend"><span><i className="available" /> Tersedia</span><span><i className="limited" /> Terbatas</span><span><i className="full" /> Penuh</span></div>
    </div>
    <div className="panel selection-panel"><div><label className="field-label">Jumlah tamu</label><p className="selection-date">{selectedDate ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Pilih tanggal terlebih dahulu"}</p></div><div className="stepper"><button aria-label="Kurangi tamu" onClick={() => setGuests(Math.max(1, guests - 1))}><Minus /></button><strong>{guests}<small> tamu</small></strong><button aria-label="Tambah tamu" onClick={() => setGuests(Math.min(50, guests + 1))}><Plus /></button></div><p className="helper">Perkiraan meja: <strong>{estimatedTables(guests, selectedCapacity?.peoplePerTable ?? 4)} meja</strong></p>{overCapacity && <p className="form-error">Jumlah tamu melebihi kapasitas tanggal ini.</p>}</div>
    <StickyAction disabled={!selectedDate || !selectedCapacity || overCapacity} onClick={onNext}>{selectedDate ? `Lanjut ke menu · ${guests} tamu` : "Pilih tanggal terlebih dahulu"} <ChevronRight size={18} /></StickyAction>
  </>}</section>;
}
function Progress({ active }: { active: BookingStep }) { return <div className="progress">{BOOKING_STEPS.map((step, index) => <span className={step === active ? "active" : BOOKING_STEPS.indexOf(active) > index ? "done" : ""} key={step}>{BOOKING_STEPS.indexOf(active) > index ? <Check size={13} /> : index + 1}</span>)}</div>; }

function MenuStep({ products, cart, setQuantity, onNext }: { products: Product[]; cart: Cart; setQuantity: (id: string, quantity: number) => void; onNext: () => void }) {
  const [query, setQuery] = useState(""); const filtered = products.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) || String(item.menuNumber ?? "").includes(query));
  return <section className="flow"><Progress active="menu" /><StepHeader number="02" title="Pilih menu untuk dibayar" detail="Booking tanggal dan pre-order dikonfirmasi setelah pembayaran QRIS." /><div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau nomor menu" /></div>{products.length === 0 ? <StateCard text="Menu belum tersedia. Booking berbayar belum dapat dilanjutkan." error /> : filtered.length === 0 ? <StateCard text="Menu tidak ditemukan." /> : <div className="product-grid">{filtered.map((item) => <article className="product-card" key={item.id}>{item.imageUrl ? <img src={item.imageUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <div className="product-image"><UtensilsCrossed /></div>}<div className="product-body"><span className="menu-number">{item.menuNumber ? `#${item.menuNumber}` : "Menu"}</span><h3>{item.name}</h3><strong>{currency(item.promoPrice ?? item.price)}</strong><div className="quantity-control">{cart[item.id] ? <><button aria-label={`Kurangi ${item.name}`} onClick={() => setQuantity(item.id, cart[item.id]! - 1)}><Minus size={15} /></button><b>{cart[item.id]}</b><button aria-label={`Tambah ${item.name}`} onClick={() => setQuantity(item.id, cart[item.id]! + 1)}><Plus size={15} /></button></> : <button className="add-button" onClick={() => setQuantity(item.id, 1)}>Tambah</button>}</div></div></article>)}</div>}<StickyAction disabled={!Object.keys(cart).length} onClick={onNext}>{Object.keys(cart).length ? `Lanjut (${Object.values(cart).reduce((a, b) => a + b, 0)} item)` : "Pilih menu untuk lanjut"}<ChevronRight size={18} /></StickyAction></section>;
}

function CustomerStep({ customer, setCustomer, onNext }: { customer: CustomerForm; setCustomer: React.Dispatch<React.SetStateAction<CustomerForm>>; onNext: () => void }) { const errors = validateCustomer(customer); const update = (field: keyof CustomerForm, value: string) => setCustomer((current) => ({ ...current, [field]: value })); return <section className="flow"><Progress active="customer" /><StepHeader number="03" title="Data pemesan" detail="Kami butuh ini untuk konfirmasi booking." /><div className="form-card">{([ ["name", "Nama lengkap", "Contoh: Fakhri Azzam", true], ["phone", "Nomor WhatsApp", "08… atau +62…", true], ["email", "Email", "opsional@email.com", false] ] as const).map(([field, label, placeholder, required]) => <label className="form-field" key={field}>{label}{required && <sup>*</sup>}<input value={customer[field]} onChange={(event) => update(field, event.target.value)} placeholder={placeholder} inputMode={field === "phone" ? "tel" : "text"} />{errors[field] && <small className="form-error">{errors[field]}</small>}</label>)}<label className="form-field">Catatan tambahan<textarea value={customer.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Alergi, kebutuhan kursi bayi, atau permintaan lain" rows={3} /></label></div><StickyAction disabled={Object.keys(errors).length > 0} onClick={onNext}>Lihat review <ChevronRight size={18} /></StickyAction></section>; }

function Review({ draft, error, submitting, onEdit, onSubmit }: { draft: { date: string; guests: number; tableCount: number; items: Array<Product & { quantity: number }>; customer: CustomerForm; total: number }; error: string | null; submitting: boolean; onEdit: (step: BookingStep) => void; onSubmit: () => void }) { return <section className="flow"><Progress active="review" /><StepHeader number="04" title="Cek kembali" detail="Pastikan data bookingmu sudah benar." /><div className="review-card"><ReviewRow label="Tanggal" value={formatDate(draft.date)} edit={() => onEdit("date")} /><ReviewRow label="Tamu / meja" value={`${draft.guests} orang · ${draft.tableCount} meja`} edit={() => onEdit("date")} /><ReviewRow label="Pemesan" value={`${draft.customer.name} · ${draft.customer.phone}`} edit={() => onEdit("customer")} /><div className="review-section"><span>Pre-order menu</span>{draft.items.length ? draft.items.map((item) => <div className="line" key={item.id}><span>{item.quantity} × {item.name}</span><strong>{currency((item.promoPrice ?? item.price) * item.quantity)}</strong></div>) : <p className="muted">Tidak ada menu pre-order</p>}<div className="total"><span>Estimasi total menu</span><strong>{currency(draft.total)}</strong></div></div></div>{error && <StateCard text={error} error />}<StickyAction disabled={submitting} onClick={onSubmit}>{submitting ? "Menyiapkan pembayaran…" : "Lanjut bayar via QRIS"}{!submitting && <Check size={18} />}</StickyAction><p className="terms">Booking akan dikonfirmasi setelah pembayaran QRIS berhasil diverifikasi melalui webhook.</p></section>; }
function ReviewRow({ label, value, edit }: { label: string; value: string; edit: () => void }) { return <div className="review-row"><div><span>{label}</span><strong>{value}</strong></div><button className="text-button" onClick={edit}>Ubah</button></div>; }
function StickyAction({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) { return <div className="sticky-action"><button className="button primary" disabled={disabled} onClick={onClick}>{children}</button></div>; }

function Success({ result, onStatus }: { result: BookingResult; onStatus: () => void }) { const [copied, setCopied] = useState(false); return <section className="success"><div className="success-icon"><Check size={30} /></div><span className="eyebrow">Booking diterima</span><h1>Sampai jumpa,<br /><em>terima kasih!</em></h1><p>Simpan kode ini untuk cek status booking.</p><div className="code-card"><span>Kode booking</span><strong>{result.bookingCode}</strong><button onClick={() => { navigator.clipboard?.writeText(result.bookingCode); setCopied(true); }}><Copy size={16} /> {copied ? "Tersalin" : "Salin kode"}</button></div><div className="summary-mini"><span><CalendarDays size={16} /> {formatDate(result.date)}</span><span><Users size={16} /> {result.guests} tamu · {result.tableCount} meja</span></div><button className="button primary full" onClick={onStatus}>Cek status booking <ChevronRight size={18} /></button></section>; }
function Status({ code, setCode, result, error, loading, onLookup }: { code: string; setCode: (value: string) => void; result: BookingResult | null; error: string | null; loading: boolean; onLookup: () => void }) { return <section className="flow status"><div className="status-hero"><div className="info-icon"><Search /></div><h1>Cek booking</h1><p>Masukkan kode booking untuk melihat status terbaru.</p></div><div className="form-card"><label className="form-field">Kode booking<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Contoh: BK-1234" /></label><button className="button primary full" disabled={!code.trim() || loading} onClick={onLookup}>{loading ? "Mencari…" : "Cari booking"} {!loading && <Search size={18} />}</button></div>{error && <StateCard text={error} error />}{result && <div className="success status-result"><span className="eyebrow">Booking: {result.status}</span><h2>{result.bookingCode}</h2><p>Pembayaran: {result.paymentStatus}</p><p>{formatDate(result.date)} · {result.guests} tamu · {result.tableCount} meja</p><a href="https://wa.me/" target="_blank" rel="noreferrer">Hubungi support <ExternalLink size={15} /></a></div>}</section>; }

createRoot(document.getElementById("root")!).render(<App />);
