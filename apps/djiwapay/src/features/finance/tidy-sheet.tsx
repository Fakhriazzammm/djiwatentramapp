import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, Ic, Sheet, spring } from "../shell/dpx-ui";
import { CategorySheet, catOf } from "./fin-sheets";
import type { FinCtx } from "./fin-pages";
import { categorizeRemote, learnRemote, syncMemory } from "../../lib/finance/ai-category";
import { loadMemory, memoryId, recall } from "../../lib/finance/ai-cache";
import { classify, payeeKeyOf, payeeName, type PayeeKind } from "../../lib/finance/payees";
import { usePayeeMeta } from "../../lib/finance/payee-meta";
import { useTween } from "../integrations/import-scan";
import { ruleSuggestion, unnamed, SURE, type Sug } from "../../lib/finance/tidy-rules";
import type { Entry } from "../../lib/finance/types";

/** The same records that carry a "?" in the lists: every record with no category, Djiwa Pay payments included. */
export const unsorted = (e: Entry) => e.kind !== "tf" && e.categoryId === "lainnya";
type Group = { key: string; label: string; kind: "in" | "out"; pk: PayeeKind; qrisNoName: boolean; list: Entry[]; total: number };

/**
 * Sorting what has no category, from the surest signal to the weakest:
 *  1. the kind of payee: money sent to a person is a Transfer, a service is a bill;
 *  2. words in the name (kopi, bakso, pln...), the same rules the rest of the app uses;
 *  3. the model, once per payee (not once per record), in rounds of 20, with its less sure answers kept as suggestions;
 *  4. what is left is asked shop by shop, the suggestion first. One answer sorts all of that payee's records and is remembered.
 */
const compact = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1).replace(".", ",")} M` : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "").replace(".", ",")} jt` : n >= 1e3 ? `${Math.round(n / 1e3)} rb` : String(Math.round(n)));
const TONES = ["#e8833a", "#d14b1a", "#8a5cc2", "#d9a21a", "#16a3b8", "#1f9d62", "#e0568a", "#6f7bd9"];
const tone = (s: string) => TONES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length];

