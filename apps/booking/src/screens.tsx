import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { ArrowLeft, Check, ChevronRight, Copy, CreditCard, Minus, Pencil, Plus, Search, UtensilsCrossed, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { tableCount as sharedTableCount } from "@djiwaapps/web-shared/booking/capacity";
import type { Djiwa3DIconName } from "@djiwaapps/web-shared";
import type { BookingOption, BookingStep } from "./lib/booking-constants";
import { currency, formatDate, todayIso } from "./lib/booking-formatters";
import type { BookingCustomField, BookingResult, BookingSettings, Capacity, Category, Product, ScheduleEntry } from "./lib/client";
import { validateCustomer, type CustomerForm } from "./lib/booking-validation";
import type { BookingCart } from "./lib/booking-state";
import { Button, Dock, EASE, Field, Head, Icon3D, Loading, Note, Num, Radio, Rise, SPRING, StickyAction } from "./ui";

type Cart = BookingCart;
type Item = Product & { quantity: number };

const OPTION_ICON: Record<string, Djiwa3DIconName> = {
  users: "party-size", "calendar-heart": "customer-benefit-happy-hour", "heart-handshake": "customer-benefit-wallet",
  "users-round": "navigation-community", "graduation-cap": "employee-leaderboard", handshake: "suppliers-purchase-order", sparkles: "customer-benefit-promo",
};
const iconFor = (name?: string): Djiwa3DIconName => OPTION_ICON[name || ""] ?? "restaurant-cafe";
export const overCapacity = (guests: number, c: Capacity) => {
  const leftPeople = c.maxPeople > 0 ? c.maxPeople - (c.usedPeople ?? 0) : Infinity;
  const leftTables = c.maxTables > 0 ? c.maxTables - (c.usedTables ?? 0) : Infinity;
  return guests > leftPeople || sharedTableCount(guests, c.peoplePerTable) > leftTables;
};
const unitPrice = (p: Product) => p.promoPrice ?? p.price;
export function requiredFieldErrors(fields: BookingCustomField[], values: Record<string, unknown>) {
  return fields.filter((f) => f.required && !f.isBookingEventOption && !String(values[f.id] ?? "").trim()).reduce<Record<string, string>>((e, f) => { e[f.id] = `${f.label} wajib diisi.`; return e; }, {});
}

/* ── Landing ───────────────────────────────────────────── */
export function Landing({ settings, loading, error, retry, onStart, onStatus, showCustomerPromo }: { settings?: BookingSettings | null; loading: boolean; error: string | null; retry: () => void; onStart: () => void; onStatus: () => void; showCustomerPromo: boolean }) {
  const inactive = settings != null && !settings.isActive;
  return <section className="bk-page">
    <Rise className="bk-hero">
      <div className="bk-hero-ic"><img src="/logo-djiwa.png" alt="" /></div>
      <h1>Booking acara,<br /><em>tanpa ribet.</em></h1>
      <p>{settings?.description || "Pilih tanggal, jumlah tamu, dan menu. Selesai dalam beberapa menit."}</p>
      <div className="bk-actions">
        <Button onClick={onStart} disabled={inactive || loading}>{inactive ? "Booking sedang ditutup" : <>Mulai booking <ChevronRight size={18} /></>}</Button>
        <Button variant="ghost" onClick={onStatus}><Search size={17} /> Cek status booking</Button>
      </div>
    </Rise>
    <Rise i={2} className="bk-group">
      {([["customer-benefit-happy-hour", "Tanggal fleksibel", "Pilih hari yang masih tersedia."], ["party-size", "Kapasitas jelas", "Kebutuhan meja dihitung otomatis."], ["customer-food-ordering", "Menu siap saat tiba", "Pre-order agar hidangan cepat datang."]] as const).map(([icon, title, text]) => <div className="bk-row" key={title}><Icon3D name={icon} /><div className="bk-main-t"><b>{title}</b><small>{text}</small></div></div>)}
    </Rise>
    {showCustomerPromo && <Rise i={3}><a className="bk-promo" href="https://booking.djiwatentram.web.id/" aria-label="Booking acara dan kolaborasi di Djiwa Tentram"><img src="/booking-collaboration-banner.png" alt="Booking acara dan kolaborasi di Djiwa Tentram" loading="lazy" /></a></Rise>}
    <Rise i={4} style={{ marginTop: 12 }}><Note>Bayar setelah review lewat QRIS atau virtual account.</Note></Rise>
    {loading && <Loading text="Memuat pengaturan…" />}
    {error && <div style={{ marginTop: 12 }}><Note tone="err" action="Coba lagi" onAction={retry}>{error}</Note></div>}
    {inactive && <div style={{ marginTop: 12 }}><Note tone="warn">Booking sedang tidak aktif. Silakan cek kembali nanti.</Note></div>}
  </section>;
}

/* ── Pilihan satu-dari-banyak (jenis booking / acara) ──── */
function ChoiceList({ options, selected, onSelect, group }: { options: BookingOption[]; selected: string; onSelect: (key: string) => void; group: string }) {
  return <LayoutGroup id={group}><div className="bk-group flat">{options.map((o) => {
    const on = selected === o.key;
    return <motion.button key={o.key} className="bk-row bk-pick" onClick={() => onSelect(o.key)} whileTap={{ scale: .98 }} transition={SPRING} aria-pressed={on}>
      {on && <motion.i className="bk-hl" layoutId="hl" transition={SPRING} />}
      <Icon3D name={iconFor(o.icon)} /><div className="bk-main-t"><b>{o.label}</b>{o.description && <small>{o.description}</small>}</div><Radio on={on} />
    </motion.button>;
  })}</div></LayoutGroup>;
}

export function BookingTypeStep({ settings, selected, onSelect, onNext }: { settings?: BookingSettings | null; selected: string; onSelect: (key: string) => void; onNext: () => void }) {
  const options = settings?.bookingTypes ?? [];
  return <section className="bk-page">
    <Head title="Untuk kebutuhan apa?" detail="Pilih yang paling sesuai." />
    {options.length === 0 ? <Note tone="err">Tipe booking belum diatur. Silakan hubungi admin.</Note> : <ChoiceList group="type" options={options} selected={selected} onSelect={onSelect} />}
    <StickyAction disabled={!selected || options.length === 0} onClick={onNext}>Lanjutkan <ChevronRight size={18} /></StickyAction>
  </section>;
}

export function EventTypeStep({ settings, selected, customText, onSelect, onCustomText, onNext }: { settings?: BookingSettings | null; selected: string; customText: string; onSelect: (key: string) => void; onCustomText: (value: string) => void; onNext: () => void }) {
  const options = settings?.eventTypes ?? [];
  const active = options.find((o) => o.key === selected);
  return <section className="bk-page">
    <Head title="Acara apa?" detail="Agar persiapan kami sesuai." />
    {options.length === 0 ? <Note tone="err">Jenis acara belum diatur. Silakan hubungi admin.</Note> : <ChoiceList group="event" options={options} selected={selected} onSelect={onSelect} />}
    <AnimatePresence>{active?.requiresCustomText && <motion.div key="o" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: .28, ease: EASE }} style={{ overflow: "hidden" }}>
      <div className="bk-group pad" style={{ marginTop: 12 }}><Field label="Nama acara" required><input className="bk-in" value={customText} onChange={(e) => onCustomText(e.target.value)} placeholder="Contoh: buka bersama kantor" maxLength={120} autoFocus /></Field></div>
    </motion.div>}</AnimatePresence>
    <StickyAction disabled={!active || (active.requiresCustomText && !customText.trim()) || options.length === 0} onClick={onNext}>Pilih tanggal <ChevronRight size={18} /></StickyAction>
  </section>;
}

