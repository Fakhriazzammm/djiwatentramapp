import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, Ic, spring } from "../shell/dpx-ui";
import type { FinCtx } from "./fin-pages";
import { unsorted } from "./tidy-sheet";
import { NewTag } from "../shell/new-badge";

/** Above the history in Kekayaan > Dompet: the records marked "?" (no category yet), with one tap to have them sorted by AI and by shop. */
export function TidyCard({ ctx, acc }: { ctx: FinCtx; acc?: string }) {
  const n = useMemo(() => ctx.fin.allRecords.filter((e) => unsorted(e) && (!acc || e.accountId === acc || e.toAccountId === acc)).length, [ctx.fin.allRecords, acc]);
  return <AnimatePresence initial={false}>{n > 0 ? <motion.div key="tidy-card" className="dpx-tidycard" role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring} style={{ overflow: "hidden" }}>
    <div className="in"><span className="q" aria-hidden="true">?</span><span className="t"><b>{n} catatan belum berkategori<NewTag id="tidy-card" /></b><small>Yang bertanda tanya di riwayat. AI memilihkan kategori dan sub-kategorinya.</small></span>
      <Btn type="button" className="dpx-btn dpx-sm" style={{ margin: 0 }} onClick={() => ctx.open({ k: "tidy", acc })} whileTap={{ scale: 0.96 }}><Ic n="spark" size="sm" /> Rapikan</Btn></div>
  </motion.div> : null}</AnimatePresence>;
}
