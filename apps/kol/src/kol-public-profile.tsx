import { useEffect, useState } from "react";
import { ArrowUpRight, BadgeCheck, BriefcaseBusiness, Check, ExternalLink, MapPin, Share2, Users } from "lucide-react";
import { PublicTimeline } from "./components/kol-public-timeline";

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
const availabilityText: Record<string, string> = {
  open: "Terbuka untuk kolaborasi",
  selective: "Memilih campaign yang sesuai",
  unavailable: "Belum tersedia untuk campaign baru",
};
const formatFollowers = (value: number) => new Intl.NumberFormat("id-ID", { notation: value >= 1000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
const safeHttpsUrl = (value?: string | null) => {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; } catch { return null; }
};

export function KolPublicProfile({ slug }: { slug: string }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<"missing" | "network" | null>(null);
  const [shareMessage, setShareMessage] = useState("");
  const [form, setForm] = useState<InquiryForm>(emptyInquiry);
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isOwner, setIsOwner] = useState(false);

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
      setProfile({ ...body.data, platforms: Array.isArray(body.data.platforms) ? body.data.platforms : [], portfolio: Array.isArray(body.data.portfolio) ? body.data.portfolio : [], badges: Array.isArray(body.data.badges) ? body.data.badges : [] });
    } catch {
      setFailure("network");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadProfile(); }, [slug]);
  useEffect(() => {
    let active = true;
    setIsOwner(false);
    fetch(`${API}/portal/profile`, { credentials: "include", headers: { Accept: "application/json" } })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        const ownerUsername = String(body?.data?.slug || body?.data?.username || "").replace(/^@+/, "").toLowerCase();
        if (active && ownerUsername && ownerUsername === slug.replace(/^@+/, "").toLowerCase()) setIsOwner(true);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [slug]);

  const shareProfile = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${profile?.name || "Creator"} · Creator Partnership`, url });
      else { await navigator.clipboard.writeText(url); setShareMessage("Link profil tersalin"); }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setShareMessage("Link belum dapat disalin. Coba salin dari address bar.");
    }
    window.setTimeout(() => setShareMessage(""), 2600);
  };

  const submitInquiry = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setSubmitError("");
    try {
      const response = await fetch(`${API}/public/${encodeURIComponent(slug)}/inquiries`, {
        method: "POST",
        credentials: "omit",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) {
        const messages: Record<string, string> = {
          CONTACT_REQUIRED: "Isi email atau nomor telepon yang bisa dihubungi.",
          INVALID_BRIEF: "Ringkasan kerja sama perlu berisi 20–3.000 karakter.",
          TOO_MANY_REQUESTS: "Pengajuan dari jaringan ini terlalu sering. Coba lagi beberapa saat.",
          PROFILE_NOT_FOUND: "Profil ini tidak tersedia untuk pengajuan saat ini.",
        };
        throw new Error(messages[body?.error] || "Pengajuan belum terkirim. Periksa kembali data lalu coba lagi.");
      }
      setSubmitted(true);
      setForm(emptyInquiry);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Pengajuan belum terkirim. Coba lagi.");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <main className="min-h-screen bg-[#f5f8ff] px-5 py-8"><div className="mx-auto max-w-5xl animate-pulse space-y-4"><div className="h-10 w-48 rounded-xl bg-blue-100"/><div className="h-72 rounded-[2rem] bg-white"/><div className="h-52 rounded-[2rem] bg-white"/></div></main>;
  if (failure) return <main className="grid min-h-screen place-items-center bg-[#f5f8ff] px-5"><section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-700"><BriefcaseBusiness/></div><h1 className="mt-5 text-xl font-extrabold text-slate-900">{failure === "missing" ? "Profil creator belum tersedia" : "Profil belum dapat dimuat"}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{failure === "missing" ? "Profil ini mungkin privat atau belum dipublikasikan oleh pemiliknya." : "Periksa koneksi internet lalu coba muat ulang."}</p>{failure === "network" && <button onClick={() => void loadProfile()} className="mt-5 min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white">Coba lagi</button>}<a href="/" className="mt-4 block text-sm font-bold text-blue-700">Kembali ke Creator Partnership</a></section></main>;
  if (!profile) return null;

  const availability = profile.public_availability && profile.public_availability !== "not_set" ? (profile.availability_label || availabilityText[profile.public_availability] || null) : null;
  const socials = profile.platforms.filter((item) => item.platform && item.username);
  const portfolio = profile.portfolio.filter((item) => item.title && safeHttpsUrl(item.content_url));

  return <main className="min-h-screen bg-[#f5f8ff] pb-16 text-slate-950">
    <header className="border-b border-blue-100/80 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3 sm:px-8">
        <a href="/" className="flex min-h-11 items-center gap-3" aria-label="Djiwa Tentram Creator Partnership">
          <img src="/logo-djiwa.png" alt="" className="h-9 w-9 rounded-full object-cover"/>
          <span><span className="block text-[10px] font-black uppercase tracking-[.16em] text-blue-700">Djiwa Tentram</span><span className="block text-sm font-bold text-slate-800">Creator Partnership</span></span>
        </a>
        <div className="flex items-center gap-2">{isOwner && <a href="/portal/profile-settings" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-800 hover:bg-blue-100">Pengaturan profil</a>}<button onClick={() => void shareProfile()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><Share2 size={16}/><span className="hidden sm:inline">Bagikan profil</span><span className="sm:hidden">Bagikan</span></button></div>
      </div>
    </header>

    <div className="mx-auto max-w-6xl px-5 pt-6 sm:px-8 sm:pt-9">
      <section className="overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-[0_24px_72px_rgba(30,64,175,.08)]">
        <div className="h-2 bg-gradient-to-r from-blue-600 via-violet-500 to-cyan-400"/>
        <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[1fr_auto] lg:items-center lg:p-12">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
            <div className="grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-100 to-violet-100 text-4xl font-black text-blue-800 ring-4 ring-blue-50 sm:h-36 sm:w-36">
              {safeHttpsUrl(profile.avatar_url) ? <img src={safeHttpsUrl(profile.avatar_url)!} alt={profile.name} className="h-full w-full object-cover"/> : profile.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[.18em] text-blue-700">Creator media kit</p>
              <h1 className="mt-2 break-words text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{profile.name}</h1>
              <p className="mt-1 text-base font-semibold text-slate-500">@{profile.username}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.category && <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">{profile.category}</span>}
                {profile.location && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"><MapPin size={13}/>{profile.location}</span>}
                {availability && <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-bold text-cyan-800"><span className={`h-1.5 w-1.5 rounded-full ${profile.public_availability === "open" ? "bg-emerald-500" : "bg-cyan-600"}`}/>{availability}</span>}
              </div>
              {profile.bio && <p className="mt-5 max-w-2xl whitespace-pre-line text-sm leading-7 text-slate-600 sm:text-base">{profile.bio}</p>}
            </div>
          </div>
          <a href="#collaboration-form" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-extrabold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800"><BriefcaseBusiness size={18}/>Ajukan kerja sama<ArrowUpRight size={16}/></a>
        </div>
      </section>

      {socials.length > 0 && <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-violet-700">Kanal sosial</p><h2 className="mt-1 text-xl font-black">Platform & jangkauan</h2></div><Users className="text-blue-600" size={21}/></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{socials.map((item, index) => <article key={`${item.platform}-${item.username}-${index}`} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4"><div className="min-w-0"><p className="text-xs font-bold text-slate-500">{item.platform}</p><p className="mt-1 truncate font-extrabold text-slate-900">@{item.username.replace(/^@+/, "")}</p>{item.followers && item.followers > 0 ? <p className="mt-1 text-xs font-semibold text-blue-700">{formatFollowers(item.followers)} followers</p> : null}</div>{safeHttpsUrl(item.profile_url) && <a href={safeHttpsUrl(item.profile_url)!} target="_blank" rel="noopener noreferrer" aria-label={`Buka ${item.platform}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-blue-700 shadow-sm"><ExternalLink size={17}/></a>}</article>)}</div>
      </section>}

      {profile.badges.length > 0 && <section className="mt-6 rounded-3xl border border-blue-100 bg-gradient-to-r from-blue-50 to-violet-50 p-5 sm:p-7"><p className="text-xs font-black uppercase tracking-[.16em] text-blue-700">Kredibilitas</p><div className="mt-3 flex flex-wrap gap-2">{profile.badges.map((badge) => <span key={badge.code} title={badge.description || undefined} className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-slate-800"><BadgeCheck size={15} className="text-blue-700"/>{badge.name}</span>)}</div></section>}

      {portfolio.length > 0 && <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-violet-700">Karya terpilih</p><h2 className="mt-1 text-2xl font-black tracking-tight">Konten pilihan</h2></div><span className="text-xs font-semibold text-slate-500">{portfolio.length} konten publik</span></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{portfolio.map((item) => <article key={item.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <a href={safeHttpsUrl(item.content_url)!} target="_blank" rel="noopener noreferrer" className="group block">
            {safeHttpsUrl(item.thumbnail_url) ? <img src={safeHttpsUrl(item.thumbnail_url)!} alt="" loading="lazy" className="aspect-[4/3] w-full bg-slate-100 object-cover"/> : <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-blue-50 via-violet-50 to-cyan-50 text-blue-700"><BriefcaseBusiness size={36}/></div>}
            <div className="p-4"><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">{item.platform || "Konten"}</span><ExternalLink size={15} className="shrink-0 text-slate-400"/></div><h3 className="mt-3 line-clamp-2 font-extrabold text-slate-900">{item.title}</h3>{item.description && <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{item.description}</p>}<span className="mt-4 inline-flex min-h-10 items-center gap-1 text-xs font-extrabold text-blue-700">Buka di platform<ArrowUpRight size={14}/></span></div>
          </a>
        </article>)}</div>
      </section>}
      {portfolio.length === 0 && <section className="mt-8 rounded-3xl border border-dashed border-blue-200 bg-white p-6 text-center sm:p-9"><BriefcaseBusiness className="mx-auto text-blue-500" size={28}/><h2 className="mt-3 font-extrabold">Portfolio publik sedang disiapkan</h2><p className="mt-1 text-sm text-slate-500">Konten yang ditampilkan di media kit ini akan muncul setelah disetujui kreator dan admin.</p></section>}

      <section className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><p className="text-xs font-black uppercase tracking-[.16em] text-violet-700">Aktivitas terpublikasi</p><h2 className="mt-1 text-xl font-black">Cerita & pencapaian</h2><div className="mt-4"><PublicTimeline apiBase={API} username={slug}/></div></div>
        <aside className="flex flex-col justify-between rounded-3xl bg-gradient-to-br from-blue-700 via-blue-700 to-violet-700 p-6 text-white shadow-lg shadow-blue-900/15 sm:p-8"><div><p className="text-xs font-black uppercase tracking-[.16em] text-blue-100">Punya campaign yang cocok?</p><h2 className="mt-3 text-2xl font-black leading-tight">Mari diskusikan kolaborasi yang relevan.</h2><p className="mt-3 text-sm leading-6 text-blue-100">Sampaikan gambaran campaign dan kebutuhan brand. Pengajuan akan ditinjau oleh tim Djiwa Tentram.</p></div><a href="#collaboration-form" className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-extrabold text-blue-800 hover:bg-blue-50">Ajukan kerja sama<ArrowUpRight size={16}/></a></aside>
      </section>

      <section id="collaboration-form" className="mt-8 scroll-mt-6 rounded-3xl border border-blue-100 bg-white p-5 shadow-[0_20px_56px_rgba(30,64,175,.07)] sm:p-8">
        <div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-[.16em] text-blue-700">Untuk brand & client</p><h2 className="mt-2 text-2xl font-black tracking-tight">Ajukan kerja sama dengan {profile.name}</h2><p className="mt-2 text-sm leading-6 text-slate-600">Ceritakan campaign Anda. Detail kontak hanya digunakan tim untuk menindaklanjuti pengajuan dan tidak ditampilkan di profil publik.</p></div>
        {submitted ? <div role="status" className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-2 font-extrabold text-emerald-800"><Check size={18}/>Pengajuan sudah diterima</div><p className="mt-2 text-sm leading-6 text-emerald-800">Tim Djiwa Tentram akan meninjau informasi campaign Anda. Pengajuan ini belum berarti kerja sama telah disetujui.</p><button onClick={() => { setSubmitted(false); setSubmitError(""); }} className="mt-3 text-sm font-bold text-emerald-800 underline">Kirim pengajuan lain</button></div> : <form onSubmit={submitInquiry} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-bold text-slate-700">Nama bisnis / brand<input required minLength={2} maxLength={160} autoComplete="organization" value={form.businessName} onChange={(event) => setForm((old) => ({ ...old, businessName: event.target.value }))} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Nama brand"/></label>
          <label className="block text-sm font-bold text-slate-700">Nama contact person<input required minLength={2} maxLength={120} autoComplete="name" value={form.contactName} onChange={(event) => setForm((old) => ({ ...old, contactName: event.target.value }))} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Nama Anda"/></label>
          <label className="block text-sm font-bold text-slate-700">Email<input type="email" maxLength={254} autoComplete="email" value={form.contactEmail} onChange={(event) => setForm((old) => ({ ...old, contactEmail: event.target.value }))} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="nama@brand.com"/></label>
          <label className="block text-sm font-bold text-slate-700">Nomor telepon / WhatsApp<input type="tel" maxLength={40} autoComplete="tel" value={form.contactPhone} onChange={(event) => setForm((old) => ({ ...old, contactPhone: event.target.value }))} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="+62…"/></label>
          <label className="block text-sm font-bold text-slate-700 sm:col-span-2">Brief kerja sama<textarea required minLength={20} maxLength={3000} value={form.brief} onChange={(event) => setForm((old) => ({ ...old, brief: event.target.value }))} className="mt-2 min-h-32 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Tujuan campaign, deliverable yang diharapkan, waktu, dan detail relevan…"/><span className="mt-1 block text-right text-xs font-normal text-slate-400">{form.brief.length}/3000</span></label>
          <label className="block text-sm font-bold text-slate-700 sm:col-span-2">Kontak yang diutamakan<select value={form.preferredContact} onChange={(event) => setForm((old) => ({ ...old, preferredContact: event.target.value as InquiryForm["preferredContact"] }))} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="either">Email atau telepon</option><option value="email">Email</option><option value="phone">Telepon / WhatsApp</option></select></label>
          <label aria-hidden="true" className="pointer-events-none absolute -left-[10000px] top-auto h-px w-px overflow-hidden">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => setForm((old) => ({ ...old, website: event.target.value }))}/></label>
          {submitError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{submitError}</p>}
          <div className="sm:col-span-2"><button disabled={sending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-extrabold text-white shadow-lg shadow-blue-700/15 disabled:cursor-wait disabled:opacity-60 sm:w-auto">{sending ? "Mengirim pengajuan…" : "Kirim pengajuan"}<ArrowUpRight size={16}/></button><p className="mt-3 text-xs leading-5 text-slate-500">Pastikan email atau nomor telepon diisi agar tim dapat menghubungi Anda.</p></div>
        </form>}
      </section>
      {shareMessage && <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-lg">{shareMessage}</div>}
      <footer className="py-8 text-center text-xs text-slate-400">Profil publik dikelola oleh {profile.name} · Djiwa Tentram Creator Partnership</footer>
    </div>
  </main>;
}