function Crumbs({ items }: { items: Array<string | undefined | false> }) {
  const list = items.filter(Boolean) as string[];
  return list.length ? <div className="bk-crumbs">{list.map((t) => <span key={t}>{t}</span>)}</div> : null;
}

/* ── Tanggal ───────────────────────────────────────────── */
const TIMES = ["10:00", "12:00", "14:00", "16:00", "18:00", "19:00"];
const AVATAR = ["#1a5dc6", "#13804a", "#a05d00", "#8a3ffc", "#d23a2a", "#0f2347"];
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
const hash = (text: string) => [...text].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
const slotOf = (time: string | null) => { if (!time) return ""; const hour = Number(time.slice(0, 2)); return [...TIMES].reverse().find((slot) => Number(slot.slice(0, 2)) <= hour) ?? TIMES[0]!; };
const levelOf = (ratio: number) => ratio >= .85 ? "hi" : ratio >= .55 ? "mid" : "lo";

export function DateStep({ settings, capacities, schedule, bookingType, eventType, selectedDate, setSelectedDate, arrivalTime, setArrivalTime, guests, setGuests, onNext }: { settings?: BookingSettings | null; capacities: Capacity[]; schedule: ScheduleEntry[]; bookingType?: BookingOption; eventType?: BookingOption; selectedDate: string; setSelectedDate: (v: string) => void; arrivalTime: string; setArrivalTime: (v: string) => void; guests: number; setGuests: (v: number) => void; onNext: () => void }) {
  const today = todayIso();
  const available = capacities.filter((e) => e.date >= today && !e.isClosed);
  const months = [...new Set(available.map((e) => e.date.slice(0, 7)))].sort();
  const currentMonth = today.slice(0, 7);
  const [month, setMonth] = useState(() => selectedDate ? selectedDate.slice(0, 7) : months.find((m) => m >= currentMonth) ?? currentMonth);
  const [dir, setDir] = useState(1);
  const selectedCap = capacities.find((c) => c.date === selectedDate);
  const tooMany = selectedCap ? overCapacity(guests, selectedCap) : false;
  const mi = months.indexOf(month);
  const first = new Date(`${month}-01T12:00:00`);
  const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = first.getDay();
  const byDate = new Map(available.filter((e) => e.date.slice(0, 7) === month).map((e) => [e.date, e]));
  const fill = (e: Capacity) => Math.max(e.maxPeople > 0 ? (e.usedPeople ?? 0) / e.maxPeople : 0, e.maxTables > 0 ? (e.usedTables ?? 0) / e.maxTables : 0);
  const move = (d: -1 | 1) => { const n = months[mi + d]; if (n) { setDir(d); setMonth(n); } };
  const perTable = selectedCap?.peoplePerTable ?? settings?.defaultPeoplePerTable ?? 4;
  const cells = Array.from({ length: lead + dim }, (_, i) => i < lead ? null : `${month}-${String(i - lead + 1).padStart(2, "0")}`);
  const ready = Boolean(selectedDate && arrivalTime && selectedCap && !tooMany);
  const dayRows = useMemo(() => schedule.filter((row) => row.date === selectedDate), [schedule, selectedDate]);
  const myTables = sharedTableCount(guests, perTable);
  const usedP = selectedCap?.usedPeople ?? 0, usedT = selectedCap?.usedTables ?? 0;
  const leftP = selectedCap && selectedCap.maxPeople > 0 ? selectedCap.maxPeople - usedP : null;
  const leftT = selectedCap && selectedCap.maxTables > 0 ? selectedCap.maxTables - usedT : null;
  const ratio = selectedCap ? fill(selectedCap) : 0;
  const status: [string, string] = tooMany ? ["bad", "Tidak cukup"] : ratio >= .85 ? ["bad", "Hampir penuh"] : ratio >= .55 ? ["warn", "Mulai penuh"] : ["ok", "Masih longgar"];
  const slotGuests = (slot: string) => dayRows.filter((row) => slotOf(row.arrivalTime) === slot).reduce((sum, row) => sum + row.guestCount, 0);
  const slotScale = Math.max(1, (selectedCap?.maxPeople || 100) / 2);

  return <section className="bk-page">
    <Head title="Kapan datang?" detail="Lihat kapasitas dan siapa saja yang sudah booking." />
    <Crumbs items={[bookingType?.label, eventType?.label]} />
    {available.length === 0 ? <Note tone="warn">Belum ada tanggal tersedia dalam {settings?.bookingWindowDays ?? 0} hari ke depan.</Note> : <>
      <div className="bk-cal">
        <div className="bk-cal-top">
          <b>{first.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</b>
          <div className="bk-cal-nav"><button aria-label="Bulan sebelumnya" disabled={mi <= 0} onClick={() => move(-1)}><ArrowLeft size={16} /></button><button aria-label="Bulan berikutnya" disabled={mi < 0 || mi >= months.length - 1} onClick={() => move(1)}><ChevronRight size={16} /></button></div>
        </div>
        <div className="bk-wd">{["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((d) => <span key={d}>{d}</span>)}</div>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={month} className="bk-days" custom={dir} variants={{ in: (d: number) => ({ opacity: 0, x: d * 36 }), on: { opacity: 1, x: 0 }, out: (d: number) => ({ opacity: 0, x: d * -36 }) }} initial="in" animate="on" exit="out" transition={{ duration: .24, ease: EASE }}>
            {cells.map((date, i) => {
              if (!date) return <span key={`e${i}`} />;
              const entry = byDate.get(date); const sel = selectedDate === date; const r = entry ? fill(entry) : 0;
              const full = !entry || (entry.maxPeople > 0 && (entry.usedPeople ?? 0) >= entry.maxPeople) || (entry.maxTables > 0 && (entry.usedTables ?? 0) >= entry.maxTables);
              return <motion.button key={date} className={`bk-day ${entry ? (full ? "full" : "") : "none"}${sel ? " sel" : ""}${date === today ? " today" : ""}`} disabled={!entry || full} onClick={() => setSelectedDate(date)} whileTap={{ scale: .88 }} aria-label={formatDate(date)} aria-pressed={sel}>
                {sel && <motion.b className="bk-dot" layoutId="day" transition={SPRING} />}
                <span>{Number(date.slice(8))}</span>{entry && <em className={`bk-meter ${full ? "hi" : levelOf(r)}`}><u style={{ width: `${Math.max(8, Math.min(100, (full ? 1 : r) * 100))}%` }} /></em>}
              </motion.button>;
            })}
          </motion.div>
        </AnimatePresence>
        {byDate.size === 0 && <p className="bk-sub" style={{ textAlign: "center", padding: "10px 0" }}>Belum ada tanggal di bulan ini.</p>}
        <div className="bk-legend"><span><i className="lo" /> Longgar</span><span><i className="mid" /> Mulai penuh</span><span><i className="hi" /> Hampir penuh</span></div>
      </div>

      <AnimatePresence initial={false} mode="wait">{selectedDate && selectedCap && <motion.div key={selectedDate} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .28, ease: EASE }}>
        <div className="bk-group" style={{ marginTop: 12, padding: "16px 18px" }}>
          <div className="bk-sec-h"><div><b>{formatDate(selectedDate)}</b><small>{dayRows.length} booking · kapasitas {selectedCap.maxPeople || "∞"} tamu{selectedCap.maxTables ? ` / ${selectedCap.maxTables} meja` : ""}</small></div><span className={`bk-tag ${status[0]}`}>{status[1]}</span></div>
          <div className="bk-cap">
            <CapRow label="Tamu" used={usedP} max={selectedCap.maxPeople} mine={guests} left={leftP} />
            {selectedCap.maxTables > 0 && <CapRow label="Meja" used={usedT} max={selectedCap.maxTables} mine={myTables} left={leftT} />}
          </div>
          <div className={`bk-note${tooMany ? " err" : ""}`} style={{ marginTop: 12 }}>{tooMany
            ? `Bookingmu (${guests} tamu, ${myTables} meja) melebihi sisa kapasitas. Kurangi tamu atau pilih tanggal lain.`
            : `Satu hari bisa dipakai beberapa booking selama kapasitas masih ada.${leftP != null ? ` Setelah bookingmu tersisa ${Math.max(0, leftP - guests)} tamu${leftT != null ? ` dan ${Math.max(0, leftT - myTables)} meja` : ""}.` : ""}`}</div>
        </div>

        <div className="bk-label"><span>Sudah booking di tanggal ini</span><span>{dayRows.length}</span></div>
        <div className="bk-group white pad" style={{ paddingTop: 2, paddingBottom: 2 }}>
          {dayRows.length === 0 ? <p className="bk-sub" style={{ textAlign: "center", padding: "18px 0" }}>Belum ada booking. Kamu yang pertama di tanggal ini.</p> : dayRows.map((row, i) => <motion.div key={`${row.customerName}-${row.arrivalTime}-${i}`} className="bk-who" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3, ease: EASE, delay: Math.min(i, 8) * .04 }}>
            <span className="bk-av" style={{ background: AVATAR[hash(row.customerName) % AVATAR.length] }}>{initials(row.customerName)}</span>
            <div className="bk-main-t"><b>{row.customerName}</b><small>{row.purpose}{row.status === "pending" ? " · menunggu pembayaran" : ""}</small></div>
            <div className="bk-who-r"><b>{row.arrivalTime ?? "—"}</b><small>{row.guestCount} tamu</small></div>
          </motion.div>)}
        </div>

        <div className="bk-group" style={{ marginTop: 12, paddingTop: 8, paddingBottom: 12 }}>
          <div className="bk-field-row">
            <div><b>Jumlah tamu</b><small>{myTables} meja · {perTable} orang per meja</small></div>
            <div className="bk-stepper"><button aria-label="Kurangi tamu" disabled={guests <= 1} onClick={() => setGuests(Math.max(1, guests - 1))}><Minus size={16} /></button><Num value={guests} /><button aria-label="Tambah tamu" disabled={guests >= 100} onClick={() => setGuests(Math.min(100, guests + 1))}><Plus size={16} /></button></div>
          </div>
          <div style={{ paddingTop: 10 }}>
            <div className="bk-field-row" style={{ paddingBottom: 4 }}><div><b>Jam tiba</b><small>Kepadatan tiap jam di tanggal ini</small></div><span className="ds-tag" style={{ background: "#fff" }}>WIB</span></div>
            <LayoutGroup id="times"><div className="bk-times">
              {TIMES.map((t) => { const g = slotGuests(t); return <button key={t} className={`bk-slot ${levelOf(g / slotScale)}${arrivalTime === t ? " on" : ""}`} onClick={() => setArrivalTime(t)}>{arrivalTime === t && <motion.i className="bk-pill-bg" layoutId="time" transition={SPRING} />}<span>{t}</span><small>{g === 0 ? "Kosong" : `${g} tamu`}</small></button>; })}
              <input className="bk-time-in" type="time" aria-label="Jam lain" value={TIMES.includes(arrivalTime) ? "" : arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} />
            </div></LayoutGroup>
          </div>
        </div>
      </motion.div>}</AnimatePresence>
      <StickyAction disabled={!ready} onClick={onNext}>{!selectedDate ? "Pilih tanggal dulu" : tooMany ? "Kapasitas tidak cukup" : !arrivalTime ? "Pilih jam tiba" : <>Lanjut <ChevronRight size={18} /></>}</StickyAction>
    </>}
  </section>;
}

