import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Btn, Ic, ease } from "../shell/dpx-ui";
import { stickerUrl, type GoldData } from "../../lib/finance/assets";
import { ASSET_KINDS } from "../../lib/finance/kelola";
import type { Asset } from "../../lib/finance/types";
import type { IconName } from "../shell/dpx-ui";

/** Full-screen layer above the tab bar (the asset flow and the asset detail). */
export function FullPage({ title, onBack, right, dark = false, children }: { title: string; onBack: () => void; right?: ReactNode; dark?: boolean; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onBack(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onBack]);
  const node = <div className={`dpx dpx-fp ${dark ? "dpx-fp-dark" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
    <motion.div className="dpx-fp-in" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.3, ease }}>
      <div className="dpx-fp-h"><Btn type="button" className="dpx-rb" onClick={onBack} aria-label="Kembali"><Ic n="back" size="sm" /></Btn><h2>{title}</h2><div className="dpx-fp-r">{right}</div></div>
      {children}
    </motion.div>
  </div>;
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}

/** An asset's photo sticker with the white edge and shadow; falls back to its kind icon. */
export function Sticker({ asset, id, size = 64 }: { asset?: Pick<Asset, "kind" | "stickerId">; id?: string; size?: number }) {
  const sid = id ?? asset?.stickerId, [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [sid]);
  if (!sid || bad) {
    const k = ASSET_KINDS[asset?.kind ?? "other"];
    return <span className={`dpx-as-ph dpx-c-${k.tone}`} style={{ width: size, height: size }}><Ic n={k.icon as IconName} /></span>;
  }
  return <img className="dpx-as-stk" src={stickerUrl(sid)} alt="" width={size} height={size} style={{ width: size, height: size }} decoding="async" onError={() => setBad(true)} />;
}

export function GainText({ pct, gain, plain = false }: { pct: number; gain?: number; plain?: boolean }) {
  const up = pct >= 0;
  return <span className={up ? "dpx-up" : "dpx-dn"} style={plain ? undefined : { fontWeight: 700 }}>{up ? "▲" : "▼"} {gain !== undefined ? `${up ? "+" : "−"}Rp ${Math.abs(Math.round(gain)).toLocaleString("id-ID")} ` : ""}({up ? "+" : "−"}{Math.abs(pct).toFixed(1).replace(".", ",")}%)</span>;
}

export function PriceNote({ gold }: { gold: GoldData | null }) {
  return <p className="dpx-sub dpx-as-note">{gold ? `Nilai mengikuti harga emas dunia dalam rupiah (acuan ${gold.asOf ?? ""}). Ini perkiraan, bukan harga toko.` : "Harga emas belum termuat. Nilai memakai harga beli sementara."}</p>;
}
