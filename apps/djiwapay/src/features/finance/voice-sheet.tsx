import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Btn, Ic, Sheet } from "../shell/dpx-ui";
import { speechCtor, type SpeechRecognitionLike } from "./fin-sheets";
import { parseEntries } from "../../lib/finance/parse";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { Account, Category } from "../../lib/finance/types";

const BARS = 28;
type Phase = "idle" | "listening" | "review";

/**
 * Voice entry in its own sheet: the microphone level drives a live waveform, the words appear as they are spoken,
 * and what the sentence will become (amounts and titles) is shown before anything is saved.
 */
export function VoiceSheet({ accounts, categories, onClose, onUse }: { accounts: Pick<Account, "id" | "name">[]; categories: Pick<Category, "id" | "name" | "income">[]; onClose: () => void; onUse: (text: string) => void }) {
  const supported = typeof window !== "undefined" && speechCtor() !== null;
  const [phase, setPhase] = useState<Phase>("idle"), [text, setText] = useState(""), [interim, setInterim] = useState(""), [error, setError] = useState(""), [lvl, setLvl] = useState(0);
  const phaseRef = useRef<Phase>("idle"), rec = useRef<SpeechRecognitionLike | null>(null), base = useRef(""), stream = useRef<MediaStream | null>(null), ctx = useRef<AudioContext | null>(null), analyser = useRef<AnalyserNode | null>(null), raf = useRef(0);
  const bars = useRef<(HTMLElement | null)[]>([]), stage = useRef<HTMLDivElement>(null), analyserOk = useRef(false);
  const setP = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const stopAudio = useCallback(() => {
    cancelAnimationFrame(raf.current); analyserOk.current = false;
    stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null;
    void ctx.current?.close().catch(() => undefined); ctx.current = null; analyser.current = null;
  }, []);
  const draw = useCallback(() => {
    const t = performance.now() / 1000, data = analyser.current ? new Uint8Array(analyser.current.frequencyBinCount) : null;
    if (data && analyser.current) analyser.current.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < BARS; i += 1) {
      const live = data ? data[Math.min(data.length - 1, Math.floor((i / BARS) * data.length * 0.8))] / 255 : 0;
      const idle = 0.08 + 0.05 * Math.sin(t * 2.2 + i * 0.5);
      const v = phaseRef.current === "listening" ? Math.max(idle, analyserOk.current ? live : 0.14 + 0.1 * Math.abs(Math.sin(t * 5 + i))) : idle;
      sum += v; const el = bars.current[i]; if (el) el.style.transform = `scaleY(${Math.min(1, 0.1 + v * 0.95).toFixed(3)})`;
    }
    const level = phaseRef.current === "listening" ? Math.min(1, sum / BARS * (analyserOk.current ? 1.6 : 1)) : 0;
    stage.current?.style.setProperty("--lvl", level.toFixed(3)); setLvl(level);
    raf.current = requestAnimationFrame(draw);
  }, []);
  useEffect(() => { raf.current = requestAnimationFrame(draw); return () => { cancelAnimationFrame(raf.current); rec.current?.stop(); stopAudio(); }; }, [draw, stopAudio]);

  const finish = useCallback(() => { rec.current?.stop(); stopAudio(); setInterim(""); setP("review"); }, [stopAudio]);
  const start = useCallback(async () => {
    setError("");
    const Ctor = speechCtor();
    if (!Ctor) { setP("review"); setError("Perangkat ini belum bisa mengenali suara. Ketik kalimatnya di bawah."); return; }
    base.current = text.trim(); setInterim(""); setP("listening");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s; const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const c = new AC(); ctx.current = c; const a = c.createAnalyser(); a.fftSize = 128; a.smoothingTimeConstant = 0.6; c.createMediaStreamSource(s).connect(a); analyser.current = a; analyserOk.current = true;
    } catch { analyserOk.current = false; }   // no level meter (permission or device): the waveform animates gently and recognition still runs
    const r = new Ctor(); r.lang = "id-ID"; r.interimResults = true; r.continuous = true;
    r.onresult = (e) => {
      const list = Array.from(e.results) as unknown as { 0: { transcript: string }; isFinal?: boolean }[];
      const done = list.filter((x) => x.isFinal).map((x) => x[0].transcript.trim()).join(" "), pending = list.filter((x) => !x.isFinal).map((x) => x[0].transcript.trim()).join(" ");
      setText([base.current, done].filter(Boolean).join(" ")); setInterim(pending);
    };
    r.onend = () => { if (phaseRef.current === "listening") finish(); };
    r.onerror = (ev) => {
      const code = ev?.error;
      if (code === "no-speech") return;
      setError(code === "not-allowed" || code === "service-not-allowed" ? "Izin mikrofon ditolak. Aktifkan izin mikrofon untuk situs ini, lalu coba lagi." : code === "audio-capture" ? "Mikrofon tidak ditemukan." : "Suara belum bisa diproses. Coba lagi atau ketik saja.");
      finish();
    };
    rec.current = r; try { r.start(); } catch { setError("Mikrofon sedang dipakai. Coba lagi."); finish(); }
  }, [text, finish]);
  useEffect(() => { if (supported) void start(); else { setP("review"); setError("Perangkat ini belum bisa mengenali suara. Ketik kalimatnya di bawah."); } }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const shown = [text, interim].filter(Boolean).join(" ");
  const parsed = useMemo(() => parseEntries(phase === "review" ? text : shown, accounts, categories), [phase, text, shown, accounts, categories]);
  const listening = phase === "listening";
  return <Sheet title="Bicara" onClose={onClose}>
    <div className="dpx-vc">
      <div className="dpx-vc-stage" ref={stage} style={{ ["--lvl" as string]: 0 }}>
        <i className="dpx-vc-ring" /><i className="dpx-vc-ring b" />
        <button type="button" className={`dpx-vc-mic ${listening ? "on" : ""}`} onClick={() => (listening ? finish() : void start())} aria-label={listening ? "Berhenti mendengarkan" : "Mulai bicara"}>{listening ? <span className="dpx-vc-stop" /> : <Ic n="mic" />}</button>
      </div>
      <div className="dpx-vc-bars" aria-hidden="true">{Array.from({ length: BARS }, (_, i) => <i key={i} ref={(el) => { bars.current[i] = el; }} />)}</div>
      <p className="dpx-vc-status" role="status">{listening ? (shown ? "Mendengarkan… ketuk bulat untuk selesai" : lvl > 0.12 ? "Terdengar. Silakan bicara…" : "Mendengarkan… coba katakan: kopi 25 ribu") : phase === "review" ? (text ? "Periksa kalimatmu, lalu lanjut" : "Ketuk mikrofon untuk bicara") : "Menyiapkan mikrofon…"}</p>
      {error ? <div className="dpx-note dpx-danger" role="alert" style={{ marginTop: 0 }}><Ic n="warn" /><div>{error}</div></div> : null}
      <div className={`dpx-vc-text ${listening ? "live" : ""}`}>
        {listening ? <p>{text ? <>{text} </> : null}<span className="dpx-vc-interim">{interim}</span>{!shown ? <span className="dpx-vc-hint">Kalimatmu muncul di sini saat kamu bicara.</span> : null}</p>
          : <textarea className="dpx-textarea" aria-label="Hasil suara, bisa diubah" placeholder="Ketik atau bicara: kopi 25rb dan parkir 5rb" value={text} onChange={(e) => setText(e.target.value)} />}
      </div>
      {parsed.length ? <div className="dpx-vc-chips" aria-label="Yang akan dicatat">{parsed.map((p, i) => <span key={i} className={p.kind === "in" ? "in" : ""}><b>{p.title}</b> {p.kind === "in" ? "+" : ""}{rupiah(p.amount)}</span>)}</div> : (phase === "review" && text.trim() ? <p className="dpx-sub dpx-center" style={{ margin: 0 }}>Belum ada nominal. Sebut jumlahnya, misalnya “25 ribu”.</p> : null)}
      <div className="dpx-flex">
        {listening ? <Btn type="button" className="dpx-btn" style={{ margin: 0, flex: 1 }} onClick={finish}>Selesai</Btn> : <>
          <Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0, flex: 1 }} onClick={() => void start()} disabled={!supported}><Ic n="mic" size="sm" /> {text.trim() ? "Tambah lagi" : "Bicara"}</Btn>
          <Btn type="button" className={`dpx-btn ${text.trim() ? "" : "dpx-off"}`} style={{ margin: 0, flex: 1 }} disabled={!text.trim()} onClick={() => onUse(text.trim())}>Lanjut</Btn></>}
      </div>
    </div>
  </Sheet>;
}
