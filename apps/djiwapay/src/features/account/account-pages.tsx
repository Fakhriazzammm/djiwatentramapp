import { useEffect, useState, type ReactNode } from "react";
import { Btn, Header, Ic, Sky } from "../shell/dpx-ui";
import { authClient } from "../../lib/identity-adapter";
import { PinCancelled, PinError, changePin, getPinStatus, pinGuarded, pinMessage, requestPin, resetPin, type PinStatus } from "../../lib/pin";

type Notify = (text: string) => void;
type Profile = { name: string | null; nickname: string | null; email: string | null; phone: string | null; birthDate: string | null; gender: string | null; address: string | null; city: string | null; province: string | null; postalCode: string | null; marketingConsent: boolean; photoUrl: string | null };
type Account = { profile: Profile; methods: { password: boolean; google: boolean; emailVerified: boolean }; pin: PinStatus };

const api = (path: string, init?: RequestInit) => fetch(`/api/pay-bridge${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
async function loadAccount(): Promise<Account> {
  const res = await api("/account"); const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) throw new Error("Data akun belum bisa dimuat");
  return body as Account;
}
const ERR: Record<string, string> = {
  INVALID_NAME: "Nama minimal 2 huruf.", INVALID_PHONE: "Nomor telepon tidak valid. Contoh: 081234567890.", PHONE_TAKEN: "Nomor ini sudah dipakai akun lain.", INVALID_BIRTH_DATE: "Tanggal lahir tidak valid.", INVALID_GENDER: "Pilihan jenis kelamin tidak valid.",
  WEAK_PASSWORD: "Kata sandi minimal 8 karakter.", HAS_PASSWORD: "Akun ini sudah punya kata sandi. Pakai ubah kata sandi.", SESSION_REQUIRED: "Sesi masuk habis. Masuk ulang lalu coba lagi.", WALLET_NOT_EMPTY: "Saldo Djiwa Pay masih ada. Tarik atau pakai habis dulu.", CONFIRM_REQUIRED: "Ketik HAPUS untuk melanjutkan.",
};
const errText = (e: unknown, fallback: string) => (e instanceof PinCancelled ? "" : e instanceof Error ? e.message : fallback);

function Section({ title, children }: { title: string; children: ReactNode }) { return <><div className="dpx-glabel">{title}</div><div className="dpx-group dpx-white dpx-ac-group">{children}</div></>; }
function Field({ id, label, value, onChange, hint, type = "text", clear, inputMode, readOnly, maxLength }: { id: string; label: string; value: string; onChange?: (v: string) => void; hint?: string; type?: string; clear?: () => void; inputMode?: "numeric" | "tel" | "text"; readOnly?: boolean; maxLength?: number }) {
  return <label className="dpx-as-fld dpx-ac-fld"><span>{label}{clear && value ? <button type="button" className="dpx-ac-clear" onClick={clear}>Hapus</button> : null}</span>
    <input id={id} type={type} value={value} readOnly={readOnly} maxLength={maxLength} inputMode={inputMode} onChange={(e) => onChange?.(e.target.value)} />{hint ? <em className="dpx-sub">{hint}</em> : null}</label>;
}

/* ---------- Data diri ---------- */
export function ProfileEditPage({ onBack, notify }: { onBack: () => void; notify: Notify }) {
  const [acc, setAcc] = useState<Account | null>(null), [form, setForm] = useState<Profile | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => { loadAccount().then((a) => { setAcc(a); setForm(a.profile); }).catch((e) => setErr(errText(e, "Data akun belum bisa dimuat"))); }, []);
  if (!form || !acc) return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar"><Header title="Data diri" onBack={onBack} />{err ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div>{err}</div></div> : <p className="dpx-st-empty">Memuat…</p>}</div></Sky></div>;
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const diff = (): Record<string, unknown> => { const out: Record<string, unknown> = {}; (Object.keys(form) as (keyof Profile)[]).forEach((k) => { if (k !== "email" && k !== "photoUrl" && form[k] !== acc.profile[k]) out[k] = form[k] ?? ""; }); return out; };
  const save = async (changes: Record<string, unknown>, done = "Data diri disimpan") => {
    if (!Object.keys(changes).length) { notify("Belum ada perubahan"); return; }
    setBusy(true); setErr("");
    try {
      const send = (pin?: string) => api("/account", { method: "PATCH", body: JSON.stringify({ ...changes, ...(pin ? { pin } : {}) }) });
      const res = "phone" in changes || "name" in changes ? await pinGuarded("Konfirmasi perubahan data diri", (pin) => send(pin)) : await send();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(ERR[body.error] ?? "Belum bisa disimpan. Coba lagi."); return; }
      const fresh = await loadAccount(); setAcc(fresh); setForm(fresh.profile); notify(done);
    } catch (e) { setErr(errText(e, "Belum bisa disimpan. Coba lagi.")); } finally { setBusy(false); }
  };
  return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar">
    <Header title="Data diri" onBack={onBack} />
    <p className="dpx-sub" style={{ margin: "0 4px 8px" }}>Satu akun untuk Djiwa Pay, Djiwa Tentram, dan Djiwa Travel. Perubahan di sini berlaku di semuanya.</p>
    <Section title="Identitas">
      <Field id="ac-name" label="Nama lengkap" value={form.name ?? ""} onChange={(v) => set("name", v)} maxLength={80} />
      <Field id="ac-nick" label="Nama panggilan" value={form.nickname ?? ""} onChange={(v) => set("nickname", v)} maxLength={30} clear={() => set("nickname", "")} />
      <Field id="ac-email" label="Email" value={form.email ?? ""} readOnly hint={acc.methods.emailVerified ? "Terverifikasi. Email dipakai untuk masuk dan tidak bisa diubah di sini." : "Email dipakai untuk masuk dan tidak bisa diubah di sini."} />
      <Field id="ac-phone" label="Nomor WhatsApp / telepon" value={form.phone ?? ""} onChange={(v) => set("phone", v.replace(/[^\d+\s-]/g, ""))} inputMode="tel" maxLength={20} clear={() => set("phone", "")} hint="Mengubah nama atau nomor meminta PIN." />
    </Section>
    <Section title="Data pribadi">
      <Field id="ac-birth" label="Tanggal lahir" type="date" value={form.birthDate ?? ""} onChange={(v) => set("birthDate", v)} clear={() => set("birthDate", "")} />
      <label className="dpx-as-fld dpx-ac-fld"><span>Jenis kelamin{form.gender ? <button type="button" className="dpx-ac-clear" onClick={() => set("gender", "")}>Hapus</button> : null}</span>
        <select id="ac-gender" value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value)}><option value="">Tidak diisi</option><option value="female">Perempuan</option><option value="male">Laki-laki</option><option value="other">Lainnya</option></select></label>
      <Field id="ac-addr" label="Alamat" value={form.address ?? ""} onChange={(v) => set("address", v)} maxLength={200} clear={() => set("address", "")} />
      <div className="dpx-as-two"><Field id="ac-city" label="Kota" value={form.city ?? ""} onChange={(v) => set("city", v)} maxLength={60} /><Field id="ac-prov" label="Provinsi" value={form.province ?? ""} onChange={(v) => set("province", v)} maxLength={60} /></div>
      <Field id="ac-zip" label="Kode pos" value={form.postalCode ?? ""} onChange={(v) => set("postalCode", v.replace(/\D/g, ""))} inputMode="numeric" maxLength={10} />
    </Section>
    <Section title="Pemberitahuan">
      <Btn type="button" className="dpx-opt" onClick={() => set("marketingConsent", !form.marketingConsent)} aria-pressed={form.marketingConsent}><span className="dpx-main"><b>Kabar promo dan penawaran</b><span>{form.marketingConsent ? "Aktif" : "Nonaktif"}</span></span><span className="dpx-radio" style={form.marketingConsent ? { borderColor: "var(--blue)", background: "var(--blue)" } : undefined} /></Btn>
    </Section>
    {err ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div>{err}</div></div> : null}
    <Btn type="button" className={`dpx-btn ${busy ? "dpx-off" : ""}`} disabled={busy} onClick={() => void save(diff())}>{busy ? "Menyimpan…" : "Simpan perubahan"}</Btn>
    <Btn type="button" className="dpx-btn dpx-soft" disabled={busy} onClick={() => void save({ nickname: "", birthDate: "", gender: "", address: "", city: "", province: "", postalCode: "" }, "Data pribadi dihapus")}>Hapus data pribadi opsional</Btn>
  </div></Sky></div>;
}

/* ---------- Keamanan ---------- */
export function SecurityPage({ onBack, notify }: { onBack: () => void; notify: Notify }) {
  const [acc, setAcc] = useState<Account | null>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<null | "password" | "reset" | "delete">(null);
  const [forgot, setForgot] = useState(false), [pw, setPw] = useState({ current: "", next: "", again: "" }), [forgotPw, setForgotPw] = useState(""), [confirm, setConfirm] = useState("");
  const reload = () => loadAccount().then(setAcc).catch((e) => setErr(errText(e, "Data akun belum bisa dimuat")));
  useEffect(() => { void reload(); }, []);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(""); try { await fn(); } catch (e) { setErr(errText(e, "Belum berhasil. Coba lagi.")); } finally { setBusy(false); } };
  if (!acc) return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar"><Header title="Keamanan" onBack={onBack} />{err ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div>{err}</div></div> : <p className="dpx-st-empty">Memuat…</p>}</div></Sky></div>;

  const createPinFlow = () => run(async () => {
    const res = await pinGuarded("Buat PIN", async () => new Response(JSON.stringify({ success: true }), { status: 200 }));   // creates the PIN first, then the no-op passes
    void res; await reload(); notify("PIN dibuat");
  });
  const changePinFlow = () => run(async () => {
    const old = await requestPin({ reason: "Masukkan PIN lama", mode: "enter" }); if (!old) return;
    const next = await requestPin({ reason: "PIN baru", mode: "create" }); if (!next) return;
    await changePin(old, next); notify("PIN diubah"); await reload();
  });
  const resetPinFlow = () => run(async () => {
    const next = await requestPin({ reason: "PIN baru", mode: "create" }); if (!next) return;
    await resetPin(forgotPw, next); setForgotPw(""); setPanel(null); notify("PIN baru dibuat"); await reload();
  });
  const savePassword = () => run(async () => {
    if (pw.next.length < 8) { setErr(ERR.WEAK_PASSWORD); return; }
    if (pw.next !== pw.again) { setErr("Kata sandi baru tidak sama."); return; }
    if (acc.methods.password && forgot) {
      const res = await pinGuarded("Atur ulang kata sandi", (pin) => api("/account/password/reset", { method: "POST", body: JSON.stringify({ newPassword: pw.next, pin }) }));
      const body = await res.json().catch(() => ({})); if (!res.ok) { setErr(ERR[body.error] ?? pinMessage(body)); return; }
    } else if (acc.methods.password) {
      const r = await authClient.changePassword({ currentPassword: pw.current, newPassword: pw.next, revokeOtherSessions: false });
      if (r.error) { setErr(r.error.message ?? "Kata sandi lama salah."); return; }
    } else {
      const res = await pinGuarded("Atur kata sandi", (pin) => api("/account/password", { method: "POST", body: JSON.stringify({ newPassword: pw.next, pin }) }));
      const body = await res.json().catch(() => ({})); if (!res.ok) { setErr(ERR[body.error] ?? pinMessage(body)); return; }
    }
    setPw({ current: "", next: "", again: "" }); setForgot(false); setPanel(null); notify(acc.methods.password ? "Kata sandi diubah" : "Kata sandi dibuat. Sekarang kamu bisa masuk dengan email dan kata sandi."); await reload();
  });
  const deleteAccount = () => run(async () => {
    if (confirm !== "HAPUS") { setErr(ERR.CONFIRM_REQUIRED); return; }
    const res = await pinGuarded("Hapus akun", (pin) => api("/account/delete", { method: "POST", body: JSON.stringify({ confirm, pin }) }));
    const body = await res.json().catch(() => ({})); if (!res.ok) { setErr(ERR[body.error] ?? "Akun belum bisa dihapus."); return; }
    await authClient.signOut().catch(() => undefined); window.location.assign("/");
  });

  return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar">
    <Header title="Keamanan" onBack={onBack} />
    <Section title="PIN pembayaran">
      <div className="dpx-ac-row"><span className="dpx-cat dpx-c-emerald"><Ic n="shield" /></span><div><b>{acc.pin.set ? "PIN aktif" : "PIN belum dibuat"}</b><span className="dpx-sub">{acc.pin.set ? "Diminta untuk bayar, transfer, tarik saldo, dan ubah data penting." : "Buat PIN 6 angka. Pembayaran dengan saldo butuh PIN."}</span></div></div>
      {acc.pin.set ? <div className="dpx-as-chips"><Btn type="button" className="dpx-chip3" disabled={busy} onClick={() => void changePinFlow()}>Ubah PIN</Btn><Btn type="button" className="dpx-chip3" onClick={() => setPanel(panel === "reset" ? null : "reset")}>Lupa PIN</Btn></div> : <Btn type="button" className="dpx-btn" disabled={busy} onClick={() => void createPinFlow()}>Buat PIN</Btn>}
      {panel === "reset" ? <div className="dpx-ac-panel"><p className="dpx-sub">Masukkan kata sandi akunmu untuk membuat PIN baru.{acc.methods.password ? "" : " Akunmu belum punya kata sandi: atur kata sandi lebih dulu di bawah."}</p>
        <Field id="ac-forgot" label="Kata sandi akun" type="password" value={forgotPw} onChange={setForgotPw} />
        <Btn type="button" className={`dpx-btn ${forgotPw.length >= 8 && !busy ? "" : "dpx-off"}`} disabled={forgotPw.length < 8 || busy} onClick={() => void resetPinFlow()}>Buat PIN baru</Btn></div> : null}
    </Section>
    <Section title="Cara masuk">
      <div className="dpx-ac-row"><span className="dpx-cat dpx-c-blue"><Ic n="link" /></span><div><b>Google</b><span className="dpx-sub">{acc.methods.google ? "Tersambung" : "Belum tersambung"}</span></div></div>
      <div className="dpx-ac-row"><span className="dpx-cat dpx-c-amber"><Ic n="edit" /></span><div><b>Email dan kata sandi</b><span className="dpx-sub">{acc.methods.password ? `Aktif untuk ${acc.profile.email ?? "emailmu"}. Kata sandi ini dibuat sebelumnya, misalnya saat mendaftar dengan email di Djiwa Tentram.` : "Belum diatur. Atur kata sandi supaya bisa masuk tanpa Google."}</span></div></div>
      <Btn type="button" className="dpx-btn dpx-soft" onClick={() => { setErr(""); setPanel(panel === "password" ? null : "password"); }}>{acc.methods.password ? "Ubah kata sandi" : "Atur kata sandi"}</Btn>
      {panel === "password" ? <div className="dpx-ac-panel">
        {acc.methods.password && !forgot ? <Field id="ac-pw-cur" label="Kata sandi sekarang" type="password" value={pw.current} onChange={(v) => setPw((p) => ({ ...p, current: v }))} /> : null}
        {acc.methods.password && acc.methods.google ? <Btn type="button" className="dpx-linkbtn" onClick={() => setForgot((f) => !f)}>{forgot ? "Saya ingat kata sandi sekarang" : "Lupa kata sandi sekarang? Atur ulang dengan PIN"}</Btn> : null}
        {forgot ? <p className="dpx-sub" style={{ margin: 0 }}>Kamu masuk lewat Google, jadi emailmu sudah terverifikasi. Cukup pilih kata sandi baru, lalu konfirmasi dengan PIN.</p> : null}
        <Field id="ac-pw-new" label="Kata sandi baru" type="password" value={pw.next} onChange={(v) => setPw((p) => ({ ...p, next: v }))} hint="Minimal 8 karakter." />
        <Field id="ac-pw-again" label="Ulangi kata sandi baru" type="password" value={pw.again} onChange={(v) => setPw((p) => ({ ...p, again: v }))} />
        <Btn type="button" className={`dpx-btn ${busy ? "dpx-off" : ""}`} disabled={busy} onClick={() => void savePassword()}>Simpan kata sandi</Btn></div> : null}
    </Section>
    {err ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div>{err}</div></div> : null}
    <Section title="Hapus akun">
      <p className="dpx-sub" style={{ margin: 0 }}>Akun ditutup untuk semua aplikasi Djiwa (Pay, Tentram, Travel), data pribadi dihapus, dan kamu tidak bisa masuk lagi. Riwayat pesanan tetap tersimpan tanpa namamu. Saldo harus kosong dan PIN diperlukan.</p>
      {panel === "delete" ? <div className="dpx-ac-panel"><Field id="ac-del" label="Ketik HAPUS untuk melanjutkan" value={confirm} onChange={(v) => setConfirm(v.toUpperCase())} />
        <div className="dpx-as-chips"><Btn type="button" className="dpx-btn dpx-soft" onClick={() => { setPanel(null); setConfirm(""); }}>Batal</Btn><Btn type="button" className={`dpx-btn ${confirm === "HAPUS" && !busy ? "" : "dpx-off"}`} style={{ background: "var(--danger)" }} disabled={confirm !== "HAPUS" || busy} onClick={() => void deleteAccount()}>Hapus akun</Btn></div></div>
        : <Btn type="button" className="dpx-btn dpx-soft" style={{ color: "var(--danger)" }} disabled={!acc.pin.set} onClick={() => setPanel("delete")}>{acc.pin.set ? "Hapus akun" : "Buat PIN dulu untuk menghapus akun"}</Btn>}
    </Section>
  </div></Sky></div>;
}
export { getPinStatus, PinError };
