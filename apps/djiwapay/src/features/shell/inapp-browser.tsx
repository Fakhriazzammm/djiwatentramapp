import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, Ic, spring } from "./dpx-ui";
import { closeArticle, loadArticleInfo, useOpenArticle, type ArticleInfo } from "../../lib/inapp";

/** A small in-app browser. Sites that allow framing open as they are; the others show their headline and opening, with a clear way to the full page. */
export function InAppBrowserHost() {
  const art = useOpenArticle();
  if (typeof document === "undefined") return null;
  return createPortal(<AnimatePresence>{art ? <Browser key={art.url} url={art.url} title={art.title} /> : null}</AnimatePresence>, document.body);
}

function Browser({ url, title }: { url: string; title?: string }) {
  const [info, setInfo] = useState<ArticleInfo | null | undefined>(undefined), [loaded, setLoaded] = useState(false), [slow, setSlow] = useState(false), [nonce, setNonce] = useState(0);
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const done = useRef(false);
  useEffect(() => { let alive = true; void loadArticleInfo(url).then((i) => { if (alive) setInfo(i); }); return () => { alive = false; }; }, [url]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeArticle(); }; window.addEventListener("keydown", onKey); const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; }; }, []);
  useEffect(() => { if (!info?.embeddable) return; setLoaded(false); setSlow(false); done.current = false; const t = window.setTimeout(() => { if (!done.current) setSlow(true); }, 10000); return () => window.clearTimeout(t); }, [info, nonce]);
  const external = () => window.open(url, "_blank", "noopener,noreferrer");
  const reader = info === null || (info && !info.embeddable);
  return <motion.div className="dpx dpx-ib" role="dialog" aria-modal="true" aria-label={title ?? host} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ ...spring, stiffness: 300, damping: 34 }}>
    <div className="dpx-ib-bar">
      <Btn type="button" className="dpx-ib-done" onClick={closeArticle}><Ic n="back" size="sm" /> Kembali</Btn>
      <span className="dpx-ib-host"><i aria-hidden="true">🔒</i>{host}</span>
      <Btn type="button" className="dpx-ib-tool" onClick={() => setNonce((n) => n + 1)} aria-label="Muat ulang" disabled={reader || info === undefined}><Ic n="refresh" size="sm" /></Btn>
      <Btn type="button" className="dpx-ib-tool" onClick={external} aria-label="Buka di browser"><Ic n="share" size="sm" /></Btn>
    </div>
    <div className="dpx-ib-body">
      {info === undefined ? <div className="dpx-ib-wait"><div className="dpx-as-spin" aria-hidden="true" /><span>Membuka {host}…</span></div> : null}
      {info?.embeddable ? <>
        <iframe key={nonce} title={title ?? host} src={url} sandbox="allow-scripts allow-same-origin allow-popups allow-forms" referrerPolicy="no-referrer" onLoad={() => { done.current = true; setLoaded(true); setSlow(false); }} />
        {!loaded ? <div className="dpx-ib-wait over"><div className="dpx-as-spin" aria-hidden="true" /><span>{slow ? "Halaman lambat dimuat." : `Membuka ${host}…`}</span>{slow ? <Btn type="button" className="dpx-btn dpx-soft" onClick={external}>Buka di browser</Btn> : null}</div> : null}
      </> : null}
      {reader ? <article className="dpx-ib-reader">
        {info?.image ? <img src={info.image} alt="" referrerPolicy="no-referrer" /> : null}
        <small>{info?.site || host}{info?.published ? ` · ${new Date(info.published).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</small>
        <h1>{info?.title || title || "Artikel"}</h1>
        {info?.description ? <p className="dpx-ib-desc">{info.description}</p> : null}
        {info?.lead.map((t, i) => <p key={i}>{t}</p>)}
        <div className="dpx-ib-note"><Ic n="info" size="sm" /><span>{info ? `${info.site || host} tidak mengizinkan artikelnya dibuka di dalam aplikasi lain. Ini ringkasan awalnya.` : "Artikel belum bisa dimuat di sini."}</span></div>
        <Btn type="button" className="dpx-btn" onClick={external}>Baca artikel lengkap di {info?.site || host}</Btn>
        <Btn type="button" className="dpx-btn dpx-soft" onClick={closeArticle}>Kembali ke Djiwa Pay</Btn>
      </article> : null}
    </div>
  </motion.div>;
}
