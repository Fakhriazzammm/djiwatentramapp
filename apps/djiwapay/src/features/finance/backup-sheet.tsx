import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, Ic, Sheet, spring } from "../shell/dpx-ui";
import type { FinCtx } from "./fin-pages";
import { useTween } from "../integrations/import-scan";
import { syncPayeeMeta } from "../../lib/finance/payee-meta";

const LABEL: Record<string, string> = { entries: "Catatan", accounts: "Dompet", categories: "Kategori", budgets: "Anggaran", goals: "Tujuan", debts: "Hutang dan piutang", loans: "Pinjaman", bills: "Tagihan", assets: "Aset" };
const ORDER = ["entries", "accounts", "categories", "budgets", "goals", "debts", "loans", "bills", "assets"] as const;
type Step = "home" | "making" | "made" | "reading" | "preview" | "restoring" | "restored" | "error";
type Preview = { exportedAt: string | null; add: Record<string, number>; have: Record<string, number> };
const kb = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

function Tile({ label, n }: { label: string; n: number }) { const v = Math.round(useTween(n, 700)); return <div className="t"><b>{v.toLocaleString("id-ID")}</b><small>{label}</small></div>; }
function Spinner({ text, sub }: { text: string; sub: string }) {
  return <motion.div className="dpx-bk-wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status" aria-live="polite">
    <div className="pack" aria-hidden="true"><i /><i /><i /><u /></div><b>{text}</b><small>{sub}</small><div className="bar" aria-hidden="true"><u /></div>
  </motion.div>;
}