function CapRow({ label, used, max, mine, left }: { label: string; used: number; max: number; mine: number; left: number | null }) {
  const pct = (n: number) => max > 0 ? Math.min(100, (n / max) * 100) : 0;
  return <div className="bk-cap-row"><div className="bk-cap-l"><span>{label}</span><b>{used} terisi{left != null ? ` · sisa ${Math.max(0, left)}` : ""}</b></div>
    <div className="bk-cap-bar"><motion.i animate={{ width: `${pct(used)}%` }} transition={{ duration: .5, ease: EASE }} /><motion.i className="me" animate={{ width: `${pct(Math.min(mine, left ?? mine))}%` }} transition={{ duration: .5, ease: EASE }} /></div></div>;
}

/* ── Menu ──────────────────────────────────────────────── */
function Qty({ item, quantity, set }: { item: Product; quantity: number; set: (q: number) => void }) {
  return <div className="bk-qty"><AnimatePresence mode="popLayout" initial={false}>{quantity > 0
    ? <motion.div key="q" className="bk-qty-box" initial={{ opacity: 0, scale: .7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .7 }} transition={SPRING}>
        <motion.button whileTap={{ scale: .85 }} aria-label={`Kurangi ${item.name}`} onClick={() => set(quantity - 1)}>{quantity === 1 ? <X size={15} /> : <Minus size={15} />}</motion.button><Num value={quantity} /><motion.button whileTap={{ scale: .85 }} aria-label={`Tambah ${item.name}`} onClick={() => set(quantity + 1)}><Plus size={15} /></motion.button>
      </motion.div>
    : <motion.button key="a" className="bk-add" aria-label={`Tambah ${item.name}`} onClick={() => set(1)} initial={{ opacity: 0, scale: .6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .6 }} whileTap={{ scale: .85 }} transition={SPRING}><Plus size={19} strokeWidth={2.6} /></motion.button>}</AnimatePresence></div>;
}

