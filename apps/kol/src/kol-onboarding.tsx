import { useEffect, useRef, useState } from "react";
import { CalendarDays, Handshake, UtensilsCrossed, Users } from "lucide-react";
import { VisitPicker } from "./kol-visit";
import { CONSENT_NO_SHOW, dotTime, errorText, kolApi, longDate, type VisitRow } from "./kol-lib";

type Session = { user: { id: string; name?: string | null; email?: string | null; image?: string | null } };
const CATEGORIES = ["Food & Beverage", "Coffee", "Lifestyle", "Travel", "Fashion", "Beauty", "Entertainment", "Other"];
const PLATFORMS = ["TikTok", "Instagram", "YouTube", "Threads"];
const CONTENT_TYPES = ["Review makanan", "Review kopi", "Short video", "Reels", "Story", "Foto & carousel", "Live review"];

/* ---------- 1. Masuk ---------- */
export function LoginScreen({ loading, error, onGoogle }: { loading?: boolean; error?: string; onGoogle: () => void }) {
  return (
    <div className="kx kx-wrap">
      <div className="kx-view" style={{ paddingTop: "calc(24px + env(safe-area-inset-top))" }}>
        <img className="kx-logo" src="/logo-djiwa.png" alt="Djiwa Tentram" />
        <p className="kx-eyebrow" style={{ marginTop: 16 }}>Djiwa Tentram · Creator</p>
        <div className="kx-hero" aria-hidden>
          <svg width="104" height="104" viewBox="0 0 120 120"><circle cx="60" cy="60" r="46" fill="#fff" opacity=".7" /><rect x="38" y="40" width="44" height="40" rx="10" fill="#2f80ed" /><circle cx="60" cy="60" r="11" fill="#fff" /><circle cx="76" cy="48" r="3" fill="#fff" /></svg>
        </div>
        <h1 className="kx-h1">Gabung komunitas creator kuliner Tasikmalaya</h1>
        <p className="kx-lead">Daftar, pilih jadwal datang, lalu masuk ke portal untuk berkolaborasi.</p>
        <div className="kx-ben" style={{ marginTop: 18 }}>
          <div><span className="kx-ico"><UtensilsCrossed size={18} /></span>Cicipi menu pilihan di Djiwa Tentram</div>
          <div><span className="kx-ico"><CalendarDays size={18} /></span>Pilih sendiri hari &amp; jam visit untuk review &amp; bikin konten</div>
          <div><span className="kx-ico"><Handshake size={18} /></span>Barter menu &amp; kolaborasi campaign</div>
          <div><span className="kx-ico"><Users size={18} /></span>Terhubung dengan komunitas KOL lain</div>
        </div>
        {error && <p role="alert" className="kx-note kx-note--err" style={{ marginBottom: 12 }}>{error}</p>}
        {loading
          ? <p className="kx-sub" style={{ textAlign: "center" }}>Memeriksa sesi Google…</p>
          : <button type="button" className="kx-btn kx-btn--ghost" onClick={onGoogle}><b style={{ color: "#4285f4", fontSize: 18 }}>G</b> Lanjutkan dengan Google</button>}
        <p className="kx-sub" style={{ textAlign: "center", marginTop: 12 }}>Dengan melanjutkan, kamu menyetujui syarat kolaborasi Djiwa Tentram.</p>
      </div>
    </div>
  );
}

/* ---------- 2–4. Form → Booking → Berhasil ---------- */
type Form = { name: string; city: string; wa: string; plat: string; user: string; followers: string; cat: string; types: string[]; why: string };

