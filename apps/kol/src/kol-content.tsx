import { rupiah } from "./kol-rewards";
import { useEffect, useMemo, useState } from "react";
import { errorText, kolApi } from "./kol-lib";
import { CampaignProofs, type Campaign } from "./kol-campaigns";
import { KxSheet } from "./kol-sheet";

type Proof = {
  id: number; campaign_assignment_id: number; deliverable_type: string; content_url: string; status: string;
  reward_amount?: number | string | null; reward_status?: string | null; wallet_ledger_key?: string | null; paid_at?: string | null;
  review_note?: string | null; campaign_title?: string; created_at: string; reviewed_at?: string | null;
};

const proofStatus = (proof: Proof) => proof.reward_status ?? proof.status;

const STATUS: Record<string, [string, string]> = {
  submitted: ["Dalam review", "kx-pill--warn"], needs_revision: ["Perlu revisi", "kx-pill--warn"],
  approved: ["Disetujui", "kx-pill--ok"], rejected: ["Ditolak", ""], paid: ["Dibayar", "kx-pill--ok"], expired: ["Kedaluwarsa", ""],
};
const TABS: Array<[string, string]> = [["all", "Semua"], ["submitted", "Review"], ["needs_revision", "Revisi"], ["approved", "Disetujui"], ["paid", "Dibayar"], ["rejected", "Ditolak"]];
const when = (v?: string | null) => (v ? new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }) : "");

/** Daftar semua konten yang pernah dikirim creator beserta status review tim. */
export function ContentTab({ campaigns, refresh }: { campaigns: Campaign[]; refresh: () => Promise<void> }) {
  const [proofs, setProofs] = useState<Proof[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [sheet, setSheet] = useState(false);
  const load = () => kolApi<Proof[]>("/portal/proofs").then(setProofs).catch((e) => setError(errorText(e, "Konten belum bisa dimuat.")));
  useEffect(() => { void load(); }, []);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: proofs?.length ?? 0 };
    for (const p of proofs ?? []) m[proofStatus(p)] = (m[proofStatus(p)] ?? 0) + 1;
    return m;
  }, [proofs]);
  const list = (proofs ?? []).filter((p) => tab === "all" || proofStatus(p) === tab);
  const sendable = campaigns.filter((c) => c.assignment_id && ["accepted", "active"].includes(c.assignment_status || ""));
  if (error) return <p role="alert" className="kx-note kx-note--err">{error}</p>;
  if (!proofs) return <p className="kx-sub" role="status">Memuat konten…</p>;
  return (
    <div>
      <div className="kx-hs" role="group" aria-label="Filter status konten">
        {TABS.map(([k, l]) => <button type="button" key={k} className="kx-chip" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}{counts[k] ? ` · ${counts[k]}` : ""}</button>)}
      </div>
      {list.length === 0 && (
        <div className="kx-card" style={{ textAlign: "center" }}>
          <b>{proofs.length ? "Tidak ada konten di status ini" : "Belum ada konten"}</b>
          <p className="kx-sub" style={{ margin: "4px 0 0" }}>{proofs.length ? "Pilih filter lain." : "Ikuti kampanye, lalu kirim link kontenmu di sini."}</p>
        </div>
      )}
      {list.map((p) => {
        const [label, tone] = STATUS[proofStatus(p)] || [proofStatus(p), ""];
        return (
          <article key={p.id} className="kx-card" style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <b>{p.deliverable_type}</b><span className={`kx-pill ${tone}`}>{label}</span>
            </div>
            <p className="kx-sub" style={{ margin: "4px 0 0" }}>{p.campaign_title} · dikirim {when(p.created_at)}</p>
            <a className="kx-link" style={{ display: "block", marginTop: 8, overflowWrap: "anywhere" }} href={p.content_url} target="_blank" rel="noreferrer">{p.content_url}</a>
            {p.reward_amount != null && <p className="kx-sub">Reward <b>{rupiah(Number(p.reward_amount))}</b>
              {p.paid_at && <> · Djiwa Pay {when(p.paid_at)}</>}</p>}
            {p.wallet_ledger_key && <p className="kx-sub">Referensi {p.wallet_ledger_key}</p>}
            {p.review_note && <p className="kx-note" style={{ marginTop: 8 }}>Catatan tim: {p.review_note}</p>}
            {p.status === "needs_revision" && <p className="kx-sub" style={{ margin: "8px 0 0" }}>Kirim revisi lewat tombol Kirim konten, pilih kampanyenya.</p>}
          </article>
        );
      })}
      <button type="button" className="kx-btn" style={{ marginTop: 14 }} onClick={() => setSheet(true)}>Kirim konten</button>
      {sheet && <SendSheet campaigns={sendable} onClose={() => setSheet(false)} onChanged={async () => { await load(); await refresh(); }} />}
    </div>
  );
}

function SendSheet({ campaigns, onClose, onChanged }: { campaigns: Campaign[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [id, setId] = useState<number | null>(campaigns.length === 1 ? campaigns[0]!.id : null);
  const picked = campaigns.find((c) => c.id === id);
  return (
    <KxSheet title="Kirim konten" onClose={onClose}>
      {campaigns.length === 0 ? (
        <p className="kx-sub">Belum ada kampanye yang diikuti dan disetujui. <a className="kx-link" href="/campaigns">Lihat kampanye</a></p>
      ) : (
        <>
          <label className="kx-label" htmlFor="kc-pick" style={{ marginTop: 0 }}>Kampanye</label>
          <select id="kc-pick" className="kx-input" value={id ?? ""} onChange={(e) => setId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Pilih kampanye</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          {picked && <CampaignProofs key={picked.id} campaign={picked} onChanged={onChanged} />}
        </>
      )}
    </KxSheet>
  );
}
