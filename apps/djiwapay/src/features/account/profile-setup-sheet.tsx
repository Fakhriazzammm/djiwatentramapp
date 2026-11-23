import { useEffect, useState } from "react";
import { Btn, Ic, Sheet } from "../shell/dpx-ui";
import { PinCancelled, pinGuarded, pinMessage } from "../../lib/pin";

type Account = { profile: { name: string | null; phone: string | null }; pin: { set: boolean } };
const SKIP_KEY = "dp-setup-skipped";
const ERR: Record<string, string> = { INVALID_NAME: "Nama minimal 2 huruf.", INVALID_PHONE: "Nomor tidak valid. Contoh: 081234567890.", PHONE_TAKEN: "Nomor ini sudah dipakai akun lain." };
const api = (path: string, init?: RequestInit) => fetch(`/api/pay-bridge${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
const phoneOk = (v: string) => { const d = v.replace(/\D/g, "").replace(/^62/, "0"); return /^08\d{8,12}$/.test(d); };
const skipped = () => { try { return sessionStorage.getItem(SKIP_KEY) === "1"; } catch { return false; } };

/**
 * Shown right after sign-up or sign-in when the account still lacks what payments need: a name, a WhatsApp number and a PIN.
 * Saving always goes through the PIN (created first when there is none), the same rule as editing the profile later.
 */
export function ProfileSetupSheet({ onSaved }: { onSaved?: () => void }) {
  const [acc, setAcc] = useState<Account | null>(null), [open, setOpen] = useState(false), [name, setName] = useState(""), [phone, setPhone] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [done, setDone] = useState(false);
  useEffect(() => {
    if (skipped()) return;
    api("/account").then((r) => r.json()).then((b) => { if (!b?.success) return; const a = b as Account; setAcc(a); setName(a.profile.name ?? ""); setPhone(a.profile.phone ?? ""); setOpen(!a.profile.name || a.profile.name.trim().length < 2 || !a.profile.phone || !a.pin.set); }).catch(() => undefined);
  }, []);
  if (!open || !acc) return null;
  const needName = !acc.profile.name || acc.profile.name.trim().length < 2, needPhone = !acc.profile.phone, needPin = !acc.pin.set;
  const close = () => { try { sessionStorage.setItem(SKIP_KEY, "1"); } catch { /* ignore */ } setOpen(false); };
  const valid = name.trim().length >= 2 && phoneOk(phone);
  const save = async () => {
    if (!valid) { setErr(name.trim().length < 2 ? ERR.INVALID_NAME : ERR.INVALID_PHONE); return; }
    setBusy(true); setErr("");
    try {
      const changes: Record<string, string> = {};
      if (name.trim() !== (acc.profile.name ?? "")) changes.name = name.trim();
      if (phone.trim() !== (acc.profile.phone ?? "")) changes.phone = phone.trim();
      const res = await pinGuarded("Simpan data pembayaran", (pin) => Object.keys(changes).length ? api("/account", { method: "PATCH", body: JSON.stringify({ ...changes, pin }) }) : Promise.resolve(new Response("{}", { status: 200 })));
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(ERR[body.error] ?? pinMessage(body) ?? "Belum bisa disimpan. Coba lagi."); return; }
      setDone(true); onSaved?.(); window.setTimeout(() => setOpen(false), 1400);
    } catch (e) { if (!(e instanceof PinCancelled)) setErr(e instanceof Error ? e.message : "Belum bisa disimpan. Coba lagi."); } finally { setBusy(false); }
  };
  return <Sheet title={done ? "Tersimpan" : "Lengkapi akunmu"} onClose={close} label="Lengkapi data akun">
    {done ? <p className="dpx-sub" role="status">Data dan PIN sudah tersimpan. Kamu bisa mengubahnya kapan saja di Akun › Data diri dan Keamanan.</p> : <>
      <p className="dpx-sub" style={{ margin: "0 4px 10px" }}>Biar pembayaran QRIS, top up, dan transaksi lancar, isi {[needName && "nama", needPhone && "nomor WhatsApp", needPin && "PIN 6 angka"].filter(Boolean).join(", ") || "datamu"}. {needPin ? "Setelah menekan Simpan, kamu diminta membuat PIN." : "Kamu akan diminta PIN untuk menyimpan."}</p>
      <label className="dpx-as-fld dpx-ac-fld"><span>Nama lengkap</span><input id="su-name" value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} /></label>
      <label className="dpx-as-fld dpx-ac-fld" style={{ marginTop: 8 }}><span>Nomor WhatsApp</span><input id="su-phone" value={phone} inputMode="tel" maxLength={20} autoComplete="tel" placeholder="081234567890" onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s-]/g, ""))} /><em className="dpx-sub">Dipakai untuk bukti pembayaran. Tidak dibagikan ke pihak lain.</em></label>
      {err ? <div className="dpx-note dpx-danger" role="alert" style={{ marginTop: 10 }}><Ic n="warn" /><div>{err}</div></div> : null}
      <Btn type="button" className={`dpx-btn ${busy || !valid ? "dpx-off" : ""}`} disabled={busy} onClick={() => void save()}>{busy ? "Menyimpan…" : needPin ? "Simpan dan buat PIN" : "Simpan"}</Btn>
      <Btn type="button" className="dpx-btn dpx-soft" disabled={busy} onClick={close}>Nanti saja</Btn>
    </>}
  </Sheet>;
}
