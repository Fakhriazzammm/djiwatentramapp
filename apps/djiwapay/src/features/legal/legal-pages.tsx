import { LEGAL_UPDATED, PRIVACY, TERMS, type Section } from "../../lib/legal-content";

/** Public pages (no sign-in): Google and the people who use the app can read them before connecting anything. */
export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const sections: Section[] = kind === "privacy" ? PRIVACY : TERMS;
  const title = kind === "privacy" ? "Kebijakan Privasi" : "Syarat Layanan";
  const back = () => { if (window.history.length > 1) window.history.back(); else window.location.assign("/"); };
  return <div className="dpx"><div className="dpx-page"><div className="dpx-sky dpx-legal"><div className="dpx-pad dpx-nobar">
    <div className="dpx-hdr"><button type="button" className="dpx-rb" onClick={back} aria-label="Kembali">‹</button><div className="dpx-grow"><h1>{title}</h1></div><span style={{ width: 44 }} /></div>
    <p className="dpx-sub" style={{ margin: "0 4px 6px" }}>Djiwa Pay · berlaku sejak {LEGAL_UPDATED}</p>
    <article className="dpx-legal-body">{sections.map((s) => <section key={s.title}><h2>{s.title}</h2>{s.body.map((p, i) => <p key={i}>{p}</p>)}</section>)}</article>
    <nav className="dpx-legal-foot" aria-label="Dokumen lain"><a href={kind === "privacy" ? "/syarat" : "/privasi"}>{kind === "privacy" ? "Syarat Layanan" : "Kebijakan Privasi"}</a><a href="/">Kembali ke Djiwa Pay</a></nav>
  </div></div></div></div>;
}
