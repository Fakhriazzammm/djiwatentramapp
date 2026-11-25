import { useMemo, useState, type ReactNode } from "react";
import { Btn, Ic, I3, payAsset, type IconName } from "../shell/dpx-ui";
import { CatIcon, catOf } from "./fin-sheets";
import { EntryRow, type FinCtx } from "./fin-pages";
import { QuickAdd } from "./hero-day";
import { CAT_COLORS, DragRow, Donut, GoldSpark, HeatGrid, PaceChart, WealthChart } from "./story-charts";
import { FullPage } from "../kelola/asset-ui";
import { openArticle } from "../../lib/inapp";
import { NEWS_TOPICS, timeAgo, useNews, type NewsItem } from "../../lib/finance/news";
import { DiscoveryChip } from "./discoveries";
import { NewTag } from "../shell/new-badge";
import { IntegrationNudge, ReviewChip, useInbound } from "../integrations/integrations-pages";
import { short } from "../kelola/kelola-ui";
import { budgetStatuses, buildInsights, goalProjection, goalSaved, inMonth, safeToSpend, totals } from "../../lib/finance/calc";
import { FlowCard } from "./sankey";
import { cashflowGraph, categoryShares, pace, spendCalendar, spendStats, wealthHistory, type WealthPoint } from "../../lib/finance/story";
import { gainOf, isGoldAsset, assetValue, assetsChange, useGold, type GoldData } from "../../lib/finance/assets";
import type { Finance } from "../../lib/finance/use-finance";
import { billsFor, forecast, healthScore } from "../../lib/finance/kelola";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { Entry } from "../../lib/finance/types";

type Story = { id: string; tone: "ok" | "warn" | "info"; icon: IconName; title: string; body: string };
const mk = (v: boolean, t: string) => (v ? t : "•••••");
const pctText = (n: number) => `${Math.abs(n)}%`;

