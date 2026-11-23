import { Mail } from "lucide-react";
import type { ImportState } from "../../lib/finance/integrations";

const counts = new Intl.NumberFormat("id-ID");
const months = new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric" });

export function ImportScanning({ imp }: { imp: ImportState }) {
  const percent = Math.round(Math.max(0, Math.min(1, imp.progress)) * 100);
  const month = imp.scanningTo ? months.format(new Date(imp.scanningTo)) : null;
  const status = imp.error ? "Menunggu pemindaian dilanjutkan" : "Memindai email bank dan e-wallet";

  return (
    <div className="dpx-isc">
      <div className="dpx-isc-envelope" aria-hidden="true">
        <Mail size={38} strokeWidth={1.5} />
        {!imp.error && <i />}
      </div>
      <div className="dpx-isc-line" role="status">{status}</div>
      <div className="dpx-isc-pct">
        <b>{percent}%</b>
        {month && <span>sampai <strong>{month}</strong></span>}
      </div>
      <div className="dpx-isc-bar" role="progressbar" aria-label="Pemindaian email"
        aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      <div className="dpx-isc-stats">
        <div><b>{counts.format(imp.scanned)}</b><span>email diperiksa</span></div>
        <div><b>{counts.format(imp.staged)}</b><span>transaksi ditemukan</span></div>
      </div>
    </div>
  );
}
