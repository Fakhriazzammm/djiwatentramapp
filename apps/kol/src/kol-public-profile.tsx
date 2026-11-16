import { useCallback, useEffect, useRef, useState } from "react";
import {
  AtSign, BadgeCheck, BriefcaseBusiness, Check, ChevronRight, Facebook, Globe2, Instagram,
  Mail, MapPin, Music2, Share2, Youtube,
} from "lucide-react";
import { AvatarImg } from "./kol-avatar";
import { KxSheet } from "./kol-sheet";
import { PublicActivityStrip } from "./components/kol-public-activity";
import "./kol-public-profile.css";

type PublicProfile = {
  id: string;
  name: string;
  username: string;
  avatar_url?: string | null;
  location?: string | null;
  category?: string | null;
  bio?: string | null;
  public_availability?: "not_set" | "open" | "selective" | "unavailable" | null;
  availability_label?: string | null;
  platforms: Array<{ platform: string; username: string; profile_url?: string | null; followers?: number | null }>;
  portfolio: Array<{ id: number | string; platform: string; title: string; content_url: string; thumbnail_url?: string | null; description?: string | null; published_at?: string | null; pinned_order?: number | null }>;
  badges: Array<{ code: string; name: string; description?: string | null; icon?: string | null }>;
};

type InquiryForm = {
  businessName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  preferredContact: "email" | "phone" | "either";
  brief: string;
  website: string;
};

const API = "https://api.djiwatentram.web.id/v1/kol";
const emptyInquiry: InquiryForm = { businessName: "", contactName: "", contactEmail: "", contactPhone: "", preferredContact: "either", brief: "", website: "" };

const availabilityCopy: Record<string, { title: string; note: string; tone: "open" | "neutral" }> = {
  open: { title: "Terbuka untuk kolaborasi", note: "Campaign, review produk, dan konten kunjungan.", tone: "open" },
  selective: { title: "Memilih campaign yang sesuai", note: "Creator memilih campaign yang paling relevan dengan audiensnya.", tone: "open" },
  unavailable: { title: "Belum menerima campaign baru", note: "Profil tetap dapat dibagikan untuk kolaborasi mendatang.", tone: "neutral" },
};

const inquiryErrors: Record<string, string> = {
  CONTACT_REQUIRED: "Isi email atau nomor WhatsApp yang bisa dihubungi.",
  PREFERRED_CONTACT_UNAVAILABLE: "Lengkapi kontak yang dipilih, atau ganti pilihan dihubungi lewat.",
  INVALID_BRIEF: "Brief kolaborasi perlu berisi 20–3.000 karakter.",
  INVALID_BUSINESS_NAME: "Nama brand perlu berisi 2–160 karakter.",
  INVALID_CONTACT_NAME: "Nama Anda perlu berisi 2–120 karakter.",
  INVALID_CONTACT_EMAIL: "Format email belum benar.",
  INVALID_CONTACT_PHONE: "Nomor WhatsApp belum benar. Contoh: +62812…",
  TOO_MANY_REQUESTS: "Pengajuan dari jaringan ini terlalu sering. Coba lagi beberapa saat.",
  PROFILE_NOT_FOUND: "Profil ini tidak tersedia untuk pengajuan saat ini.",
  ORIGIN_NOT_ALLOWED: "Pengajuan harus dikirim dari halaman profil resmi.",
};

