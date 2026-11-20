import { useMemo, useState } from "react";
import { VISIT_TIMES, colorFor, dayKey, dotTime, longDate, parseDay, shortDate, tomorrowKey, type VisitRow } from "./kol-lib";

/** Aturan: 1 tanggal = 1 KOL, jam berapa pun. Tanggal yang sudah dipegang tidak bisa dipilih tetapi bisa dilihat. */
type Props = {
  rows: VisitRow[];
  date: string | null;
  time: string | null;
  startDate?: string | null;
  endDate?: string | null;
  onChange: (next: { date: string | null; time: string | null }) => void;
};

const statusLabel = (s: string) => (s === "requested" ? "Menunggu" : s === "confirmed" ? "Terkonfirmasi" : "Selesai");
const statusClass = (s: string) => (s === "requested" ? "kx-pill--warn" : "kx-pill--ok");
const DOW = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export function VisitPicker({ rows, date, time, onChange, startDate, endDate }: Props) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const minKey = startDate && startDate > tomorrowKey() ? startDate : tomorrowKey();
  const [cursor, setCursor] = useState(() => parseDay(minKey.slice(0, 7) + "-01"));
  const [peek, setPeek] = useState<string | null>(null);
  const byDate = useMemo(() => new Map(rows.map(r => [r.booking_date, r])), [rows]);

  const y = cursor.getFullYear(), m = cursor.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)] as Array<number | null>;
  const atMinMonth = dayKey(y, m, 1).slice(0, 7) <= minKey.slice(0, 7);
  const atMaxMonth = Boolean(endDate && dayKey(y, m, 1).slice(0, 7) >= endDate.slice(0, 7));

  const nextFree = () => {
    for (let i = 1; i < 120; i++) { const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i); const k = dayKey(d.getFullYear(), d.getMonth(), d.getDate()); if (k >= minKey && (!endDate || k <= endDate) && !byDate.has(k)) return k; }
    return null;
  };
  const pick = (key: string) => {
    if (byDate.has(key)) { setPeek(key); onChange({ date: null, time: null }); return; }
    setPeek(null); onChange({ date: key, time: null });
  };
  const monthPrefix = `${y}-${String(m + 1).padStart(2, "0")}-`;
  const monthRows = rows.filter(r => r.booking_date.startsWith(monthPrefix) && r.booking_date >= minKey).sort((a, b) => a.booking_date.localeCompare(b.booking_date));
  const held = peek ? byDate.get(peek) : null;
  const free = nextFree();

  return (
    <div>
      <div className="kx-cal">
        <div className="kx-calh">
          <button type="button" aria-label="Bulan sebelumnya" disabled={atMinMonth} onClick={() => setCursor(new Date(y, m - 1, 1))}>‹</button>
          <b>{cursor.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</b>
          <button type="button" aria-label="Bulan berikutnya" disabled={atMaxMonth} onClick={() => setCursor(new Date(y, m + 1, 1))}>›</button>
        </div>
        <div className="kx-g7">
          {DOW.map(d => <div className="kx-dow" key={d}>{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const key = dayKey(y, m, d);
            const past = key < minKey || Boolean(endDate && key > endDate);
            const row = byDate.get(key);
            const cls = past ? "past" : row ? (row.own ? "full own" : "full") : "free";
            const sel = date === key ? " sel" : "";
            const isToday = parseDay(key).getTime() === today.getTime() ? " today" : "";
            const pk = peek === key ? " peek" : "";
            return (
              <button key={key} type="button" className={`kx-day ${cls}${sel}${isToday}${pk}`} disabled={past} aria-pressed={date === key}
                aria-label={`${longDate(key)}${row ? (row.own ? ", jadwalmu" : ", sudah dipegang " + (row.creator_name || "KOL lain")) : past ? ", tidak tersedia" : ", tersedia"}`}
                onClick={() => pick(key)}>
                {d}
                {row && !past && <span className="kx-dot" style={{ background: colorFor(row.creator_name || "x") }} />}
              </button>
            );
          })}
        </div>
        <div className="kx-legend">
          <span><i style={{ background: "#f4f8ff", border: "1px solid #cfe0fb" }} />Tersedia</span>
          <span><i style={{ background: "var(--kx-blue)" }} />Pilihanmu</span>
          <span><i style={{ background: "#e3e5ea" }} />Sudah dibooking KOL lain (ketuk untuk lihat)</span>
        </div>
      </div>

      <div style={{ marginTop: 14 }} aria-live="polite">
        {held ? (
          <div className="kx-card kx-held">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <b style={{ fontSize: 14 }}>Tanggal ini sudah dipegang</b><span className="kx-pill kx-pill--warn">1 hari = 1 KOL</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
              <div className="kx-av" style={{ background: colorFor(held.creator_name || "x") }}>{(held.creator_name || "K")[0]}</div>
              <div className="kx-main"><b>{held.own ? "Jadwalmu" : held.creator_name || "KOL lain"}</b><small>{[held.category, held.platform].filter(Boolean).join(" · ")}</small></div>
              <div style={{ textAlign: "right" }}><b style={{ display: "block" }}>{dotTime(held.booking_time)}</b><span className={`kx-pill ${statusClass(held.status)}`}>{statusLabel(held.status)}</span></div>
            </div>
            <p>{longDate(peek!)}. Satu tanggal hanya untuk satu KOL, jadi jam berapa pun tidak bisa dibagi.</p>
            {free && <button type="button" className="kx-btn kx-btn--sm" style={{ marginTop: 10 }} onClick={() => { setPeek(null); const d = parseDay(free); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); onChange({ date: free, time: null }); }}>Pilih tanggal kosong terdekat · {shortDate(free)}</button>}
          </div>
        ) : date ? (
          <div className="kx-card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className="kx-ico" aria-hidden>✓</span>
            <div className="kx-main"><b>{parseDay(date).toLocaleDateString("id-ID", { day: "numeric", month: "long" })} masih kosong</b><small>Tidak ada KOL lain di tanggal ini. Pilih jam datangmu.</small></div>
          </div>
        ) : null}
      </div>

      {date && (
        <>
          <div className="kx-section">Jam kedatangan · 11.00–17.00, bebas pilih</div>
          <div className="kx-times" role="group" aria-label="Jam kedatangan">
            {VISIT_TIMES.map(t => <button key={t} type="button" className="kx-time" aria-pressed={time === t} onClick={() => onChange({ date, time: t })}>{dotTime(t)}</button>)}
          </div>
        </>
      )}
      {date && time && (
        <div className="kx-sum">
          <span style={{ fontSize: 24 }} aria-hidden>📍</span>
          <div><b>{longDate(date)}</b><small>Pukul {dotTime(time)} WIB · Visit review &amp; konten di Djiwa Tentram</small></div>
        </div>
      )}

      <div className="kx-section">Jadwal KOL lain bulan ini</div>
      {monthRows.length ? (
        <div className="kx-group">
          {monthRows.map(r => (
            <button type="button" key={r.booking_date} className="kx-grow" onClick={() => pick(r.booking_date)}>
              <div className="kx-dtag"><b>{r.booking_date.slice(8)}</b><small>{parseDay(r.booking_date).toLocaleDateString("id-ID", { weekday: "short" })}</small></div>
              <div className="kx-main"><b>{r.own ? "Jadwalmu" : r.creator_name || "KOL"}</b><small>{[r.category, r.platform].filter(Boolean).join(" · ")}</small></div>
              <div style={{ textAlign: "right" }}><b style={{ display: "block", fontSize: 14 }}>{dotTime(r.booking_time)}</b><span className={`kx-pill ${statusClass(r.status)}`}>{statusLabel(r.status)}</span></div>
            </button>
          ))}
        </div>
      ) : <div className="kx-card kx-sub">Belum ada KOL lain bulan ini. Semua tanggal masih kosong.</div>}
    </div>
  );
}
