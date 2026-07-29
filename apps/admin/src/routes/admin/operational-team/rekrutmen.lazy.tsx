import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  Search,
  FileText,
  X,
  ChevronLeft,
  Star,
  Loader2,
  User,
  Calendar,
  Clock,
  MessageSquare,
  ChevronDown,
  Check,
  Briefcase,
  Phone,
  Mail,
  MapPin,
  Globe,
  BookOpen,
  FileSignature,
  ClipboardList,
  Users,
  Filter,
  ArrowUpDown,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import "@/styles/rekrutmen-admin.css";

export const Route = createLazyFileRoute("/admin/operational-team/rekrutmen")({
  component: AdminRekrutmen,
});

const TAB_CONFIG = {
  candidates: {
    label: "Candidates",
    tableName: "Candidates",
    statusField: "Status",
    defaultSort: "date_desc",
    searchFields: ["Nama Lengkap", "Posisi Dilamar", "Email", "Nomor Telepon/HP"],
    statusOptions: ["All", "New", "Review", "Interview", "Accepted", "Rejected"],
    quickFilters: ["All", "New", "Review", "Interview", "Accepted", "Rejected"],
    sortOptions: [
      { value: "date_desc", label: "Terbaru" },
      { value: "date_asc", label: "Terlama" },
      { value: "name_asc", label: "Nama A-Z" },
      { value: "position_asc", label: "Posisi A-Z" },
    ],
  },
  interviews: {
    label: "Interviews",
    tableName: "Interviews",
    statusField: "Status",
    defaultSort: "date_desc",
    searchFields: ["Candidate", "Interviewer", "Interview ID", "Feedback"],
    statusOptions: ["All", "Scheduled", "Passed", "Failed"],
    quickFilters: ["All", "Scheduled", "Passed", "Failed"],
    sortOptions: [
      { value: "date_desc", label: "Jadwal terbaru" },
      { value: "date_asc", label: "Jadwal terlama" },
      { value: "interviewer_asc", label: "Interviewer A-Z" },
    ],
  },
  onboarding: {
    label: "Onboarding",
    tableName: "Onboarding",
    statusField: "Training Completion Status",
    defaultSort: "date_desc",
    searchFields: ["Employee", "Onboarding ID", "Training Schedule", "Notes"],
    statusOptions: ["All", "In Progress", "Completed"],
    quickFilters: ["All", "In Progress", "Completed"],
    sortOptions: [
      { value: "date_desc", label: "Start terbaru" },
      { value: "date_asc", label: "Start terlama" },
      { value: "employee_asc", label: "Employee A-Z" },
    ],
  },
};

type TabKey = keyof typeof TAB_CONFIG;

interface AirtableRecord {
  id: string;
  createdTime: string;
  fields: Record<string, any>;
}

function statusClass(rawStatus: string | null | undefined): string {
  const value = String(rawStatus || "new").toLowerCase().replace(/\s+/g, "");
  if (["inprogress", "in progress"].some((s) => value.includes(s))) return "bg-amber-100 text-amber-800 border-amber-200";
  if (value === "completed" || value === "passed" || value === "accepted") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (value === "rejected" || value === "failed") return "bg-red-100 text-red-800 border-red-200";
  if (value === "review" || value === "interview" || value === "scheduled") return "bg-blue-100 text-blue-800 border-blue-200";
  return "bg-slate-100 text-slate-800 border-slate-200";
}