export function TidySheet({ ctx, onClose, acc }: { ctx: FinCtx; onClose: () => void; /** Only one wallet's records. */ acc?: string }) {
  const { fin } = ctx, { meta } = usePayeeMeta(fin.profileId);
  const [openKey, setOpenKey] = useState<string | null>(null), [busy, setBusy] = useState(false), [phase, setPhase] = useState(""), [progress, setProgress] = useState<{ done: number; of: number } | null>(null), [note, setNote] = useState(""), [pick, setPick] = useState<Group | null>(null), [more, setMore] = useState(false);
  const [aiSugs, setAiSugs] = useState<Record<string, Sug>>({});
  const todo = useMemo(() => fin.allRecords.filter((e) => unsorted(e) && (!acc || e.accountId === acc || e.toAccountId === acc)), [fin.allRecords, acc]);
  /** A stored record is updated; a Djiwa Pay payment (read-only) takes its category as an override. */
  const put = (e: Entry, next: Entry) => { if (e.source === "pay") fin.dispatch({ type: "override/set", id: e.id, override: { categoryId: next.categoryId } }); else fin.dispatch({ type: "entry/update", entry: next }); };
  const has = (id: string, income: boolean) => fin.raw.categories.some((c) => c.id === id && c.income === income);
  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const e of todo) {
      const kind = e.kind === "in" ? "in" : "out", pkey = payeeKeyOf(e.note), key = `${kind}|${pkey}`;
      const g = m.get(key) ?? { key, label: payeeName(e.note), kind, pk: meta.kinds[pkey] ?? "toko", qrisNoName: unnamed(payeeName(e.note)), list: [], total: 0 };
      g.list.push(e); g.total += e.amount; m.set(key, g);
    }
    for (const g of m.values()) { const pkey = g.key.slice(g.key.indexOf("|") + 1); g.pk = meta.kinds[pkey] ?? classify(g.label, [], { qris: g.list.some((e) => /\bPAN\b|qris/i.test(e.note)) }); }
    return [...m.values()].sort((a, b) => b.list.length - a.list.length || b.total - a.total);
  }, [todo, meta]);

  const ruleSug = (g: Group): Sug | null => ruleSuggestion(g.label, g.kind, g.pk, has);
  const sugOf = (g: Group): Sug | null => ruleSug(g) ?? aiSugs[g.key] ?? null;
  const pending = groups.filter((g) => { const s = sugOf(g); return s && s.confidence < SURE; });

  const popular = useMemo(() => {
    const count = (income: boolean) => { const m = new Map<string, number>(); for (const e of fin.allRecords) if (e.kind !== "tf" && e.categoryId !== "lainnya" && (e.kind === "in") === income) m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).filter((id) => fin.raw.categories.some((c) => c.id === id && c.income === income)); };
    return { in: count(true), out: count(false) };
  }, [fin.allRecords, fin.raw.categories]);
  const suggest = (g: Group) => { const s = sugOf(g); return [...new Set([...(s ? [s.categoryId] : []), ...popular[g.kind].slice(0, 5)])].slice(0, 5); };
  const remaining = Math.round(useTween(todo.length, 600));

  /** Many payees at once, with one way back. */
  const applyMany = (pairs: { g: Group; categoryId: string }[], message: (n: number, p: number) => string) => {
    const before = pairs.flatMap(({ g }) => g.list);
    for (const { g, categoryId } of pairs) { for (const e of g.list) put(e, { ...e, categoryId }); learnRemote(g.label, categoryId, { profileId: fin.profileId, kind: g.kind }); }
    ctx.notify(message(before.length, pairs.length), () => { for (const e of before) put(e, e); });
    return before.length;
  };

  const auto = async () => {
    setBusy(true); setNote(""); const tally = { jenis: 0, kata: 0, ai: 0 }; let limited = false, tried = 0;
    try {
      await syncMemory(fin.profileId);
      // 1. kind of payee and words in the name
      setPhase("Mengenali jenis penerima dan kata kunci…"); setProgress({ done: 0, of: Math.max(1, groups.length) });
      const sure = groups.map((g) => ({ g, s: ruleSug(g) })).filter((x): x is { g: Group; s: Sug } => Boolean(x.s) && x.s!.confidence >= SURE);
      if (sure.length) { for (const x of sure) tally[x.s.why === "kata" ? "kata" : "jenis"] += x.g.list.length; applyMany(sure.map((x) => ({ g: x.g, categoryId: x.s.categoryId })), (n, p) => `${n} catatan dari ${p} penerima dikategorikan`); }
      await new Promise((r) => setTimeout(r, 350));
      // 2. the model, one question per payee
      const done = new Set(sure.map((x) => x.g.key));
      const left = groups.filter((g) => !done.has(g.key) && !g.qrisNoName && g.label.length >= 3 && g.pk !== "orang" && !aiSugs[g.key]);
      const memory = loadMemory(fin.profileId), fresh: Record<string, Sug> = {}, apply2: { g: Group; categoryId: string }[] = [];
      const ask: Group[] = [];
      for (const g of left) { const h = recall(memory, memoryId(g.label, g.kind)); if (h && h.c !== "lainnya" && has(h.c, g.kind === "in")) apply2.push({ g, categoryId: h.c }); else ask.push(g); }
      for (let i = 0; i < ask.length; i += 20) {
        setPhase(`Meminta AI memilihkan kategori untuk ${Math.min(ask.length, i + 20)} dari ${ask.length} toko…`); setProgress({ done: i, of: ask.length });
        const part = ask.slice(i, i + 20), got = await categorizeRemote(part.map((g) => ({ key: g.key, text: g.label, amount: g.total / g.list.length, kind: g.kind }))).catch(() => null);
        if (!got) break; tried += part.length; if (got.limited) limited = true;
        for (const r of got.results) { const g = part.find((x) => x.key === r.key); if (!g || !r.categoryId || r.source === "none" || !has(r.categoryId, g.kind === "in")) continue; if (r.confidence >= got.minConfidence || r.source === "rule") apply2.push({ g, categoryId: r.categoryId }); else if (r.confidence >= 0.4) fresh[g.key] = { categoryId: r.categoryId, why: "ai", confidence: r.confidence }; }
        if (got.limited) break;
      }
      if (apply2.length) { for (const x of apply2) tally.ai += x.g.list.length; applyMany(apply2, (n, p) => `${n} catatan dari ${p} toko dikategorikan oleh AI`); }
      setAiSugs((cur) => ({ ...cur, ...fresh }));
    } finally { setBusy(false); setProgress(null); setPhase(""); }
    const total = tally.jenis + tally.kata + tally.ai;
    const parts = [tally.jenis ? `${tally.jenis} lewat jenis penerima (transfer ke orang, tagihan)` : "", tally.kata ? `${tally.kata} lewat kata kunci` : "", tally.ai ? `${tally.ai} oleh AI` : ""].filter(Boolean).join(", ");
    setNote(total ? `${total} catatan dikategorikan${parts ? `: ${parts}` : ""}.${limited ? " Batas harian AI tercapai; sisanya bisa dipilih per toko." : ""}` : limited ? "Batas harian AI sudah tercapai. Pilih per toko di bawah." : tried ? "AI belum cukup yakin untuk sisanya. Saran sudah disiapkan di bawah, tinggal pilih." : "Tidak ada lagi yang bisa dikategorikan otomatis. Pilih per toko di bawah.");
  };

  /** The less sure answers (the model's and the weaker rules), all at once. */
  const applySuggestions = () => { const pairs = pending.map((g) => ({ g, categoryId: sugOf(g)!.categoryId })); applyMany(pairs, (n, p) => `${n} catatan dari ${p} penerima mengikuti saran`); setAiSugs({}); };

  /** One answer for a whole payee, remembered for next time. The way back is one tap. */
  const apply = (g: Group, categoryId: string) => {
    const name = catOf(fin.raw, categoryId).name;
    setPick(null);
    applyMany([{ g, categoryId }], (n) => `${n} catatan ${g.label} masuk ${name}`);
  };

  const shown = more ? groups : groups.slice(0, 15);
  return <Sheet title="Rapikan kategori" onClose={onClose}>
    {todo.length === 0 ? <motion.div className="dpx-empty" style={{ paddingTop: 20 }} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={spring}><span className="dpx-df-done"><Ic n="check" size="lg" /></span><b>Semua catatan sudah berkategori</b><p>Catatan baru tanpa kategori akan muncul di sini.</p></motion.div> : <>
      <div className="dpx-td-sum"><b>{remaining}</b><span>catatan belum berkategori<small>dari {groups.length} toko dan penerima</small></span></div>
      <div className="dpx-td-ai">
        <div className="t"><span className="ic"><Ic n="spark" size="sm" /></span><span><b>Biar AI yang memilih</b><small>Transfer ke orang dan tagihan dikenali dari jenisnya, toko dari namanya, sisanya ditanyakan ke AI satu per toko. Yang kurang yakin jadi saran.</small></span></div>
        <Btn type="button" className="go" disabled={busy} onClick={() => void auto()} whileTap={{ scale: 0.97 }}>{busy ? "Merapikan…" : "Rapikan otomatis"}</Btn>
        {busy && phase ? <p className="phase" role="status">{phase}</p> : null}
        {!busy && pending.length ? <Btn type="button" className="go soft" onClick={applySuggestions} whileTap={{ scale: 0.97 }}>Terapkan {pending.length} saran ({pending.reduce((s, g) => s + g.list.length, 0)} catatan)</Btn> : null}
        {busy && progress ? <div className="dpx-isc-bar" aria-hidden="true"><i style={{ width: `${Math.max(6, Math.round((progress.done / progress.of) * 100))}%` }} /></div> : null}
        {note ? <p className="note" role="status">{note}</p> : null}
      </div>
      <div className="dpx-glabel" style={{ marginTop: 16 }}>Atau pilih sendiri, satu jawaban untuk satu toko</div>
      <div className="dpx-td-list">
        <AnimatePresence initial={false}>{shown.map((g) => { const open = openKey === g.key, name = g.label, sg = sugOf(g); return <motion.div key={g.key} layout="position" className={`dpx-td-item ${open ? "open" : ""}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40, height: 0 }} transition={spring}>
          <Btn type="button" className="head" onClick={() => setOpenKey(open ? null : g.key)} aria-expanded={open}>
            <span className="av" style={{ background: tone(g.key) }} aria-hidden="true">{name.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase() || "?"}</span>
            <span className="tx"><b>{name}</b><small>{g.list.length} catatan · {g.kind === "in" ? "+" : "−"}Rp{compact(g.total)}{sg ? <em className="sg"> · Saran: {catOf(fin.raw, sg.categoryId).name}</em> : null}</small></span>
            <motion.span className="cv" animate={{ rotate: open ? 90 : 0 }} transition={spring}><Ic n="chev" size="sm" /></motion.span>
          </Btn>
          <AnimatePresence initial={false}>{open ? <motion.div className="more" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}>
            <p>Masukkan semua {g.list.length} catatan ini ke:</p>
            <div className="chips">{suggest(g).map((id) => { const l = catOf(fin.raw, id), par = l.parentId ? fin.raw.categories.find((c) => c.id === l.parentId) : null; return <Btn key={id} type="button" className={`chip ${sg && sg.categoryId === id ? "sug" : ""}`} onClick={() => apply(g, id)} whileTap={{ scale: 0.95 }}>{par ? `${par.name} › ${l.name}` : l.name}</Btn>; })}
              <Btn type="button" className="chip other" onClick={() => setPick(g)} whileTap={{ scale: 0.95 }}>Pilih lainnya…</Btn></div>
          </motion.div> : null}</AnimatePresence>
        </motion.div>; })}</AnimatePresence>
      </div>
      {groups.length > 15 && !more ? <Btn type="button" className="dpx-btn dpx-ghost" onClick={() => setMore(true)}>Tampilkan {groups.length - 15} lainnya</Btn> : null}
    </>}
    <AnimatePresence>{pick ? <CategorySheet key="pick" categories={fin.raw.categories} income={pick.kind === "in"} uncategorizedIsInvalid onPick={(id) => apply(pick, id)} onClose={() => setPick(null)} /> : null}</AnimatePresence>
  </Sheet>;
}
