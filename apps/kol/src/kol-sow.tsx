import { useEffect, useState } from "react";
import { CalendarPlus, MapPin, MessageCircle } from "lucide-react";
import { googleCalendarUrl, sowText, waLink, type SowSnapshot } from "../../../supabase/functions/_shared/kol-mail";
import { dotTime, kolApi, longDate, type VisitRow } from "./kol-lib";

export type VisitInfo = { cafe_name: string; address: string; maps_url: string; wa_admin: string; wa_manager: string; post_deadline_days: number };

/** Info lokasi/kontak kunjungan; hanya dimuat saat creator punya booking. */
export function useVisitInfo(enabled: boolean) {
  const [info, setInfo] = useState<VisitInfo | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    kolApi<VisitInfo | null>("/portal/visit-info").then(v => live && setInfo(v)).catch(() => undefined);
    return () => { live = false; };
  }, [enabled]);
  return info;
}

/** Scope of Work yang berlaku untuk booking ini (salinan saat dikonfirmasi). */
export function SowCard({ sow }: { sow: SowSnapshot }) {
  if (!sow) return null;
  const days = sow.days ?? 7;
  return (
    <div className="kx-card kx-sow" aria-label="Scope of Work">
      <div className="kx-eyebrow">{sow.title}</div>
      {sow.sections.map(section => (
        <div key={section.title}>
          <b className="kx-sow-h">{section.title}</b>
          <ul>{section.items.map((item, i) => <li key={i}>{sowText(item, days)}</li>)}</ul>
        </div>
      ))}
      {sow.closing && <p className="kx-sub" style={{ margin: "12px 0 0", lineHeight: 1.5 }}>{sowText(sow.closing, days)}</p>}
    </div>
  );
}

/** Lokasi, batas tayang, tambah kalender, dan kontak WhatsApp untuk visit yang sudah terkonfirmasi. */
export function VisitDetails({ visit, info }: { visit: VisitRow; info: VisitInfo | null }) {
  const calendar = info ? googleCalendarUrl({ date: visit.booking_date, time: visit.booking_time ?? "11:00", cafeName: info.cafe_name, address: info.address }) : "";
  return (
    <div className="kx-group" style={{ marginTop: 10 }}>
      {info && (info.address || info.maps_url) && (
        <a className="kx-grow" href={info.maps_url || undefined} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="kx-ico"><MapPin size={18} /></span>
          <span className="kx-main"><b>{info.cafe_name}</b><small>{info.address}</small></span>
          {info.maps_url && <span className="kx-chev">›</span>}
        </a>
      )}
      {visit.post_deadline && (
        <div className="kx-grow"><span className="kx-main"><small>Batas tayang konten</small><b>{longDate(visit.post_deadline)}</b></span></div>
      )}
      {visit.note && <div className="kx-grow"><span className="kx-main"><small>Catatan tim</small><b style={{ fontWeight: 500 }}>{visit.note}</b></span></div>}
      {calendar && (
        <a className="kx-grow" href={calendar} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="kx-ico"><CalendarPlus size={18} /></span>
          <span className="kx-main"><b>Tambah ke Google Calendar</b><small>{longDate(visit.booking_date)} · {dotTime(visit.booking_time)} WIB</small></span>
          <span className="kx-chev">›</span>
        </a>
      )}
      {info && [["Admin", info.wa_admin], ["Manager", info.wa_manager]].filter(([, n]) => n).map(([label, number]) => (
        <a key={label} className="kx-grow" href={waLink(number)} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="kx-ico"><MessageCircle size={18} /></span>
          <span className="kx-main"><b>WhatsApp {label}</b><small>Ubah jadwal atau berhalangan hadir</small></span>
          <span className="kx-chev">›</span>
        </a>
      ))}
    </div>
  );
}
