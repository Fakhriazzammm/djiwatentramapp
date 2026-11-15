import { PaymentDetails } from "./payment-details";
import { useEffect, useState } from "react";
import { Btn, Ic } from "../shell/dpx-ui";
import { formatDateTime } from "../../lib/djiwa-pay-format";
import { CHANNEL_NAME, getOrigin, rejectItem, type Origin } from "../../lib/finance/integrations";

export function EmailOrigin({ inboundId, onUndo }: { inboundId: string; onUndo: () => void }) {
  const [o, setO] = useState<Origin | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; getOrigin(inboundId).then((r) => live && setO(r.origin)).catch(() => live && setO(null)); return () => { live = false; }; }, [inboundId]);
  const undo = async () => { setBusy(true); try { await rejectItem(inboundId); } catch { /* the entry is removed locally either way */ } finally { setBusy(false); onUndo(); } };
  return <div className="dpx-group dpx-origin" style={{ marginTop: 10 }}>
    <div className="dpx-flex" style={{ gap: 10 }}><Ic n="bank" /><div style={{ flex: 1, minWidth: 0 }}><b>Dari email{o ? ` ${CHANNEL_NAME[o.channel] ?? o.issuer}` : ""}</b><div className="dpx-sub">{o ? `Diterima ${formatDateTime(o.receivedAt)}${o.subject ? ` · “${o.subject}”` : ""}` : o === null ? "Asal email tidak lagi tersedia" : "Memuat…"}</div></div></div>
    {o?.details ? <PaymentDetails details={o.details} /> : null}
    <Btn type="button" className="dpx-btn dpx-soft dpx-sm" style={{ marginTop: 10, width: "100%" }} disabled={busy} onClick={() => void undo()}><Ic n="undo" size="sm" /> Urungkan catatan ini</Btn>
  </div>;
}