export function RegisterFlow({ session, onRegistered }: { session: Session; onRegistered: () => Promise<void> | void }) {
  const [step, setStep] = useState<"form" | "book" | "done">("form");
  const [f, setF] = useState<Form>({ name: session.user.name || "", city: "Tasikmalaya", wa: "", plat: "TikTok", user: "", followers: "", cat: "Food & Beverage", types: [], why: "" });
  const [errors, setErrors] = useState<Partial<Record<"name" | "wa" | "user", string>>>({});
  const [rows, setRows] = useState<VisitRow[]>([]);
  const [pick, setPick] = useState<{ date: string | null; time: string | null }>({ date: null, time: null });
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [c3, setC3] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [formNote, setFormNote] = useState("");
  const [booked, setBooked] = useState<{ date: string; time: string } | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setF(x => ({ ...x, [key]: value }));
  const loadRows = () => kolApi<VisitRow[]>("/register/calendar").then(setRows).catch(() => undefined);
  useEffect(() => { if (step === "book") void loadRows(); }, [step]);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(""), 3200); return () => window.clearTimeout(id); }, [toast]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);

  const validate = () => {
    const e: typeof errors = {};
    if (f.name.trim().length < 2) e.name = "Nama minimal 2 karakter.";
    if (!/^(\+62|62|0)\d{8,13}$/.test(f.wa.replace(/[^\d+]/g, ""))) e.wa = "Isi nomor WhatsApp yang valid, mis. 0812xxxxxxx.";
    if (!f.user.trim().replace(/^@/, "")) e.user = "Username akun wajib diisi.";
    setErrors(e);
    return !Object.keys(e).length;
  };
  const next = () => { setFormNote(""); if (validate()) setStep("book"); };

  const ready = Boolean(pick.date && pick.time && c1 && c2 && c3) && !busy;
  const submit = async () => {
    if (!pick.date || !pick.time) return;
    setBusy(true);
    try {
      await kolApi("/register", { method: "POST", body: JSON.stringify({
        name: f.name.trim(), location: f.city.trim(), whatsapp: f.wa, platform: f.plat, username: f.user, followers: Number(f.followers) || 0,
        category: f.cat, contentTypes: f.types, reason: f.why, bookingDate: pick.date, bookingTime: pick.time, consentTerms: c1, consentAttendance: c2, consentNoShow: c3,
      }) });
      setBooked({ date: pick.date, time: pick.time });
      setStep("done");
    } catch (error: any) {
      setToast(errorText(error));
      if (error?.code === "DATE_ALREADY_BOOKED") { setPick({ date: null, time: null }); void loadRows(); }
      else if (["PROFILE_DUPLICATE", "INVALID_KOL_INTAKE"].includes(error?.code)) { setFormNote(errorText(error)); setStep("form"); }
    } finally { setBusy(false); }
  };

  if (step === "done" && booked) return <Done name={f.name} booked={booked} onEnter={onRegistered} />;

  return (
    <div className="kx kx-wrap" ref={top}>
      <div className="kx-top">
        <button type="button" className="kx-back" aria-label="Kembali" onClick={() => { if (step === "book") setStep("form"); }} style={{ visibility: step === "book" ? "visible" : "hidden" }}>‹</button>
        <div className="kx-steps" aria-hidden><i className={step === "form" ? "on" : "done"} /><i className={step === "book" ? "on" : ""} /></div>
        <span className="kx-stepn">{step === "form" ? 1 : 2}/2</span>
      </div>
      {toast && <div className="kx-toast" role="status">{toast}</div>}

      {step === "form" ? (
        <>
          <div className="kx-view">
            <h1 className="kx-h1">Kenalkan dirimu</h1>
            <p className="kx-lead">Data ini dipakai tim Djiwa Tentram untuk mengenal akunmu.</p>
            {formNote && <p role="alert" className="kx-note kx-note--err" style={{ marginTop: 14 }}>{formNote}</p>}
            <label className="kx-label" htmlFor="kx-name">Nama lengkap</label>
            <input id="kx-name" className="kx-input" autoComplete="name" value={f.name} placeholder="mis. Nadia Putri" onChange={e => set("name", e.target.value)} onBlur={validate} />
            {errors.name && <p className="kx-err">{errors.name}</p>}
            <label className="kx-label" htmlFor="kx-city">Kota / domisili</label>
            <input id="kx-city" className="kx-input" value={f.city} onChange={e => set("city", e.target.value)} />
            <label className="kx-label" htmlFor="kx-wa">WhatsApp</label>
            <input id="kx-wa" className="kx-input" inputMode="tel" autoComplete="tel" value={f.wa} placeholder="0812…" onChange={e => set("wa", e.target.value)} />
            {errors.wa && <p className="kx-err">{errors.wa}</p>}
            <label className="kx-label" htmlFor="kx-email">Email <em>(dari Google)</em></label>
            <input id="kx-email" className="kx-input" value={session.user.email || ""} disabled readOnly />

            <div className="kx-section">Akun utama</div>
            <div className="kx-chips" role="group" aria-label="Platform">{PLATFORMS.map(p => <button type="button" key={p} className="kx-chip" aria-pressed={f.plat === p} onClick={() => set("plat", p)}>{p}</button>)}</div>
            <div className="kx-row2">
              <div><label className="kx-label" htmlFor="kx-user">Username</label><input id="kx-user" className="kx-input" autoCapitalize="none" value={f.user} placeholder="@username" onChange={e => set("user", e.target.value)} /></div>
              <div><label className="kx-label" htmlFor="kx-fol">Followers</label><input id="kx-fol" className="kx-input" inputMode="numeric" value={f.followers} placeholder="12000" onChange={e => set("followers", e.target.value.replace(/\D/g, ""))} /></div>
            </div>
            {errors.user && <p className="kx-err">{errors.user}</p>}

            <div className="kx-section">Konten</div>
            <span className="kx-label" style={{ marginTop: 0 }}>Kategori</span>
            <div className="kx-chips" role="group" aria-label="Kategori">{CATEGORIES.map(c => <button type="button" key={c} className="kx-chip" aria-pressed={f.cat === c} onClick={() => set("cat", c)}>{c}</button>)}</div>
            <span className="kx-label">Jenis konten <em>(boleh lebih dari satu)</em></span>
            <div className="kx-chips" role="group" aria-label="Jenis konten">{CONTENT_TYPES.map(c => <button type="button" key={c} className="kx-chip" aria-pressed={f.types.includes(c)} onClick={() => set("types", f.types.includes(c) ? f.types.filter(x => x !== c) : [...f.types, c])}>{c}</button>)}</div>
            <label className="kx-label" htmlFor="kx-why">Kenapa ingin berkolaborasi?</label>
            <textarea id="kx-why" className="kx-input" placeholder="Ceritakan singkat…" value={f.why} onChange={e => set("why", e.target.value)} />
          </div>
          <div className="kx-dock"><button type="button" className="kx-btn" onClick={next}>Lanjut pilih jadwal ›</button></div>
        </>
      ) : (
        <>
          <div className="kx-view">
            <h1 className="kx-h1">Jadwalkan visit ke Djiwa Tentram</h1>
            <p className="kx-lead">Datang untuk mereview menu dan membuat kontenmu di kafe. Satu tanggal hanya untuk satu KOL, jadi pilih tanggal yang masih kosong. Booking mulai besok.</p>
            <div style={{ marginTop: 16 }}><VisitPicker rows={rows} date={pick.date} time={pick.time} onChange={setPick} /></div>
            <div className="kx-section">Persetujuan</div>
            <button type="button" className="kx-check" onClick={() => setC1(!c1)} role="checkbox" aria-checked={c1}><span className="kx-box" data-on={c1}>✓</span><span>Saya setuju dengan syarat &amp; ketentuan kolaborasi Djiwa Tentram.</span></button>
            <button type="button" className="kx-check" onClick={() => setC2(!c2)} role="checkbox" aria-checked={c2}><span className="kx-box" data-on={c2}>✓</span><span>Saya berkomitmen hadir sesuai jadwal. Bila berhalangan, saya akan memberi kabar lebih awal.</span></button>
            <button type="button" className="kx-check" onClick={() => setC3(!c3)} role="checkbox" aria-checked={c3}><span className="kx-box" data-on={c3}>✓</span><span>{CONSENT_NO_SHOW}</span></button>
          </div>
          <div className="kx-dock">
            <button type="button" className="kx-btn" disabled={!ready} onClick={submit}>
              {busy ? "Mengirim…" : ready ? "Kirim pendaftaran" : !pick.date ? "Pilih tanggal" : !pick.time ? "Pilih jam datang" : "Setujui persetujuan"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Done({ name, booked, onEnter }: { name: string; booked: { date: string; time: string }; onEnter: () => Promise<void> | void }) {
  const [count, setCount] = useState(5);
  const [paused, setPaused] = useState(false);
  const [entering, setEntering] = useState(false);
  const enter = async () => { if (entering) return; setEntering(true); await onEnter(); };
  useEffect(() => {
    if (paused || entering) return;
    if (count <= 0) { void enter(); return; }
    const id = window.setTimeout(() => setCount(c => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [count, paused, entering]);
  const circ = 2 * Math.PI * 52;
  return (
    <div className="kx kx-wrap">
      <div className="kx-view" style={{ textAlign: "center", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="kx-ok" aria-hidden>✓</div>
        <h1 className="kx-h1" style={{ marginTop: 16 }}>Pendaftaran berhasil!</h1>
        <p className="kx-lead">Halo {name || "Creator"}, jadwal visit-mu ke Djiwa Tentram sudah kami catat. Tim akan mengonfirmasi lewat WhatsApp.</p>
        <div className="kx-sum" style={{ textAlign: "left", marginTop: 18 }}>
          <span style={{ fontSize: 24 }} aria-hidden>📅</span>
          <div style={{ flex: 1 }}><b>{longDate(booked.date)}</b><small>Pukul {dotTime(booked.time)} WIB</small></div>
          <span className="kx-pill kx-pill--warn">Menunggu konfirmasi</span>
        </div>
        <div className="kx-section" style={{ textAlign: "left" }}>Apa selanjutnya</div>
        <div className="kx-tl">
          <div className="kx-tli now"><b>Pendaftaran terkirim</b><small>Data &amp; jadwalmu aman di sistem.</small></div>
          <div className="kx-tli next"><b>Konfirmasi tim Djiwa Tentram</b><small>Maksimal 1×24 jam lewat WhatsApp.</small></div>
          <div className="kx-tli"><b>Visit: review &amp; buat konten</b><small>Datang ke Djiwa Tentram, cicipi menu, lalu buat kontenmu.</small></div>
        </div>
        <div className="kx-ring" role="timer" aria-label={`Membuka portal dalam ${count} detik`}>
          <svg width="116" height="116"><circle cx="58" cy="58" r="52" fill="none" stroke="#e1e4ea" strokeWidth="8" /><circle cx="58" cy="58" r="52" fill="none" stroke="var(--kx-blue)" strokeWidth="8" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={(1 - count / 5) * circ} style={{ transition: "stroke-dashoffset 1s linear" }} /></svg>
          <span>{count}</span>
        </div>
        <p className="kx-sub">{entering ? "Membuka portal…" : "Membuka portal komunitas…"}</p>
      </div>
      <div className="kx-dock"><div className="kx-row2"><button type="button" className="kx-btn kx-btn--ghost" onClick={() => setPaused(p => !p)} disabled={entering}>{paused ? "Lanjutkan hitung" : "Tahan"}</button><button type="button" className="kx-btn" onClick={enter} disabled={entering}>Masuk sekarang</button></div></div>
    </div>
  );
}