function AdminRekrutmen() {
  const [activeTab, setActiveTab] = useState<TabKey>("candidates");
  const [allData, setAllData] = useState<Record<TabKey, AirtableRecord[]>>({
    candidates: [],
    interviews: [],
    onboarding: [],
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("");
  const [activeQuickFilter, setActiveQuickFilter] = useState("All");
  const [density, setDensity] = useState<"compact" | "comfortable">("compact");
  const [drawerRecord, setDrawerRecord] = useState<AirtableRecord | null>(null);
  const [modalRecordId, setModalRecordId] = useState<string | null>(null);
  const [modalStatus, setModalStatus] = useState("");
  const [modalNotes, setModalNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const config = TAB_CONFIG[activeTab];
  const records = allData[activeTab] || [];

  useEffect(() => {
    if (!sortBy && config) {
      setSortBy(config.defaultSort);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchAllData();
  }, []);

  async function fetchAllData() {
    setLoading(true);
    try {
      const [cRes, iRes, oRes] = await Promise.all([
        fetch("/api/rekrutmen/table/Candidates"),
        fetch("/api/rekrutmen/table/Interviews"),
        fetch("/api/rekrutmen/table/Onboarding"),
      ]);
      const [cData, iData, oData] = await Promise.all([cRes.json(), iRes.json(), oRes.json()]);
      setAllData({
        candidates: cData.records || [],
        interviews: iData.records || [],
        onboarding: oData.records || [],
      });
    } catch (e) {
      console.error("Gagal fetch rekrutmen data:", e);
    } finally {
      setLoading(false);
    }
  }

  function matchesSearch(record: AirtableRecord, query: string): boolean {
    if (!query) return true;
    const fields = config.searchFields;
    const haystack = fields.map((f) => String(record.fields[f] || "")).join(" ").toLowerCase();
    return haystack.includes(query);
  }

  const filtered = useMemo(() => {
    let items = [...records];
    // Quick filter / status filter
    const sf = statusFilter;
    if (sf !== "All") {
      items = items.filter((r) => String(r.fields[config.statusField] || "") === sf);
    }
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter((r) => matchesSearch(r, q));
    }
    // Sort
    const sortValue = sortBy || config.defaultSort;
    items.sort((a, b) => {
      const fa = a.fields;
      const fb = b.fields;
      if (sortValue === "name_asc") return String(fa["Nama Lengkap"] || "").localeCompare(String(fb["Nama Lengkap"] || ""));
      if (sortValue === "position_asc") return String(fa["Posisi Dilamar"] || "").localeCompare(String(fb["Posisi Dilamar"] || ""));
      if (sortValue === "interviewer_asc") return String(fa["Interviewer"] || "").localeCompare(String(fb["Interviewer"] || ""));
      if (sortValue === "employee_asc") return String(fa["Employee"] || "").localeCompare(String(fb["Employee"] || ""));
      const dateField = activeTab === "candidates" ? "Application Date" : activeTab === "interviews" ? "Interview Date" : "Start Date";
      const ad = new Date(fa[dateField] || 0).getTime();
      const bd = new Date(fb[dateField] || 0).getTime();
      return sortValue === "date_asc" ? ad - bd : bd - ad;
    });
    return items;
  }, [records, activeTab, searchQuery, statusFilter, sortBy]);

  function handleQuickFilter(value: string) {
    setActiveQuickFilter(value);
    setStatusFilter(value);
  }

  function openDrawer(record: AirtableRecord) {
    setDrawerRecord(record);
  }

  function closeDrawer() {
    setDrawerRecord(null);
  }

  function openModal(recordId: string, currentStatus?: string) {
    setModalRecordId(recordId);
    setModalStatus(currentStatus || "");
    setModalNotes("");
  }

  function closeModal() {
    setModalRecordId(null);
    setModalStatus("");
    setModalNotes("");
  }

  async function saveStatus() {
    if (!modalRecordId) return;
    setSaving(true);
    const payload: Record<string, string> = { [config.statusField]: modalStatus };
    if (modalNotes.trim()) payload.Notes = modalNotes.trim();
    try {
      const res = await fetch(`/api/rekrutmen/table/${config.tableName}/${modalRecordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data?.error?.message || data?.error || "Gagal");
      closeModal();
      await fetchAllData();
    } catch (e: any) {
      alert("Gagal update: " + (e.message || "unknown"));
    } finally {
      setSaving(false);
    }
  }

  function esc(v: any): string {
    return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const stats = useMemo(() => {
    const c = allData.candidates;
    return {
      total: c.length,
      review: c.filter((r) => ["New", "Review"].includes(r.fields.Status)).length,
      interview: c.filter((r) => r.fields.Status === "Interview").length,
      accepted: c.filter((r) => r.fields.Status === "Accepted").length,
    };
  }, [allData]);

  const tdClass = density === "compact" ? "px-3 py-2.5" : "px-4 py-3.5";
  const thClass = density === "compact" ? "px-3 py-2.5" : "px-4 py-3.5";

  function renderDetailDrawer() {
    if (!drawerRecord) return null;
    const f = drawerRecord.fields;
    const tab = activeTab;

    let cards = "";
    if (tab === "candidates") {
      cards = `
        <div class="space-y-1">
          <div class="text-xs font-semibold uppercase tracking-wider text-blue-600">Profil</div>
          <div class="grid gap-2 mt-2">
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">Nama</span><span class="text-xs font-medium text-right">${esc(f["Nama Lengkap"] || "-")}</span></div>
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">Posisi</span><span class="text-xs font-medium text-right">${esc(f["Posisi Dilamar"] || "-")}</span></div>
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">Status</span><span class="text-xs font-medium text-right">${esc(f.Status || "New")}</span></div>
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">Tipe</span><span class="text-xs font-medium text-right">${esc(f["Full time/Part time"] || "-")}</span></div>
          </div>
        </div>
        <div class="space-y-1 mt-4">
          <div class="text-xs font-semibold uppercase tracking-wider text-blue-600">Kontak</div>
          <div class="grid gap-2 mt-2">
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">No HP</span><span class="text-xs font-medium text-right">${esc(f["Nomor Telepon/HP"] || "-")}</span></div>
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">Email</span><span class="text-xs font-medium text-right">${esc(f.Email || "-")}</span></div>
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">Sosmed</span><span class="text-xs font-medium text-right">${esc(f["Sosial Media Instagram/Tiktok"] || "-")}</span></div>
          </div>
        </div>
        <div class="space-y-1 mt-4">
          <div class="text-xs font-semibold uppercase tracking-wider text-blue-600">Catatan</div>
          <div class="mt-2 text-xs">${esc(f.Notes || "Belum ada catatan")}</div>
        </div>
      `;
    } else if (tab === "interviews") {
      cards = `
        <div class="space-y-1">
          <div class="text-xs font-semibold uppercase tracking-wider text-blue-600">Interview</div>
          <div class="grid gap-2 mt-2">
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">ID</span><span class="text-xs font-medium text-right">${esc(f["Interview ID"] || drawerRecord.id.slice(0, 6))}</span></div>
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">Kandidat</span><span class="text-xs font-medium text-right">${esc(f.Candidate || "-")}</span></div>
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">Interviewer</span><span class="text-xs font-medium text-right">${esc(f.Interviewer || "-")}</span></div>
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">Status</span><span class="text-xs font-medium text-right">${esc(f.Status || "Scheduled")}</span></div>
          </div>
        </div>
        <div class="space-y-1 mt-4">
          <div class="text-xs font-semibold uppercase tracking-wider text-blue-600">Hasil</div>
          <div class="mt-2 text-xs">${esc(f.Feedback || "Belum ada feedback")}</div>
          ${f["Key Notes (AI)"] ? `<div class="mt-2 text-xs italic text-muted-foreground">AI: ${esc(f["Key Notes (AI)"])}</div>` : ""}
        </div>
      `;
    } else {
      const docs = Array.isArray(f["Document Collection Status"]) ? f["Document Collection Status"].join(", ") : (f["Document Collection Status"] || "-");
      cards = `
        <div class="space-y-1">
          <div class="text-xs font-semibold uppercase tracking-wider text-blue-600">Onboarding</div>
          <div class="grid gap-2 mt-2">
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">ID</span><span class="text-xs font-medium text-right">${esc(f["Onboarding ID"] || drawerRecord.id.slice(0, 6))}</span></div>
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">Employee</span><span class="text-xs font-medium text-right">${esc(f.Employee || "-")}</span></div>
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">Status</span><span class="text-xs font-medium text-right">${esc(f["Training Completion Status"] || "In Progress")}</span></div>
          </div>
        </div>
        <div class="space-y-1 mt-4">
          <div class="text-xs font-semibold uppercase tracking-wider text-blue-600">Detail</div>
          <div class="grid gap-2 mt-2">
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">Start</span><span class="text-xs font-medium text-right">${esc(f["Start Date"] || "-")}</span></div>
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">Probation</span><span class="text-xs font-medium text-right">${esc(f["Probation End Date"] || "-")}</span></div>
            <div class="flex justify-between"><span class="text-xs text-muted-foreground">Dokumen</span><span class="text-xs font-medium text-right">${esc(docs)}</span></div>
          </div>
        </div>
      `;
    }
    return (
      <div className="fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) closeDrawer(); }}>
        <div className="w-full max-w-sm bg-white border-l shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 bg-white border-b flex items-center justify-between px-4 py-3 z-10">
            <h3 className="font-bold text-sm">Detail {config.label}</h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeDrawer}><X className="h-4 w-4" /></Button>
          </div>
          <div className="p-4 space-y-4" dangerouslySetInnerHTML={{ __html: cards }} />
        </div>
      </div>
    );
  }

  function renderModal() {
    if (!modalRecordId) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
          <h3 className="font-bold text-sm">Update {config.label}</h3>
          <p className="text-xs text-muted-foreground mt-1">Ubah {config.statusField}.</p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-semibold block mb-1.5">Status</label>
              <select
                className="w-full h-9 rounded-lg border px-3 text-xs bg-white"
                value={modalStatus}
                onChange={(e) => setModalStatus(e.target.value)}
              >
                {config.statusOptions.filter((s) => s !== "All").map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5">Catatan</label>
              <textarea
                className="w-full rounded-lg border px-3 py-2 text-xs min-h-[80px] resize-y"
                placeholder="Catatan singkat..."
                value={modalNotes}
                onChange={(e) => setModalNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button size="sm" className="h-8 text-xs" onClick={saveStatus} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Simpan
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={closeModal}>Batal</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total },
          { label: "Review", value: stats.review },
          { label: "Interview", value: stats.interview },
          { label: "Diterima", value: stats.accepted },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className="text-xl font-bold mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Main Card */}
      <div className="rekrutmen-admin">
      <div className="card workspace">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-3 border-b flex-wrap">
          <h2 className="font-bold text-sm">Rekrutmen</h2>
          <div className="flex gap-1.5 flex-wrap">
            {(Object.entries(TAB_CONFIG) as [TabKey, typeof config][]).map(([key, cfg]) => {
              const count = allData[key]?.length ?? 0;
              return (
                <button
                  key={key}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                    activeTab === key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted"
                  }`}
                  onClick={() => {
                    setActiveTab(key);
                    setSearchQuery("");
                    setStatusFilter("All");
                    setActiveQuickFilter("All");
                  }}
                >
                  {key === "candidates" ? <Users className="h-3.5 w-3.5" /> : key === "interviews" ? <MessageSquare className="h-3.5 w-3.5" /> : <ClipboardList className="h-3.5 w-3.5" />}
                  {cfg.label}
                  <span className="opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Toolbar */}
        <div className="p-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                className="w-full h-9 pl-8 pr-3 rounded-lg border text-xs bg-white outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                placeholder="Cari data..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="h-9 px-2 rounded-lg border text-xs bg-white outline-none"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setActiveQuickFilter(e.target.value); }}
            >
              {config.statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              className="h-9 px-2 rounded-lg border text-xs bg-white outline-none"
              value={sortBy || config.defaultSort}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {config.sortOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select
              className="h-9 px-2 rounded-lg border text-xs bg-white outline-none"
              value={density}
              onChange={(e) => setDensity(e.target.value as "compact" | "comfortable")}
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
            </select>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={fetchAllData} title="Refresh">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* Quick filters */}
          <div className="flex gap-1.5 flex-wrap">
            {config.quickFilters.map((f) => (
              <button
                key={f}
                className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                  activeQuickFilter === f
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-white text-muted-foreground hover:bg-muted/40"
                }`}
                onClick={() => handleQuickFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Meta */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span><strong className="text-foreground">{filtered.length}</strong> data tampil</span>
            <span>{config.label} • {statusFilter} • {config.sortOptions.find((s) => s.value === (sortBy || config.defaultSort))?.label}</span>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden sm:block overflow-x-auto border-t">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Memuat data...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-xs text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <strong className="block text-foreground">Tidak ada data</strong>
              Coba ubah pencarian atau filter.
            </div>
          ) : activeTab === "candidates" ? (
            <table className="w-full min-w-[800px] text-xs">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground sticky left-0 bg-muted/30 z-10`}>Kandidat</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Posisi</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Kontak</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>CV</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Tanggal</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Status</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Tipe</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const f = r.fields;
                  return (
                    <tr key={r.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className={`${tdClass} sticky left-0 bg-white z-[2]`}>
                        <div className="font-semibold truncate max-w-[180px]">{esc(f["Nama Lengkap"] || "-")}</div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{esc(f.Email || "tanpa email")}</div>
                      </td>
                      <td className={tdClass}>
                        <div className="font-medium">{esc(f["Posisi Dilamar"] || "-")}</div>
                        <div className="text-[10px] text-muted-foreground">{esc(f["Sosial Media Instagram/Tiktok"] || "")}</div>
                      </td>
                      <td className={tdClass}>
                        <div>{esc(f["Nomor Telepon/HP"] || "-")}</div>
                        <div className="text-[10px] text-muted-foreground">{esc(f.Email || "")}</div>
                      </td>
                      <td className={tdClass}>
                        {f["CV URL"] ? (
                          <a href={f["CV URL"]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline">
                            <FileText className="h-3 w-3" /> Lihat CV
                          </a>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className={tdClass}>{esc(f["Application Date"] || "-")}</td>
                      <td className={tdClass}>
                        <Badge variant="outline" className={`${statusClass(f.Status)} text-[10px] font-semibold border`}>
                          {esc(f.Status || "New")}
                        </Badge>
                      </td>
                      <td className={tdClass}>{esc(f["Full time/Part time"] || "-")}</td>
                      <td className={tdClass}>
                        <div className="flex gap-1">
                          <Button size="sm" variant="default" className="h-7 text-[10px] px-2" onClick={() => openModal(r.id, f.Status)}>Update</Button>
                          <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => openDrawer(r)}>Detail</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : activeTab === "interviews" ? (
            <table className="w-full min-w-[800px] text-xs">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground sticky left-0 bg-muted/30 z-10`}>Interview</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Jadwal</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Interviewer</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Status</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Rating</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Feedback</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const f = r.fields;
                  const rating = f.Rating ? Math.min(Number(f.Rating), 5) : 0;
                  return (
                    <tr key={r.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className={`${tdClass} sticky left-0 bg-white z-[2]`}>
                        <div className="font-semibold">#{esc(f["Interview ID"] || r.id.slice(0, 6))}</div>
                        <div className="text-[10px] text-muted-foreground">{esc(f.Candidate || "kandidat tidak tercatat")}</div>
                      </td>
                      <td className={tdClass}>
                        <div>{esc(f["Interview Date"] || "-")}</div>
                        <div className="text-[10px] text-muted-foreground">{esc(f["Interview Time"] || "jam belum diisi")}</div>
                      </td>
                      <td className={tdClass}>{esc(f.Interviewer || "-")}</td>
                      <td className={tdClass}>
                        <Badge variant="outline" className={`${statusClass(f.Status)} text-[10px] font-semibold border`}>
                          {esc(f.Status || "Scheduled")}
                        </Badge>
                      </td>
                      <td className={tdClass}>
                        {rating > 0 ? Array.from({ length: rating }, (_, i) => <Star key={i} className="h-3 w-3 inline text-amber-400 fill-amber-400" />) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className={`${tdClass} text-muted-foreground max-w-[200px] truncate`}>{esc(f.Feedback || "belum ada feedback")}</td>
                      <td className={tdClass}>
                        <div className="flex gap-1">
                          <Button size="sm" variant="default" className="h-7 text-[10px] px-2" onClick={() => openModal(r.id)}>Update</Button>
                          <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => openDrawer(r)}>Detail</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[800px] text-xs">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground sticky left-0 bg-muted/30 z-10`}>Onboarding</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Mulai</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Probation</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Status</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Dokumen</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Schedule</th>
                  <th className={`${thClass} text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const f = r.fields;
                  const docs = Array.isArray(f["Document Collection Status"]) ? f["Document Collection Status"].join(", ") : (f["Document Collection Status"] || "-");
                  return (
                    <tr key={r.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className={`${tdClass} sticky left-0 bg-white z-[2]`}>
                        <div className="font-semibold">#{esc(f["Onboarding ID"] || r.id.slice(0, 6))}</div>
                        <div className="text-[10px] text-muted-foreground">{esc(f.Employee || "employee belum diisi")}</div>
                      </td>
                      <td className={tdClass}>{esc(f["Start Date"] || "-")}</td>
                      <td className={tdClass}>{esc(f["Probation End Date"] || "-")}</td>
                      <td className={tdClass}>
                        <Badge variant="outline" className={`${statusClass(f["Training Completion Status"])} text-[10px] font-semibold border`}>
                          {esc(f["Training Completion Status"] || "In Progress")}
                        </Badge>
                      </td>
                      <td className={`${tdClass} text-muted-foreground max-w-[150px] truncate`}>{esc(docs)}</td>
                      <td className={`${tdClass} text-muted-foreground`}>{esc(f["Training Schedule"] || "-")}</td>
                      <td className={tdClass}>
                        <div className="flex gap-1">
                          <Button size="sm" variant="default" className="h-7 text-[10px] px-2" onClick={() => openModal(r.id)}>Update</Button>
                          <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => openDrawer(r)}>Detail</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Mobile Cards */}
        <div className="sm:hidden border-t p-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Memuat data...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              <FileText className="h-6 w-6 mx-auto mb-2 opacity-30" />
              <strong className="block text-foreground">Tidak ada data</strong>
              Coba ubah pencarian atau filter.
            </div>
          ) : (
            filtered.map((r) => {
              const f = r.fields;
              if (activeTab === "candidates") {
                return (
                  <div key={r.id} className="bg-white rounded-xl border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-xs">{esc(f["Nama Lengkap"] || "-")}</div>
                        <div className="text-[10px] text-muted-foreground">{esc(f["Posisi Dilamar"] || "-")}</div>
                      </div>
                      <Badge variant="outline" className={`${statusClass(f.Status)} text-[10px] font-semibold border`}>{esc(f.Status || "New")}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                      <span>{esc(f["Nomor Telepon/HP"] || "-")}</span>
                      <span className="text-right">{esc(f["Application Date"] || "-")}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="default" className="h-7 text-[10px] px-2 flex-1" onClick={() => openModal(r.id, f.Status)}>Update</Button>
                      <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 flex-1" onClick={() => openDrawer(r)}>Detail</Button>
                    </div>
                  </div>
                );
              } else if (activeTab === "interviews") {
                const rating = f.Rating ? Math.min(Number(f.Rating), 5) : 0;
                return (
                  <div key={r.id} className="bg-white rounded-xl border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-xs">#{esc(f["Interview ID"] || r.id.slice(0, 6))}</div>
                        <div className="text-[10px] text-muted-foreground">{esc(f.Candidate || "-")}</div>
                      </div>
                      <Badge variant="outline" className={`${statusClass(f.Status)} text-[10px] font-semibold border`}>{esc(f.Status || "Scheduled")}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                      <span>{esc(f["Interview Date"] || "-")}</span>
                      <span className="text-right">{esc(f.Interviewer || "-")}</span>
                    </div>
                    {rating > 0 && <div className="text-[10px]">{Array.from({ length: rating }, (_, i) => <Star key={i} className="h-3 w-3 inline text-amber-400 fill-amber-400" />)}</div>}
                    <div className="flex gap-1">
                      <Button size="sm" variant="default" className="h-7 text-[10px] px-2 flex-1" onClick={() => openModal(r.id)}>Update</Button>
                      <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 flex-1" onClick={() => openDrawer(r)}>Detail</Button>
                    </div>
                  </div>
                );
              } else {
                const docs = Array.isArray(f["Document Collection Status"]) ? f["Document Collection Status"].join(", ") : (f["Document Collection Status"] || "-");
                return (
                  <div key={r.id} className="bg-white rounded-xl border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-xs">#{esc(f["Onboarding ID"] || r.id.slice(0, 6))}</div>
                        <div className="text-[10px] text-muted-foreground">{esc(f.Employee || "-")}</div>
                      </div>
                      <Badge variant="outline" className={`${statusClass(f["Training Completion Status"])} text-[10px] font-semibold border`}>{esc(f["Training Completion Status"] || "In Progress")}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                      <span>Mulai: {esc(f["Start Date"] || "-")}</span>
                      <span className="text-right truncate">{esc(docs)}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="default" className="h-7 text-[10px] px-2 flex-1" onClick={() => openModal(r.id)}>Update</Button>
                      <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 flex-1" onClick={() => openDrawer(r)}>Detail</Button>
                    </div>
                  </div>
                );
              }
            })
          )}
        </div>
      </div>
      </div>

      {/* Drawer & Modal */}
      {renderDetailDrawer()}
      {renderModal()}
    </div>
  );
}