const formatFollowers = (value: number) => new Intl.NumberFormat("id-ID", { notation: value >= 1000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
const safeHttpsUrl = (value?: string | null) => {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; } catch { return null; }
};

function platformMeta(platform: string) {
  const key = platform.trim().toLowerCase();
  if (key.includes("tiktok")) return { Icon: Music2, tone: "tiktok" };
  if (key.includes("instagram")) return { Icon: Instagram, tone: "instagram" };
  if (key.includes("youtube")) return { Icon: Youtube, tone: "youtube" };
  if (key.includes("facebook")) return { Icon: Facebook, tone: "facebook" };
  if (key.includes("thread")) return { Icon: AtSign, tone: "threads" };
  return { Icon: Globe2, tone: "other" };
}

export function KolPublicProfile({ slug }: { slug: string }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<"missing" | "network" | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastId = useRef(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<InquiryForm>(emptyInquiry);
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const showToast = useCallback((text: string) => setToast({ id: ++toastId.current, text }), []);

  const loadProfile = async () => {
    setLoading(true);
    setFailure(null);
    setProfile(null);
    try {
      const response = await fetch(`${API}/public/${encodeURIComponent(slug)}`, { credentials: "omit", headers: { Accept: "application/json" } });
      if (response.status === 404) { setFailure("missing"); return; }
      if (!response.ok) throw new Error("PROFILE_LOAD_FAILED");
      const body = await response.json();
      if (!body?.data?.id || !body?.data?.username) throw new Error("INVALID_PUBLIC_PROFILE");
      setProfile({
        ...body.data,
        platforms: Array.isArray(body.data.platforms) ? body.data.platforms : [],
        portfolio: Array.isArray(body.data.portfolio) ? body.data.portfolio : [],
        badges: Array.isArray(body.data.badges) ? body.data.badges : [],
      });
    } catch {
      setFailure("network");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadProfile(); }, [slug]);

  useEffect(() => {
    const onScroll = () => setCollapsed(window.scrollY > 250);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!profile) return;
    document.title = `${profile.name} · Creator Partnership`;
  }, [profile]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const shareProfile = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${profile?.name || "Creator"} · Creator Partnership`, url });
      else { await navigator.clipboard.writeText(url); showToast("Link profil disalin"); }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      try { await navigator.clipboard.writeText(url); showToast("Link profil disalin"); }
      catch { showToast("Link belum dapat disalin. Salin dari address bar."); }
    }
  };

  const openSheet = () => { setSubmitError(""); setSheetOpen(true); };
  const closeSheet = useCallback(() => { setSheetOpen(false); setSubmitted(false); setSubmitError(""); }, []);

  const submitInquiry = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    setSubmitError("");
    if (form.preferredContact === "email" && !form.contactEmail.trim()) { setSubmitError("Isi email agar tim bisa menghubungi lewat email."); return; }
    if (form.preferredContact === "phone" && !form.contactPhone.trim()) { setSubmitError("Isi nomor WhatsApp agar tim bisa menghubungi lewat WhatsApp."); return; }
    if (!form.contactEmail.trim() && !form.contactPhone.trim()) { setSubmitError(inquiryErrors.CONTACT_REQUIRED || "Isi email atau nomor WhatsApp yang bisa dihubungi."); return; }
    setSending(true);
    try {
      const response = await fetch(`${API}/public/${encodeURIComponent(slug)}/inquiries`, {
        method: "POST",
        credentials: "omit",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) throw new Error((typeof body?.error === "string" ? inquiryErrors[body.error] : undefined) || "Pengajuan belum terkirim. Periksa kembali data lalu coba lagi.");
      setSubmitted(true);
      setForm(emptyInquiry);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Pengajuan belum terkirim. Coba lagi.");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <main className="kpp" aria-busy="true" aria-label="Memuat profil creator">
    <div className="kpp-skel kpp-skel-hero" />
    <div className="kpp-skel kpp-skel-strip" />
    <div className="kpp-skel-body">
      <div className="kpp-skel kpp-skel-line" style={{ width: "76%", margin: "26px auto 0" }} />
      <div className="kpp-skel kpp-skel-line" style={{ width: "54%", margin: "0 auto" }} />
      <div className="kpp-skel kpp-skel-block" />
      <div className="kpp-skel kpp-skel-block" />
    </div>
  </main>;

  if (failure) return <main className="kpp-state">
    <section className="kpp-state-card">
      <div className="kpp-state-ico"><BriefcaseBusiness size={26} /></div>
      <h1>{failure === "missing" ? "Profil creator tidak ditemukan" : "Profil belum dapat dimuat"}</h1>
      <p>{failure === "missing" ? "Periksa penulisan link profil. Creator yang ditolak atau tidak terdaftar tidak memiliki profil." : "Periksa koneksi internet lalu coba muat ulang."}</p>
      {failure === "network" && <button type="button" className="kpp-btn" onClick={() => void loadProfile()}>Coba lagi</button>}
      <a href="/" className="kpp-state-link">Kembali ke Creator Partnership</a>
    </section>
  </main>;

  if (!profile) return null;

  const avatarUrl = safeHttpsUrl(profile.avatar_url);
  const socials = profile.platforms
    .filter((item) => item.platform && item.username)
    .map((item) => ({ ...item, handle: item.username.replace(/^@+/, ""), followers: Number(item.followers) || 0 }))
    .filter((item) => item.handle);
  const totalFollowers = socials.reduce((sum, item) => sum + item.followers, 0);
  const karyaCount = profile.portfolio.length;
  const availabilityKey = profile.public_availability && profile.public_availability !== "not_set" ? profile.public_availability : null;
  const availability = availabilityKey ? availabilityCopy[availabilityKey] : null;
  const availabilityTitle = profile.availability_label?.trim() || availability?.title || null;
  const aboutRows = Boolean(profile.category || profile.location || profile.badges.length > 0);
  const socialActions = socials.slice(0, 2);

  return <main className="kpp">
    <div className="kpp-cbar" data-on={collapsed} aria-hidden={!collapsed}>
      <span className="kpp-ib2" aria-hidden="true" />
      <div className="kpp-cbar-mid">
        <AvatarImg url={avatarUrl} name={profile.name} size={30} />
        <b>{profile.name}</b>
      </div>
      <button type="button" className="kpp-ib2" aria-label="Bagikan profil" tabIndex={collapsed ? 0 : -1} onClick={() => void shareProfile()}><Share2 size={18} /></button>
    </div>

    {toast && <div className="kpp-toast" role="status">{toast.text}</div>}

    <header className="kpp-hero">
      <div className="kpp-hero-top">
        <a href="/" className="kpp-brand" aria-label="Djiwa Tentram Creator Partnership"><img src="/logo-djiwa.png" alt="" /><span>Creator Partnership</span></a>
        <button type="button" className="kpp-hero-share" aria-label="Bagikan profil" onClick={() => void shareProfile()}><Share2 size={18} /></button>
      </div>
      <div className="kpp-who">
        <AvatarImg url={avatarUrl} name={profile.name} size={104} className="kpp-av-hero" />
        <h1>{profile.name}</h1>
        <div className="kpp-at">@{profile.username}</div>
        {(profile.category || profile.location) && <div className="kpp-chips">
          {profile.category && <span className="kpp-chip">{profile.category}</span>}
          {profile.location && <span className="kpp-chip"><MapPin size={13} />{profile.location}</span>}
        </div>}
      </div>
    </header>

    <div className="kpp-stats" role="group" aria-label="Ringkasan profil">
      <div><b>{formatFollowers(totalFollowers)}</b><small>PENGIKUT</small></div>
      <div><b>{socials.length}</b><small>PLATFORM</small></div>
      <div><b>{karyaCount}</b><small>KARYA</small></div>
    </div>

    <div className="kpp-body">
      {profile.bio && <p className="kpp-bio">{profile.bio}</p>}

      <div className="kpp-acts">
        <button type="button" className="kpp-act pri" onClick={openSheet}><i><Mail size={20} /></i><span>Ajukan</span></button>
        {socialActions.map((item) => {
          const { Icon } = platformMeta(item.platform);
          const url = safeHttpsUrl(item.profile_url);
          if (url) return <a key={`${item.platform}-${item.handle}`} className="kpp-act" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Buka ${item.platform} @${item.handle}`}><i><Icon size={20} /></i><span>{item.platform}</span></a>;
          return <button key={`${item.platform}-${item.handle}`} type="button" className="kpp-act" aria-label={`${item.platform} @${item.handle} belum memiliki tautan`} onClick={() => showToast(`Tautan ${item.platform} belum tersedia`)}><i><Icon size={20} /></i><span>{item.platform}</span></button>;
        })}
      </div>

      {availability && availabilityTitle && <div className="kpp-avl" data-tone={availability.tone}>
        <span className="kpp-avl-dot" aria-hidden="true" />
        <div><b>{availabilityTitle}</b><small>{availability.note}</small></div>
      </div>}

      {socials.length > 0 && <>
        <h2 className="kpp-sec">Kanal sosial</h2>
        <div className="kpp-grp">
          {socials.map((item) => {
            const { Icon, tone } = platformMeta(item.platform);
            const url = safeHttpsUrl(item.profile_url);
            const inner = <>
              <span className={`kpp-ic kpp-ic--${tone}`} aria-hidden="true"><Icon size={17} /></span>
              <span className="kpp-gr-m"><b>@{item.handle}</b><small>{item.platform}</small></span>
              {item.followers > 0 && <span className="kpp-pill">{formatFollowers(item.followers)}</span>}
              <ChevronRight className="kpp-chev" size={18} aria-hidden="true" />
            </>;
            const label = `${item.platform} @${item.handle}${item.followers > 0 ? `, ${formatFollowers(item.followers)} pengikut` : ""}`;
            return url
              ? <a key={`${item.platform}-${item.handle}`} className="kpp-gr" data-tappable="true" href={url} target="_blank" rel="noopener noreferrer" aria-label={label}>{inner}</a>
              : <button key={`${item.platform}-${item.handle}`} type="button" className="kpp-gr" data-tappable="true" aria-label={`${label}. Tautan belum tersedia`} onClick={() => showToast(`Tautan ${item.platform} belum tersedia`)}>{inner}</button>;
          })}
        </div>
      </>}

      {aboutRows && <>
        <h2 className="kpp-sec">Tentang</h2>
        <div className="kpp-grp">
          {profile.category && <div className="kpp-gr"><span className="kpp-gr-m"><small>Kategori</small><b>{profile.category}</b></span></div>}
          {profile.location && <div className="kpp-gr"><span className="kpp-gr-m"><small>Domisili</small><b>{profile.location}</b></span></div>}
          {profile.badges.map((badge) => <div key={badge.code} className="kpp-gr">
            <span className="kpp-ic kpp-ic--badge" aria-hidden="true"><BadgeCheck size={17} /></span>
            <span className="kpp-gr-m"><b>{badge.name}</b>{badge.description && <small>{badge.description}</small>}</span>
          </div>)}
        </div>
      </>}

      <PublicActivityStrip apiBase={API} username={slug} name={profile.name} avatarUrl={avatarUrl} />

      <p className="kpp-ft">Dibuat dengan Djiwa Tentram Creator Partnership</p>
    </div>

    <div className="kpp-bar">
      <button type="button" className="kpp-btn kpp-btn--sq" aria-label="Bagikan profil" onClick={() => void shareProfile()}><Share2 size={19} /></button>
      <button type="button" className="kpp-btn" onClick={openSheet}>Ajukan kerja sama</button>
    </div>

    {sheetOpen && <KxSheet title="Ajukan kerja sama" onClose={closeSheet}>
      {submitted ? <div className="kpp-done">
        <div className="kpp-ok" aria-hidden="true"><Check size={32} /></div>
        <b>Permintaan terkirim</b>
        <p>Terima kasih. Kami akan meneruskannya ke {profile.name} dan menghubungi Anda.</p>
        <button type="button" className="kpp-btn kpp-btn--ghost" onClick={() => { setSubmitted(false); setSubmitError(""); }}>Kirim yang lain</button>
      </div> : <form className="kpp-form" onSubmit={submitInquiry}>
        <label className="kx-label" htmlFor="inquiry-brand">Nama brand</label>
        <input id="inquiry-brand" className="kx-input" required minLength={2} maxLength={160} autoComplete="organization" value={form.businessName} onChange={(event) => setForm((old) => ({ ...old, businessName: event.target.value }))} placeholder="Nama brand" />

        <label className="kx-label" htmlFor="inquiry-name">Nama Anda</label>
        <input id="inquiry-name" className="kx-input" required minLength={2} maxLength={120} autoComplete="name" value={form.contactName} onChange={(event) => setForm((old) => ({ ...old, contactName: event.target.value }))} placeholder="Nama Anda" />

        <div className="kpp-row2" style={{ marginTop: 16 }}>
          <div>
            <label className="kx-label" htmlFor="inquiry-email" style={{ marginTop: 0 }}>Email</label>
            <input id="inquiry-email" className="kx-input" type="email" maxLength={254} autoComplete="email" value={form.contactEmail} onChange={(event) => setForm((old) => ({ ...old, contactEmail: event.target.value }))} placeholder="nama@brand.com" />
          </div>
          <div>
            <label className="kx-label" htmlFor="inquiry-phone" style={{ marginTop: 0 }}>WhatsApp</label>
            <input id="inquiry-phone" className="kx-input" type="tel" maxLength={40} autoComplete="tel" value={form.contactPhone} onChange={(event) => setForm((old) => ({ ...old, contactPhone: event.target.value }))} placeholder="+62…" />
          </div>
        </div>

        <span className="kx-label" id="inquiry-preferred">Dihubungi lewat</span>
        <div className="kx-seg" role="group" aria-labelledby="inquiry-preferred">
          {([["either", "Mana saja"], ["email", "Email"], ["phone", "WhatsApp"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={form.preferredContact === value} onClick={() => setForm((old) => ({ ...old, preferredContact: value }))}>{label}</button>)}
        </div>

        <label className="kx-label" htmlFor="inquiry-brief">Brief kolaborasi</label>
        <textarea id="inquiry-brief" className="kx-input" required minLength={20} maxLength={3000} value={form.brief} onChange={(event) => setForm((old) => ({ ...old, brief: event.target.value }))} placeholder="Tujuan campaign, deliverable, waktu, dan detail relevan." />

        <label className="kpp-hp" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => setForm((old) => ({ ...old, website: event.target.value }))} /></label>

        {submitError && <p role="alert" className="kpp-alert">{submitError}</p>}

        <button type="submit" className="kpp-btn" style={{ marginTop: 14 }} disabled={sending}>{sending ? "Mengirim permintaan…" : "Kirim permintaan"}</button>
        <p className="kpp-form-note">Tim Djiwa Tentram akan menghubungimu maksimal 1×24 jam.</p>
      </form>}
    </KxSheet>}
  </main>;
}