function Card({ title, right, children, className = "" }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`dpx-st-card ${className}`}>{title ? <div className="dpx-st-ch"><h2>{title}</h2>{right}</div> : null}{children}</section>;
}
const Sec = ({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) => <div className="dpx-sec dpx-st-sec"><h2>{title}</h2>{action ? <Btn type="button" onClick={onAction}>{action}</Btn> : null}</div>;

const MENU: { label: string; icon: IconName; path?: string; news?: boolean; all?: boolean }[] = [
  { label: "Laporan", icon: "chart", path: "/ringkasan" }, { label: "Kalender", icon: "cal", path: "/kalender" }, { label: "Kesehatan", icon: "heart", path: "/kesehatan" }, { label: "Kantong", icon: "pie", path: "/rencana?bagian=kantong" },
  { label: "Tujuan", icon: "target", path: "/rencana?bagian=tujuan" }, { label: "Hutang & tagihan", icon: "users", path: "/kekayaan?bagian=kewajiban" }, { label: "Berita", icon: "book", news: true }, { label: "Lainnya", icon: "grid", all: true },
];
type MenuGroup = { title: string; items: { label: string; sub: string; icon: IconName; path?: string; act?: "news" | "notif" | "catat"; /** Id of a new feature: shows the standard "Baru" mark for 2 days after the person first sees it. */ fresh?: string }[] };
const ALL_MENU: MenuGroup[] = [
  { title: "Keuangan", items: [{ label: "Laporan", sub: "Ringkasan, kategori, tren, arus uang", icon: "chart", path: "/ringkasan" }, { label: "Penerima", sub: "Ke mana uangmu pergi, dari siapa masuk", icon: "users", path: "/penerima", fresh: "payees-page" }, { label: "Kalender tagihan", sub: "Jatuh tempo per tanggal", icon: "cal", path: "/kalender" }, { label: "Kesehatan keuangan", sub: "Skor dan langkah tercepat", icon: "heart", path: "/kesehatan" }, { label: "Prakiraan kas", sub: "Saldo sampai akhir bulan", icon: "trend", path: "/prakiraan" }] },
  { title: "Rencana", items: [{ label: "Anggaran", sub: "Batas per kategori", icon: "chart", path: "/rencana" }, { label: "Kantong", sub: "Bagi pemasukan", icon: "pie", path: "/rencana?bagian=kantong" }, { label: "Tujuan", sub: "Tabungan dan targetnya", icon: "target", path: "/rencana?bagian=tujuan" }, { label: "Alat", sub: "Bisa beli, dana darurat, zakat, cicilan", icon: "grid", path: "/alat" }] },
  { title: "Kekayaan", items: [{ label: "Kekayaan", sub: "Aset, saham, dompet, kewajiban", icon: "wallet", path: "/kekayaan" }, { label: "Hutang & tagihan", sub: "Cicilan, tagihan bulanan, jatuh tempo", icon: "users", path: "/kekayaan?bagian=kewajiban" }, { label: "Foto aset", sub: "Emas, kendaraan, rumah, lainnya", icon: "scan", act: "catat" }] },
  { title: "Email & catatan", items: [{ label: "Temuan", sub: "Dompet, tagihan, langganan baru", icon: "spark", path: "/temuan", fresh: "discoveries-page" }, { label: "Tinjau email", sub: "Catatan yang perlu dicek", icon: "receipt", path: "/tinjau" }, { label: "Email & Google", sub: "Hubungkan email pembayaran", icon: "link", path: "/integrasi" }, { label: "Catatan", sub: "Semua transaksi", icon: "list", path: "/riwayat" }] },
  { title: "Dompet & bayar", items: [{ label: "Isi saldo", sub: "Tambah saldo Djiwa Pay", icon: "plus", path: "/wallet/topup" }, { label: "Kirim", sub: "Transfer ke sesama pengguna", icon: "send", path: "/wallet/transfer" }, { label: "Scan QR", sub: "Bayar dengan QR", icon: "scan", path: "/wallet/transfer?mode=scan" }, { label: "Layanan", sub: "Pulsa, PLN, e-toll, dan lain-lain", icon: "flash", path: "/bayar" }] },
  { title: "Lainnya", items: [{ label: "Berita keuangan", sub: "Emas, ekonomi, saham, kripto", icon: "book", act: "news" }, { label: "Notifikasi", sub: "Email, tagihan, anggaran", icon: "bell", act: "notif" }, { label: "Bantuan", sub: "Pertanyaan umum", icon: "help", path: "/wallet/help" }, { label: "Pengaturan", sub: "Dompet, kategori, data", icon: "shield", path: "/pengaturan" }, { label: "Akun", sub: "Profil dan keluar", icon: "user", path: "/akun" }] },
];

/** Every screen of the app in one list, for what does not fit in the Beranda menu. */
function AllMenuPage({ onBack, run }: { onBack: () => void; run: (i: MenuGroup["items"][number]) => void }) {
  return <FullPage title="Semua menu" onBack={onBack}>
    <div className="dpx-st-npage">{ALL_MENU.map((g) => <div key={g.title} className="dpx-am-g"><div className="dpx-glabel">{g.title}</div>
      <div className="dpx-st-nlist">{g.items.map((i) => <Btn key={i.label} type="button" className="dpx-st-nrow dpx-am-row" onClick={() => run(i)}><span className="dpx-st-mi" style={{ width: 40, height: 40 }}><Ic n={i.icon} /></span><div><b>{i.label}{i.fresh ? <NewTag id={i.fresh} /> : null}</b><span className="dpx-sub">{i.sub}</span></div><Ic n="chev" size="sm" /></Btn>)}</div></div>)}</div>
  </FullPage>;
}
const TOPIC_ICON: Record<string, { icon: IconName; tone: string }> = { emas: { icon: "gift", tone: "amber" }, saham: { icon: "chart", tone: "blue" }, kripto: { icon: "flash", tone: "violet" }, ekonomi: { icon: "trend", tone: "emerald" } };
const NewsCard = ({ n }: { n: NewsItem }) => <a className="dpx-st-card dpx-st-story dpx-st-news" href={n.url} onClick={(e) => { e.preventDefault(); openArticle({ url: n.url, title: n.title, source: n.source }); }}><span className={`dpx-cat dpx-c-${TOPIC_ICON[n.topic].tone}`}><Ic n={TOPIC_ICON[n.topic].icon} /></span><b>{n.title}</b><span className="dpx-sub">{n.source} · {timeAgo(n.at)}</span></a>;

/** Full list of today's headlines by topic. Each opens the article on the publisher's site. */
function NewsPage({ onBack }: { onBack: () => void }) {
  const [topic, setTopic] = useState<string>("semua"), { items, failed } = useNews(topic);
  return <FullPage title="Berita keuangan" onBack={onBack} aboveSheet>
    <div className="dpx-st-npage">
      <DragRow className="dpx-st-tabs" role="tablist">{NEWS_TOPICS.map((t) => <Btn key={t.id} type="button" role="tab" aria-selected={topic === t.id} className={topic === t.id ? "on" : ""} onClick={() => setTopic(t.id)}>{t.label}</Btn>)}</DragRow>
      {items === null && !failed ? <p className="dpx-st-empty">Memuat berita…</p> : failed ? <p className="dpx-st-empty">Berita belum bisa dimuat. Periksa koneksi lalu coba lagi.</p> : !items?.length ? <p className="dpx-st-empty">Belum ada berita untuk topik ini hari ini.</p> :
        <div className="dpx-st-nlist">{items.map((n) => <a key={n.url} className="dpx-st-nrow" href={n.url} onClick={(e) => { e.preventDefault(); openArticle({ url: n.url, title: n.title, source: n.source }); }}><span className={`dpx-cat dpx-c-${TOPIC_ICON[n.topic].tone}`}><Ic n={TOPIC_ICON[n.topic].icon} /></span><div><b>{n.title}</b><span className="dpx-sub">{n.source} · {timeAgo(n.at)}</span></div></a>)}</div>}
      <p className="dpx-st-foot">Judul dari CNBC Indonesia dan Antara News, diperbarui otomatis. Artikel dibuka di dalam aplikasi.</p>
    </div>
  </FullPage>;
}

/** The "Cerita" cards: what the person's own numbers say this month. Pure of the screen, so the Beranda and the Notifikasi tab show the same ones. */
export function useStories(fin: Finance, entries: Entry[], gold: GoldData | null, now: Date): Story[] {
  const { state } = fin;
  const y = now.getFullYear(), m = now.getMonth();
  const month = useMemo(() => fin.rolled.filter((e) => inMonth(e, y, m)), [fin.rolled]);
  const prev = useMemo(() => fin.rolled.filter((e) => inMonth(e, m === 0 ? y - 1 : y, (m + 11) % 12)), [fin.rolled]);
  const statuses = useMemo(() => budgetStatuses(state.budgets, month), [state.budgets, month]);
  const st = useMemo(() => spendStats(entries, now), [entries]);
  const cal = useMemo(() => spendCalendar(entries, now), [entries]);
  const pc = useMemo(() => pace(entries, now), [entries]);
  const stories = useMemo<Story[]>(() => {
    const out: Story[] = [], prevOut = totals(prev).out;
    if (st.perDayChange !== null && prevOut > 0) out.push(st.perDayChange <= 0 ? { id: "pace", tone: "ok", icon: "trend", title: `Belanja harianmu turun ${pctText(st.perDayChange)}`, body: `Rata-rata ${rupiah(Math.round(st.perDay))} per hari, dibanding bulan lalu di tanggal yang sama.` } : { id: "pace", tone: "warn", icon: "warn", title: `Belanja harianmu naik ${pctText(st.perDayChange)}`, body: `Rata-rata ${rupiah(Math.round(st.perDay))} per hari, dibanding bulan lalu di tanggal yang sama.` });
    const worst = statuses.find((s) => s.level !== "ok");
    if (worst) out.push({ id: "budget", tone: "warn", icon: "warn", title: `${catOf(state, worst.budget.categoryId).name} sudah ${Math.round(worst.percent)}% dari anggaran`, body: worst.remaining >= 0 ? `Sisa ${rupiah(worst.remaining)} untuk ${Math.max(1, pc.dim - pc.today + 1)} hari lagi.` : `Lewat ${rupiah(-worst.remaining)} dari batas.` });
    for (const i of buildInsights(state.categories, month, prev, statuses).slice(0, 2)) if (!out.some((o) => o.title === i.title)) out.push({ id: i.id, tone: i.tone, icon: i.tone === "warn" ? "warn" : i.tone === "ok" ? "spark" : "trend", title: i.title, body: i.body });
    const ch = assetsChange(state.assets, gold?.points ?? null, 30, now);
    if (ch && Math.abs(ch.delta) >= 1000) out.push({ id: "gold", tone: ch.delta >= 0 ? "ok" : "warn", icon: "gift", title: `Emasmu ${ch.delta >= 0 ? "naik" : "turun"} ${rupiah(Math.abs(Math.round(ch.delta)))}`, body: "Dalam 30 hari terakhir, mengikuti harga emas dunia." });
    if (cal.calm > 0) out.push({ id: "calm", tone: "ok", icon: "heart", title: `${cal.calm} hari tenang bulan ini`, body: "Hari tanpa belanja. Setiap hari tenang memberi ruang pada tabunganmu." });
    return out.slice(0, 5);
  }, [st, statuses, month, prev, gold, cal.calm]);
  return stories;
}

/** Cerita & berita: the topic tabs, the story cards, and the headlines. Used on Beranda and in the Notifikasi tab. */
export function CeritaFeed({ stories, onOpenAll, list }: { stories: Story[]; onOpenAll: () => void; list?: boolean }) {
  const [feed, setFeed] = useState<string>("untukmu"), news = useNews(feed, feed !== "untukmu");
  return <>
      <DragRow className="dpx-st-tabs" role="tablist" aria-label="Topik cerita dan berita">{[{ id: "untukmu", label: "Untukmu" }, ...NEWS_TOPICS.filter((t) => t.id !== "semua")].map((t) => <Btn key={t.id} type="button" role="tab" aria-selected={feed === t.id} className={feed === t.id ? "on" : ""} onClick={() => setFeed(t.id)}>{t.label}</Btn>)}</DragRow>
      <DragRow className={`dpx-st-stories ${list ? "is-list" : ""}`}>
        {feed === "untukmu"
          ? (stories.length ? stories.map((s) => <div key={s.id} className="dpx-st-card dpx-st-story"><span className={`dpx-cat dpx-c-${s.tone === "warn" ? "amber" : s.tone === "ok" ? "emerald" : "violet"}`}><Ic n={s.icon} /></span><b>{s.title}</b><span className="dpx-sub">{s.body}</span></div>) : <div className="dpx-st-card dpx-st-story"><b>Ceritamu menyusul</b><span className="dpx-sub">Catat beberapa transaksi lagi, insight pribadi muncul di sini.</span></div>)
          : news.items === null ? <div className="dpx-st-card dpx-st-story"><b>{news.failed ? "Berita belum bisa dimuat" : "Memuat berita…"}</b><span className="dpx-sub">{news.failed ? "Periksa koneksi lalu pilih topik lagi." : "Sebentar ya."}</span></div>
          : news.items.length ? <>{news.items.slice(0, list ? 20 : 8).map((n) => <NewsCard key={n.url} n={n} />)}<button type="button" className="dpx-st-card dpx-st-story dpx-st-more" onClick={() => onOpenAll()}><b>Lihat semua berita</b><span className="dpx-sub">Emas, ekonomi, saham, kripto</span></button></>
          : <div className="dpx-st-card dpx-st-story"><b>Belum ada berita</b><span className="dpx-sub">Belum ada kabar untuk topik ini hari ini.</span></div>}
      </DragRow>
      {list && feed === "untukmu" ? <button type="button" className="dpx-st-card dpx-st-more" onClick={() => onOpenAll()}><b>Lihat semua berita</b><span className="dpx-sub">Emas, ekonomi, saham, kripto</span></button> : null}
  </>;
}

/** The same section inside Notifikasi: its own headlines overlay, so it works from any page. */
export function CeritaTab({ ctx }: { ctx: FinCtx }) {
  const gold = useGold(), now = new Date(), [newsOpen, setNewsOpen] = useState(false);
  const stories = useStories(ctx.fin, ctx.fin.entries, gold, now);
  return <>
    <CeritaFeed stories={stories} onOpenAll={() => setNewsOpen(true)} list />
    {newsOpen ? <NewsPage onBack={() => setNewsOpen(false)} /> : null}
  </>;
}

/** Everything under the sky on Beranda. No card sits on the scene: the sky block above ends where this begins. */
export function CeritaBody({ ctx, entries, cash, gold, now, templates, onAddTemplate }: { ctx: FinCtx; entries: Entry[]; cash: number; gold: GoldData | null; now: Date; templates: Entry[]; onAddTemplate: (e: Entry) => void }) {
  const { nav, visible } = ctx, { state } = ctx.fin, inbound = useInbound();
  const y = now.getFullYear(), m = now.getMonth(), empty = entries.length === 0;
  const month = useMemo(() => ctx.fin.rolled.filter((e) => inMonth(e, y, m)), [ctx.fin.rolled]);
  const prev = useMemo(() => ctx.fin.rolled.filter((e) => inMonth(e, m === 0 ? y - 1 : y, (m + 11) % 12)), [ctx.fin.rolled]);
  const t = totals(month), statuses = useMemo(() => budgetStatuses(state.budgets, month), [state.budgets, month]);
  const safe = safeToSpend(state.budgets, month, now);
  const history = useMemo<WealthPoint[]>(() => wealthHistory(state, entries, cash, gold?.points ?? null, 12, now), [state, entries, cash, gold]);
  const cal = useMemo(() => spendCalendar(entries, now), [entries]);
  const pc = useMemo(() => pace(entries, now), [entries]);
  const st = useMemo(() => spendStats(entries, now), [entries]);
  const shares = useMemo(() => categoryShares(entries, now), [entries]);
  const flowGraph = useMemo(() => cashflowGraph(month, prev.filter((e) => new Date(e.at).getDate() <= now.getDate())), [month, prev]);
  const health = useMemo(() => healthScore({ entries, state, cash }), [entries, state, cash]);
  const fc = useMemo(() => forecast(cash, entries, state.bills, now), [cash, entries, state.bills]);
  const bills = useMemo(() => billsFor(state.bills, now).filter((v) => v.status !== "paid").slice(0, 2), [state.bills]);
  const goldAssets = state.assets.filter(isGoldAsset), goldValue = goldAssets.reduce((s, a) => s + assetValue(a), 0);
  const goldGain = goldAssets.reduce((s, a) => { const g = gainOf(a); return g ? { gain: s.gain + g.gain, cost: s.cost + (a.cost ?? 0) } : s; }, { gain: 0, cost: 0 });
  const goal = state.goals[0], goalPct = goal ? Math.min(100, Math.round((goalSaved(goal) / Math.max(1, goal.target)) * 100)) : 0;
  const stories = useStories(ctx.fin, entries, gold, now);
  const [newsOpen, setNewsOpen] = useState(false), [allOpen, setAllOpen] = useState(false);
  const nameOf = (id: string) => (id === "_rest" ? "Lainnya" : catOf(state, id).name);
  const fav = st.fav && st.fav.n >= 2 ? st.fav : null;

  return <div className="dpx-st-body">
    <DiscoveryChip ctx={ctx} />
    <ReviewChip count={inbound.data?.review ?? 0} importReady={inbound.data?.importReady ?? 0} onOpen={() => nav.go("/tinjau")} onOpenImport={() => nav.go("/integrasi?impor=1")} />
    <IntegrationNudge onOpenIntegrations={() => nav.go("/integrasi")} />
    <section className="dpx-st-card dpx-st-menu-card" aria-label="Menu">
      <div className="dpx-st-menu">{MENU.map((m) => <Btn key={m.label} type="button" className="dpx-st-mt" onClick={() => (m.all ? setAllOpen(true) : m.news ? setNewsOpen(true) : nav.go(m.path!))}>
        <span className="dpx-st-mi"><Ic n={m.icon} />{m.label === "Tinjau" && (inbound.data?.review ?? 0) > 0 ? <i className="dpx-st-mb">{inbound.data?.review}</i> : null}</span><span>{m.label}</span></Btn>)}</div>
    </section>

    <section className="dpx-st-card dpx-pay-strip" aria-label="Saldo Djiwa Pay">
      <div className="dpx-pay-bal">
        <div className="dpx-pay-lbl"><span>Saldo Djiwa Pay</span><Btn type="button" className="dpx-pay-eye" onClick={ctx.onToggleVisible} aria-label={visible ? "Sembunyikan saldo" : "Tampilkan saldo"}><Ic n={visible ? "eye" : "eyeoff"} size="sm" /></Btn></div>
        <div className="dpx-pay-amt">{mk(visible, rupiah(ctx.payBalance))}</div>
      </div>
      <div className="dpx-pay-acts">{([["topup", "Isi saldo", "/wallet/topup"], ["send", "Kirim", "/wallet/transfer"], ["scan-qr", "Scan", "/wallet/transfer?mode=scan"], ["bills", "Layanan", "/bayar"]] as const).map(([a, l, p]) => <Btn key={a} type="button" className="dpx-pay-act" onClick={() => nav.go(p)}><img src={payAsset(a)} width={34} height={34} alt="" /><span>{l}</span></Btn>)}</div>
    </section>


    {empty ? <Card><div className="dpx-st-welcome"><I3 name="customer-benefit-wallet" px={88} /><b>Mulai ceritamu</b><span className="dpx-sub">Catat transaksi pertama. Grafik, statistik, dan kalender belanja muncul di sini setelah ada datanya.</span><Btn type="button" className="dpx-btn" onClick={() => ctx.open({ k: "catat" })}>Catat sekarang</Btn></div></Card> : <>
      <Sec title="Catatan terbaru" action="Lihat semua" onAction={() => nav.go("/riwayat")} />
      <div className="dpx-group dpx-flush">{entries.slice(0, 4).map((e, i) => <EntryRow key={e.id} entry={e} state={state} i={i} onOpen={(id) => ctx.open({ k: "entry", id })} />)}</div>
      {templates.length ? <div className="dpx-st-card"><QuickAdd templates={templates} onAdd={onAddTemplate} /></div> : null}

      <Card title="Perjalanan kekayaan" right={<Btn type="button" className="dpx-st-link" onClick={() => nav.go("/kekayaan")}>Kekayaan</Btn>}>
        <WealthChart history={history} visible={visible} />
        <p className="dpx-st-foot">Dihitung ulang dari catatanmu dan harga emas. Mengisi saldo awal dompet membuat grafik lebih akurat.</p>
      </Card>

      <Sec title="Cerita & berita" action="Semua berita" onAction={() => setNewsOpen(true)} />
      <CeritaFeed stories={stories} onOpenAll={() => setNewsOpen(true)} />

      <Card title="Arus uang bulan ini" right={<Btn type="button" className="dpx-st-link" onClick={() => nav.go("/ringkasan")}>Laporan</Btn>}>
        <FlowCard graph={flowGraph} state={state} visible={visible} />
        <div className="dpx-st-legend"><span><i style={{ background: "#2e9e57" }} />Pemasukan</span><span><i style={{ background: "#d9483b" }} />Pengeluaran</span><span><i style={{ background: "#1f7a46" }} />Kas bersih</span></div>
      </Card>

      {shares.rows.length ? <Card title="Ke mana uangmu pergi" right={<span className="dpx-sub">{now.toLocaleDateString("id-ID", { month: "short" })}</span>}>
        <div className="dpx-st-donutw"><Donut rows={shares.rows} total={shares.total} visible={visible} />
          <div className="dpx-st-catl">{shares.rows.map((r, k) => <div key={r.id}><i style={{ background: CAT_COLORS[k % CAT_COLORS.length] }} />{nameOf(r.id)}<b>{Math.round(r.pct)}%</b><span className={r.change === null ? "dpx-sub" : r.change > 0 ? "dpx-dn" : "dpx-up"}>{r.change === null ? "" : r.change === 0 ? "▬" : `${r.change > 0 ? "▲" : "▼"} ${Math.abs(r.change)}%`}</span></div>)}</div></div>
      </Card> : null}

      <Card title="Kalender belanja" right={<span className="dpx-up" style={{ fontSize: 12.5 }}>{cal.calm} hari tenang</span>}>
        <HeatGrid cells={cal.cells} offset={cal.offset} today={now.getDate()} />
        <div className="dpx-st-legend"><span><i className="calm" />Tanpa belanja</span><span>Sedikit <i className="l1" /><i className="l2" /><i className="l3" /><i className="l4" /> Banyak</span></div>
      </Card>

      <Card title="Laju belanja" right={<span className="dpx-sub">kumulatif per hari</span>}>
        <PaceChart cur={pc.cur} prev={pc.prev} projected={pc.projected} dim={pc.dim} />
        <div className="dpx-st-legend"><span><i style={{ background: "#c9461b" }} />Bulan ini</span><span><i style={{ background: "#c9b99c" }} />Bulan lalu</span><span>┄ Perkiraan</span></div>
        <div className="dpx-st-tip"><span className="dpx-cat dpx-c-blue"><Ic n="trend" /></span><div><b>Perkiraan akhir bulan {mk(visible, rupiah(pc.projected))}</b>
          <span className="dpx-sub">{pc.diff === null ? "Belum ada data bulan lalu untuk dibandingkan." : pc.diff <= 0 ? `Lebih hemat ${mk(visible, rupiah(-pc.diff))} dari bulan lalu, jika lajunya tetap.` : `Lebih boros ${mk(visible, rupiah(pc.diff))} dari bulan lalu, jika lajunya tetap.`}{safe ? ` Aman dibelanjakan hari ini ${mk(visible, rupiah(Math.max(0, safe.perDay)))}.` : ""}</span></div></div>
        {fc.runsOutDay !== null ? <Btn type="button" className="dpx-st-tip dpx-st-warn" onClick={() => nav.go("/prakiraan")}><span className="dpx-cat dpx-c-amber"><Ic n="warn" /></span><div><b>Kas diperkirakan habis tanggal {fc.runsOutDay}</b><span className="dpx-sub">Ketuk untuk melihat prakiraan dan tagihan yang akan datang.</span></div></Btn> : null}
      </Card>

      <Sec title="Statistik bulan ini" />
      <div className="dpx-st-stats">
        <div><span className="dpx-st-up">Rata-rata harian</span><b>{mk(visible, rupiah(Math.round(st.perDay)))}</b>{st.perDayChange !== null ? <span className={st.perDayChange <= 0 ? "dpx-up" : "dpx-dn"}>{st.perDayChange <= 0 ? "▼" : "▲"} {pctText(st.perDayChange)} dari bulan lalu</span> : <span className="dpx-sub">per hari</span>}</div>
        <div><span className="dpx-st-up">Hari terboros</span><b>{st.costly ? st.costly.day.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" }) : "-"}</b><span className="dpx-sub">{st.costly ? mk(visible, rupiah(st.costly.amount)) : "Belum ada"}</span></div>
        <div><span className="dpx-st-up">Transaksi keluar</span><b>{st.count}</b><span className="dpx-sub">{st.perDayCount.toLocaleString("id-ID", { maximumFractionDigits: 1 })} per hari</span></div>
        <div><span className="dpx-st-up">Tempat favorit</span><b className="dpx-st-ell">{fav ? fav.name : "-"}</b><span className="dpx-sub">{fav ? `${fav.n} kali · ${mk(visible, rupiah(Math.round(fav.sum)))}` : "Muncul setelah ada yang berulang"}</span></div>
      </div>

      <Card title="Kesehatan keuangan" right={<Btn type="button" className="dpx-st-link" onClick={() => nav.go("/kesehatan")}>Detail</Btn>}>
        <div className="dpx-st-health"><div className={`dpx-st-score ${health.tone}`}><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="rgba(45,36,29,.08)" strokeWidth="12" /><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" strokeDasharray="264" strokeDashoffset={264 * (1 - health.score / 100)} /></svg><b>{health.score}</b></div>
          <div><b style={{ fontSize: 15 }}>{health.label}</b><span className="dpx-sub" style={{ display: "block" }}>Langkah tercepat: {[...health.pillars].sort((a, b) => a.score - b.score)[0].action.toLowerCase()}.</span></div></div>
        <div className="dpx-st-fact">{health.pillars.map((p) => <div key={p.id}><span>{p.name}</span><div className="dpx-bar"><i className={p.score >= 70 ? "dpx-ok" : p.score < 40 ? "dpx-over" : ""} style={{ width: `${p.score}%` }} /></div><b>{p.score}</b></div>)}</div>
      </Card>

      {statuses.length || goal ? <><Sec title="Anggaran & target" action="Rencana" onAction={() => nav.go("/rencana")} />
        <section className="dpx-st-card dpx-st-group">
          {statuses.slice(0, 2).map((s) => { const c = catOf(state, s.budget.categoryId); return <Btn key={s.budget.categoryId} type="button" className="dpx-st-bud" onClick={() => ctx.open({ k: "budget", cid: s.budget.categoryId })}><div className="dpx-st-bud-t"><CatIcon cat={c} /><b>{c.name}</b><span className={s.level === "over" ? "dpx-dn" : "dpx-sub"}>{Math.round(s.percent)}%</span></div><div className="dpx-bar"><i className={s.level === "over" ? "dpx-over" : s.level === "warn" ? "dpx-warn" : ""} style={{ width: `${Math.min(100, s.percent)}%` }} /></div><span className="dpx-sub">{s.level === "over" ? `Lewat ${mk(visible, rupiah(-s.remaining))}` : `Sisa ${mk(visible, rupiah(s.remaining))}`} dari {mk(visible, rupiah(s.budget.limit))}</span></Btn>; })}
          {goal ? <Btn type="button" className="dpx-st-goal" onClick={() => ctx.open({ k: "goal-detail", id: goal.id })}><span className="dpx-cat dpx-c-emerald"><Ic n="target" /></span><div><b>{goal.name}</b><span className="dpx-sub">{mk(visible, `${rupiah(goalSaved(goal))} dari ${rupiah(goal.target)}`)}{(() => { const p = goalProjection(goal, now); return p.eta ? ` · selesai ${p.eta.toLocaleDateString("id-ID", { month: "short", year: "numeric" })}` : ""; })()}</span></div><b>{goalPct}%</b></Btn> : null}
          {!statuses.length ? <Btn type="button" className="dpx-st-bud" onClick={() => ctx.open({ k: "budget" })}><b>Belum ada anggaran</b><span className="dpx-sub">Atur anggaran supaya jatah harianmu bisa dihitung.</span></Btn> : null}
        </section></> : null}

      {goldAssets.length ? <Card title="Aset emas" right={goldGain.cost > 0 ? <span className={goldGain.gain >= 0 ? "dpx-up" : "dpx-dn"}>{goldGain.gain >= 0 ? "▲ +" : "▼ −"}{Math.abs((goldGain.gain / goldGain.cost) * 100).toFixed(1).replace(".", ",")}% sejak beli</span> : undefined}>
        <div className="dpx-st-read"><b>{mk(visible, rupiah(goldValue))}</b><span className="dpx-sub">{goldAssets.length} aset{gold?.points.length ? ` · Rp ${Math.round(gold.points[gold.points.length - 1][1]).toLocaleString("id-ID")}/gram` : ""}</span></div>
        {gold?.points.length ? <GoldSpark points={gold.points} /> : null}
        <Btn type="button" className="dpx-st-link" onClick={() => nav.go("/kekayaan")}>Lihat pemantauan aset</Btn>
      </Card> : null}

      {bills.length ? <><Sec title="Tagihan terdekat" action="Kalender" onAction={() => nav.go("/kalender")} /><section className="dpx-st-card dpx-st-group">{bills.map((v) => <div key={v.bill.id} className="dpx-st-line"><span className="dpx-cat dpx-c-amber"><Ic n="flash" /></span><div><b>{v.bill.name}</b><span className="dpx-sub">{v.due.toLocaleDateString("id-ID", { day: "numeric", month: "short" })} · {v.status === "late" ? "terlambat" : v.daysLeft === 0 ? "hari ini" : `${v.daysLeft} hari lagi`}</span></div><b>{mk(visible, rupiah(v.bill.amount))}</b></div>)}</section></> : null}

    </>}


    {newsOpen ? <NewsPage onBack={() => setNewsOpen(false)} /> : null}
    {allOpen ? <AllMenuPage onBack={() => setAllOpen(false)} run={(i) => { setAllOpen(false); if (i.act === "news") setNewsOpen(true); else if (i.act === "notif") ctx.onOpenNotifications(); else if (i.act === "catat") ctx.open({ k: "asset-new" }); else if (i.path) nav.go(i.path); }} /> : null}
  </div>;
}

export type { Story };
