import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, Ic, spring } from "../shell/dpx-ui";
import { refineEntries, syncMemory, worthAsking } from "../../lib/finance/ai-category";
import { useMemo } from "react";
import type { Finance } from "../../lib/finance/use-finance";

/** Appears while some records have no category. One tap lets the model sort up to 20 of them; the result can be undone. */
export function TidyBanner({ fin, notify, onManual }: { fin: Finance; notify: (text: string, undo?: () => void) => void; onManual?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);   // re-reads the memory after a pass
  const todo = useMemo(() => fin.state.entries.filter((e) => worthAsking(e, fin.profileId)), [fin.state.entries, fin.profileId, round]), n = todo.length;   // stored records, not the keyword-guessed display; shops already judged unsure are not asked again
  useEffect(() => { void syncMemory(fin.profileId).then(() => setRound((r) => r + 1)); }, [fin.profileId]);
  const run = async () => { setBusy(true); try { await refineEntries(fin, notify, todo, { announce: true }); } finally { setBusy(false); setRound((r) => r + 1); } };
  return <AnimatePresence initial={false}>{n > 0 ? <motion.div key="tidy" className="dpx-tidy" role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring} style={{ overflow: "hidden" }}>
    <div className="dpx-tidy-in"><span className="dpx-tidy-ic"><Ic n="spark" /></span><span className="dpx-tidy-t"><b>{n} catatan belum punya kategori</b><small>AI bisa memilihkan yang paling cocok dan belajar dari koreksimu.</small></span>
      <Btn type="button" className="dpx-btn dpx-sm" style={{ margin: 0 }} disabled={busy} onClick={() => (onManual ? onManual() : void run())} whileTap={{ scale: 0.96 }}>{busy ? "Merapikan…" : "Rapikan"}</Btn></div>
  </motion.div> : null}</AnimatePresence>;
}