export function MenuStep({ products, categories, cart, setQuantity, total, onNext }: { products: Product[]; categories: Category[]; cart: Cart; setQuantity: (id: string, quantity: number) => void; total: number; onNext: () => void }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [sub, setSub] = useState("all");
  const tree = (id: string) => { const ids = new Set([id]); let changed = true; while (changed) { changed = false; categories.forEach((c) => { if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); changed = true; } }); } return ids; };
  const filled = (id: string) => { const ids = tree(id); return products.some((p) => p.categoryId != null && ids.has(p.categoryId)); };
  const roots = useMemo(() => categories.filter((c) => !c.parentId && filled(c.id)).sort((a, b) => a.displayOrder - b.displayOrder), [categories, products]);
  const subs = useMemo(() => categories.filter((c) => c.parentId === cat && filled(c.id)).sort((a, b) => a.displayOrder - b.displayOrder), [categories, products, cat]);
  const filtered = useMemo(() => {
    const scope = sub !== "all" ? tree(sub) : cat !== "all" ? tree(cat) : null;
    const q = query.trim().toLowerCase();
    return products.filter((p) => (!q || p.name.toLowerCase().includes(q) || String(p.menuNumber ?? "").includes(q)) && (!scope || (p.categoryId != null && scope.has(p.categoryId))));
  }, [products, query, cat, sub, categories]);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const Chip = ({ id, label, value, set, small }: { id: string; label: string; value: string; set: (v: string) => void; small?: boolean }) => <button className={`bk-pill${small ? " sm" : ""}${value === id ? " on" : ""}`} onClick={() => set(id)}>{value === id && <motion.i className="bk-pill-bg" layoutId={small ? "sub" : "cat"} transition={SPRING} />}<span>{label}</span></button>;

  return <section className="bk-page">
    <div className="bk-menu-top">
      <div className="bk-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari menu atau nomor" enterKeyHint="search" />{query && <button aria-label="Hapus pencarian" onClick={() => setQuery("")}><X size={13} strokeWidth={3} /></button>}</div>
      {roots.length > 0 && <LayoutGroup id="cats"><div className="bk-chips"><Chip id="all" label="Semua" value={cat} set={(v) => { setCat(v); setSub("all"); }} />{roots.map((c) => <Chip key={c.id} id={c.id} label={c.name} value={cat} set={(v) => { setCat(v); setSub("all"); }} />)}</div></LayoutGroup>}
      <AnimatePresence initial={false}>{subs.length > 0 && <motion.div key="s" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}><LayoutGroup id="subs"><div className="bk-chips"><Chip small id="all" label="Semua" value={sub} set={setSub} />{subs.map((c) => <Chip small key={c.id} id={c.id} label={c.name} value={sub} set={setSub} />)}</div></LayoutGroup></motion.div>}</AnimatePresence>
    </div>
    {products.length === 0 ? <Note tone="err">Menu belum tersedia. Booking belum dapat dilanjutkan.</Note>
      : filtered.length === 0 ? <div className="bk-empty"><Search size={30} color="#9aa0ae" /><b>Menu tidak ditemukan</b><span>Coba kata kunci atau kategori lain.</span></div>
      : <div className="bk-group" style={{ marginTop: 8 }}><AnimatePresence initial={false}>{filtered.map((p) => {
        const q = cart[p.id] ?? 0;
        return <motion.div layout="position" key={p.id} className="bk-prod" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .26, ease: EASE }}>
          <div className="bk-thumb">{p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <UtensilsCrossed size={24} />}</div>
          <div className="bk-main-t"><b>{p.menuNumber ? `${p.menuNumber}. ` : ""}{p.name}</b>{p.description && <small>{p.description}</small>}<div className="bk-price">{currency(unitPrice(p))}{p.promoPrice != null && p.promoPrice < p.price && <s>{currency(p.price)}</s>}</div></div>
          <Qty item={p} quantity={q} set={(n) => setQuantity(p.id, n)} />
        </motion.div>;
      })}</AnimatePresence></div>}
    <Dock show={count > 0}><Button onClick={onNext}><span className="bk-badge">{count}</span>Lihat ringkasan<small>· {currency(total)}</small></Button></Dock>
  </section>;
}

