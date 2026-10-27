import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

export function DjiwaPayPageHeader({ title, subtitle, onBack, trailing }: { title: string; subtitle?: string; onBack: () => void; trailing?: ReactNode }) {
  return <header className="ios-page-header">
    <div className="ios-navigation-bar">
      <button type="button" className="ios-back-button" onClick={onBack} aria-label={`Kembali dari ${title}`}><ChevronLeft size={22} strokeWidth={2.4} /><span>Saldo</span></button>
      <span className="ios-navigation-title" aria-hidden="true">{title}</span>
      <span className="ios-navigation-trailing">{trailing}</span>
    </div>
    <div className="ios-large-title"><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>
  </header>;
}
