import { RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { APP_UPDATE_EVENT, APP_VERSION, applyAppUpdate } from "../lib/app-update";

export function AppUpdatePrompt() {
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get("appUpdate") === "preview");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const onUpdate = () => setOpen(true);
    window.addEventListener(APP_UPDATE_EVENT, onUpdate);
    return () => window.removeEventListener(APP_UPDATE_EVENT, onUpdate);
  }, []);

  if (!open) return null;
  return <div className="app-update-overlay" role="presentation">
    <section className="app-update-dialog" role="dialog" aria-modal="true" aria-labelledby="booking-update-title">
      <div className="app-update-icon">{updating ? <RefreshCw size={20} className="app-update-spin" /> : <Sparkles size={20} />}</div>
      <p className="app-update-eyebrow">Djiwa Tentram · App Update</p>
      <h2 id="booking-update-title">{updating ? "Sedang memperbarui…" : "Update aplikasi tersedia"}</h2>
      <p className="app-update-copy">Versi baru sudah siap. Perbarui sekarang agar aplikasi menggunakan bundle terbaru.</p>
      <dl className="app-update-meta">
        <div><dt>Versi app :</dt><dd>{APP_VERSION.semantic}</dd></div>
        <div><dt>Commit :</dt><dd>{APP_VERSION.commitHash}</dd></div>
        <div><dt>Message:</dt><dd>{APP_VERSION.message}</dd></div>
      </dl>
      {!updating && <div className="app-update-actions"><button type="button" className="app-update-later" onClick={() => setOpen(false)}>Nanti saja</button><button type="button" className="app-update-now" onClick={async () => { setUpdating(true); try { await applyAppUpdate(); } catch { window.location.reload(); } }}>Update sekarang <RefreshCw size={16} /></button></div>}
    </section>
  </div>;
}
