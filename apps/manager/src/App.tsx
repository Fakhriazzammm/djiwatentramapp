import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Role } from "./lib/api";
import { managerAuth } from "./lib/auth";
import { Ic } from "./ui";
import { Gate } from "./views/Gate";
import { DashView } from "./views/Dash";
import { ReportsView } from "./views/Reports";
import { GuideView } from "./views/Guide";
import { FinanceView } from "./views/Finance";
import { ExpensesView } from "./views/Expenses";
import { StockView } from "./views/Stock";
import { TeamView } from "./views/Team";
import { PurchasingView } from "./views/Purchasing";

type Access = { status: "none" | "pending" | "approved" | "rejected" | "revoked"; role: Role | null; requestedRole: Role | null };
type Page = "guide" | "dash" | "keuangan" | "expense" | "opset" | "sdm" | "purch" | "belanja" | "laporan";
// [id, icon, title, subtitle, short label] — same as the prototype RAIL.
const RAIL: Record<Role, [Page, string, string, string, string][]> = {
  manager: [
    ["guide", "book", "Playbook & Dokumen", "Panduan, templat", "Panduan"],
    ["dash", "grid", "Dasbor Manager", "Tugas & monitor", "Dasbor"],
    ["keuangan", "chart", "Keuangan", "Transaksi & analitik", "Keuangan"],
    ["expense", "receipt", "Pengeluaran", "Scan struk & input", "Biaya"],
    ["opset", "sl", "Stok & Opname", "Satuan, jadwal, toleransi", "Stok"],
    ["sdm", "users", "Tim & Gaji", "Absensi, gaji, bonus, slip", "Tim"],
    ["purch", "cart", "Pantau Purchasing", "Supervisor & PO", "Purchasing"],
    ["laporan", "file", "Laporan", "Kirim & terima laporan", "Laporan"],
  ],
  supervisor: [
    ["guide", "book", "Playbook & Dokumen", "Panduan, templat", "Panduan"],
    ["dash", "grid", "Dasbor Purchasing", "Tugas & stok", "Dasbor"],
    ["belanja", "cart", "Belanja & PO", "Purchasing", "Belanja"],
    ["expense", "receipt", "Pengeluaran", "Scan struk & input", "Biaya"],
    ["opset", "sl", "Stok & Opname", "Satuan, jadwal, toleransi", "Stok"],
    ["laporan", "file", "Laporan", "Kirim & terima laporan", "Laporan"],
  ],
};
const MOBP: Record<Role, Page[]> = { manager: ["dash", "keuangan", "expense", "laporan"], supervisor: ["dash", "belanja", "expense", "laporan"] };
const ROLE_NAME: Record<Role, string> = { manager: "Manager", supervisor: "Supervisor" };
const FIRST_KEY = "mgr_seen_guide";