/* ── Review ────────────────────────────────────────────── */
function Sum({ label, value, edit }: { label: string; value: string; edit: () => void }) {
  return <div className="bk-sum"><div><small>{label}</small><b>{value}</b></div><button className="bk-link" onClick={edit} aria-label={`Ubah ${label}`}><Pencil size={15} /></button></div>;
}

export function Review({ bookingType, eventType, eventTypeOther, date, arrivalTime, guests, tableCount, items, total, hasType, onEdit, onNext }: { bookingType?: BookingOption; eventType?: BookingOption; eventTypeOther: string; date: string; arrivalTime: string; guests: number; tableCount: number; items: Item[]; total: number; hasType: boolean; onEdit: (step: BookingStep) => void; onNext: () => void }) {
  return <section className="bk-page">
    <Head title="Periksa pesananmu" detail="Pastikan semuanya sudah benar." />
    <Rise className="bk-group white pad" style={{ paddingTop: 4, paddingBottom: 4 }}>
      {hasType && <Sum label="Booking" value={eventType ? `${bookingType?.label || "Acara"} · ${eventType.label}${eventTypeOther ? ` · ${eventTypeOther}` : ""}` : bookingType?.label || "-"} edit={() => onEdit("type")} />}
      <Sum label="Jadwal" value={`${formatDate(date)} · ${arrivalTime || "jam belum diisi"}`} edit={() => onEdit("date")} />
      <Sum label="Tamu" value={`${guests} orang · ${tableCount} meja`} edit={() => onEdit("date")} />
    </Rise>
    <Rise i={2}>
      <div className="bk-label"><span>Menu pre-order</span>{items.length > 0 && <button onClick={() => onEdit("menu")}>Ubah</button>}</div>
      <div className="bk-group white pad" style={{ paddingTop: 8, paddingBottom: 4 }}>
        {items.length === 0 ? <p className="bk-sub" style={{ padding: "6px 0 10px" }}>Tanpa pre-order menu.</p> : <>
          {items.map((it) => <div className="bk-line" key={it.id}><span>{it.quantity} × {it.name}</span><b>{currency(unitPrice(it) * it.quantity)}</b></div>)}
          <div className="bk-total"><span>Total menu</span><motion.b key={total} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>{currency(total)}</motion.b></div>
        </>}
      </div>
    </Rise>
    <StickyAction onClick={onNext}>Lanjut <ChevronRight size={18} /></StickyAction>
  </section>;
}

