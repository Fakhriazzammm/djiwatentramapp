import { AnimatePresence, motion } from "framer-motion";
import { Seg, spring } from "../shell/dpx-ui";
import { SCOPES } from "../../lib/finance/scope";
import type { Finance } from "../../lib/finance/use-finance";

/** Semua / Pribadi / Bisnis. It appears once a business wallet exists (or `always`), and every number on the page follows it. */
export function ScopeSwitch({ fin, id, always = false }: { fin: Finance; id: string; always?: boolean }) {
  const show = fin.hasBusiness || always;
  return <AnimatePresence initial={false}>
    {show ? <motion.div key="scope" role="region" aria-label="Lingkup dompet" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring} style={{ overflow: "hidden" }}>
      <div style={{ padding: "6px 2px 10px" }}><Seg id={`scope-${id}`} label="Lingkup dompet" fit value={fin.scope} onChange={fin.setScope} options={SCOPES} /></div>
    </motion.div> : null}
  </AnimatePresence>;
}
