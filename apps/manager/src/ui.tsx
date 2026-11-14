import type { ReactNode } from "react";
import { ICONS } from "./icons";

export function Ic({ n, className = "ic" }: { n: string; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: ICONS[n] ?? "" }} />;
}

export const rp = (n: number | string) => `Rp${Math.round(Number(n) || 0).toLocaleString("id-ID")}`;
export const wib = (v: string | number | Date) => new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
export const hm = (v: string | number | Date) => new Date(v).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(".", ":");

export function Panel({ title, meta, green, fill, action, children, style }: { title?: ReactNode; meta?: ReactNode; green?: boolean; fill?: boolean; action?: ReactNode; children?: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className={`panel${fill ? " fill" : ""}`} style={style}>
      {title !== undefined && <div className="ph"><span className={`lab${green ? " g" : ""}`}>{title}</span>{action ?? (meta !== undefined ? <span className="meta">{meta}</span> : null)}</div>}
      {children}
    </div>
  );
}

export function Kpis({ items }: { items: { v: ReactNode; l: string; s?: string }[] }) {
  return (
    <div className="kpis" style={{ gridTemplateColumns: `repeat(${items.length},1fr)` }}>
      {items.map((k) => <div key={k.l}><b>{k.v}</b><div className="kl">{k.l}</div>{k.s && <div className={`ks ${k.s.startsWith("▼") ? "dn" : ""}`}>{k.s}</div>}</div>)}
    </div>
  );
}

export function Tabs<T extends string>({ items, value, onChange, style }: { items: [T, string][]; value: T; onChange: (v: T) => void; style?: React.CSSProperties }) {
  return <div className="tabs" style={style}>{items.map(([k, l]) => <button key={k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
