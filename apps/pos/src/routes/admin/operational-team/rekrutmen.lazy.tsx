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
import { useYumiAuth } from "@/hooks/useYumiAuth";

export const Route = createLazyFileRoute("/admin/operational-team/rekrutmen")({
  component: AdminRekrutmen,
});

const TAB_CONFIG = {
  candidates: {
    label: "Candidates",
    supported: true,
    readOnly: false,
    tableName: "Candidates",
    statusField: "Status",
    defaultSort: "date_desc",
    searchFields: ["Nama Lengkap", "Posisi Dilamar", "Email", "Nomor Telepon/HP"],
    statusOptions: ["All", "Application Received", "Applied", "Interview Scheduled", "Hired", "Rejected"],
    quickFilters: ["All", "Application Received", "Applied", "Interview Scheduled", "Hired", "Rejected"],
    sortOptions: [
      { value: "date_desc", label: "Terbaru" },
      { value: "date_asc", label: "Terlama" },
      { value: "name_asc", label: "Nama A-Z" },
      { value: "position_asc", label: "Posisi A-Z" },
    ],
  },
  interviews: {
    label: "Interviews",
    supported: false,
    readOnly: true,
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
    supported: true,
    readOnly: true,
    tableName: "Onboarding",
    statusField: "Training Completion Status",
    defaultSort: "date_desc",
    searchFields: ["Employee", "Onboarding ID", "Training Schedule", "Notes"],
    statusOptions: ["All", "pending", "approved", "rejected", "needs_revision"],
    quickFilters: ["All", "pending", "approved", "rejected", "needs_revision"],
    sortOptions: [
      { value: "date_desc", label: "Start terbaru" },
      { value: "date_asc", label: "Start terlama" },
      { value: "employee_asc", label: "Employee A-Z" },
    ],
  },
};

function onboardingStatusLabel(value: string): string {
  return ({ pending: "Menunggu Review", approved: "Disetujui", rejected: "Ditolak", needs_revision: "Perlu Revisi" } as Record<string, string>)[value] || value;
}

type TabKey = keyof typeof TAB_CONFIG;

interface AirtableRecord {
  id: string;
  createdTime: string;
  fields: Record<string, any>;
}

