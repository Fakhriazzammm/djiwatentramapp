import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Btn, Ic } from "../shell/dpx-ui";
import { registerPinRequester, type PinRequest } from "../../lib/pin";

/** Mounts once for the whole app: whoever needs the PIN asks through lib/pin and this pad answers. */
export function PinHost() {
  const [req, setReq] = useState<{ r: PinRequest; resolve: (pin: string | null) => void } | null>(null);
  useEffect(() => registerPinRequester((r) => new Promise<string | null>((resolve) => setReq({ r, resolve }))), []);
  if (!req || typeof document === "undefined") return null;
  return createPortal(<PinPad key={`${req.r.mode}-${req.r.error ?? ""}-${req.r.reason}`} request={req.r} onDone={(pin) => { req.resolve(pin); setReq(null); }} />, document.body);
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"] as const;

export function PinPad({ request, onDone }: { request: PinRequest; onDone: (pin: string | null) => void }) {
  const create = request.mode === "create";
  const [digits, setDigits] = useState(""), [first, setFirst] = useState<string | null>(null), [error, setError] = useState(request.error ?? "");
  const title = create ? (first ? "Ulangi PIN" : "Buat PIN") : "Masukkan PIN";
  const hint = create ? (first ? "Masukkan PIN yang sama sekali lagi." : "6 angka untuk mengamankan pembayaran dan data pribadimu.") : request.reason;
  const press = useCallback((k: string) => {
    setError((e) => (e && k !== "⌫" ? "" : e));
    setDigits((d) => {
      if (k === "⌫") return d.slice(0, -1);
      if (!/^\d$/.test(k) || d.length >= 6) return d;
      return d + k;
    });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === "Backspace") press("⌫"); else if (e.key === "Escape") onDone(null); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [press, onDone]);
  useEffect(() => {
    if (digits.length !== 6) return;
    if (!create) { const t = window.setTimeout(() => onDone(digits), 120); return () => window.clearTimeout(t); }
    if (!first) { const t = window.setTimeout(() => { setFirst(digits); setDigits(""); }, 160); return () => window.clearTimeout(t); }
    const t = window.setTimeout(() => { if (digits === first) onDone(digits); else { setError("PIN tidak sama. Ulangi dari awal."); setFirst(null); setDigits(""); } }, 160);
    return () => window.clearTimeout(t);
  }, [digits]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="dpx dpx-pin" role="dialog" aria-modal="true" aria-label={title}>
    <div className="dpx-pin-card">
      <Btn type="button" className="dpx-pin-x" onClick={() => onDone(null)} aria-label="Batal"><Ic n="close" size="sm" /></Btn>
      <span className="dpx-pin-ic"><Ic n="shield" /></span>
      <h2>{title}</h2>
      <p className="dpx-sub">{hint}</p>
      <div className={`dpx-pin-dots ${error ? "bad" : ""}`} aria-live="polite" aria-label={`${digits.length} dari 6 angka`}>{Array.from({ length: 6 }, (_, i) => <i key={i} className={i < digits.length ? "on" : ""} />)}</div>
      <p className="dpx-pin-err" role="alert">{error}</p>
      <div className="dpx-pin-keys">{KEYS.map((k, i) => k === "" ? <span key={i} /> : <Btn key={i} type="button" className="dpx-pin-key" onClick={() => press(k)} aria-label={k === "⌫" ? "Hapus angka" : k}>{k}</Btn>)}</div>
      {create ? null : <Btn type="button" className="dpx-linkbtn" onClick={() => { onDone(null); window.location.assign("/akun?keamanan=1"); }}>Lupa PIN?</Btn>}
    </div>
  </div>;
}
