import { useEffect, type ReactNode } from "react";

/** Sheet dari bawah gaya iOS: grabber, judul kiri, tombol tutup bundar. Tutup dengan Esc atau ketuk latar. */
export function KxSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="kx kx-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="kx-sheet">
        <div className="kx-grab" />
        <div className="kx-sheeth"><h2 className="kx-h2">{title}</h2><button type="button" className="kx-x" aria-label="Tutup" onClick={onClose}>✕</button></div>
        <div className="kx-sheetb">{children}</div>
      </section>
    </div>
  );
}