/* ── Checkout ──────────────────────────────────────────── */
function CustomField({ field, value, error, onChange }: { field: BookingCustomField; value: unknown; error?: string; onChange: (value: unknown) => void }) {
  const cur = typeof value === "string" ? value : value ? String(value) : "";
  return <Field label={field.label} required={field.required} error={error}>
    {field.type === "textarea" ? <textarea className={`bk-in${error ? " bad" : ""}`} value={cur} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} rows={3} />
      : field.type === "dropdown" ? <select className={`bk-in${error ? " bad" : ""}`} value={cur} onChange={(e) => onChange(e.target.value)}><option value="">Pilih {field.label.toLowerCase()}</option>{field.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
      : <input className={`bk-in${error ? " bad" : ""}`} value={cur} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />}
  </Field>;
}

export function Checkout({ settings, bookingType, eventType, date, arrivalTime, guests, items, total, customer, setCustomer, customAnswers, setCustomAnswers, error, submitting, signedIn, onNext }: { settings?: BookingSettings | null; bookingType?: BookingOption; eventType?: BookingOption; date: string; arrivalTime: string; guests: number; items: Item[]; total: number; customer: CustomerForm; setCustomer: (value: CustomerForm) => void; customAnswers: Record<string, unknown>; setCustomAnswers: (value: Record<string, unknown>) => void; error: string | null; submitting: boolean; signedIn: boolean; onNext: () => void }) {
  const [attempted, setAttempted] = useState(false);
  const errors = validateCustomer(customer);
  const customErrors = requiredFieldErrors(settings?.customFields ?? [], customAnswers);
  const invalid = Object.keys(errors).length + Object.keys(customErrors).length > 0;
  const update = (f: keyof CustomerForm, v: string) => setCustomer({ ...customer, [f]: v });
  const fields = (settings?.customFields ?? []).filter((f) => !f.isBookingEventOption);
  const e = (v?: string) => attempted ? v : undefined;
  const submit = () => { if (signedIn && invalid) { setAttempted(true); return; } onNext(); };
  return <section className="bk-page">
    <Head title="Data pemesan" detail="Terakhir, lalu lanjut ke pembayaran." />
    <Crumbs items={[bookingType?.label, eventType?.label, formatDate(date), arrivalTime && `${arrivalTime} WIB`, `${guests} tamu`]} />
    <div className="bk-group pad" style={{ paddingTop: 6, paddingBottom: 6 }}>
      <Field label="Nama lengkap" required error={e(errors.name)}><input className={`bk-in${attempted && errors.name ? " bad" : ""}`} value={customer.name} onChange={(ev) => update("name", ev.target.value)} placeholder="Nama lengkap" autoComplete="name" /></Field>
      <Field label="Nomor WhatsApp" required error={e(errors.phone)}><input className={`bk-in${attempted && errors.phone ? " bad" : ""}`} value={customer.phone} onChange={(ev) => update("phone", ev.target.value)} placeholder="08… atau +62…" inputMode="tel" autoComplete="tel" /></Field>
      <Field label="Email" error={e(errors.email)}><input className={`bk-in${attempted && errors.email ? " bad" : ""}`} value={customer.email} onChange={(ev) => update("email", ev.target.value)} placeholder="nama@email.com" inputMode="email" autoComplete="email" /></Field>
      <Field label="Catatan"><textarea className="bk-in" value={customer.notes} onChange={(ev) => update("notes", ev.target.value)} placeholder="Opsional" rows={2} /></Field>
      {fields.map((f) => <CustomField key={f.id} field={f} value={customAnswers[f.id]} error={e(customErrors[f.id])} onChange={(v) => setCustomAnswers({ ...customAnswers, [f.id]: v })} />)}
    </div>
    <Rise className="bk-group white pad" style={{ marginTop: 12, paddingTop: 4, paddingBottom: 4 }}>
      {items.length > 0 ? <div className="bk-total" style={{ border: 0, margin: 0 }}><span>Total pembayaran</span><b>{currency(total)}</b></div> : <p className="bk-sub" style={{ padding: "10px 0" }}>Booking tanpa menu. Pembayaran mengikuti pengaturan booking.</p>}
    </Rise>
    {!signedIn && <div style={{ marginTop: 12 }}><Note>Kamu akan diminta masuk dulu agar booking tercatat di akunmu.</Note></div>}
    {error && <div style={{ marginTop: 12 }}><Note tone="err" action="Coba lagi" onAction={onNext}>{error}</Note></div>}
    <StickyAction loading={submitting} onClick={submit}><CreditCard size={18} />{signedIn ? "Bayar sekarang" : "Masuk & bayar"}</StickyAction>
  </section>;
}

