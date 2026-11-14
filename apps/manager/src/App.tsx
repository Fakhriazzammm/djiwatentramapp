import { useCallback, useEffect, useState } from "react";
import { BookOpen, CheckSquare, FileText, LayoutDashboard, Loader2, LogOut, Menu, Package, Receipt, ShoppingCart, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, type Role } from "./lib/api";
import { managerAuth } from "./lib/auth";
import { Gate } from "./views/Gate";
import { TasksView } from "./views/Tasks";
import { ReportsView } from "./views/Reports";
import { PlaybookView } from "./views/Playbook";
import { DashboardView } from "./views/Dashboard";
import { FinanceView } from "./views/Finance";
import { ExpensesView } from "./views/Expenses";
import { StockView } from "./views/Stock";
import { TeamView } from "./views/Team";
import { PurchasingView } from "./views/Purchasing";
import { DocumentsView } from "./views/Documents";

type Access = { status: "none" | "pending" | "approved" | "rejected" | "revoked"; role: Role | null; requestedRole: Role | null };
type Tab = "dashboard" | "guide" | "tasks" | "expenses" | "stock" | "team" | "purchasing" | "finance" | "documents" | "reports" | "more";

const TABS: { id: Exclude<Tab, "more">; label: string; icon: typeof BookOpen; managerOnly?: boolean }[] = [
  { id: "dashboard", label: "Monitor", icon: LayoutDashboard },
  { id: "tasks", label: "Tugas", icon: CheckSquare },
  { id: "expenses", label: "Pengeluaran", icon: Receipt },
  { id: "stock", label: "Stok", icon: Package },
  { id: "purchasing", label: "Belanja", icon: ShoppingCart },
  { id: "team", label: "Tim & Gaji", icon: Users, managerOnly: true },
  { id: "finance", label: "Keuangan", icon: Wallet, managerOnly: true },
  { id: "documents", label: "Dokumen", icon: FileText },
  { id: "guide", label: "Playbook", icon: BookOpen },
  { id: "reports", label: "Laporan", icon: FileText },
];
const PRIMARY: Tab[] = ["dashboard", "tasks", "expenses", "stock"];

export function App() {
  const { data: session, isPending } = managerAuth.useSession();
  const [access, setAccess] = useState<Access | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");

  const loadAccess = useCallback(async () => {
    try { setAccess(await api<Access>("/api/manager/access")); }
    catch { setAccess(null); }
  }, []);

  useEffect(() => {
    if (session?.user) void loadAccess();
    else setAccess(null);
  }, [session?.user?.id, loadAccess]);

  if (isPending) return <Center><Loader2 className="animate-spin" /></Center>;
  if (!session?.user) return <Gate stage="login" />;
  if (!access) return <Center><Loader2 className="animate-spin" /></Center>;
  if (access.status !== "approved" || !access.role) return <Gate stage={access.status} requestedRole={access.requestedRole} onChanged={loadAccess} name={session.user.name} />;

  const role = access.role;
  const tabs = TABS.filter((t) => !t.managerOnly || role === "manager");
  const signOut = async () => { try { await managerAuth.signOut(); } catch { toast.error("Gagal keluar"); } };

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col pb-20 md:pb-6">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span className="h-5 w-1 rounded bg-brand" />
          <div>
            <div className="text-sm font-bold leading-none">Panel {role === "manager" ? "Manager" : "Supervisor"}</div>
            <div className="label mt-1">{session.user.name}</div>
          </div>
        </div>
        <button className="btn" onClick={signOut} aria-label="Keluar"><LogOut size={15} /><span className="hidden sm:inline">Keluar</span></button>
      </header>

      <nav className="hidden flex-wrap gap-1 px-4 pt-3 md:flex">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`btn ${tab === t.id ? "btn-dark" : ""}`}><t.icon size={15} />{t.label}</button>
        ))}
      </nav>

      <main className="flex-1 px-4 pt-4">
        {tab === "dashboard" && <DashboardView onNavigate={(t) => setTab(t as Tab)} />}
        {tab === "guide" && <PlaybookView onSkip={() => setTab("tasks")} onOpenDocument={() => setTab("documents")} />}
        {tab === "tasks" && <TasksView role={role} />}
        {tab === "expenses" && <ExpensesView />}
        {tab === "stock" && <StockView />}
        {tab === "team" && role === "manager" && <TeamView role={role} />}
        {tab === "purchasing" && <PurchasingView />}
        {tab === "finance" && role === "manager" && <FinanceView />}
        {tab === "documents" && <DocumentsView />}
        {tab === "reports" && <ReportsView role={role} />}
        {tab === "more" && (
          <div className="grid grid-cols-2 gap-2">
            {tabs.filter((t) => !PRIMARY.includes(t.id)).map((t) => (
              <button key={t.id} className="panel flex items-center gap-2 p-4 text-left text-sm font-semibold" onClick={() => setTab(t.id)}><t.icon size={18} />{t.label}</button>
            ))}
          </div>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {tabs.filter((t) => PRIMARY.includes(t.id)).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold ${tab === t.id ? "text-ink" : "text-mute"}`}>
            <t.icon size={19} />{t.label}
          </button>
        ))}
        <button onClick={() => setTab("more")} className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold ${tab === "more" || !PRIMARY.includes(tab) ? "text-ink" : "text-mute"}`}>
          <Menu size={19} />Lainnya
        </button>
      </nav>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-dvh place-items-center">{children}</div>;
}