/** A complete copy of the person's finance data in one file, and the safe way back in: restoring only adds what is missing, never overwrites or deletes. */
export function BackupSheet({ ctx, onClose }: { ctx: FinCtx; onClose: () => void }) {
  const { fin } = ctx, [step, setStep] = useState<Step>("home"), [err, setErr] = useState(""), file = useRef<HTMLInputElement>(null);
  const [made, setMade] = useState<{ name: string; size: number; summary: Record<string, number> } | null>(null);
  const [text, setText] = useState(""), [prev, setPrev] = useState<Preview | null>(null), [result, setResult] = useState<Record<string, number> | null>(null);
  const mine: Record<string, number> = { entries: fin.raw.entries.length, accounts: fin.raw.accounts.length, categories: fin.raw.categories.length, budgets: fin.raw.budgets.length, goals: fin.raw.goals.length, debts: fin.raw.debts.length, loans: fin.raw.loans.length, bills: fin.raw.bills.length, assets: fin.raw.assets.length };
  const fail = (m: string) => { setErr(m); setStep("error"); };

  const download = async () => {
    setStep("making");
    const began = Date.now();
    try {
      const res = await fetch("/api/finance/backup", { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.text(), json = JSON.parse(body) as { exportedAt: string; summary: Record<string, number> };
      await new Promise((r) => setTimeout(r, Math.max(0, 1100 - (Date.now() - began))));   // a quick answer still shows what is happening
      const name = `djiwa-pay-cadangan-${json.exportedAt.slice(0, 10)}.json`, url = URL.createObjectURL(new Blob([body], { type: "application/json" })), a = document.createElement("a");
      a.href = url; a.download = name; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setMade({ name, size: body.length, summary: json.summary }); setStep("made");
    } catch { fail("Cadangan belum bisa dibuat. Periksa koneksi lalu coba lagi."); }
  };

  const pick = (f: File | undefined) => {
    if (!f) return;
    setStep("reading");
    void f.text().then(async (t) => {
      let json: { app?: string };
      try { json = JSON.parse(t); } catch { return fail("Berkas ini bukan cadangan Djiwa Pay (bukan JSON yang sah)."); }
      if (json.app !== "djiwa-pay") return fail("Berkas ini bukan cadangan Djiwa Pay.");
      try {
        const r = await fetch("/api/finance/restore/preview", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: t });
        const out = (await r.json()) as { success?: boolean; error?: string } & Preview;
        if (!r.ok || !out.success) return fail(out.error === "FORMAT_UNSUPPORTED" ? "Format cadangan ini dari versi yang belum didukung." : "Berkas cadangan tidak lengkap atau rusak.");
        setText(t); setPrev(out); setStep("preview");
      } catch { fail("Belum bisa memeriksa berkas. Coba lagi."); }
    }, () => fail("Berkas tidak bisa dibaca."));
  };

  const restore = async () => {
    setStep("restoring");
    const began = Date.now();
    try {
      const r = await fetch("/api/finance/restore", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: text });
      const out = (await r.json()) as { success?: boolean; added?: Record<string, number> };
      if (!r.ok || !out.success) throw new Error("restore");
      await Promise.all([fin.retrySync(), syncPayeeMeta(fin.profileId, true), ctx.disc.refresh()]);
      await new Promise((res) => setTimeout(res, Math.max(0, 1400 - (Date.now() - began))));
      setResult(out.added ?? {}); setStep("restored");
    } catch { fail("Pemulihan belum berhasil. Datamu yang sekarang tidak berubah. Coba lagi."); }
  };

  const total = prev ? ORDER.reduce((s, k) => s + (prev.add[k] ?? 0), 0) : 0;
  return <Sheet title="Cadangan dan pemulihan" onClose={onClose}>
    <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    <AnimatePresence mode="wait" initial={false}>
      {step === "home" ? <motion.div key="home" className="dpx-bk" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
        <p className="dpx-sub" style={{ marginTop: -6 }}>Satu berkas berisi semua yang tersimpan di akunmu. Cocok sebagai pegangan, dan untuk pindah akun atau perangkat.</p>
        <div className="tiles">{ORDER.map((k) => <Tile key={k} label={LABEL[k]} n={mine[k]} />)}</div>
        <ul className="incl"><li><Ic n="check" size="sm" />Catatan, dompet, kategori, anggaran, tujuan, hutang, tagihan, pinjaman, aset, kantong</li><li><Ic n="check" size="sm" />Aturan toko, jenis dan label penerima, transaksi saham</li><li><Ic n="shield" size="sm" />Tanpa kata sandi, token, atau alamat email</li></ul>
        <Btn type="button" className="dpx-btn" onClick={() => void download()} whileTap={{ scale: 0.98 }}><Ic n="dl" size="sm" /> Unduh cadangan lengkap</Btn>
        <div className="dpx-glabel" style={{ marginTop: 18 }}>Pulihkan dari cadangan</div>
        <p className="dpx-hint" style={{ margin: "0 4px 8px" }}>Hanya <b>menambahkan</b> yang belum ada. Tidak menghapus atau menimpa apa pun, jadi aman di akun yang sedang dipakai maupun akun baru.</p>
        <Btn type="button" className="dpx-btn dpx-soft" onClick={() => file.current?.click()} whileTap={{ scale: 0.98 }}><Ic n="up" size="sm" /> Pilih berkas cadangan</Btn>
      </motion.div> : null}
      {step === "making" ? <Spinner key="making" text="Menyiapkan cadangan…" sub="Mengumpulkan semua data akunmu" /> : null}
      {step === "reading" ? <Spinner key="reading" text="Memeriksa berkas…" sub="Belum ada yang diubah" /> : null}
      {step === "restoring" ? <Spinner key="restoring" text="Menggabungkan data…" sub="Menambahkan yang belum ada, tanpa menimpa" /> : null}
      {step === "made" && made ? <motion.div key="made" className="dpx-bk ok" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
        <span className="burst"><motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring, delay: 0.08 }}><Ic n="check" size="lg" /></motion.span></span>
        <b>Cadangan tersimpan</b><small>{made.name} · {kb(made.size)}</small>
        <div className="tiles">{ORDER.map((k) => <Tile key={k} label={LABEL[k]} n={made.summary[k] ?? 0} />)}</div>
        <p className="dpx-hint">Simpan di tempat aman (Files, Drive, atau kirim ke dirimu sendiri). Berkas ini berisi data keuanganmu, jadi jangan dibagikan ke orang lain.</p>
        <Btn type="button" className="dpx-btn" onClick={onClose}>Selesai</Btn>
      </motion.div> : null}
      {step === "preview" && prev ? <motion.div key="preview" className="dpx-bk" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
        <p className="dpx-sub" style={{ marginTop: -6 }}>Cadangan{prev.exportedAt ? ` tanggal ${new Date(prev.exportedAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}` : ""}. Berikut yang akan ditambahkan:</p>
        <ul className="diff">{ORDER.filter((k) => (prev.have[k] ?? 0) > 0).map((k, i) => <motion.li key={k} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: i * 0.05 }}>
          <span>{LABEL[k]}</span><span className="bar"><motion.i initial={{ width: 0 }} animate={{ width: `${prev.have[k] ? Math.round(((prev.add[k] ?? 0) / prev.have[k]) * 100) : 0}%` }} transition={{ duration: 0.7, delay: 0.1 + i * 0.05 }} /></span>
          <b>+{(prev.add[k] ?? 0).toLocaleString("id-ID")}<small> dari {prev.have[k].toLocaleString("id-ID")}</small></b></motion.li>)}</ul>
        {total === 0 ? <div className="dpx-note dpx-info"><Ic n="info" /><div>Semua isi cadangan ini sudah ada di akunmu. Tidak ada yang perlu ditambahkan.</div></div> : null}
        <div className="dpx-flex dpx-mt"><Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} onClick={() => setStep("home")}>Batal</Btn>
          <Btn type="button" className="dpx-btn" style={{ margin: 0 }} disabled={total === 0} onClick={() => void restore()} whileTap={{ scale: 0.98 }}>Gabungkan {total.toLocaleString("id-ID")} data</Btn></div>
      </motion.div> : null}
      {step === "restored" && result ? <motion.div key="restored" className="dpx-bk ok" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
        <span className="burst"><motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring, delay: 0.08 }}><Ic n="check" size="lg" /></motion.span></span>
        <b>Data digabungkan</b><small>{ORDER.reduce((s, k) => s + (result[k] ?? 0), 0).toLocaleString("id-ID")} data baru ditambahkan</small>
        <div className="tiles">{ORDER.filter((k) => (result[k] ?? 0) > 0).map((k) => <Tile key={k} label={LABEL[k]} n={result[k]} />)}</div>
        <Btn type="button" className="dpx-btn" onClick={onClose}>Selesai</Btn>
      </motion.div> : null}
      {step === "error" ? <motion.div key="error" className="dpx-bk" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div>{err}</div></div>
        <Btn type="button" className="dpx-btn" onClick={() => setStep("home")}>Kembali</Btn>
      </motion.div> : null}
    </AnimatePresence>
  </Sheet>;
}
