import { useEffect, useState } from "react";
import { errorText, kolApi, longDate } from "./kol-lib";
import { KxSheet } from "./kol-sheet";

/** Reward KOL: anggaran Bisnis dibayar ke saldo Djiwa Pay setelah view terverifikasi pada H+N. */
export type RewardInfo = {
  ratePer1000: number; minViews: number; maxPerContent: number | null; maxPerKol: number; settleDays: number; platforms: string[];
  slotsTotal: number; slotsLeft: number;
};
type Rules = Omit<RewardInfo, "slotsTotal" | "slotsLeft">;
type RewardItem = {
  id: number; campaignTitle: string; campaignSlug: string; platform: string; contentUrl: string; contentStatus: string;
  videoId: string | null; postedAt: string | null; dueAt: string | null; daysLeft: number | null; createdAt: string;
  state: "paid" | "needs_date" | "waiting" | "due" | "ready"; views: number | null; estimate: number | null; computed: number | null; capped: boolean;
  rules: Rules; reserved: number;
  payout: { id: number; amount: number; views: number; computed: number; released: number; rate: number; paidAt: string } | null;
};
type Earnings = { totalPaid: number; runningEstimate: number; maxRemaining: number; walletBalance: number; items: RewardItem[] };

export const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const PAY_URL = "https://pay.djiwatentram.web.id";
const dayLabel = (v?: string | null) => (v ? new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }) : "–");
const STATE: Record<RewardItem["state"], [string, string]> = {
  waiting: ["Menunggu H+", "kx-pill--warn"], needs_date: ["Menunggu tanggal tayang", "kx-pill--warn"],
  due: ["Sedang diverifikasi", "kx-pill--info"], ready: ["Sedang diverifikasi", "kx-pill--info"], paid: ["Dibayar", "kx-pill--ok"],
};
const stateLabel = (i: RewardItem) => (i.state === "waiting" ? `Menunggu H+${i.rules.settleDays}` : STATE[i.state][0]);

/** Kartu reward di halaman kampanye: tarif, batas, hari bayar, dan sisa slot. */
export function RewardBox({ reward }: { reward: RewardInfo }) {
  const share = reward.slotsTotal > 0 ? Math.max(0, Math.min(100, (reward.slotsLeft / reward.slotsTotal) * 100)) : 0;
  const full = reward.slotsLeft <= 0;
  return (
    <section className="kx-reward" aria-label="Reward kampanye">
      <p className="kx-sub" style={{ margin: 0, fontWeight: 700 }}>REWARD UNTUK ANDA</p>
      <div className="kx-reward-rate">{rupiah(reward.ratePer1000)}<span style={{ fontSize: 14, fontWeight: 600, color: "var(--kx-muted)" }}> / 1.000 view</span></div>
      <p className="kx-sub" style={{ margin: "4px 0 0" }}>Tiap view dihitung · {rupiah(reward.ratePer1000 / 1000)} per view</p>
      <div className="kx-reward-grid">
        <div><span>Maksimal</span><b>{rupiah(reward.maxPerKol)}</b></div>
        <div><span>Minimal view</span><b>{reward.minViews.toLocaleString("id-ID")}</b></div>
        <div><span>Dibayar</span><b>H+{reward.settleDays}</b></div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 14, fontSize: 13 }}><b>Kuota</b><b style={{ color: full ? "#b42318" : undefined }}>{full ? "Penuh" : `${reward.slotsLeft} dari ${reward.slotsTotal} slot`}</b></div>
      <div style={{ height: 8, borderRadius: 99, background: "#ffffff99", marginTop: 8 }}><div style={{ width: `${share}%`, height: "100%", borderRadius: 99, background: full ? "#b42318" : "#13804a" }} /></div>
      <p className="kx-sub" style={{ margin: "10px 0 0" }}>Dibayar sekali setelah video tayang H+{reward.settleDays}, langsung ke saldo Djiwa Pay. Kuota dibatasi anggaran Bisnis, jadi reward Anda terjamin.</p>
    </section>
  );
}

