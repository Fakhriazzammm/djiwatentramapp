import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { djiwa3DIconSources, type Djiwa3DIconName } from "../ui/djiwa-3d-icon";

/** URL aset ikon 3D dari katalog djiwa-icons-v2 (untuk <img>, DsIcon, DsTab.icon). */
export const ds3d = (name: Djiwa3DIconName): string => djiwa3DIconSources[name] as unknown as string;

/**
 * Djiwa Soft iOS — komponen React untuk design system (docs/design-system).
 * Gaya ada di src/ds.css (kelas ds-*). Impor stylesheet sekali per app:
 *   @import "@yumipos/web-shared/ds.css";
 */
const cx = (...p: (string | false | null | undefined)[]) => p.filter(Boolean).join(" ");

export function DsRoot({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cx("ds-root", className)}>{children}</div>;
}
export function DsScreen({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cx("ds-screen", className)}>{children}</div>;
}
export function DsHeader({ eyebrow, title, left, right }: { eyebrow?: ReactNode; title: ReactNode; left?: ReactNode; right?: ReactNode }) {
	return (
		<div className="ds-header">
			{left}
			<div className="ds-grow">{eyebrow && <small>{eyebrow}</small>}<h1>{title}</h1></div>
			{right}
		</div>
	);
}
export function DsPageTitle({ children, left, right }: { children: ReactNode; left?: ReactNode; right?: ReactNode }) {
	return <div className="ds-header" style={{ padding: "8px 0 14px" }}>{left}<h1 className="ds-page-title ds-grow">{children}</h1>{right}</div>;
}
export function DsAvatar({ name, src, size }: { name?: string; src?: string | null; size?: number }) {
	const style: CSSProperties | undefined = size ? { width: size, height: size, fontSize: size * 0.38 } : undefined;
	return src ? <img className="ds-avatar" style={style} src={src} alt={name ?? ""} /> : <div className="ds-avatar" style={style}>{(name ?? "?").charAt(0).toUpperCase()}</div>;
}
export function DsIconButton({ children, badge, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { badge?: number }) {
	return <button type="button" {...p} className={cx("ds-iconbtn", p.className)}>{children}{badge ? <i className="ds-badge">{badge > 9 ? "9+" : badge}</i> : null}</button>;
}
export function DsSection({ title, action }: { title: ReactNode; action?: ReactNode }) {
	return <div className="ds-section"><h2>{title}</h2>{action}</div>;
}
export function DsGroupLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
	return <div className="ds-group-label"><span>{children}</span>{action}</div>;
}
export function DsGroup({ children, white, flush, className, style }: { children: ReactNode; white?: boolean; flush?: boolean; className?: string; style?: CSSProperties }) {
	return <div className={cx("ds-group", white && "ds-group--white", flush && "ds-group--flush", className)} style={style}>{children}</div>;
}
export function DsRow({ icon, title, sub, trail, onClick, chevron, as }: { icon?: ReactNode; title: ReactNode; sub?: ReactNode; trail?: ReactNode; onClick?: () => void; chevron?: boolean; as?: "div" | "button" }) {
	const body = (
		<>
			{icon}
			<div className="ds-main"><b>{title}</b>{sub && <span>{sub}</span>}</div>
			{trail && <div className="ds-trail">{trail}</div>}
			{chevron && <svg className="ds-chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>}
		</>
	);
	return onClick || as === "button"
		? <button type="button" className="ds-row" onClick={onClick}>{body}</button>
		: <div className="ds-row">{body}</div>;
}
export function DsIcon({ name, src, alt = "" }: { name?: Djiwa3DIconName; src?: string; alt?: string }) {
	return <img className="ds-icon" src={src ?? (name ? ds3d(name) : "")} alt={alt} />;
}
export function DsTiles({ items }: { items: { value: ReactNode; label: string }[] }) {
	return <div className="ds-tiles">{items.map((i) => <div key={i.label} className="ds-tile"><b>{i.value}</b><span>{i.label}</span></div>)}</div>;
}
export function DsTag({ tone, children }: { tone?: "ok" | "warn" | "info" | "danger"; children: ReactNode }) {
	return <span className={cx("ds-tag", tone && `ds-tag--${tone}`)}>{children}</span>;
}
export function DsBar({ value }: { value: number }) {
	return <div className="ds-bar"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}
export function DsButton({ variant, size, block, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "ghost" | "danger"; size?: "sm" | "md"; block?: boolean }) {
	return <button type="button" {...p} className={cx("ds-btn", variant && `ds-btn--${variant}`, size && `ds-btn--${size}`, block && "ds-btn--block", p.className)} />;
}
export function DsAsk({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
	return <button type="button" className="ds-ask" onClick={onClick}><span>{children}</span><i>↗</i></button>;
}
export function DsNote({ icon, children, action, tone }: { icon?: ReactNode; children: ReactNode; action?: ReactNode; tone?: "info" }) {
	return <div className={cx("ds-note", tone === "info" && "ds-note--info")}>{icon}<div style={{ flex: 1 }}>{children}</div>{action}</div>;
}
export function DsSegmented<T extends string>({ items, value, onChange }: { items: [T, string][]; value: T; onChange: (v: T) => void }) {
	return <div className="ds-seg">{items.map(([k, l]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
export function DsPills<T extends string>({ items, value, onChange }: { items: [T, string][]; value: T; onChange: (v: T) => void }) {
	return <div className="ds-pills">{items.map(([k, l]) => <button key={k} type="button" className="ds-chip" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
export function DsPromo({ eyebrow, title, sub, action, art }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; action?: ReactNode; art?: string }) {
	return <div className="ds-promo">{eyebrow && <small>{eyebrow}</small>}<h3>{title}</h3>{sub && <span style={{ fontSize: 13, opacity: 0.8 }}>{sub}</span>}<br />{action}{art && <img src={art} alt="" />}</div>;
}
export function DsChart({ bars }: { bars: { label: string; value: number; display?: string; muted?: boolean }[] }) {
	const max = Math.max(1, ...bars.map((b) => b.value));
	return (
		<div className="ds-chart">
			{bars.map((b) => (
				<div key={b.label} data-muted={b.muted ? "" : undefined}><span>{b.display ?? b.value}</span><i style={{ height: `${Math.max(6, Math.round((b.value / max) * 84))}px` }} />{b.label}</div>
			))}
		</div>
	);
}
export interface DsTab { id: string; label: string; icon: string; badge?: number }
export function DsTabBar({ tabs, active, onSelect, center }: { tabs: DsTab[]; active: string; onSelect: (id: string) => void; center: ReactNode }) {
	const left = tabs.slice(0, 2), right = tabs.slice(2);
	const t = (x: DsTab) => (
		<button key={x.id} type="button" className="ds-tab" aria-current={active === x.id ? "page" : undefined} onClick={() => onSelect(x.id)}>
			<img src={x.icon} alt="" />{x.label}{x.badge ? <i className="ds-badge" style={{ top: 2, right: "calc(50% - 22px)", borderColor: "#fff" }}>{x.badge}</i> : null}
		</button>
	);
	return <nav className="ds-tabbar" aria-label="Navigasi utama">{left.map(t)}{center}{right.map(t)}</nav>;
}
export function DsSheet({ title, onClose, children }: { title?: ReactNode; onClose: () => void; children: ReactNode }) {
	return (
		<>
			<div className="ds-scrim" onClick={onClose} />
			<div className="ds-sheet" role="dialog" aria-modal="true">
				<div className="ds-sheet-head">
					{title && <h2 className="ds-title">{title}</h2>}
					<button type="button" className="ds-iconbtn" style={{ background: "var(--ds-group)" }} onClick={onClose} aria-label="Tutup"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
				</div>
				{children}
			</div>
		</>
	);
}
export function DsEmpty({ icon, children }: { icon?: string; children: ReactNode }) {
	return <div className="ds-empty">{icon && <img src={icon} alt="" />}{children}</div>;
}
