import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, Ic, Sheet, spring } from "../shell/dpx-ui";
import { CategorySheet, CatIcon, catOf } from "./fin-sheets";
import type { FinCtx } from "./fin-pages";
import { categorizeRemote, learnRemote, planRefine, syncMemory, toItem } from "../../lib/finance/ai-category";
import { loadMemory, memoryId, recall } from "../../lib/finance/ai-cache";
import { payeeKey } from "../../lib/finance/discover";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { Entry } from "../../lib/finance/types";

/** The same records that carry a "?" in the lists: every record with no category, Djiwa Pay payments included. */
export const unsorted = (e: Entry) => e.kind !== "tf" && e.categoryId === "lainnya";
type Group = { key: string; label: string; kind: "in" | "out"; list: Entry[]; total: number };

/** Every record with no category, in two steps: the model sorts what it is sure of (in rounds, until it is done or out of its daily allowance), and what is left is
 *  asked shop by shop: one answer, category or sub category, sorts all of that shop's records and is remembered for next time. */
export function TidySheet({ ctx, onClose, acc }: { ctx: FinCtx; onClose: () => void; /** Only one wallet's records. */ acc?: string }) {
  const { fin } = ctx;
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState<{ done: number; of: number } | null>(null), [note, setNote] = useState(""), [pick, setPick] = useState<Group | null>(null), [more, setMore] = useState(false);
  const todo = useMemo(() => fin.allRecords.filter((e) => unsorted(e) && (!acc || e.accountId === acc || e.toAccountId === acc)), [fin.allRecords, acc]);
  /** A stored record is updated; a Djiwa Pay payment (read-only) takes its category as an override. */
  const put = (e: Entry, next: Entry) => { if (e.source === "pay") fin.dispatch({ type: "override/set", id: e.id, override: { categoryId: next.categoryId } }); else fin.dispatch({ type: "entry/update", entry: next }); };
  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const e of todo) {
      const kind = e.kind === "in" ? "in" : "out", key = `${kind}|${payeeKey(e.note) || e.note.trim().toLowerCase() || "?"}`, g = m.get(key) ?? { key, label: e.note.trim() || "Tanpa nama", kind, list: [], total: 0 };
      g.list.push(e); g.total += e.amount; m.set(key, g);
    }
    return [...m.values()].sort((a, b) => b.list.length - a.list.length || b.total - a.total);
  }, [todo]);

  /** Rounds of 20: the person's own memory first, then the model. Stops when nothing more is gained or the daily allowance is spent. */
  const auto = async () => {
    setBusy(true); setNote(""); let sorted = 0, limited = false;
    try {
      await syncMemory(fin.profileId);
      const queue = [...todo].slice(0, 240);
      for (let i = 0; i < queue.length; i += 20) {
        setProgress({ done: i, of: queue.length });
        const part = queue.slice(i, i + 20), memory = loadMemory(fin.profileId), local = [], ask: Entry[] = [];
        for (const e of part) { const h = recall(memory, memoryId(e.note, e.kind === "in" ? "in" : "out")); if (h && h.c !== "lainnya") local.push({ key: e.id, categoryId: h.c, confidence: h.p, source: "ai" as const }); else ask.push(e); }
        let res = { results: local as { key: string; categoryId: string | null; confidence: number; source: "rule" | "ai" | "none" }[], minConfidence: 0.8 };
        if (ask.length) { const got = await categorizeRemote(ask.map(toItem)).catch(() => null); if (got) { res = { results: [...local, ...got.results], minConfidence: got.minConfidence }; limited = got.limited; } }
        const plan = planRefine(part, res, fin.raw.categories);
        for (const p of plan) put(p.before, p.after);
        sorted += plan.length;
        if (limited) break;
      }
    } finally { setBusy(false); setProgress(null); }
    setNote(sorted ? `${sorted} catatan dikategorikan otomatis.${limited ? " Batas harian pengategorian otomatis tercapai, sisanya bisa dipilih per toko." : ""}` : limited ? "Batas harian pengategorian otomatis sudah tercapai. Pilih per toko di bawah." : "Tidak ada yang cukup yakin dikategorikan. Pilih per toko di bawah.");
    if (sorted) ctx.notify(`${sorted} catatan dikategorikan`);
  };

  /** One answer for a whole shop, remembered for next time. The way back is one tap. */
  const apply = (g: Group, categoryId: string) => {
    const before = g.list, name = catOf(fin.raw, categoryId).name;
    for (const e of before) put(e, { ...e, categoryId });
    learnRemote(g.label, categoryId, { profileId: fin.profileId, kind: g.kind });
    setPick(null);
    ctx.notify(`${before.length} catatan ${g.label} masuk ${name}`, () => { for (const e of before) put(e, e); });
  };

  const shown = more ? groups : groups.slice(0, 12);
  return <Sheet title="Rapikan kategori" onClose={onClose}>
    {todo.length === 0 ? <motion.div className="dpx-empty" style={{ paddingTop: 20 }} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={spring}><span className="dpx-df-done"><Ic n="check" size="lg" /></span><b>Semua catatan sudah berkategori</b><p>Catatan baru tanpa kategori akan muncul di sini.</p></motion.div> : <>
      <p className="dpx-sub" style={{ marginTop: -6 }}><b>{todo.length}</b> catatan dari <b>{groups.length}</b> toko belum punya kategori. Satu jawaban untuk satu toko merapikan semua catatannya dan diingat untuk berikutnya.</p>
      <Btn type="button" className="dpx-btn" disabled={busy} onClick={() => void auto()} whileTap={{ scale: 0.98 }}><Ic n="spark" size="sm" /> {busy ? `Merapikan ${progress ? `${Math.min(progress.done + 20, progress.of)} dari ${progress.of}` : ""}…` : "Rapikan otomatis dengan AI"}</Btn>
      {busy && progress ? <div className="dpx-isc-bar" aria-hidden="true" style={{ marginTop: 8 }}><motion.i animate={{ width: `${Math.round(((progress.done + 20) / progress.of) * 100)}%` }} transition={{ duration: 0.5 }} /></div> : null}
      {note ? <div className="dpx-note dpx-info" role="status" style={{ marginTop: 10 }}><Ic n="info" /><div>{note}</div></div> : null}
      <div className="dpx-glabel" style={{ marginTop: 16 }}>Pilih per toko</div>
      <div className="dpx-tidy-list">
        <AnimatePresence initial={false}>{shown.map((g) => <motion.button key={g.key} layout type="button" className="dpx-tidy-row" onClick={() => setPick(g)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40, height: 0 }} transition={spring}>
          <CatIcon cat={catOf(fin.raw, "lainnya")} size={36} /><span><b>{g.label}</b><small>{g.list.length} catatan · {g.kind === "in" ? "+" : "−"}{rupiah(g.total)}</small></span><Ic n="chev" size="sm" />
        </motion.button>)}</AnimatePresence>
      </div>
      {groups.length > 12 && !more ? <Btn type="button" className="dpx-btn dpx-ghost" onClick={() => setMore(true)}>Tampilkan {groups.length - 12} toko lainnya</Btn> : null}
    </>}
    <AnimatePresence>{pick ? <CategorySheet key="pick" categories={fin.raw.categories} income={pick.kind === "in"} onPick={(id) => apply(pick, id)} onClose={() => setPick(null)} /> : null}</AnimatePresence>
  </Sheet>;
}
