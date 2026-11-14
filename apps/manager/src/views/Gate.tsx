import { useState } from "react";
import { Clock3, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { api, type Role } from "../lib/api";
import { managerAuth } from "../lib/auth";

type Props =
  | { stage: "login" }
  | { stage: "none" | "pending" | "rejected" | "revoked" | "approved"; requestedRole?: Role | null; name?: string; onChanged: () => void };

export function Gate(props: Props) {
  const [role, setRole] = useState<Role>("manager");
  const [busy, setBusy] = useState(false);

  const google = async () => {
    setBusy(true);
    try {
      await managerAuth.signIn.social({ provider: "google", callbackURL: window.location.origin });
    } catch {
      toast.error("Masuk dengan Google belum berhasil");
      setBusy(false);
    }
  };

  const request = async () => {
    if (props.stage === "login") return;
    setBusy(true);
    try {
      await api("/api/manager/access-request", { method: "POST", body: { role } });
      props.onChanged();
    } catch {
      toast.error("Permintaan akses belum terkirim");
    } finally {
      setBusy(false);
    }
  };

  const stage = props.stage;
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="panel w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2.5"><span className="h-6 w-1 rounded bg-brand" /><div className="text-lg font-bold">Panel Manager</div></div>
        {stage === "login" && (
          <>
            <p className="mb-5 text-sm text-mute">Untuk Manager dan Supervisor/Purchasing Djiwa Tentram. Masuk dengan akun Google.</p>
            <button className="btn btn-dark w-full" disabled={busy} onClick={google}>Masuk dengan Google</button>
          </>
        )}
        {(stage === "none" || stage === "rejected") && (
          <>
            <p className="mb-3 text-sm text-mute">{stage === "rejected" ? "Permintaan sebelumnya ditolak. Kamu bisa mengajukan ulang." : "Pilih peranmu. Owner akan menyetujui di admin."}</p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {(["manager", "supervisor"] as const).map((r) => (
                <button key={r} onClick={() => setRole(r)} className={`btn ${role === r ? "btn-dark" : ""}`}>{r === "manager" ? "Manager" : "Supervisor / Purchasing"}</button>
              ))}
            </div>
            <button className="btn btn-dark w-full" disabled={busy} onClick={request}>Ajukan akses</button>
          </>
        )}
        {stage === "pending" && (
          <div className="flex items-start gap-3 text-sm"><Clock3 className="mt-0.5 shrink-0" size={18} /><p>Menunggu persetujuan Owner untuk peran <b>{props.requestedRole === "supervisor" ? "Supervisor / Purchasing" : "Manager"}</b>. Halaman ini akan terbuka setelah disetujui.</p></div>
        )}
        {stage === "revoked" && (
          <div className="flex items-start gap-3 text-sm"><ShieldX className="mt-0.5 shrink-0" size={18} /><p>Aksesmu dicabut oleh Owner. Hubungi Owner bila ini keliru.</p></div>
        )}
        {stage !== "login" && (
          <button className="btn mt-4 w-full" onClick={() => managerAuth.signOut()}>Keluar</button>
        )}
      </div>
    </div>
  );
}
