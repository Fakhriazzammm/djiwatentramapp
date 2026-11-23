import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, Ic, Sheet, spring } from "../shell/dpx-ui";
import { CategorySheet, CatIcon, catOf } from "./fin-sheets";
import type { FinCtx } from "./fin-pages";
import { categorizeRemote, learnRemote, planRefine, syncMemory, toItem } from "../../lib/finance/ai-category";
import { loadMemory, memoryId, recall } from "../../lib/finance/ai-cache";
import { payeeKey } from "../../lib/finance/discover";
import { guessCategory } from "../../lib/finance/categories";
import { useTween } from "../integrations/import-scan";
import type { Entry } from "../../lib/finance/types";

/** The same records that carry a "?" in the lists: every record with no category, Djiwa Pay payments included. */
export const unsorted = (e: Entry) => e.kind !== "tf" && e.categoryId === "lainnya";
type Group = { key: string; label: string; kind: "in" | "out"; list: Entry[]; total: number };

/** Every record with no category, in two steps: the model sorts what it is sure of (in rounds, until it is done or out of its daily allowance), and what is left is
 *  asked shop by shop: one answer, category or sub category, sorts all of that shop's records and is remembered for next time. */

const compact = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1).replace(".", ",")} M` : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "").replace(".", ",")} jt` : n >= 1e3 ? `${Math.round(n / 1e3)} rb` : String(Math.round(n)));
const TONES = ["#e8833a", "#d14b1a", "#8a5cc2", "#d9a21a", "#16a3b8", "#1f9d62", "#e0568a", "#6f7bd9"];
const tone = (s: string) => TONES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];
/** "PAN" alone is a QRIS terminal number, not a shop; names in capitals are shown as names. */
function pretty(label: string, key: string) {
  if (/\|pan$/.test(key) || /^pan\b/i.test(label)) return "QRIS tanpa nama toko";
  return label === label.toUpperCase() && /[A-Z]{3}/.test(label) ? label.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : label;
}

export function TidySheet({ ctx, onClose, acc }: { ctx: FinCtx; onClose: () => void; /** Only one wallet's records. */ acc?: string }) {
  const { fin } = ctx;
  const [openKey, setOpenKey] = useState<string | null>(null), [busy, setBusy] = useState(false), [progress, setProgress] = useState<{ done: number; of: number } | null>(null), [note, setNote] = useState(""), [pick, setPick] = useState<Group | null>(null), [more, setMore] = useState(false);
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

  const popular = useMemo(() => {
    const count = (income: boolean) => { const m = new Map<string, number>(); for (const e of fin.allRecords) if (e.kind !== "tf" && e.categoryId !== "lainnya" && (e.kind === "in") === income) m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).filter((id) => fin.raw.categories.some((c) => c.id === id && c.income === income)); };
    return { in: count(true), out: count(false) };
  }, [fin.allRecords, fin.raw.categories]);
  const suggest = (g: Group) => { const guess = guessCategory(g.label), cat = guess && fin.raw.categories.find((c) => c.id === guess && c.income === (g.kind === "in")); return [...new Set([...(cat ? [cat.id] : []), ...popular[g.kind].slice(0, 5)])].slice(0, 5); };
  const remaining = Math.round(useTween(todo.length, 600));

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

  const shown = more ? groups : groups.slice(0, 15);
  return <Sheet title="Rapikan kategori" onClose={onClose}>
    {todo.length === 0 ? <motion.div className="dpx-empty" style={{ paddingTop: 20 }} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={spring}><span className="dpx-df-done"><Ic n="check" size="lg" /></span><b>Semua catatan sudah berkategori</b><p>Catatan baru tanpa kategori akan muncul di sini.</p></motion.div> : <>
      <div className="dpx-td-sum"><b>{remaining}</b><span>catatan belum berkategori<small>dari {groups.length} toko dan penerima</small></span></div>
      <div className="dpx-td-ai">
        <div className="t"><span className="ic"><Ic n="spark" size="sm" /></span><span><b>Biar AI yang memilih</b><small>Kategori dan sub-kategori dipilihkan untuk yang ia yakini. Sisanya kamu jawab di bawah.</small></span></div>
        <Btn type="button" className="go" disabled={busy} onClick={() => void auto()} whileTap={{ scale: 0.97 }}>{busy ? `Merapikan ${progress ? `${Math.min(progress.done + 20, progress.of)} dari ${progress.of}` : ""}…` : "Rapikan otomatis"}</Btn>
        {busy && progress ? <div className="dpx-isc-bar" aria-hidden="true"><i style={{ width: `${Math.max(6, Math.round(((progress.done + 20) / progress.of) * 100))}%` }} /></div> : null}
        {note ? <p className="note" role="status">{note}</p> : null}
      </div>
      <div className="dpx-glabel" style={{ marginTop: 16 }}>Atau pilih sendiri, satu jawaban untuk satu toko</div>
      <div className="dpx-td-list">
        <AnimatePresence initial={false}>{shown.map((g) => { const open = openKey === g.key, name = pretty(g.label, g.key); return <motion.div key={g.key} layout="position" className={`dpx-td-item ${open ? "open" : ""}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40, height: 0 }} transition={spring}>
          <Btn type="button" className="head" onClick={() => setOpenKey(open ? null : g.key)} aria-expanded={open}>
            <span className="av" style={{ background: tone(g.key) }} aria-hidden="true">{name.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase() || "?"}</span>
            <span className="tx"><b>{name}</b><small>{g.list.length} catatan · {g.kind === "in" ? "+" : "−"}Rp{compact(g.total)}</small></span>
            <motion.span className="cv" animate={{ rotate: open ? 90 : 0 }} transition={spring}><Ic n="chev" size="sm" /></motion.span>
          </Btn>
          <AnimatePresence initial={false}>{open ? <motion.div className="more" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}>
            <p>Masukkan semua {g.list.length} catatan ini ke:</p>
            <div className="chips">{suggest(g).map((id) => { const l = catOf(fin.raw, id), par = l.parentId ? fin.raw.categories.find((c) => c.id === l.parentId) : null; return <Btn key={id} type="button" className="chip" onClick={() => apply(g, id)} whileTap={{ scale: 0.95 }}>{par ? `${par.name} › ${l.name}` : l.name}</Btn>; })}
              <Btn type="button" className="chip other" onClick={() => setPick(g)} whileTap={{ scale: 0.95 }}>Pilih lainnya…</Btn></div>
          </motion.div> : null}</AnimatePresence>
        </motion.div>; })}</AnimatePresence>
      </div>
      {groups.length > 15 && !more ? <Btn type="button" className="dpx-btn dpx-ghost" onClick={() => setMore(true)}>Tampilkan {groups.length - 15} lainnya</Btn> : null}
    </>}
    <AnimatePresence>{pick ? <CategorySheet key="pick" categories={fin.raw.categories} income={pick.kind === "in"} onPick={(id) => apply(pick, id)} onClose={() => setPick(null)} /> : null}</AnimatePresence>
  </Sheet>;
}