/* ── Sukses & status ───────────────────────────────────── */
export function Success({ code, onStatus }: { code: string; onStatus: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 1800); return () => clearTimeout(t); }, [copied]);
  return <section className="bk-page no-dock bk-center">
    <motion.div className="bk-check" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...SPRING, delay: .05 }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .5, ease: EASE, delay: .25 }} /></svg>
    </motion.div>
    <Rise i={2}><h1 className="bk-title" style={{ fontSize: 30 }}>Booking tercatat</h1><p className="bk-sub">Simpan kode ini untuk cek status kapan saja.</p></Rise>
    <Rise i={3} className="bk-code"><small>Kode booking</small><b>{code || "-"}</b>
      <Button small variant="ghost" onClick={() => { void navigator.clipboard?.writeText(code); setCopied(true); }}><AnimatePresence mode="wait" initial={false}><motion.span key={copied ? "y" : "n"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .15 }} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>{copied ? <><Check size={15} /> Tersalin</> : <><Copy size={15} /> Salin kode</>}</motion.span></AnimatePresence></Button></Rise>
    <Rise i={4}><Button onClick={onStatus}>Cek status booking <ChevronRight size={18} /></Button></Rise>
  </section>;
}

const tone = (s: string) => /paid|lunas|settled|confirm|dikonfirmasi|selesai|berhasil/i.test(s) ? "ok" : /cancel|batal|fail|gagal|expire|kedaluwarsa/i.test(s) ? "bad" : "warn";

