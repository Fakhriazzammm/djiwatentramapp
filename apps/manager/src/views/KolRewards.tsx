import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { Empty, Kpis, Panel } from "../ui";

/** Ringkasan reward KOL untuk Manager: baca saja. Pengisian anggaran dan pembayaran dilakukan di Admin. */
type Campaign = { id: number; title: string; status: string; rewardsEnabled: boolean; ratePer1000: number | null; maxPerKol: number | null; funded: number; available: number; reserved: number; paid: number; slotsLeft: number | null; slotsTotal: number | null };
type Review = { id: number; kolName: string; campaignTitle: string; state: string; dueAt: string | null; estimate: number | null };
type Data = { campaigns: Campaign[]; reviews: Review[]; totals: { funded: number; available: number; reserved: number; paid: number; refunded: number }; dueCount: number; waitingCount: number; estimatedNeed: number; alerts: Array<{ kind: string; title: string; body: string }> };

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

export function KolRewardsView() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setError(""); setData((await api<{ data: Data }>("/api/manager/kol-rewards")).data); }
    catch (e) { setError(e instanceof ApiError ? e.code : "Data reward belum bisa dimuat."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (error) return <Panel title="Reward KOL" action={<button className="btn s" onClick={() => void load()}>Coba lagi</button>}><div className="pad" style={{ fontSize: 12.5 }}>{error}</div></Panel>;
  if (!data) return <div className="empty">MEMUAT REWARD KOL…</div>;
  const active = data.campaigns.filter((c) => c.rewardsEnabled);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Panel title="Reward KOL" meta="Baca saja · isi anggaran dan bayar di Admin">
        <Kpis items={[{ v: rp(data.totals.funded), l: "Anggaran terisi" }, { v: rp(data.totals.paid), l: "Terbayar ke KOL" }, { v: rp(data.totals.reserved), l: "Dicadangkan" }, { v: rp(data.totals.available), l: "Tersedia" }]} />
      </Panel>
      <Panel title="Per kampanye" meta={`${active.length} aktif`}>
        {active.length === 0 ? <Empty>Belum ada kampanye dengan reward.</Empty> : active.map((c) => (
          <div key={c.id} className="pad" style={{ borderTop: "1px solid var(--line, #e4e4e8)", fontSize: 12.5, display: "grid", gap: 4 }}>
            <b>{c.title}</b>
            <span>Tarif {rp(c.ratePer1000 ?? 0)} / 1.000 view · maks {rp(c.maxPerKol ?? 0)} per KOL · slot {c.slotsLeft ?? 0} dari {c.slotsTotal ?? 0}</span>
            <span>Diisi {rp(c.funded)} · terbayar {rp(c.paid)} · dicadangkan {rp(c.reserved)} · tersedia {rp(c.available)}</span>
          </div>
        ))}
      </Panel>
      <Panel title="Perlu perhatian" meta={`${data.alerts.length} item`}>
        {data.alerts.length === 0 ? <Empty>Tidak ada yang perlu ditindak.</Empty> : data.alerts.map((a, i) => (
          <div key={i} className="pad" style={{ borderTop: "1px solid var(--line, #e4e4e8)", fontSize: 12.5 }}><b>{a.title}</b><div>{a.body}</div></div>
        ))}
        <div className="pad" style={{ fontSize: 12.5 }}>{data.dueCount} konten jatuh tempo · {data.waitingCount} menunggu H+N · estimasi kebutuhan {rp(data.estimatedNeed)}</div>
      </Panel>
    </div>
  );
}