function AdminRekrutmen() {
  const { token } = useYumiAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("candidates");
  const [allData, setAllData] = useState<Record<TabKey, AirtableRecord[]>>({
    candidates: [],
    interviews: [],
    onboarding: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const [positions, setPositions] = useState<Array<{ id: string; title: string; icon: string | null; summary: string | null; is_open: boolean; sort_order: number | null }>>([]);
  const [positionBusy, setPositionBusy] = useState<string | null>(null);
  const [showPositions, setShowPositions] = useState(false);

  const config = TAB_CONFIG[activeTab];
  const records = allData[activeTab] || [];

  useEffect(() => {
    if (!sortBy && config) {
      setSortBy(config.defaultSort);
    }
  }, [activeTab]);

  useEffect(() => {
    if (token) void fetchAllData();
  }, [token]);

  async function fetchAllData() {
    setLoading(true);
    setLoadError(null);
    try {
      const headers = { "X-Yumi-Session": token || "" };
      const [cRes, oRes] = await Promise.all([
        fetch("/api/rekrutmen/table/Candidates", { headers }),
        fetch("/api/rekrutmen/table/Onboarding", { headers }),
      ]);
      const [cData, oData] = await Promise.all([cRes.json(), oRes.json()]);
      if ([cRes, oRes].some((response) => response.status === 401 || response.status === 403)) {
        throw new Error("Sesi admin tidak valid atau akses ditolak");
      }
      if (!cRes.ok || !oRes.ok) {
        throw new Error(String(cData.error || oData.error || "Data recruitment gagal dimuat"));
      }
      setAllData({
        candidates: cData.records || [],
        interviews: [],
        onboarding: oData.records || [],
      });
      void fetchPositions();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Gagal memuat data recruitment";
      setLoadError(message);
      console.error("Gagal fetch rekrutmen data:", e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPositions() {
    try {
      const headers = { "X-Yumi-Session": token || "" };
      const res = await fetch("/api/rekrutmen/recruitment-positions-admin", { headers });
      if (!res.ok) return setPositions([]);
      const data = await res.json();
      setPositions(Array.isArray(data) ? data : []);
    } catch {
      setPositions([]);
    }
  }

  async function togglePosition(id: string) {
    if (positionBusy) return;
    setPositionBusy(id);
    try {
      const target = positions.find((p) => p.id === id);
      if (!target) return;
      const headers = { "X-Yumi-Session": token || "", "Content-Type": "application/json" };
      const res = await fetch(`/api/rekrutmen/recruitment-positions/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ is_open: !target.is_open }),
      });
      if (!res.ok) throw new Error("Gagal memperbarui status lowongan");
      await fetchPositions();
    } catch (e) {
      console.error("Gagal toggle posisi:", e);
    } finally {
      setPositionBusy(null);
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
    if (config.readOnly) {
      alert("Data onboarding bersumber dari workflow onboarding dan hanya dapat dibaca di sini.");
      closeModal();
      return;
    }
    setSaving(true);
    const payload: Record<string, string> = { [config.statusField]: modalStatus };
    if (modalNotes.trim()) payload.Notes = modalNotes.trim();
    try {
      const res = await fetch(`/api/rekrutmen/table/${config.tableName}/${modalRecordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Yumi-Session": token || "" },
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
      review: c.filter((r) => ["Application Received", "Applied", "Review", "New"].includes(r.fields.Status)).length,
      interview: c.filter((r) => ["Interview Scheduled", "Interview"].includes(r.fields.Status)).length,
      accepted: c.filter((r) => ["Hired", "Accepted"].includes(r.fields.Status)).length,
      rejected: c.filter((r) => ["Rejected"].includes(r.fields.Status)).length,
    };
  }, [allData]);

  // thClass/tdClass removed — CSS handles styling

  function renderDetailDrawer() {
    if (!drawerRecord) return null;
    const f = drawerRecord.fields;
    const tab = activeTab;

    if (tab === "onboarding") {
      const status = String(f["Training Completion Status"] || "pending");
      return (
        <div className={`rk-sheet ${drawerRecord ? "open" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) closeDrawer(); }}>
          <div className="rk-sheet-overlay" onClick={closeDrawer} />
          <div className="rk-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[var(--rk-text)]">{esc(f.Employee || "Detail Onboarding")}</h3>
              <button className="rk-card-action !min-h-[36px] !min-w-[36px] !p-2 !border-0" onClick={closeDrawer}><X className="h-5 w-5" /></button>
            </div>
            <div className="mb-5"><span className={`rk-card-badge rk-status-${status.toLowerCase().replace(/\s+/g, "")}`}>{onboardingStatusLabel(status)}</span></div>
            <div className="rk-sheet-section">
              <div className="rk-sheet-section-title">Onboarding</div>
              <div className="rk-sheet-field"><span className="rk-sheet-field-label">ID</span><span className="rk-sheet-field-value">{esc(f["Onboarding ID"] || drawerRecord.id)}</span></div>
              <div className="rk-sheet-field"><span className="rk-sheet-field-label">Mulai</span><span className="rk-sheet-field-value">{esc(f["Start Date"] || "-")}</span></div>
              <div className="rk-sheet-field"><span className="rk-sheet-field-label">Akhir probation</span><span className="rk-sheet-field-value">{esc(f["Probation End Date"] || "-")}</span></div>
              <div className="rk-sheet-field"><span className="rk-sheet-field-label">Jadwal training</span><span className="rk-sheet-field-value">{esc(f["Training Schedule"] || "-")}</span></div>
            </div>
            <div className="rk-sheet-section">
              <div className="rk-sheet-section-title">Kontak & review</div>
              <div className="rk-sheet-field"><span className="rk-sheet-field-label">Email</span><span className="rk-sheet-field-value">{esc(f.Email || "-")}</span></div>
              <div className="rk-sheet-field"><span className="rk-sheet-field-label">No HP</span><span className="rk-sheet-field-value">{esc(f["Nomor Telepon/HP"] || "-")}</span></div>
              <div className="rk-sheet-field"><span className="rk-sheet-field-label">Sosial media</span><span className="rk-sheet-field-value">{esc(f["Sosial Media Instagram/Tiktok"] || f["Sosial Media"] || "Belum diisi")}</span></div>
              <div className="rk-sheet-field"><span className="rk-sheet-field-label">Catatan</span><span className="rk-sheet-field-value">{esc(f.Notes || "Belum ada catatan")}</span></div>
            </div>
            <div className="rk-sheet-section"><div className="text-sm text-[var(--rk-muted)]">Data ini hanya-baca dan bersumber dari workflow onboarding karyawan.</div></div>
          </div>
        </div>
      );
    }

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

        {/* Positions management (buka/tutup lowongan) */}
        <div className="rk-positions">
          <div className="rk-positions-head">
            <div>
              <div className="rk-positions-title">Pengaturan Lowongan</div>
              <div className="rk-positions-sub">Kontrol posisi yang tampil di rekrutmen.djiwatentram.web.id. Perubahan langsung tersinkron.</div>
            </div>
            <button className="rk-segmented-item" onClick={() => setShowPositions((v) => !v)}>{showPositions ? "Sembunyikan" : "Kelola"}</button>
          </div>
          {showPositions && (
            <div className="rk-positions-list">
              {positions.length === 0 && <div className="rk-positions-empty">Memuat posisi…</div>}
              {positions.map((p) => (
                <div key={p.id} className="rk-positions-row">
                  <div className="rk-positions-meta">
                    <strong>{p.title}</strong>
                    <span>{p.is_open ? "Dibuka" : "Ditutup"}</span>
                  </div>
                  <button
                    className={`rk-positions-toggle ${p.is_open ? "on" : ""}`}
                    disabled={positionBusy === p.id}
                    aria-label={`${p.is_open ? "Tutup" : "Buka"} lowongan ${p.title}`}
                    onClick={() => void togglePosition(p.id)}
                  >
                    {positionBusy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <span />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary (compact) */}
        <div className="rk-summary" aria-label="Ringkasan kandidat">
          <span className="rk-summary-total"><strong>{stats.total}</strong> Kandidat</span>
          <button className="rk-summary-chip" onClick={() => { setActiveTab('candidates'); handleQuickFilter('Application Received'); }}>{stats.review} Masuk</button>
          <button className="rk-summary-chip" onClick={() => { setActiveTab('candidates'); handleQuickFilter('Interview Scheduled'); }}>{stats.interview} Interview</button>
          <button className="rk-summary-chip" onClick={() => { setActiveTab('candidates'); handleQuickFilter('Hired'); }}>{stats.accepted} Diterima</button>
          <button className="rk-summary-chip" onClick={() => { setActiveTab('candidates'); handleQuickFilter('Rejected'); }}>{stats.rejected} Ditolak</button>
        </div>

        {loadError && (
          <div className="rk-empty !min-h-0 !p-4 !mb-4" role="alert">
            <div className="rk-empty-title">Data kandidat belum dapat dimuat</div>
            <div className="rk-empty-desc">{loadError}. Pastikan login sebagai admin lalu coba refresh.</div>
            <button className="rk-empty-cta" onClick={fetchAllData}><RefreshCw className="h-4 w-4" /> Coba lagi</button>
          </div>
        )}

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
              {activeTab === "onboarding" ? onboardingStatusLabel(f) : f}
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
                disabled={cfg.supported === false}
                title={cfg.supported === false ? "Belum tersedia: belum ada tabel sumber interview" : undefined}
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
          ) : !config.supported ? (
            <div className="rk-empty">
              <div className="rk-empty-icon"><MessageSquare className="h-7 w-7" /></div>
              <div className="rk-empty-title">Interviews belum tersedia</div>
              <div className="rk-empty-desc">Belum ada tabel sumber interview di schema recruitment. Tab ini tidak menampilkan data sintetis.</div>
            </div>
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
                      <span className={`rk-card-badge rk-status-${(f["Training Completion Status"] || "pending").toLowerCase().replace(/\s+/g, "")}`}>{onboardingStatusLabel(String(f["Training Completion Status"] || "pending"))}</span>
                    </div>
                    <div className="rk-card-meta">
                      <span>{esc(f["Start Date"] || "-")}</span>
                      <span>{esc(docs)}</span>
                    </div>
                    <div className="rk-card-actions">
                      <button className="rk-card-action" onClick={() => openDrawer(r)}>Detail</button>
                      <span className="text-[10px] text-muted-foreground">Hanya-baca</span>
                    </div>
                  </div>
                );
              }
            })
          )}
        </div>

        {/* Candidate Table (primary) */}
        <div className="rk-table">
          {loading ? (
            <div className="rk-loading">Memuat data...</div>
          ) : !config.supported ? (
            <div className="rk-empty">
              <div className="rk-empty-icon"><MessageSquare className="h-7 w-7" /></div>
              <div className="rk-empty-title">Interviews belum tersedia</div>
              <div className="rk-empty-desc">Belum ada tabel sumber interview di schema recruitment. Tab ini tidak menampilkan data sintetis.</div>
            </div>
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
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground sticky left-0 bg-muted/30 z-10">Kandidat</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Posisi</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Sosmed</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Gender</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Lahir</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Kontak</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Tipe</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Catatan</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">CV</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Tanggal</th>
                  <th className="text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Status</th>
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
                      <td>{esc(f["Posisi Dilamar"] || "-")}</td>
                      <td className="max-w-[180px] truncate text-muted-foreground" title={f["Sosial Media Instagram/Tiktok"] || f["Sosial Media"] || "Belum diisi"}>{esc(f["Sosial Media Instagram/Tiktok"] || f["Sosial Media"] || "-")}</td>
                      <td>{esc(f["Jenis Kelamin"] || "-")}</td>
                      <td>{esc(f["Tanggal Lahir"] || "-")}</td>
                      <td>{esc(f["Nomor Telepon/HP"] || "-")}</td>
                      <td>{esc(f["Full time/Part time"] || "-")}</td>
                      <td className="max-w-[220px] truncate text-muted-foreground" title={f.Notes || "Belum ada catatan"}>{esc(f.Notes || "-")}</td>
                      <td>{f["CV URL"] ? <a className="text-blue-600 hover:underline" href={String(f["CV URL"])} target="_blank" rel="noreferrer">Buka CV</a> : <span className="text-muted-foreground">-</span>}</td>
                      <td>{esc(f["Application Date"] || "-")}</td>
                      <td>
                        <span className={`rk-card-badge rk-status-${(f.Status || "new").toLowerCase().replace(/\\s+/g, "")}`}>
                          {esc(f.Status || "New")}
                        </span>
                      </td>
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
                        <span className={`rk-card-badge rk-status-${(f["Training Completion Status"] || "pending").toLowerCase().replace(/\s+/g, "")}`}>
                          {onboardingStatusLabel(String(f["Training Completion Status"] || "pending"))}
                        </span>
                      </td>
                      <td className="text-muted-foreground max-w-[150px] truncate">{esc(docs)}</td>
                      <td className="text-muted-foreground">{esc(f["Training Schedule"] || "-")}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button className="rk-card-action" onClick={() => openDrawer(r)}>Detail</button>
                          <span className="text-[10px] text-muted-foreground">Hanya-baca</span>
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