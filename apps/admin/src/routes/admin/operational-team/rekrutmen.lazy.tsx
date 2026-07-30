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
  const [moreMenuId, setMoreMenuId] = useState<string | null>(null);

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

    return (
      <div className={`rk-sheet ${drawerRecord ? "open" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) closeDrawer(); }}>
        <div className="rk-sheet-overlay" onClick={closeDrawer} />
        <div className="rk-sheet-content" onClick={(e) => e.stopPropagation()}>
          {/* Drag handle */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[var(--rk-text)]">{esc(f["Nama Lengkap"] || "Detail")}</h3>
            <button className="rk-card-action !min-h-[36px] !min-w-[36px] !p-2 !border-0" onClick={closeDrawer}>
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Status Badge */}
          <div className="mb-5">
            <span className={`rk-card-badge rk-status-${(f.Status || "new").toLowerCase().replace(/\\s+/g, "")}`}>{esc(f.Status || "New")}</span>
          </div>

          {/* Profile Section */}
          <div className="rk-sheet-section">
            <div className="rk-sheet-section-title">Profile</div>
            <div className="rk-sheet-field">
              <span className="rk-sheet-field-label">Posisi</span>
              <span className="rk-sheet-field-value">{esc(f["Posisi Dilamar"] || "-")}</span>
            </div>
            <div className="rk-sheet-field">
              <span className="rk-sheet-field-label">Tipe</span>
              <span className="rk-sheet-field-value">{esc(f["Full time/Part time"] || "-")}</span>
            </div>
            <div className="rk-sheet-field">
              <span className="rk-sheet-field-label">Tanggal Daftar</span>
              <span className="rk-sheet-field-value">{esc(f["Application Date"] || "-")}</span>
            </div>
            <div className="rk-sheet-field">
              <span className="rk-sheet-field-label">Jenis Kelamin</span>
              <span className="rk-sheet-field-value">{esc(f["Jenis Kelamin"] || "-")}</span>
            </div>
            <div className="rk-sheet-field">
              <span className="rk-sheet-field-label">Tanggal Lahir</span>
              <span className="rk-sheet-field-value">{esc(f["Tanggal Lahir"] || "-")}</span>
            </div>
          </div>

          {/* Contact Section */}
          <div className="rk-sheet-section">
            <div className="rk-sheet-section-title">Kontak</div>
            <div className="rk-sheet-field">
              <span className="rk-sheet-field-label">No HP</span>
              <span className="rk-sheet-field-value">{esc(f["Nomor Telepon/HP"] || "-")}</span>
            </div>
            <div className="rk-sheet-field">
              <span className="rk-sheet-field-label">Email</span>
              <span className="rk-sheet-field-value">{esc(f.Email || "-")}</span>
            </div>
            <div className="rk-sheet-field">
              <span className="rk-sheet-field-label">Sosmed</span>
              <span className="rk-sheet-field-value">{esc(f["Sosial Media Instagram/Tiktok"] || "-")}</span>
            </div>
          </div>

          {/* CV Section */}
          <div className="rk-sheet-section">
            <div className="rk-sheet-section-title">Curriculum Vitae</div>
            {f["CV URL"] ? (
              <a href={esc(f["CV URL"])} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl bg-[var(--rk-bg)] text-sm font-semibold text-[var(--rk-primary)] no-underline">
                <FileText className="h-5 w-5" />
                Download CV
              </a>
            ) : (
              <div className="text-sm text-[var(--rk-muted)]">Tidak ada CV</div>
            )}
          </div>

          {/* Notes Section */}
          <div className="rk-sheet-section">
            <div className="rk-sheet-section-title">Catatan</div>
            <div className="text-sm text-[var(--rk-text)] leading-relaxed">
              {esc(f.Notes || "Belum ada catatan")}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rk-sheet-section">
            <div className="rk-sheet-section-title">Aksi</div>
            <div className="rk-sheet-actions">
              <button className="rk-sheet-action primary" onClick={() => { closeDrawer(); openModal(drawerRecord.id, f.Status); }}>
                <FileSignature className="h-4 w-4" /> Review Kandidat
              </button>
              <button className="rk-sheet-action secondary" onClick={() => { closeDrawer(); openModal(drawerRecord.id, "Accepted"); }}>
                <Check className="h-4 w-4" /> Terima
              </button>
            </div>
          </div>
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
      <div className="rk">
        {/* Header */}
        <div className="rk-header">
          <h1 className="rk-header-title">Recruitment</h1>
          <p className="rk-header-sub">{stats.total} Candidates</p>
          <button className="rk-header-action" onClick={fetchAllData} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Stats */}
        <div className="rk-stats">
          {[
            { label: "Total Candidates", value: stats.total, trend: "+18 minggu ini" },
            { label: "Interview", value: stats.interview, percent: stats.total > 0 ? `${Math.round(stats.interview / stats.total * 100)}%` : "0%", trend: "+3 minggu ini" },
            { label: "Diterima", value: stats.accepted, percent: stats.total > 0 ? `${Math.round(stats.accepted / stats.total * 100)}%` : "0%", trend: "+2 minggu ini" },
          ].map((s) => (
            <div key={s.label} className="rk-stat">
              <div className="rk-stat-value">{s.value}</div>
              <div className="rk-stat-label">{s.label}</div>
              <div className="rk-stat-sub">
                <span className="rk-stat-trend up">{s.trend}</span>
                {s.percent && <span className="rk-stat-percent">{s.percent}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="rk-search">
          <Search className="rk-search-icon" />
          <input
            className="rk-search-input"
            placeholder="Search candidate..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Sort */}
        <div className="rk-sort-row">
          <span className="rk-sort-label">Sort</span>
          <select className="rk-sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {config.sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Segmented Filters */}
        <div className="rk-segmented">
          {config.quickFilters.map((f) => (
            <button
              key={f}
              className={`rk-segmented-item ${activeQuickFilter === f ? "active" : ""}`}
              onClick={() => handleQuickFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Tab Bar */}
        <div className="rk-tab-row">
          {(Object.entries(TAB_CONFIG) as [TabKey, typeof config][]).map(([key, cfg]) => {
            const count = allData[key]?.length ?? 0;
            return (
              <button
                key={key}
                className={`rk-tab ${activeTab === key ? "active" : ""}`}
                onClick={() => {
                  setActiveTab(key);
                  setSearchQuery("");
                  setStatusFilter("All");
                  setActiveQuickFilter("All");
                }}
              >
                {key === "candidates" ? <Users className="h-3.5 w-3.5" /> : key === "interviews" ? <MessageSquare className="h-3.5 w-3.5" /> : <ClipboardList className="h-3.5 w-3.5" />}
                {cfg.label}
                <span className="rk-count">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Candidate List (Mobile Cards) */}
        <div className="rk-list">
          {loading ? (
            <div className="rk-loading">Memuat data...</div>
          ) : filtered.length === 0 ? (
            <div className="rk-empty">
              <div className="rk-empty-icon">
                <Users className="h-7 w-7" />
              </div>
              <div className="rk-empty-title">Belum ada kandidat</div>
              <div className="rk-empty-desc">
                {searchQuery ? "Tidak ada hasil untuk pencarian ini. Coba ubah kata kunci." : "Kandidat yang memenuhi kriteria akan muncul di sini."}
              </div>
              {!searchQuery && (
                <button className="rk-empty-cta" onClick={fetchAllData}>
                  <RefreshCw className="h-4 w-4" /> Refresh Data
                </button>
              )}
            </div>
          ) : (
            filtered.map((r) => {
              const f = r.fields;
              if (activeTab === "candidates") {
                return (
                  <div key={r.id} className="rk-card">
                    <div className="rk-card-header">
                      <div>
                        <div className="rk-card-name">{esc(f["Nama Lengkap"] || "-")}</div>
                        <div className="rk-card-position">{esc(f["Posisi Dilamar"] || "-")}</div>
                      </div>
                      <span className={`rk-card-badge rk-status-${(f.Status || "new").toLowerCase().replace(/\\s+/g, "")}`}>{esc(f.Status || "New")}</span>
                    </div>
                    <div className="rk-card-meta">
                      <span>{esc(f["Nomor Telepon/HP"] || "-")}</span>
                      <span>{esc(f["Application Date"] || "-")}</span>
                    </div>
                    <div className="rk-card-actions">
                      <button className="rk-card-action" onClick={() => openDrawer(r)}>
                        Detail
                      </button>
                      <div className="rk-more-wrap">
                        <button className="rk-more-btn" onClick={() => setMoreMenuId(moreMenuId === r.id ? null : r.id)}>
                          More <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        {moreMenuId === r.id && (
                          <div className="rk-more-menu">
                            <button className="rk-more-menu-item" onClick={() => { setMoreMenuId(null); openModal(r.id, f.Status); }}>
                              <FileSignature className="h-4 w-4" /> Review
                            </button>
                            <button className="rk-more-menu-item" onClick={() => { setMoreMenuId(null); openModal(r.id, f.Status); }}>
                              <MessageSquare className="h-4 w-4" /> Schedule Interview
                            </button>
                            <button className="rk-more-menu-item" onClick={() => { setMoreMenuId(null); openModal(r.id, "Accepted"); }}>
                              <Check className="h-4 w-4" /> Accept
                            </button>
                            <button className="rk-more-menu-item" onClick={() => { setMoreMenuId(null); openModal(r.id, "Rejected"); }}>
                              <X className="h-4 w-4" /> Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              } else if (activeTab === "interviews") {
                const rating = f.Rating ? Math.min(Number(f.Rating), 5) : 0;
                return (
                  <div key={r.id} className="rk-card">
                    <div className="rk-card-header">
                      <div>
                        <div className="rk-card-name">#{esc(f["Interview ID"] || r.id.slice(0, 6))}</div>
                        <div className="rk-card-position">{esc(f.Candidate || "-")}</div>
                      </div>
                      <span className={`rk-card-badge rk-status-${(f.Status || "scheduled").toLowerCase().replace(/\\s+/g, "")}`}>{esc(f.Status || "Scheduled")}</span>
                    </div>
                    <div className="rk-card-meta">
                      <span>{esc(f["Interview Date"] || "-")}</span>
                      <span>{esc(f.Interviewer || "-")}</span>
                    </div>
                    {rating > 0 && <div className="rating">{Array.from({ length: rating }, (_, i) => <Star key={i} className="rating-star" />)}</div>}
                    <div className="rk-card-actions">
                      <button className="rk-card-action" onClick={() => openDrawer(r)}>Detail</button>
                      <div className="rk-more-wrap">
                        <button className="rk-more-btn" onClick={() => setMoreMenuId(moreMenuId === r.id ? null : r.id)}>
                          More <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        {moreMenuId === r.id && (
                          <div className="rk-more-menu">
                            <button className="rk-more-menu-item" onClick={() => { setMoreMenuId(null); openModal(r.id); }}>
                              <FileSignature className="h-4 w-4" /> Update Status
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              } else {
                const docs = Array.isArray(f["Document Collection Status"]) ? f["Document Collection Status"].join(", ") : (f["Document Collection Status"] || "-");
                return (
                  <div key={r.id} className="rk-card">
                    <div className="rk-card-header">
                      <div>
                        <div className="rk-card-name">#{esc(f["Onboarding ID"] || r.id.slice(0, 6))}</div>
                        <div className="rk-card-position">{esc(f.Employee || "-")}</div>
                      </div>
                      <span className={`rk-card-badge rk-status-${(f["Training Completion Status"] || "inprogress").toLowerCase().replace(/\\s+/g, "")}`}>{esc(f["Training Completion Status"] || "In Progress")}</span>
                    </div>
                    <div className="rk-card-meta">
                      <span>{esc(f["Start Date"] || "-")}</span>
                      <span>{esc(docs)}</span>
                    </div>
                    <div className="rk-card-actions">
                      <button className="rk-card-action" onClick={() => openDrawer(r)}>Detail</button>
                      <div className="rk-more-wrap">
                        <button className="rk-more-btn" onClick={() => setMoreMenuId(moreMenuId === r.id ? null : r.id)}>
                          More <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        {moreMenuId === r.id && (
                          <div className="rk-more-menu">
                            <button className="rk-more-menu-item" onClick={() => { setMoreMenuId(null); openModal(r.id); }}>
                              <FileSignature className="h-4 w-4" /> Update Status
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
            })
          )}
        </div>

        {/* Desktop Table */}
        <div className="rk-table desktop-only">
          {loading ? (
            <div className="rk-loading">Memuat data...</div>
          ) : filtered.length === 0 ? (
            <div className="rk-empty">
              <div className="rk-empty-icon">
                <Users className="h-7 w-7" />
              </div>
              <div className="rk-empty-title">Belum ada data</div>
              <div className="rk-empty-desc">
                {searchQuery ? "Tidak ada hasil untuk pencarian ini." : "Belum ada data untuk ditampilkan."}
              </div>
            </div>
          ) : activeTab === "candidates" ? (
            <table className="w-full min-w-[800px] text-xs">
              <thead>
                <tr>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground sticky left-0 bg-muted/30 z-10">Kandidat</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Posisi</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Kontak</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">CV</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Tanggal</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Tipe</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const f = r.fields;
                  return (
                    <tr key={r.id}>
                      <td className="sticky left-0 bg-white z-[2]">
                        <div className="row-title">{esc(f["Nama Lengkap"] || "-")}</div>
                        <div className="row-sub">{esc(f.Email || "tanpa email")}</div>
                      </td>
                      <td>
                        <div>{esc(f["Posisi Dilamar"] || "-")}</div>
                        <div className="row-sub">{esc(f["Sosial Media Instagram/Tiktok"] || "")}</div>
                      </td>
                      <td>
                        <div>{esc(f["Nomor Telepon/HP"] || "-")}</div>
                        <div className="row-sub">{esc(f.Email || "")}</div>
                      </td>
                      <td>
                        {f["CV URL"] ? (
                          <a href={f["CV URL"]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline">
                            <FileText className="h-3 w-3" /> Lihat CV
                          </a>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">-</span>
                        )}
                      </td>
                      <td>{esc(f["Application Date"] || "-")}</td>
                      <td>
                        <span className={`rk-card-badge rk-status-${(f.Status || "new").toLowerCase().replace(/\\s+/g, "")}`}>
                          {esc(f.Status || "New")}
                        </span>
                      </td>
                      <td>{esc(f["Full time/Part time"] || "-")}</td>
                      <td>
                        <div className="flex gap-1">
                          <button className="rk-card-action" onClick={() => openModal(r.id, f.Status)}>Update</button>
                          <button className="rk-card-action" onClick={() => openDrawer(r)}>Detail</button>
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
                <tr>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground sticky left-0 bg-muted/30 z-10">Interview</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Jadwal</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Interviewer</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Rating</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Feedback</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const f = r.fields;
                  const rating = f.Rating ? Math.min(Number(f.Rating), 5) : 0;
                  return (
                    <tr key={r.id}>
                      <td className="sticky left-0 bg-white z-[2]">
                        <div className="row-title">#{esc(f["Interview ID"] || r.id.slice(0, 6))}</div>
                        <div className="row-sub">{esc(f.Candidate || "kandidat tidak tercatat")}</div>
                      </td>
                      <td>
                        <div>{esc(f["Interview Date"] || "-")}</div>
                        <div className="row-sub">{esc(f["Interview Time"] || "jam belum diisi")}</div>
                      </td>
                      <td>{esc(f.Interviewer || "-")}</td>
                      <td>
                        <span className={`rk-card-badge rk-status-${(f.Status || "scheduled").toLowerCase().replace(/\\s+/g, "")}`}>
                          {esc(f.Status || "Scheduled")}
                        </span>
                      </td>
                      <td>
                        {rating > 0 ? Array.from({ length: rating }, (_, i) => <Star key={i} className="rating-star" />) : <span>-</span>}
                      </td>
                      <td className="text-muted-foreground max-w-[200px] truncate">{esc(f.Feedback || "belum ada feedback")}</td>
                      <td>
                        <div className="flex gap-1">
                          <button className="rk-card-action" onClick={() => openModal(r.id)}>Update</button>
                          <button className="rk-card-action" onClick={() => openDrawer(r)}>Detail</button>
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
                <tr>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground sticky left-0 bg-muted/30 z-10">Onboarding</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Mulai</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Probation</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Dokumen</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Schedule</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const f = r.fields;
                  const docs = Array.isArray(f["Document Collection Status"]) ? f["Document Collection Status"].join(", ") : (f["Document Collection Status"] || "-");
                  return (
                    <tr key={r.id}>
                      <td className="sticky left-0 bg-white z-[2]">
                        <div className="row-title">#{esc(f["Onboarding ID"] || r.id.slice(0, 6))}</div>
                        <div className="row-sub">{esc(f.Employee || "employee belum diisi")}</div>
                      </td>
                      <td>{esc(f["Start Date"] || "-")}</td>
                      <td>{esc(f["Probation End Date"] || "-")}</td>
                      <td>
                        <span className={`rk-card-badge rk-status-${(f["Training Completion Status"] || "inprogress").toLowerCase().replace(/\\s+/g, "")}`}>
                          {esc(f["Training Completion Status"] || "In Progress")}
                        </span>
                      </td>
                      <td className="text-muted-foreground max-w-[150px] truncate">{esc(docs)}</td>
                      <td className="text-muted-foreground">{esc(f["Training Schedule"] || "-")}</td>
                      <td>
                        <div className="flex gap-1">
                          <button className="rk-card-action" onClick={() => openModal(r.id)}>Update</button>
                          <button className="rk-card-action" onClick={() => openDrawer(r)}>Detail</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Drawer, Modal & Confirm */}
        {renderDetailDrawer()}
        {renderModal()}
      </div>
    );
}