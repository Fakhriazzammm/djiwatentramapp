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

  // thClass/tdClass removed — CSS handles styling

  function renderDetailDrawer() {
    if (!drawerRecord) return null;
    const f = drawerRecord.fields;
    const tab = activeTab;

    let cards = "";
    if (tab === "candidates") {
      cards = `
        <div class="detail-card">
          <h4>Profil</h4>
          <div class="detail-item"><strong>Nama</strong><span>${esc(f["Nama Lengkap"] || "-")}</span></div>
          <div class="detail-item"><strong>Posisi</strong><span>${esc(f["Posisi Dilamar"] || "-")}</span></div>
          <div class="detail-item"><strong>Status</strong><span>${esc(f.Status || "New")}</span></div>
          <div class="detail-item"><strong>Tipe</strong><span>${esc(f["Full time/Part time"] || "-")}</span></div>
        </div>
        <div class="detail-card">
          <h4>Kontak</h4>
          <div class="detail-item"><strong>No HP</strong><span>${esc(f["Nomor Telepon/HP"] || "-")}</span></div>
          <div class="detail-item"><strong>Email</strong><span>${esc(f.Email || "-")}</span></div>
          <div class="detail-item"><strong>Sosmed</strong><span>${esc(f["Sosial Media Instagram/Tiktok"] || "-")}</span></div>
        </div>
        <div class="detail-card">
          <h4>CV</h4>
          <div class="detail-item">${f["CV URL"] ? `<a href="${esc(f["CV URL"])}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--primary);text-decoration:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="12" y2="12"/><line x1="15" y1="15" x2="12" y2="12"/></svg>Download CV</a>` : '<span style="color:var(--muted)">Tidak ada CV</span>'}</div>
        </div>
        <div class="detail-card">
          <h4>Catatan</h4>
          <div class="detail-item"><span>${esc(f.Notes || "Belum ada catatan")}</span></div>
        </div>
      `;
    } else if (tab === "interviews") {
      cards = `
        <div class="detail-card">
          <h4>Interview</h4>
          <div class="detail-item"><strong>ID</strong><span>${esc(f["Interview ID"] || drawerRecord.id.slice(0, 6))}</span></div>
          <div class="detail-item"><strong>Kandidat</strong><span>${esc(f.Candidate || "-")}</span></div>
          <div class="detail-item"><strong>Interviewer</strong><span>${esc(f.Interviewer || "-")}</span></div>
          <div class="detail-item"><strong>Status</strong><span>${esc(f.Status || "Scheduled")}</span></div>
        </div>
        <div class="detail-card">
          <h4>Hasil</h4>
          <div class="detail-item"><span>${esc(f.Feedback || "Belum ada feedback")}</span></div>
          ${f["Key Notes (AI)"] ? `<div class="detail-item" style="font-style:italic;color:var(--muted)">AI: ${esc(f["Key Notes (AI)"])}</div>` : ""}
        </div>
      `;
    } else {
      const docs = Array.isArray(f["Document Collection Status"]) ? f["Document Collection Status"].join(", ") : (f["Document Collection Status"] || "-");
      cards = `
        <div class="detail-card">
          <h4>Onboarding</h4>
          <div class="detail-item"><strong>ID</strong><span>${esc(f["Onboarding ID"] || drawerRecord.id.slice(0, 6))}</span></div>
          <div class="detail-item"><strong>Employee</strong><span>${esc(f.Employee || "-")}</span></div>
          <div class="detail-item"><strong>Status</strong><span>${esc(f["Training Completion Status"] || "In Progress")}</span></div>
        </div>
        <div class="detail-card">
          <h4>Detail</h4>
          <div class="detail-item"><strong>Start</strong><span>${esc(f["Start Date"] || "-")}</span></div>
          <div class="detail-item"><strong>Probation</strong><span>${esc(f["Probation End Date"] || "-")}</span></div>
          <div class="detail-item"><strong>Dokumen</strong><span>${esc(docs)}</span></div>
        </div>
      `;
    }
    return (
      <div className="drawer-overlay visible" onClick={(e) => { if (e.target === e.currentTarget) closeDrawer(); }}>
        <div className="drawer visible" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-head">
            <h3 className="drawer-title">Detail {config.label}</h3>
            <button className="small-btn" onClick={closeDrawer}><X className="h-4 w-4" /></button>
          </div>
          <div className="detail-grid" dangerouslySetInnerHTML={{ __html: cards }} />
        </div>
      </div>
    );
  }

  function renderModal() {
    if (!modalRecordId) return null;
    return (
      <>
      <div className="modal-overlay visible" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}></div>
      <div className="modal-wrap visible">
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3 className="modal-title">Update {config.label}</h3>
          <div className="modal-subtitle">Ubah {config.statusField}.</div>
          <div className="modal-grid">
            <div>
              <label>Status</label>
              <select
                className=""
                value={modalStatus}
                onChange={(e) => setModalStatus(e.target.value)}
              >
                {config.statusOptions.filter((s) => s !== "All").map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Catatan</label>
              <textarea
                className=""
                placeholder="Catatan singkat..."
                value={modalNotes}
                onChange={(e) => setModalNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn-primary" onClick={saveStatus} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Simpan
            </button>
            <button className="btn-secondary" onClick={closeModal}>Batal</button>
          </div>
        </div>
      </div>
      </>
    );
  }

  return (
    <div className="rekrutmen-admin"><div className="page">
      {/* Stats */}
      <div className="summary">
        {[
          { label: "Total", value: stats.total },
          { label: "Review", value: stats.review },
          { label: "Interview", value: stats.interview },
          { label: "Diterima", value: stats.accepted },
        ].map((s) => (
          <div key={s.label} className="stat">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Main Card */}
      <div className="card workspace">
        {/* Header */}
        <div className="topbar">
          <h2 className="topbar-title">Rekrutmen</h2>
          <div className="tab-row">
            {(Object.entries(TAB_CONFIG) as [TabKey, typeof config][]).map(([key, cfg]) => {
              const count = allData[key]?.length ?? 0;
              return (
                <button
                  key={key}
                  className={`tab ${activeTab === key ? "active" : ""}`}
                  onClick={() => {
                    setActiveTab(key);
                    setSearchQuery("");
                    setStatusFilter("All");
                    setActiveQuickFilter("All");
                  }}
                >
                  {key === "candidates" ? <Users className="h-3.5 w-3.5" /> : key === "interviews" ? <MessageSquare className="h-3.5 w-3.5" /> : <ClipboardList className="h-3.5 w-3.5" />}
                  {cfg.label}
                  <span className="count">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Toolbar */}
        <div className="p-3 space-y-3">
          <div className="toolbar">
            <div className="search">
              <Search className="search-icon" />
              <input
                className="search-input"
                placeholder="Cari data..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="tool-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setActiveQuickFilter(e.target.value); }}
            >
              {config.statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              className="tool-select"
              value={sortBy || config.defaultSort}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {config.sortOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select
              className="tool-select"
              value={density}
              onChange={(e) => setDensity(e.target.value as "compact" | "comfortable")}
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
            </select>
            <button className="tool-btn" onClick={fetchAllData} title="Refresh">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Quick filters */}
          <div className="filter-row">
            {config.quickFilters.map((f) => (
              <button
                key={f}
                className={`filter-chip ${activeQuickFilter === f ? "active" : ""}`}
                onClick={() => handleQuickFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Meta */}
          <div className="meta-row">
            <span><strong className="text-foreground">{filtered.length}</strong> data tampil</span>
            <span>{config.label} • {statusFilter} • {config.sortOptions.find((s) => s.value === (sortBy || config.defaultSort))?.label}</span>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="table-shell"><div className="table-scroll">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Memuat data...
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <strong>Tidak ada data</strong>
              Coba ubah pencarian atau filter.
            </div>
          ) : activeTab === "candidates" ? (
            <table className="w-full min-w-[800px] text-xs">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground sticky left-0 bg-muted/30 z-10`}>Kandidat</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Posisi</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Kontak</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>CV</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Tanggal</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Status</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Tipe</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const f = r.fields;
                  return (
                    <tr key={r.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className=" sticky left-0 bg-white z-[2]">
                        <div className="row-title">{esc(f["Nama Lengkap"] || "-")}</div>
                        <div className="row-sub">{esc(f.Email || "tanpa email")}</div>
                      </td>
                      <td className="">
                        <div className="font-medium">{esc(f["Posisi Dilamar"] || "-")}</div>
                        <div className="text-[10px] text-muted-foreground">{esc(f["Sosial Media Instagram/Tiktok"] || "")}</div>
                      </td>
                      <td className="">
                        <div>{esc(f["Nomor Telepon/HP"] || "-")}</div>
                        <div className="text-[10px] text-muted-foreground">{esc(f.Email || "")}</div>
                      </td>
                      <td className="">
                        {f["CV URL"] ? (
                          <a href={f["CV URL"]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline">
                            <FileText className="h-3 w-3" /> Lihat CV
                          </a>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="">{esc(f["Application Date"] || "-")}</td>
                      <td className="">
                        <span className={`badge status-${(f.Status || "new").toLowerCase().replace(/\s+/g, "")}`}>
                          {esc(f.Status || "New")}
                        </span>
                      </td>
                      <td className="">{esc(f["Full time/Part time"] || "-")}</td>
                      <td className="">
                        <div className="flex gap-1">
                          <button className="small-btn" onClick={() => openModal(r.id, f.Status)}>Update</button>
                          <button className="small-btn" onClick={() => openDrawer(r)}>Detail</button>
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
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground sticky left-0 bg-muted/30 z-10`}>Interview</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Jadwal</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Interviewer</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Status</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Rating</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Feedback</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const f = r.fields;
                  const rating = f.Rating ? Math.min(Number(f.Rating), 5) : 0;
                  return (
                    <tr key={r.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className=" sticky left-0 bg-white z-[2]">
                        <div className="row-title">#{esc(f["Interview ID"] || r.id.slice(0, 6))}</div>
                        <div className="row-sub">{esc(f.Candidate || "kandidat tidak tercatat")}</div>
                      </td>
                      <td className="">
                        <div>{esc(f["Interview Date"] || "-")}</div>
                        <div className="text-[10px] text-muted-foreground">{esc(f["Interview Time"] || "jam belum diisi")}</div>
                      </td>
                      <td className="">{esc(f.Interviewer || "-")}</td>
                      <td className="">
                        <span className={`badge status-${(f.Status || "scheduled").toLowerCase().replace(/\s+/g, "")}`}>
                          {esc(f.Status || "Scheduled")}
                        </span>
                      </td>
                      <td className="">
                        {rating > 0 ? Array.from({ length: rating }, (_, i) => <Star key={i} className="h-3 w-3 inline text-amber-400 fill-amber-400" />) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className=" text-muted-foreground max-w-[200px] truncate">{esc(f.Feedback || "belum ada feedback")}</td>
                      <td className="">
                        <div className="flex gap-1">
                          <button className="small-btn" onClick={() => openModal(r.id)}>Update</button>
                          <button className="small-btn" onClick={() => openDrawer(r)}>Detail</button>
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
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground sticky left-0 bg-muted/30 z-10`}>Onboarding</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Mulai</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Probation</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Status</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Dokumen</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Schedule</th>
                  <th className={` text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground`}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const f = r.fields;
                  const docs = Array.isArray(f["Document Collection Status"]) ? f["Document Collection Status"].join(", ") : (f["Document Collection Status"] || "-");
                  return (
                    <tr key={r.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className=" sticky left-0 bg-white z-[2]">
                        <div className="row-title">#{esc(f["Onboarding ID"] || r.id.slice(0, 6))}</div>
                        <div className="row-sub">{esc(f.Employee || "employee belum diisi")}</div>
                      </td>
                      <td className="">{esc(f["Start Date"] || "-")}</td>
                      <td className="">{esc(f["Probation End Date"] || "-")}</td>
                      <td className="">
                        <span className={`badge status-${(f["Training Completion Status"] || "inprogress").toLowerCase().replace(/\s+/g, "")}`}>
                          {esc(f["Training Completion Status"] || "In Progress")}
                        </span>
                      </td>
                      <td className=" text-muted-foreground max-w-[150px] truncate">{esc(docs)}</td>
                      <td className=" text-muted-foreground">{esc(f["Training Schedule"] || "-")}</td>
                      <td className="">
                        <div className="flex gap-1">
                          <button className="small-btn" onClick={() => openModal(r.id)}>Update</button>
                          <button className="small-btn" onClick={() => openDrawer(r)}>Detail</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

        {/* Mobile Cards */}
        <div className="mobile-cards">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Memuat data...
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <strong>Tidak ada data</strong>
              Coba ubah pencarian atau filter.
            </div>
          ) : (
            filtered.map((r) => {
              const f = r.fields;
              if (activeTab === "candidates") {
                return (
                  <div key={r.id} className="mobile-card">
                    <div className="mobile-card-head">
                      <div>
                        <div className="font-semibold text-xs">{esc(f["Nama Lengkap"] || "-")}</div>
                        <div className="text-[10px] text-muted-foreground">{esc(f["Posisi Dilamar"] || "-")}</div>
                      </div>
                      <span className={`badge status-${(f.Status || "new").toLowerCase().replace(/\s+/g, "")}`}>{esc(f.Status || "New")}</span>
                    </div>
                    <div className="mobile-card-grid">
                      <div className="mobile-field">
                        <span className="mobile-label">Kontak</span>
                        <span className="mobile-value">{esc(f["Nomor Telepon/HP"] || "-")}</span>
                      </div>
                      <div className="mobile-field">
                        <span className="mobile-label">Tanggal</span>
                        <span className="mobile-value">{esc(f["Application Date"] || "-")}</span>
                      </div>
                    </div>
                    <div className="mobile-actions">
                      <button className="small-btn" onClick={() => openModal(r.id, f.Status)}>Update</button>
                      <button className="small-btn" onClick={() => openDrawer(r)}>Detail</button>
                    </div>
                  </div>
                );
              } else if (activeTab === "interviews") {
                const rating = f.Rating ? Math.min(Number(f.Rating), 5) : 0;
                return (
                  <div key={r.id} className="mobile-card">
                    <div className="mobile-card-head">
                      <div>
                        <div className="font-semibold text-xs">#{esc(f["Interview ID"] || r.id.slice(0, 6))}</div>
                        <div className="text-[10px] text-muted-foreground">{esc(f.Candidate || "-")}</div>
                      </div>
                      <span className={`badge status-${(f.Status || "scheduled").toLowerCase().replace(/\s+/g, "")}`}>{esc(f.Status || "Scheduled")}</span>
                    </div>
                    <div className="mobile-card-grid">
                      <div className="mobile-field">
                        <span className="mobile-label">Jadwal</span>
                        <span className="mobile-value">{esc(f["Interview Date"] || "-")}</span>
                      </div>
                      <div className="mobile-field">
                        <span className="mobile-label">Interviewer</span>
                        <span className="mobile-value">{esc(f.Interviewer || "-")}</span>
                      </div>
                    </div>
                    {rating > 0 && <div className="text-[10px]">{Array.from({ length: rating }, (_, i) => <Star key={i} className="h-3 w-3 inline text-amber-400 fill-amber-400" />)}</div>}
                    <div className="mobile-actions">
                      <button className="small-btn" onClick={() => openModal(r.id)}>Update</button>
                      <button className="small-btn" onClick={() => openDrawer(r)}>Detail</button>
                    </div>
                  </div>
                );
              } else {
                const docs = Array.isArray(f["Document Collection Status"]) ? f["Document Collection Status"].join(", ") : (f["Document Collection Status"] || "-");
                return (
                  <div key={r.id} className="mobile-card">
                    <div className="mobile-card-head">
                      <div>
                        <div className="font-semibold text-xs">#{esc(f["Onboarding ID"] || r.id.slice(0, 6))}</div>
                        <div className="text-[10px] text-muted-foreground">{esc(f.Employee || "-")}</div>
                      </div>
                      <span className={`badge status-${(f["Training Completion Status"] || "inprogress").toLowerCase().replace(/\s+/g, "")}`}>{esc(f["Training Completion Status"] || "In Progress")}</span>
                    </div>
                    <div className="mobile-card-grid">
                      <div className="mobile-field">
                        <span className="mobile-label">Mulai</span>
                        <span className="mobile-value">{esc(f["Start Date"] || "-")}</span>
                      </div>
                      <div className="mobile-field">
                        <span className="mobile-label">Dokumen</span>
                        <span className="mobile-value">{esc(docs)}</span>
                      </div>
                    </div>
                    <div className="mobile-actions">
                      <button className="small-btn" onClick={() => openModal(r.id)}>Update</button>
                      <button className="small-btn" onClick={() => openDrawer(r)}>Detail</button>
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