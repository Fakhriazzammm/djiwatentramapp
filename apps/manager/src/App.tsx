import { useCallback, useEffect, useState } from "react";
import { BookOpen, CheckSquare, FileText, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { api, type Role } from "./lib/api";
import { managerAuth } from "./lib/auth";
import { Gate } from "./views/Gate";
import { TasksView } from "./views/Tasks";
import { ReportsView } from "./views/Reports";
import { PlaybookView } from "./views/Playbook";

type Access = { status: "none" | "pending" | "approved" | "rejected" | "revoked"; role: Role | null; requestedRole: Role | null };
type Tab = "guide" | "tasks" | "reports";

const TABS: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: "guide", label: "Playbook", icon: BookOpen },
  { id: "tasks", label: "Tugas", icon: CheckSquare },
  { id: "reports", label: "Laporan", icon: FileText },
];

export function App() {
  const { data: session, isPending } = managerAuth.useSession();
  const [access, setAccess] = useState<Access | null>(null);
  const [tab, setTab] = useState<Tab>("guide");

  const loadAccess = useCallback(async () => {
    try {
      setAccess(await api<Access>("/api/manager/access"));
    } catch {
      setAccess(null);
    }
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
  const signOut = async () => {
    try { await managerAuth.signOut(); } catch { toast.error("Gagal keluar"); }
  };

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

      <nav className="hidden gap-1 px-4 pt-3 md:flex">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`btn ${tab === t.id ? "btn-dark" : ""}`}><t.icon size={15} />{t.label}</button>
        ))}
      </nav>

      <main className="flex-1 px-4 pt-4">
        {tab === "guide" && <PlaybookView onSkip={() => setTab("tasks")} />}
        {tab === "tasks" && <TasksView role={role} />}
        {tab === "reports" && <ReportsView role={role} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${tab === t.id ? "text-ink" : "text-mute"}`}>
            <t.icon size={20} />{t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-dvh place-items-center">{children}</div>;
}
