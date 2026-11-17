// Komponen dasar halaman admin KOL. Gaya mengikuti Pusat Pantau (kartu datar persegi, garis tipis, label mono).
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check, Copy, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, Label, Skeleton, Tag } from "../-dashboard/ui";
import { avatarColor } from "./kol-core";

export { Card, Label, Tag };

export const INK = "#111114";
export const LINE = "#e4e4e8";

export function Page({ children }: { children: ReactNode }) {
  return <div className="admin-command mx-auto w-full max-w-[1400px] space-y-4 px-4 pb-24 pt-5 sm:px-6 lg:pb-10">{children}</div>;
}

export function PageHeader({ title, description, actions, count }: { title: string; description: string; actions?: ReactNode; count?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <Label>KOL MARKETING</Label>
        <h1 className="mt-1 flex items-center gap-2 text-[22px] font-semibold leading-tight tracking-tight text-[#111114]">{title}{count}</h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-[#666672]">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" | "danger" | "success"; size?: "sm" | "md" };
export function Btn({ variant = "outline", size = "md", className = "", type = "button", ...props }: BtnProps) {
  const base = "inline-flex shrink-0 items-center justify-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] transition disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6fdf]";
  const sizes = size === "sm" ? "min-h-8 px-2.5" : "min-h-10 px-3.5";
  const look = {
    primary: "border border-[#111114] bg-[#111114] text-white hover:bg-[#2a2a30]",
    outline: "border border-[#cfcfd6] bg-white text-[#111114] hover:bg-[#f4f4f6]",
    ghost: "border border-transparent text-[#444450] hover:bg-[#ececf0]",
    danger: "border border-[#f5c2bd] bg-white text-[#b42318] hover:bg-[#fff5f4]",
    success: "border border-[#16a34a] bg-[#16a34a] text-white hover:bg-[#15803d]",
  }[variant];
  return <button type={type} className={`${base} ${sizes} ${look} ${className}`} {...props} />;
}

export function StatusTag({ color, children }: { color: string; children: ReactNode }) {
  return <Tag color={color}>{children}</Tag>;
}

export function Avatar({ url, name, size = 36 }: { url?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const show = url && !failed;
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.4, background: show ? "#e9ecf1" : avatarColor(name || "K") }}>
      {show ? <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" /> : (name.trim()[0] || "K").toUpperCase()}
    </span>
  );
}

export const inputCls = "h-10 w-full border border-[#cfcfd6] bg-white px-3 text-sm text-[#111114] outline-none transition placeholder:text-[#9a9aa5] focus:border-[#111114] focus:ring-2 focus:ring-[#111114]/10 disabled:bg-[#f4f4f6]";
export const textareaCls = "min-h-[84px] w-full border border-[#cfcfd6] bg-white px-3 py-2 text-sm text-[#111114] outline-none transition placeholder:text-[#9a9aa5] focus:border-[#111114] focus:ring-2 focus:ring-[#111114]/10";

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <Label className="mb-1">{label}</Label>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[#666672]">{hint}</span>}
    </label>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-[200px] flex-1">
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a9aa5]" />
      <input aria-label={placeholder} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} pl-9`} />
    </div>
  );
}

/** Chip filter dengan jumlah, dipakai di atas daftar. */
export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ key: T; label: string; count?: number }> }) {
  return (
    <div role="group" className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)}
          className={`inline-flex min-h-8 items-center gap-1.5 border px-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] transition ${value === o.key ? "border-[#111114] bg-[#111114] text-white" : "border-[#cfcfd6] bg-white text-[#444450] hover:bg-[#f4f4f6]"}`}>
          {o.label}{o.count !== undefined && <span className={`tabular-nums ${value === o.key ? "text-white/70" : "text-[#9a9aa5]"}`}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint, to, tone = "ink" }: { label: string; value: ReactNode; hint?: string; to?: string; tone?: "ink" | "red" | "amber" | "blue" | "green" }) {
  const color = { ink: "#111114", red: "#d92d20", amber: "#b7791f", blue: "#2f6fdf", green: "#16a34a" }[tone];
  const body = (
    <Card className="h-full">
      <Label>{label}</Label>
      <div className="mt-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums" style={{ color }}>{value}</div>
      {hint && <div className="mt-2 text-[11px] text-[#666672]">{hint}</div>}
    </Card>
  );
  return to ? <Link to={to as never} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2f6fdf]">{body}</Link> : body;
}

export function Loading({ rows = 5 }: { rows?: number }) {
  return <div aria-busy="true" aria-label="Memuat" className="space-y-2">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border border-[#f5c2bd] bg-[#fff5f4] p-3 text-xs text-[#9b1c12]">
      <span className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" />{message}</span>
      {onRetry && <Btn size="sm" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" />Coba lagi</Btn>}
    </div>
  );
}

export function EmptyBlock({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-[#cfcfd6] bg-[#fafafb] px-4 py-10 text-center">
      <p className="text-sm font-semibold text-[#111114]">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#666672]">{hint}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

export function NoAccess() {
  return <Page><EmptyBlock title="Akses ditolak" hint="Halaman KOL Marketing hanya untuk peran admin, owner, atau superadmin." /></Page>;
}

/* ---------- Panel samping + elemen detail ---------- */

export function Panel({ title, description, onClose, children, footer, width = "sm:max-w-xl" }: { title: string; description?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: string }) {
  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className={`flex w-full flex-col gap-0 p-0 ${width}`}>
        <SheetHeader className="border-b border-[#e4e4e8] px-5 py-4 pr-14">
          <SheetTitle className="text-[15px] font-semibold leading-tight tracking-tight text-[#111114]">{title}</SheetTitle>
          {description && <SheetDescription className="mt-1 text-[11px] leading-5 text-[#666672]">{description}</SheetDescription>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#e4e4e8] bg-[#fafafb] px-5 py-3">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}

export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_1fr] items-start gap-3 border-t border-[#ececf0] py-2 first:border-t-0">
      <span className="font-mono text-[10px] uppercase leading-5 tracking-[0.08em] text-[#666672]">{label}</span>
      <div className="min-w-0 text-[12.5px] leading-5 text-[#111114]">{children}</div>
    </div>
  );
}

export function CopyField({ value, label = "Salin" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt("Salin manual", value);
    }
  };
  return (
    <div className="flex min-w-0 items-center gap-2 border border-[#cfcfd6] bg-white px-2">
      <code className="min-w-0 flex-1 truncate py-2 text-[11px] text-[#444450]">{value}</code>
      <button type="button" onClick={() => void copy()} className="inline-flex min-h-7 shrink-0 items-center gap-1 px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#2f6fdf]">
        <Copy className="h-3 w-3" />{copied ? "Tersalin" : label}
      </button>
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "ok" | "err"; children: ReactNode }) {
  const look = { info: "border-[#cfd9ea] bg-[#f4f7fc] text-[#2f5d9e]", ok: "border-[#bfe3cd] bg-[#eef8f2] text-[#166534]", err: "border-[#f5c2bd] bg-[#fff5f4] text-[#9b1c12]" }[tone];
  return <div role={tone === "err" ? "alert" : "status"} className={`border px-3 py-2 text-[11.5px] leading-5 ${look}`}>{children}</div>;
}

export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="flex w-full items-start justify-between gap-3 border border-[#e4e4e8] bg-white p-3 text-left transition hover:bg-[#fafafb] disabled:opacity-50">
      <span className="min-w-0"><span className="block text-[12.5px] font-semibold text-[#111114]">{label}</span>{hint && <span className="mt-0.5 block text-[11px] leading-4 text-[#666672]">{hint}</span>}</span>
      <span aria-hidden="true" className={`mt-0.5 flex h-5 w-9 shrink-0 items-center border p-0.5 transition ${checked ? "border-[#16a34a] bg-[#16a34a]" : "border-[#cfcfd6] bg-[#ececf0]"}`}>
        <span className={`block h-3.5 w-3.5 bg-white transition ${checked ? "translate-x-[15px]" : "translate-x-0"}`} />
      </span>
    </button>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <div className="mt-5 mb-2 flex items-center justify-between gap-2 first:mt-0"><Label tone="ink">{children}</Label>{right}</div>;
}

export function CheckLine({ children }: { children: ReactNode }) {
  return <p className="flex items-start gap-2 text-[11.5px] leading-5 text-[#444450]"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16a34a]" />{children}</p>;
}
