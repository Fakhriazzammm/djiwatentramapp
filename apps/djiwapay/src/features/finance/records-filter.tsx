import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, Ic, Seg, Sheet } from "../shell/dpx-ui";
import { NewTag } from "../shell/new-badge";
import { CatIcon, catOf } from "./fin-sheets";
import type { Category, FinanceState } from "../../lib/finance/types";
import type { PayeeKind } from "../../lib/finance/payees";

export type RecFilter = { cat: string; sub: string; kind: PayeeKind | "all" };
export const NO_FILTER: RecFilter = { cat: "", sub: "", kind: "all" };
export const hasFilter = (f: RecFilter) => Boolean(f.cat || f.sub || f.kind !== "all");
const KINDS: readonly (readonly [PayeeKind | "all", string])[] = [["all", "Semua"], ["orang", "Orang"], ["toko", "Toko"], ["layanan", "Layanan"]];

/** Pick a category and, inside it, a sub category. Counts show how many records each holds in the current view. */
export function CategoryFilterSheet({ state, value, counts, onApply, onClose }: { state: FinanceState; value: RecFilter; counts: Map<string, number>; onApply: (cat: string, sub: string) => void; onClose: () => void }) {
  const [income, setIncome] = useState(() => (value.cat ? catOf(state, value.cat).income : false)), [cat, setCat] = useState(value.cat), [sub, setSub] = useState(value.sub);
  const ids = useMemo(() => new Set(state.categories.map((c) => c.id)), [state.categories]);
  const parents = useMemo(() => state.categories.filter((c) => c.income === income && !(c.parentId && ids.has(c.parentId))), [state.categories, income, ids]);
  const subsOf = (id: string) => state.categories.filter((c) => c.parentId === id);
  const total = (c: Category) => (counts.get(c.id) ?? 0) + subsOf(c.id).reduce((s, x) => s + (counts.get(x.id) ?? 0), 0);
  const subs = cat ? subsOf(cat) : [];
  return <Sheet title="Filter kategori" onClose={onClose}>
    <Seg id="rf-income" label="Jenis kategori" fit value={income ? "in" : "out"} onChange={(v) => { setIncome(v === "in"); setCat(""); setSub(""); }} options={[["out", "Pengeluaran"], ["in", "Pemasukan"]] as const} />
    <div className="dpx-rf-grid" role="group" aria-label="Kategori">
      <Btn type="button" className={`dpx-rf-cat ${!cat ? "on" : ""}`} aria-pressed={!cat} onClick={() => { setCat(""); setSub(""); }} whileTap={{ scale: 0.96 }}><span className="all"><Ic n="grid" size="sm" /></span><b>Semua</b></Btn>
      {parents.map((c) => <Btn key={c.id} type="button" className={`dpx-rf-cat ${cat === c.id ? "on" : ""}`} aria-pressed={cat === c.id} onClick={() => { setCat(c.id); setSub(""); }} whileTap={{ scale: 0.96 }}><CatIcon cat={c} size={30} /><b>{c.name}</b><small>{total(c)}</small></Btn>)}
    </div>
    <AnimatePresence initial={false}>{subs.length ? <motion.div key={cat} className="dpx-rf-subs" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }}>
      <div className="dpx-glabel">Sub kategori {catOf(state, cat).name}</div>
      <div className="chips"><Btn type="button" className={`chip ${!sub ? "on" : ""}`} aria-pressed={!sub} onClick={() => setSub("")} whileTap={{ scale: 0.95 }}>Semua sub</Btn>
        {subs.map((s) => <Btn key={s.id} type="button" className={`chip ${sub === s.id ? "on" : ""}`} aria-pressed={sub === s.id} onClick={() => setSub(s.id)} whileTap={{ scale: 0.95 }}>{s.name}<small>{counts.get(s.id) ?? 0}</small></Btn>)}</div>
    </motion.div> : null}</AnimatePresence>
    <div className="dpx-rf-bar"><Btn type="button" className="dpx-btn dpx-soft" onClick={() => { setCat(""); setSub(""); }}>Atur ulang</Btn><Btn type="button" className="dpx-btn" onClick={() => { onApply(cat, sub); onClose(); }}>Terapkan</Btn></div>
  </Sheet>;
}

/** Under the search box: category and sub category buttons, and the kind chips (semua, orang, toko, layanan). */
export function FilterBar({ state, value, onChange, onOpen }: { state: FinanceState; value: RecFilter; onChange: (f: RecFilter) => void; onOpen: () => void }) {
  const cat = value.cat ? catOf(state, value.cat) : null, sub = value.sub ? catOf(state, value.sub) : null, hasSubs = Boolean(value.cat && state.categories.some((c) => c.parentId === value.cat));
  return <div className="dpx-rf">
    <div className="row" role="group" aria-label="Filter kategori dan jenis">
      <Btn type="button" className={`btn ${cat ? "on" : ""}`} onClick={onOpen} whileTap={{ scale: 0.96 }}><Ic n="filter" size="sm" />{cat ? cat.name : "Kategori"}{cat ? null : <NewTag id="records-filter" />}<Ic n="chev" size="sm" /></Btn>
      <AnimatePresence initial={false}>{hasSubs ? <motion.span key="sub" initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }} style={{ display: "inline-flex", overflow: "hidden", flex: "none" }}>
        <Btn type="button" className={`btn ${sub ? "on" : ""}`} onClick={onOpen} whileTap={{ scale: 0.96 }}>{sub ? sub.name : "Sub kategori"}<Ic n="chev" size="sm" /></Btn></motion.span> : null}</AnimatePresence>
      <i className="sep" aria-hidden="true" />
      {KINDS.map(([k, l]) => <Btn key={k} type="button" className={`k ${value.kind === k ? "on" : ""}`} aria-pressed={value.kind === k} onClick={() => onChange({ ...value, kind: k })} whileTap={{ scale: 0.95 }}>{l}</Btn>)}
      <AnimatePresence initial={false}>{hasFilter(value) ? <motion.span key="reset" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} style={{ display: "inline-flex", flex: "none" }}><Btn type="button" className="btn reset" onClick={() => onChange(NO_FILTER)} whileTap={{ scale: 0.94 }} aria-label="Atur ulang filter"><Ic n="close" size="sm" /></Btn></motion.span> : null}</AnimatePresence>
    </div>
  </div>;
}

/** While a filter is being applied: a bar that always moves and a line that says so, so a pause never looks like a freeze. */
export function FilterWait({ show }: { show: boolean }) {
  return <AnimatePresence initial={false}>{show ? <motion.div key="wait" className="dpx-rf-wait" role="status" aria-live="polite" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
    <span className="ring" aria-hidden="true" /><span>Menyaring catatan…</span><i className="bar" aria-hidden="true"><u /></i>
  </motion.div> : null}</AnimatePresence>;
}

/** Placeholder rows that shimmer where the list will be. */
export function FilterSkeleton() {
  return <div className="dpx-rf-skel" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="r" style={{ animationDelay: `${i * 0.12}s` }}><i className="c" /><span><i className="l1" style={{ width: `${48 + ((i * 17) % 30)}%` }} /><i className="l2" /></span><i className="a" /></div>)}</div>;
}