export function Status({ code, setCode, result, error, loading, onLookup }: { code: string; setCode: (value: string) => void; result: BookingResult | null; error: string | null; loading: boolean; onLookup: () => void }) {
  return <section className="bk-page no-dock">
    <Head title="Cek booking" detail="Masukkan kode booking untuk melihat status terbarunya." />
    <form onSubmit={(e) => { e.preventDefault(); if (code.trim() && !loading) onLookup(); }}>
      <div className="bk-group pad" style={{ paddingTop: 6, paddingBottom: 14 }}>
        <Field label="Kode booking"><input className="bk-in" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Contoh: BK-1234" autoCapitalize="characters" autoComplete="off" enterKeyHint="search" /></Field>
        <Button type="submit" disabled={!code.trim()} loading={loading}><Search size={17} /> Cari booking</Button>
      </div>
    </form>
    <AnimatePresence mode="popLayout">
      {error && <div key="e" style={{ marginTop: 12 }}><Note tone="err">{error}</Note></div>}
      {result && <motion.div key={result.bookingCode} className="bk-group white pad" style={{ marginTop: 12 }} initial={{ opacity: 0, y: 14, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING}>
        <small className="bk-sub" style={{ margin: 0 }}>Kode booking</small>
        <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: ".03em", color: "var(--ds-navy)", margin: "2px 0 12px" }}>{result.bookingCode}</h2>
        <div className="bk-sum" style={{ borderTop: 0, paddingTop: 0 }}><div><small>Status booking</small></div><span className={`bk-tag ${tone(result.status)}`}>{result.status}</span></div>
        <div className="bk-sum"><div><small>Pembayaran</small></div><span className={`bk-tag ${tone(result.paymentStatus)}`}>{result.paymentStatus}</span></div>
        <div className="bk-sum"><div><small>Jadwal</small><b>{formatDate(result.date)}{result.arrivalTime ? ` · ${result.arrivalTime}` : ""}</b></div></div>
        <div className="bk-sum"><div><small>Tamu</small><b>{result.guests} orang · {result.tableCount} meja</b></div></div>
      </motion.div>}
    </AnimatePresence>
  </section>;
}
