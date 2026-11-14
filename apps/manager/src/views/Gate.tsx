import { useState } from "react";
import { toast } from "sonner";
import { api, type Role } from "../lib/api";
import { managerAuth } from "../lib/auth";

const G = (
  <svg className="gsvg" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.100 0 24s.9 7.600 2.600 10.800l7.900-6.100z"/><path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.500-5.800c-2.100 1.400-4.800 2.300-8.400 2.300-6.300 0-11.600-4-13.500-9.800l-7.900 6.100C6.500 42.600 14.600 48 24 48z"/></svg>
);
const logo = <div className="logo" style={{ margin: "0 auto 14px", width: 48, height: 48, fontSize: 20 }}>D</div>;

type Props =
  | { stage: "login" }
  | { stage: "none" | "pending" | "rejected" | "revoked" | "approved"; requestedRole?: Role | null; name?: string; email?: string; onChanged: () => void };

export function Gate(props: Props) {
  const [role, setRole] = useState<Role>(("requestedRole" in props && props.requestedRole) || "manager");
  const [name, setName] = useState(("name" in props && props.name) || "");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const google = async () => {
    setBusy(true);
    try { await managerAuth.signIn.social({ provider: "google", callbackURL: window.location.origin }); }
    catch { toast.error("Masuk dengan Google belum berhasil"); setBusy(false); }
  };
  const request = async () => {
    if (props.stage === "login") return;
    setBusy(true);
    try {
      await api("/api/manager/access-request", { method: "POST", body: { role, note: [name && `Nama: ${name}`, phone && `Kontak: ${phone}`].filter(Boolean).join(" · ") } });
      props.onChanged();
    } catch { toast.error("Permintaan akses belum terkirim"); } finally { setBusy(false); }
  };
  const out = () => managerAuth.signOut();
  const s = props.stage;

  return (
    <div className="auth" style={{ display: "grid" }}>
      <div className="acard">
        {s === "login" && (<>
          {logo}<h2 className="at">Djiwa Manager</h2>
          <p className="as">Panel kerja untuk Manager dan Supervisor Djiwa Tentram.</p>
          <button className="gbtn" disabled={busy} onClick={google}>{G}Masuk dengan Google</button>
          <p className="an">Akses baru perlu disetujui Owner. Masuk memakai akun Google Anda, tanpa kata sandi tambahan.</p>
          <div className="ameta">manager.djiwatentram.web.id · Better Auth</div>
        </>)}
        {(s === "none" || s === "rejected") && (<>
          <h2 className="at" style={{ marginTop: 4 }}>Pilih peran Anda</h2>
          <p className="as">{s === "rejected" ? "Permintaan sebelumnya ditolak. Anda bisa mengajukan ulang." : "Owner akan memeriksa pilihan ini sebelum akses diaktifkan."}</p>
          <div className="roles2">
            <button className={`rc ${role === "manager" ? "on" : ""}`} onClick={() => setRole("manager")}><b>Manager</b><span>SDM, toko, pantau operasional dan keuangan</span></button>
            <button className={`rc ${role === "supervisor" ? "on" : ""}`} onClick={() => setRole("supervisor")}><b>Supervisor / Purchasing</b><span>Stok, PO, belanja, penerimaan barang</span></button>
          </div>
          <label>Nama lengkap</label><input type="text" className="f" value={name} onChange={(e) => setName(e.target.value)} />
          <label>Nomor WhatsApp / Telegram</label><input type="text" className="f" placeholder="+62 …" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button className="btn r" disabled={busy} onClick={request} style={{ width: "100%", justifyContent: "center", marginTop: 16, padding: 11 }}>Kirim permintaan akses</button>
          <button className="btn s" onClick={out} style={{ marginTop: 12 }}>Keluar</button>
        </>)}
        {s === "pending" && (<>
          {logo}<h2 className="at">Menunggu persetujuan Owner</h2>
          <p className="as">Permintaan akses sebagai <b>{props.requestedRole === "supervisor" ? "Supervisor / Purchasing" : "Manager"}</b> sudah dikirim.</p>
          <div className="asteps"><div className="astep ok">Akun Google terverifikasi</div><div className="astep cur">Menunggu persetujuan Owner</div><div className="astep">Akses aktif</div></div>
          <button className="btn" onClick={props.onChanged}>Periksa status</button> <button className="btn" onClick={out}>Keluar</button>
        </>)}
        {s === "revoked" && (<>{logo}<h2 className="at">Akses dicabut</h2><p className="as">Owner mencabut akses Anda. Hubungi Owner bila ini keliru.</p><button className="btn p" onClick={out}>Kembali ke halaman masuk</button></>)}
      </div>
    </div>
  );
}