/** Pemeriksaan otomatis setelah link terkirim (dibaca dari ID video, bukan dari isi video). */
export function ProofChecks({ proof }: { proof: { video_id?: string | null; posted_at?: string | null; settle_due_at?: string | null } }) {
  if (!proof.video_id && !proof.settle_due_at && !proof.posted_at) return null;
  return (
    <div className="kx-card" style={{ marginTop: 10 }}>
      <b style={{ fontSize: 12, letterSpacing: ".04em" }} className="kx-sub">PEMERIKSAAN OTOMATIS</b>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 14, lineHeight: 1.5 }}>
        {proof.video_id ? <li>Link valid, ID video terbaca.</li> : <li>Link pendek: tanggal tayang akan diisi admin.</li>}
        {proof.settle_due_at && <li>Tayang <b>{dayLabel(proof.posted_at)}</b>, jadi reward dibayar <b>{dayLabel(proof.settle_due_at)}</b>.</li>}
        <li>Video belum pernah dipakai di kampanye lain.</li>
      </ul>
      <p className="kx-sub" style={{ margin: "8px 0 0" }}>View dicek pada hari pembayaran. Pastikan video tetap publik, bertag @djiwatentram, dan tidak dihapus.</p>
    </div>
  );
}

export function RewardsTab() {
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<RewardItem | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    kolApi<Earnings>("/portal/rewards", { signal: controller.signal }).then(setData).catch((e) => { if (!controller.signal.aborted) setError(errorText(e, "Penghasilan belum bisa dimuat.")); });
    return () => controller.abort();
  }, []);
  if (error) return <p role="alert" className="kx-note kx-note--err">{error}</p>;
  if (!data) return <p className="kx-sub" role="status">Memuat penghasilan…</p>;
  return (
    <div>
      <div className="kx-card" style={{ background: "linear-gradient(160deg,#0f2347,#1a5dc6)", color: "#fff" }}>
        <div style={{ fontSize: 13, opacity: 0.85 }}>Total reward diterima</div>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-.02em" }}>{rupiah(data.totalPaid)}</div>
        <div className="kx-row2" style={{ marginTop: 12 }}>
          <div style={{ background: "rgba(255,255,255,.14)", borderRadius: 14, padding: "10px 12px" }}><div style={{ fontSize: 12, opacity: 0.85 }}>Estimasi berjalan</div><b>{rupiah(data.runningEstimate)}</b></div>
          <div style={{ background: "rgba(255,255,255,.14)", borderRadius: 14, padding: "10px 12px" }}><div style={{ fontSize: 12, opacity: 0.85 }}>Maksimal tersisa</div><b>{rupiah(data.maxRemaining)}</b></div>
        </div>
      </div>
      <a className="kx-btn kx-btn--ghost" style={{ marginTop: 10 }} href={PAY_URL} target="_blank" rel="noreferrer">Saldo Djiwa Pay {rupiah(data.walletBalance)} · buka</a>
      <h3 className="kx-section">Konten Anda</h3>
      {data.items.length === 0 && <div className="kx-card" style={{ textAlign: "center" }}><b>Belum ada konten</b><p className="kx-sub" style={{ margin: "4px 0 0" }}>Daftar ke kampanye bereward, lalu kirim link kontenmu dari halaman kampanye.</p><a className="kx-link" href="/campaigns">Lihat kampanye</a></div>}
      {data.items.map((item) => {
        const left = item.daysLeft ?? 0, total = item.rules.settleDays;
        const progress = item.state === "paid" ? 100 : item.dueAt ? Math.max(4, Math.min(100, ((total - Math.max(0, left)) / total) * 100)) : 4;
        return (
          <button type="button" key={item.id} className="kx-card" style={{ display: "block", width: "100%", textAlign: "left", marginTop: 10, cursor: "pointer" }} onClick={() => setOpen(item)}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <b>{item.campaignTitle}</b><span className={`kx-pill ${STATE[item.state][1]}`}>{stateLabel(item)}</span>
            </div>
            <p className="kx-sub" style={{ margin: "4px 0 0" }}>{item.platform} · tayang {dayLabel(item.postedAt)}</p>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
              <div><div className="kx-sub">{item.payout ? "View final" : "View terbaru"}</div><b style={{ fontSize: 20 }}>{item.views === null ? "–" : item.views.toLocaleString("id-ID")}</b></div>
              <div style={{ textAlign: "right" }}><div className="kx-sub">{item.payout ? "Dibayar" : "Estimasi"}</div><b style={{ fontSize: 20, color: "#13804a" }}>{item.payout ? rupiah(item.payout.amount) : item.estimate === null ? "–" : rupiah(item.estimate)}</b></div>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: "#e6efff", marginTop: 12 }}><div style={{ width: `${progress}%`, height: "100%", borderRadius: 99, background: "#1a5dc6" }} /></div>
            <p className="kx-sub" style={{ margin: "6px 0 0" }}>{item.payout ? `Dibayar ${dayLabel(item.payout.paidAt)}` : item.dueAt ? `H+${Math.min(total, Math.max(0, total - left))} dari ${total} · dibayar ${dayLabel(item.dueAt)}` : "Menunggu admin mengisi tanggal tayang"}</p>
          </button>
        );
      })}
      {open && <RewardDetail item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function RewardDetail({ item, onClose }: { item: RewardItem; onClose: () => void }) {
  const rate = item.payout?.rate ?? item.rules.ratePer1000;
  const left = Math.max(0, item.daysLeft ?? 0);
  const rows: Array<[string, string, boolean]> = [
    ["Link diterima", dayLabel(item.createdAt), true],
    ["Link terbaca", item.videoId ? `ID video terbaca, tayang ${dayLabel(item.postedAt)}` : "Tanggal tayang diisi admin", Boolean(item.dueAt)],
    [`Verifikasi view H+${item.rules.settleDays}`, item.dueAt ? dayLabel(item.dueAt) : "Menunggu tanggal tayang", item.state === "paid"],
    ["Reward masuk saldo Djiwa Pay", item.payout ? dayLabel(item.payout.paidAt) : "Setelah verifikasi", item.state === "paid"],
  ];
  return (
    <KxSheet title={item.payout ? "Reward dibayar" : "Detail konten"} onClose={onClose}>
      {item.payout ? (
        <div style={{ textAlign: "center", padding: "6px 0 12px" }}>
          <p className="kx-sub" style={{ margin: 0 }}>{item.campaignTitle}</p>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-.03em", color: "#13804a" }}>+{rupiah(item.payout.amount)}</div>
          <p className="kx-sub" style={{ margin: 0 }}>{dayLabel(item.payout.paidAt)} · masuk ke saldo Djiwa Pay</p>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "6px 0 12px" }}>
          <p className="kx-sub" style={{ margin: 0 }}>Hitung mundur pembayaran</p>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-.03em" }}>{item.dueAt ? (left > 0 ? `${left} hari` : "Hari ini") : "–"}</div>
          <p className="kx-sub" style={{ margin: 0 }}>{item.dueAt ? `Dibayar ${dayLabel(item.dueAt)} jika view terverifikasi` : "Menunggu tanggal tayang"}</p>
        </div>
      )}
      <div className="kx-group">
        <div className="kx-kv"><span>{item.payout ? "View terverifikasi" : "View terbaru"}</span><b>{(item.payout?.views ?? item.views)?.toLocaleString("id-ID") ?? "–"}</b></div>
        <div className="kx-kv"><span>Tarif per view</span><b>{rupiah(rate / 1000)}</b></div>
        {item.payout && <div className="kx-kv"><span>Hitungan</span><b>{item.payout.views.toLocaleString("id-ID")} × {rupiah(rate / 1000)}</b></div>}
        <div className="kx-kv"><span>Batas maksimal</span><b>{rupiah(Math.min(item.rules.maxPerKol, item.rules.maxPerContent ?? item.rules.maxPerKol))}</b></div>
        <div className="kx-kv"><span>{item.payout ? "Total reward" : "Estimasi sementara"}</span><b style={{ color: "#13804a" }}>{item.payout ? rupiah(item.payout.amount) : item.estimate === null ? "–" : rupiah(item.estimate)}</b></div>
      </div>
      {!item.payout && <p className="kx-sub">Angka final ditentukan dari view terverifikasi pada H+{item.rules.settleDays}. Estimasi bisa naik atau turun.</p>}
      <h3 className="kx-section">Status</h3>
      <div className="kx-group">
        {rows.map(([title, sub, done], index) => (
          <div key={title} className="kx-grow" style={{ alignItems: "flex-start" }}>
            <span aria-hidden style={{ width: 24, height: 24, borderRadius: 99, background: done ? "#e5f5ec" : "#f1f3f8", color: done ? "#13804a" : "#6b7080", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flex: "none" }}>{done ? "✓" : index + 1}</span>
            <span className="kx-main"><b>{title}</b><small>{sub}</small></span>
          </div>
        ))}
      </div>
      <a className="kx-link" style={{ display: "block", marginTop: 12, overflowWrap: "anywhere" }} href={item.contentUrl} target="_blank" rel="noreferrer">Buka konten · {longDate(item.createdAt.slice(0, 10))}</a>
      {item.payout && <a className="kx-btn" style={{ marginTop: 12 }} href={PAY_URL} target="_blank" rel="noreferrer">Lihat saldo di Djiwa Pay</a>}
    </KxSheet>
  );
}