export function App() {
  const { data: session, isPending } = managerAuth.useSession();
  const [access, setAccess] = useState<Access | null>(null);
  const [page, setPage] = useState<Page | null>(() => { const h = window.location.hash.slice(1); return (["guide", "dash", "keuangan", "expense", "opset", "sdm", "purch", "belanja", "laporan"] as string[]).includes(h) ? (h as Page) : null; });
  const [sheet, setSheet] = useState(false);
  const [bug, setBug] = useState(0);

  const loadAccess = useCallback(async () => {
    try { setAccess(await api<Access>("/api/manager/access")); } catch { setAccess(null); }
  }, []);
  useEffect(() => { if (session?.user) void loadAccess(); else setAccess(null); }, [session?.user?.id, loadAccess]);

  if (isPending) return <div className="loading">Memuat…</div>;
  if (!session?.user) return <Gate stage="login" />;
  if (!access) return <div className="loading">Memuat…</div>;
  if (access.status !== "approved" || !access.role) return <Gate stage={access.status} requestedRole={access.requestedRole} onChanged={loadAccess} name={session.user.name} />;

  const role = access.role;
  const pages = RAIL[role];
  // Playbook is the first page; it is only a start page, never a gate.
  let first = "1";
  try { first = localStorage.getItem(FIRST_KEY) ?? ""; } catch { /* storage blocked */ }
  const cur: Page = page ?? (first ? "dash" : "guide");
  const go = (p: Page) => {
    setPage(p); setSheet(false);
    try { window.history.replaceState(null, "", `#${p}`); } catch { /* ignore */ }
    try { localStorage.setItem(FIRST_KEY, "1"); } catch { /* ignore */ }
  };
  const info = pages.find((p) => p[0] === cur) ?? pages[0];
  const showLive = ["dash", "sdm", "purch", "keuangan"].includes(cur);
  const initials = (session.user.name || ROLE_NAME[role]).split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
  const signOut = async () => { try { await managerAuth.signOut(); } catch { toast.error("Gagal keluar"); } };
  const openBug = () => { setBug((n) => n + 1); go("laporan"); };

  const prim = MOBP[role].map((id) => pages.find((p) => p[0] === id)).filter(Boolean) as typeof pages;
  const rest = pages.filter((p) => !MOBP[role].includes(p[0]));

  return (
    <>
      <div className="shell">
        <nav className="rail">
          <div className="logo">D</div>
          {pages.map((p) => <button key={p[0]} className={`rb ${p[0] === cur ? "on" : ""}`} title={p[2]} onClick={() => go(p[0])}><Ic n={p[1]} /></button>)}
          <div className="sep" />
          <div className="avatar" title="Keluar" onClick={signOut} style={{ cursor: "pointer" }}>{initials}</div>
        </nav>
        <div className="main">
          <header>
            <span className="circ" title="Menu"><svg className="ic" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" /><path d="M9 3v18" /></svg></span>
            <div className="hl"><div className="crumb">{ROLE_NAME[role]} / {info[2]}</div><h1>{info[2]}</h1></div>
            {showLive && <span className="live">LIVE · DIPERBARUI BARU SAJA</span>}
            <button className="btn r s bugpill" title="Lapor bug, permintaan fitur, atau kendala aplikasi" onClick={openBug}><Ic n="alert" /><span>Lapor kendala</span></button>
            <span className="circ" title="Cari"><Ic n="grid" /></span>
            <span className="circ" title="Notifikasi"><Ic n="bell" /></span>
            <span className="circ blk" title={session.user.name}>{initials[0]}</span>
          </header>
          <div className={`body ${["laporan", "keuangan", "sdm", "expense", "opset", "purch", "belanja"].includes(cur) ? "scroll" : ""}`}>
            {cur === "guide" && <GuideView role={role} onSkip={() => go("dash")} />}
            {cur === "dash" && <DashView role={role} onNavigate={(p) => go(p as Page)} />}
            {cur === "keuangan" && role === "manager" && <FinanceView />}
            {cur === "expense" && <ExpensesView />}
            {cur === "opset" && <StockView role={role} />}
            {cur === "sdm" && role === "manager" && <TeamView role={role} />}
            {(cur === "purch" || cur === "belanja") && <PurchasingView role={role} />}
            {cur === "laporan" && <ReportsView role={role} bugKey={bug} />}
          </div>
        </div>
      </div>

      <nav className="bnav">
        {prim.map((p) => <button key={p[0]} className={`bi ${p[0] === cur ? "on" : ""}`} onClick={() => go(p[0])}><Ic n={p[1]} /><span>{p[4]}</span></button>)}
        <button className={`bi ${sheet ? "on" : ""}`} onClick={() => setSheet((v) => !v)}><Ic n="more" /><span>Lainnya</span></button>
      </nav>
      <div id="sheet">
        {sheet && (<>
          <div className="sbk" onClick={() => setSheet(false)} />
          <div className="shs">
            <div className="shh" />
            {rest.map((p) => <button key={p[0]} className="srow" onClick={() => go(p[0])}><Ic n={p[1]} /><span><b>{p[2]}</b><small>{p[3]}</small></span></button>)}
            <button className="srow" onClick={openBug}><Ic n="alert" /><span><b>Lapor kendala</b><small>Bug, permintaan fitur, kendala aplikasi</small></span></button>
            <button className="srow" onClick={signOut}><Ic n="out" /><span><b>Keluar</b><small>Kembali ke halaman masuk</small></span></button>
          </div>
        </>)}
      </div>
    </>
  );
}
