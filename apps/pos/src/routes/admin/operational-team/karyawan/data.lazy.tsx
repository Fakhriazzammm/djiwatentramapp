import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useHybridPublicUsers } from "@/hooks/use-hybrid-attendance-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Search,
	X,
	FileText,
	FileSpreadsheet,
	User,
	Camera,
	Eye,
	Loader2,
	ChevronUp,
	ChevronDown,
	ChevronRight,
	ChevronLeft,
	ArrowUpDown,
	IdCard,
	Building2,
	PhoneCall,
	Trash2,
} from "lucide-react";
import { toast } from "sonner";
import * as React from "react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

const MONTHS = [
	"Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
	"Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function fmtDate(val?: string | number) {
	if (!val) return "\u2014";
	const d = new Date(val);
	if (isNaN(d.getTime())) return String(val);
	return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtCurrency(val?: number) {
	if (val == null || val === 0) return "\u2014";
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
	}).format(val);
}

function buildCsvRow(row: any, r: any): string {
	const esc = (v: any) => {
		const s = String(v ?? "");
		return s.includes(",") || s.includes('"') || s.includes("\n")
			? `"${s.replace(/"/g, '""')}"`
			: s;
	};
	return [
		esc(row.name),
		esc(row.username),
		esc(r.roleName),
		esc(r.phone),
		esc(r.identityNumber),
		esc(r.placeOfBirth),
		esc(r.birthDate),
		esc(r.address),
		esc(r.startDate),
		esc(r.employmentType),
		r.monthlySalary ?? "",
		esc(r.location),
		esc(r.emergencyContactName),
		esc(r.emergencyContactPhone),
		row.isActive ? "Aktif" : "Nonaktif",
		row.hasFace ? "Ya" : "Tidak",
		r.cvUrl ? "Ada" : "Tidak",
	].join(",");
}

const CSV_HEADER = [
	"Nama", "Username", "Role", "No HP", "No Identitas",
	"Tempat Lahir", "Tgl Lahir", "Alamat", "Tgl Mulai",
	"Status Kerja", "Gaji Pokok", "Lokasi",
	"Kontak Darurat", "No Darurat",
	"Status", "Wajah", "CV",
].join(",");

const STATUS_OPTIONS = [
	{ value: "", label: "Semua" },
	{ value: "active", label: "Aktif" },
	{ value: "inactive", label: "Nonaktif" },
	{ value: "no_phone", label: "Belum No HP" },
	{ value: "has_phone", label: "Sudah No HP" },
];

function DetailRow({ row, expanded }: { row: any; expanded: boolean }) {
	const r = (row as any).raw ?? {};
	if (!expanded) return null;
	return (
		<tr className="border-b border-border/20 bg-muted/10">
			<td colSpan={16} className="p-0">
				<div className="px-3 py-3">
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
						<div className="rounded-lg border border-border/40 p-2.5 space-y-1.5">
							<div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-primary">
								<IdCard className="h-3 w-3" />
								Identitas
							</div>
							<div className="space-y-1">
								<div className="flex justify-between text-[10px]">
									<span className="text-muted-foreground">No Identitas</span>
									<span className="font-medium">{r.identityNumber || "\u2014"}</span>
								</div>
								<div className="flex justify-between text-[10px]">
									<span className="text-muted-foreground">TTL</span>
									<span className="font-medium text-right">
										{r.placeOfBirth ? `${r.placeOfBirth}, ` : ""}{fmtDate(r.birthDate)}
									</span>
								</div>
								<div className="flex justify-between text-[10px]">
									<span className="text-muted-foreground">Alamat</span>
									<span className="font-medium text-right max-w-[200px] truncate">{r.address || "\u2014"}</span>
								</div>
							</div>
						</div>
						<div className="rounded-lg border border-border/40 p-2.5 space-y-1.5">
							<div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-primary">
								<Building2 className="h-3 w-3" />
								Pekerjaan
							</div>
							<div className="space-y-1">
								<div className="flex justify-between text-[10px]">
									<span className="text-muted-foreground">Tgl Mulai</span>
									<span className="font-medium">{fmtDate(r.startDate)}</span>
								</div>
								<div className="flex justify-between text-[10px]">
									<span className="text-muted-foreground">Gaji Pokok</span>
									<span className="font-medium">{fmtCurrency(r.monthlySalary)}</span>
								</div>
								<div className="flex justify-between text-[10px]">
									<span className="text-muted-foreground">Lokasi</span>
									<span className="font-medium">{r.location || "\u2014"}</span>
								</div>
							</div>
						</div>
						<div className="rounded-lg border border-border/40 p-2.5 space-y-1.5">
							<div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-primary">
								<PhoneCall className="h-3 w-3" />
								Kontak Darurat
							</div>
							{r.emergencyContactName ? (
								<div className="space-y-1">
									<div className="flex justify-between text-[10px]">
										<span className="text-muted-foreground">Nama</span>
										<span className="font-medium">{r.emergencyContactName}</span>
									</div>
									<div className="flex justify-between text-[10px]">
										<span className="text-muted-foreground">No HP</span>
										<span className="font-medium">{r.emergencyContactPhone || "\u2014"}</span>
									</div>
								</div>
							) : (
								<p className="text-[10px] text-muted-foreground italic">Tidak ada data</p>
							)}
						</div>
					</div>
				</div>
			</td>
		</tr>
	);
}

function DataKaryawanPage() {
	const navigate = useNavigate();
	const allStaff = useHybridPublicUsers();
	const [searchQuery, setSearchQuery] = useState("");
	const [roleFilter, setRoleFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState("");
	const [sortCol, setSortCol] = useState("name");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
	const [isExporting, setIsExporting] = useState<"pdf" | "csv" | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
	const [isBulkDeleting, setIsBulkDeleting] = useState(false);
	const [confirmModal, setConfirmModal] = useState<{
		isOpen: boolean;
		title: string;
		subtitle?: string;
		message: string;
		confirmText?: string;
		loading: boolean;
		variant?: "danger" | "warning" | "info";
		onConfirm: () => void;
	}>({
		isOpen: false,
		title: "",
		message: "",
		loading: false,
		onConfirm: () => {},
	});

	const allRoles = useMemo(() => {
		const roles = new Set<string>();
		(allStaff ?? []).forEach((s: any) => {
			if (s.roleName) roles.add(s.roleName);
		});
		return Array.from(roles).sort();
	}, [allStaff]);

	const stats = useMemo(() => {
		if (!Array.isArray(allStaff)) return { total: 0, active: 0, inactive: 0, noPhone: 0 };
		const total = allStaff.length;
		const active = allStaff.filter((s: any) => s.isActive !== false).length;
		const inactive = allStaff.filter((s: any) => s.isActive === false).length;
		const noPhone = allStaff.filter((s: any) => !((s as any).raw?.phone)).length;
		return { total, active, inactive, noPhone };
	}, [allStaff]);

	const filtered = useMemo(() => {
		const list = Array.isArray(allStaff) ? allStaff : [];
		const q = searchQuery.toLowerCase().trim();
		let result = list.filter((row: any) => {
			const r = (row as any).raw ?? {};
			if (q && !row.name?.toLowerCase().includes(q) && !row.username?.toLowerCase().includes(q) && !(r.phone || "").includes(q)) return false;
			if (roleFilter && row.roleName !== roleFilter) return false;
			if (statusFilter === "active" && row.isActive === false) return false;
			if (statusFilter === "inactive" && row.isActive !== false) return false;
			if (statusFilter === "no_phone" && ((row as any).raw?.phone)) return false;
			if (statusFilter === "has_phone" && !(row as any).raw?.phone) return false;
			return true;
		});
		result.sort((a: any, b: any) => {
			const ra = (a as any).raw ?? {};
			const rb = (b as any).raw ?? {};
			let va: any, vb: any;
			switch (sortCol) {
				case "name": va = a.name; vb = b.name; break;
				case "role": va = a.roleName; vb = b.roleName; break;
				case "phone": va = ra.phone; vb = rb.phone; break;
				case "status": va = a.isActive; vb = b.isActive; break;
				default: va = a.name; vb = b.name;
			}
			va = String(va ?? "").toLowerCase();
			vb = String(vb ?? "").toLowerCase();
			return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
		});
		return result;
	}, [allStaff, searchQuery, roleFilter, statusFilter, sortCol, sortDir]);

	const handleSort = (col: string) => {
		if (sortCol === col) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortCol(col);
			setSortDir("asc");
		}
	};

	const SortIcon = ({ col }: { col: string }) => {
		if (sortCol !== col) return <ArrowUpDown className="ml-1 h-3 w-3 shrink-0 opacity-20" />;
		return sortDir === "asc"
			? <ChevronUp className="ml-1 h-3 w-3 shrink-0" />
			: <ChevronDown className="ml-1 h-3 w-3 shrink-0" />;
	};

	const toggleExpand = (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		setExpandedId((prev) => prev === id ? null : id);
	};

	const exportCsv = async () => {
		setIsExporting("csv");
		try {
			const rows = Array.isArray(allStaff) ? allStaff : [];
			const csv = [CSV_HEADER, ...rows.map((row: any) => buildCsvRow(row, (row as any).raw ?? {}))].join("\n");
			const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `data-karyawan-${new Date().toISOString().slice(0, 10)}.csv`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success(`CSV berhasil diexport (${rows.length} karyawan)`);
		} catch {
			toast.error("Gagal export CSV");
		} finally {
			setIsExporting(null);
		}
	};

	const exportPdf = async () => {
		setIsExporting("pdf");
		try {
			const { default: jsPDF } = await import("jspdf");
			const { default: html2canvas } = await import("html2canvas");
			const el = document.getElementById("karyawan-data-table");
			if (!el) return;
			const canvas = await html2canvas(el, { scale: 2, useCORS: true });
			const imgData = canvas.toDataURL("image/png");
			const pdf = new jsPDF("l", "mm", "a4");
			const pw = pdf.internal.pageSize.getWidth();
			const ph = pdf.internal.pageSize.getHeight();
			const imgW = pw - 10;
			const imgH = (canvas.height / canvas.width) * imgW;
			pdf.setFontSize(8);
			pdf.text(`Data Karyawan - ${new Date().toLocaleDateString("id-ID")}`, 5, 5);
			if (imgH <= ph) {
				pdf.addImage(imgData, "PNG", 5, 8, imgW, imgH);
			} else {
				const pageH = (ph - 15) / imgH * canvas.height;
				for (let y = 0; y < canvas.height; y += pageH) {
					if (y > 0) pdf.addPage();
					const chunk = document.createElement("canvas");
					chunk.width = canvas.width;
					chunk.height = Math.min(pageH, canvas.height - y);
					const ctx = chunk.getContext("2d")!;
					ctx.drawImage(canvas, 0, y, canvas.width, pageH, 0, 0, canvas.width, chunk.height);
					const chunkData = chunk.toDataURL("image/png");
					const chunkH = (chunk.height / canvas.width) * imgW;
					pdf.addImage(chunkData, "PNG", 5, 15, imgW, chunkH);
				}
			}
			pdf.save(`data-karyawan-${new Date().toISOString().slice(0, 10)}.pdf`);
			toast.success("PDF berhasil diexport");
		} catch {
			toast.error("Gagal export PDF");
		} finally {
			setIsExporting(null);
		}
	};

	const isLoading = allStaff === undefined;
	const isEmpty = Array.isArray(allStaff) && allStaff.length === 0;

	async function cascadeDeleteUsers(sourceIds: string[]) {
		if (sourceIds.length === 0) return;
		const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
		const adminSecret = import.meta.env.VITE_ADMIN_SECRET || "";
		const res = await fetch(supabaseUrl + "/functions/v1/delete-employee-cascade", {
			method: "POST",
			headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret },
			body: JSON.stringify({ source_ids: sourceIds }),
		});
		const result = await res.json();
		if (!res.ok) throw new Error(result?.error || "Gagal menghapus");
		return result;
	}

	function handleSingleDelete(row: any) {
		setConfirmModal({
			isOpen: true,
			title: "Hapus Karyawan?",
			subtitle: row.name || "Karyawan",
			message: "Seluruh data terkait akan terhapus permanen dari:\n• Pendaftaran onboarding\n• Riwayat kontrak\n• Daftar data karyawan\n• Akun login",
			confirmText: "Ya, Hapus",
			variant: "danger",
			loading: false,
			onConfirm: async () => {
				setDeletingIds((prev) => new Set(prev).add(row._id));
				try {
					await cascadeDeleteUsers([row._id]);
					setSelectedIds((prev) => { const n = new Set(prev); n.delete(row._id); return n; });
					toast.success("Karyawan dihapus");
					// Force re-fetch by changing search query (hack: trigger re-render)
					setTimeout(() => window.location.reload(), 500);
				} catch (e: any) {
					toast.error(e?.message || "Gagal menghapus");
				} finally {
					setDeletingIds((prev) => { const n = new Set(prev); n.delete(row._id); return n; });
					setConfirmModal((p) => ({ ...p, isOpen: false }));
				}
			},
		});
	}

	function handleBulkDelete() {
		if (selectedIds.size === 0) return;
		setConfirmModal({
			isOpen: true,
			title: `Hapus ${selectedIds.size} Karyawan?`,
			message: `${selectedIds.size} data karyawan akan dihapus permanen dari onboarding, kontrak, dan daftar karyawan.`,
			confirmText: "Ya, Hapus Semua",
			variant: "danger",
			loading: false,
			onConfirm: async () => {
				setIsBulkDeleting(true);
				try {
					const ids = Array.from(selectedIds);
					await cascadeDeleteUsers(ids);
					setSelectedIds(new Set());
					toast.success(`${ids.length} karyawan dihapus`);
					setTimeout(() => window.location.reload(), 500);
				} catch (e: any) {
					toast.error(e?.message || "Gagal menghapus");
				} finally {
					setIsBulkDeleting(false);
					setConfirmModal((p) => ({ ...p, isOpen: false }));
				}
			},
		});
	}

	const toggleSelect = (id: string) => {
		setSelectedIds((prev) => {
			const n = new Set(prev);
			if (n.has(id)) n.delete(id); else n.add(id);
			return n;
		});
	};

	const toggleSelectAll = () => {
		if (selectedIds.size === filtered.length) { setSelectedIds(new Set()); }
		else { setSelectedIds(new Set(filtered.map((row: any) => row._id))); }
	};

	const ThButton = ({ col, children, className = "" }: { col: string; children: React.ReactNode; className?: string }) => (
		<button
			className={`flex items-center gap-0.5 whitespace-nowrap font-bold text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors ${className}`}
			onClick={() => handleSort(col)}
		>
			{children}
			<SortIcon col={col} />
		</button>
	);

	return (
		<div className="flex flex-col gap-3 p-3 md:p-4">
			{/* Header */}
			<div className="flex items-center justify-between flex-wrap gap-2">
				<div className="flex items-center gap-2.5">
					<button
						onClick={() => navigate({ to: "/admin/operational-team/karyawan" as any })}
						className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
						title="Kembali ke Overview"
					>
						<ChevronLeft className="h-4 w-4" />
					</button>
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-400 text-white shadow-sm">
						<User className="h-4 w-4" />
					</div>
					<div>
						<h1 className="text-sm font-black tracking-tight uppercase">Data Karyawan</h1>
						<p className="text-[10px] font-bold text-muted-foreground">
							{Array.isArray(allStaff) ? `${allStaff.length} total` : "Memuat..."}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" size="sm" className="h-7 rounded-lg text-[11px] font-bold px-2 gap-1.5" disabled={isExporting === "csv" || isLoading || isEmpty} onClick={exportCsv}>
						{isExporting === "csv" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
						CSV
					</Button>
					<Button variant="outline" size="sm" className="h-7 rounded-lg text-[11px] font-bold px-2 gap-1.5" disabled={isExporting === "pdf" || isLoading || isEmpty} onClick={exportPdf}>
						{isExporting === "pdf" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
						PDF
					</Button>
				</div>
			</div>

			{/* Stats Summary */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
				{[
					{ label: "Total", value: stats.total, color: "bg-primary/10 text-primary" },
					{ label: "Aktif", value: stats.active, color: "bg-emerald-100 text-emerald-700" },
					{ label: "Nonaktif", value: stats.inactive, color: "bg-red-100 text-red-700" },
					{ label: "Belum No HP", value: stats.noPhone, color: "bg-amber-100 text-amber-700" },
				].map((stat) => (
					<div
						key={stat.label}
						className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
					>
						<div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-black ${stat.color}`}>
							{stat.value}
						</div>
						<div className="min-w-0">
							<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
							<p className="text-sm font-black text-foreground">{stat.value}</p>
						</div>
					</div>
				))}
			</div>

			{/* Toolbar: Search + Filters */}
			<div className="rounded-xl border bg-card p-2.5 space-y-2.5">
				<div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
					<div className="relative flex-1 max-w-xs">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
						<Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cari nama, username, No HP..." className="h-8 rounded-xl pl-8 pr-8 text-[11px] font-medium" />
						{searchQuery && (
							<button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
								<X className="h-3.5 w-3.5" />
							</button>
						)}
					</div>
					<span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap sm:ml-auto">{filtered.length} dari {Array.isArray(allStaff) ? allStaff.length : 0} data</span>
				</div>

				<div className="flex items-center gap-2 flex-wrap">
					<div className="flex items-center gap-1 flex-wrap">
						<span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-1">Role:</span>
						<button onClick={() => setRoleFilter("")} className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${!roleFilter ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>Semua</button>
						{allRoles.slice(0, 8).map((r) => (
							<button key={r} onClick={() => setRoleFilter(roleFilter === r ? "" : r)} className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${roleFilter === r ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>{r}</button>
						))}
						{allRoles.length > 8 && (
							<select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-7 rounded-lg border border-input bg-background px-2 text-[10px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/20">
								<option value="">Lainnya...</option>
								{allRoles.slice(8).map((r) => <option key={r} value={r}>{r}</option>)}
							</select>
						)}
					</div>

					<div className="w-px h-5 bg-border/60" />

					<div className="flex items-center gap-1 flex-wrap">
						<span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-1">Status:</span>
						{STATUS_OPTIONS.map((opt) => (
							<button key={opt.value} onClick={() => setStatusFilter(opt.value)} className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${statusFilter === opt.value ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>{opt.label}</button>
						))}
					</div>
				</div>
			</div>

			{/* Bulk Delete Bar */}
			{selectedIds.size > 0 && (
				<div className="flex items-center gap-2 bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
					<span className="text-[10px] font-medium text-muted-foreground">{selectedIds.size} dipilih</span>
					<Button
						variant="destructive"
						size="sm"
						onClick={handleBulkDelete}
						disabled={isBulkDeleting}
						className="text-[10px] h-7 ml-auto"
					>
						{isBulkDeleting ? (
							<Loader2 className="h-3 w-3 mr-1 animate-spin" />
						) : (
							<Trash2 className="h-3 w-3 mr-1" />
						)}
						Hapus {selectedIds.size}
					</Button>
				</div>
			)}

			{/* Table */}
			<div className="overflow-x-auto rounded-xl border bg-card">
				{isLoading ? (
					<div className="p-6 space-y-3">
						{[1,2,3,4,5,6].map((i) => <Skeleton key={i} className="h-7 w-full rounded-lg" />)}
					</div>
				) : isEmpty ? (
					<div className="flex flex-col items-center justify-center py-12 text-center">
						<User className="mb-3 h-10 w-10 text-muted-foreground/30" />
						<p className="text-sm font-bold text-muted-foreground">Belum ada data karyawan</p>
						<p className="text-[11px] text-muted-foreground/60 mt-1">Karyawan akan muncul setelah registrasi dan disetujui.</p>
					</div>
				) : (
					<table id="karyawan-data-table" className="w-full border-collapse text-[11px]">
						<thead className="sticky top-0 z-10">
							<tr className="border-b bg-muted/40">
								<th className="w-8 px-1 py-2.5 text-center">
									<input
										type="checkbox"
										className="h-3 w-3 rounded cursor-pointer"
										checked={filtered.length > 0 && selectedIds.size === filtered.length}
										onChange={toggleSelectAll}
									/>
								</th>
								<th className="w-8 px-1 py-2.5 text-center"><span className="inline-flex items-center justify-center h-4 w-4 rounded text-[10px] text-muted-foreground/40">#</span></th>
								<th className="px-2.5 py-2.5 text-left min-w-[140px]"><ThButton col="name">Nama</ThButton></th>
								<th className="px-2.5 py-2.5 text-left min-w-[90px]"><ThButton col="role">Role</ThButton></th>
								<th className="px-2.5 py-2.5 text-left min-w-[100px] hidden sm:table-cell"><ThButton col="phone">No HP</ThButton></th>
								<th className="px-2.5 py-2.5 text-left whitespace-nowrap hidden md:table-cell">No Identitas</th>
								<th className="px-2.5 py-2.5 text-left whitespace-nowrap hidden lg:table-cell">TTL</th>
								<th className="px-2.5 py-2.5 text-left hidden lg:table-cell">Alamat</th>
								<th className="px-2.5 py-2.5 text-left whitespace-nowrap hidden md:table-cell">Tgl Mulai</th>
								<th className="px-2.5 py-2.5 text-left whitespace-nowrap min-w-[80px] hidden sm:table-cell">Status Kerja</th>
								<th className="px-2.5 py-2.5 text-right hidden md:table-cell">Gaji</th>
								<th className="px-2.5 py-2.5 text-left hidden xl:table-cell">Lokasi</th>
								<th className="px-2.5 py-2.5 text-left hidden xl:table-cell">Kontak Darurat</th>
								<th className="px-2.5 py-2.5 text-center min-w-[50px]"><ThButton col="status">Status</ThButton></th>
								<th className="px-2.5 py-2.5 text-center hidden lg:table-cell">Wajah</th>
								<th className="px-2.5 py-2.5 text-center hidden lg:table-cell">CV</th>
								<th className="w-10 px-1 py-2.5 text-center"><X className="mx-auto h-3 w-3 text-muted-foreground/40" aria-hidden="true" /></th>
							</tr>
						</thead>
						<tbody>
							{filtered.length === 0 ? (
								<tr><td colSpan={16} className="px-4 py-8 text-center text-xs text-muted-foreground">Tidak ada karyawan yang cocok dengan filter.</td></tr>
							) : filtered.map((row: any, idx: number) => {
								const r = (row as any).raw ?? {};
								const isActive = row.isActive !== false;
								const isExpanded = expandedId === row._id;
								return (
									<React.Fragment key={row._id}>
										<tr className={`border-b border-border/20 hover:bg-muted/10 transition-colors cursor-pointer ${isExpanded ? "bg-primary/[0.02]" : ""} ${selectedIds.has(row._id) ? "bg-primary/[0.03]" : ""}`} onClick={() => navigate({ to: `/karyawan/${row.slug}` as any })}>
											<td className="px-1 py-2 text-center" onClick={(e) => { e.stopPropagation(); toggleSelect(row._id); }}>
												<input
													type="checkbox"
													className="h-3 w-3 rounded cursor-pointer"
													checked={selectedIds.has(row._id)}
													onChange={() => toggleSelect(row._id)}
												/>
											</td>
											<td className="px-1 py-2 text-center text-[10px] text-muted-foreground/40 font-mono" onClick={(e) => toggleExpand(row._id, e)}>
												<button className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-muted transition-colors">
													<ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
												</button>
											</td>
											<td className="px-2.5 py-2" onClick={(e) => toggleExpand(row._id, e)}>
												<div className="flex items-center gap-2">
													{row.photoUrl ? (
														<img src={row.photoUrl} alt={row.name || ""} className="h-6 w-6 shrink-0 rounded-lg object-cover ring-1 ring-border" />
													) : (
														<div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-black ring-1 ring-border/50 ${isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{(row.name || "?").charAt(0)}</div>
													)}
													<div className="min-w-0">
														<p className="font-bold text-xs truncate max-w-[120px]">{row.name}</p>
														<p className="text-[11px] text-muted-foreground truncate max-w-[120px]">@{row.username || row.slug}</p>
													</div>
												</div>
											</td>
											<td className="px-2.5 py-2" onClick={(e) => toggleExpand(row._id, e)}>
												<span className="inline-flex rounded-md bg-primary/5 px-1.5 py-0.5 text-[11px] font-bold text-primary uppercase tracking-wider">{row.roleName || "—"}</span>
											</td>
											<td className="px-2.5 py-2 font-medium hidden sm:table-cell">{r.phone || <span className="text-muted-foreground/40">—</span>}</td>
											<td className="px-2.5 py-2 text-muted-foreground hidden md:table-cell">{r.identityNumber || <span className="text-muted-foreground/40">—</span>}</td>
											<td className="px-2.5 py-2 text-muted-foreground text-[10px] hidden lg:table-cell">{r.placeOfBirth ? `${r.placeOfBirth}, ` : ""}{fmtDate(r.birthDate)}</td>
											<td className="px-2.5 py-2 text-muted-foreground max-w-[120px] truncate hidden lg:table-cell">{r.address || <span className="text-muted-foreground/40">—</span>}</td>
											<td className="px-2.5 py-2 text-muted-foreground text-[10px] hidden md:table-cell">{fmtDate(r.startDate)}</td>
											<td className="px-2.5 py-2 hidden sm:table-cell">
												<span className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${r.employmentType === "permanent" ? "bg-emerald-100 text-emerald-700" : r.employmentType === "probation" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>{r.employmentType === "permanent" ? "Tetap" : r.employmentType === "probation" ? "Probation" : r.employmentType || "—"}</span>
											</td>
											<td className="px-2.5 py-2 text-right font-medium hidden md:table-cell">{fmtCurrency(r.monthlySalary)}</td>
											<td className="px-2.5 py-2 text-muted-foreground hidden xl:table-cell">{r.location || <span className="text-muted-foreground/40">—</span>}</td>
											<td className="px-2.5 py-2 text-[10px] hidden xl:table-cell">{r.emergencyContactName ? <div><p className="font-medium">{r.emergencyContactName}</p><p className="text-muted-foreground">{r.emergencyContactPhone || "—"}</p></div> : <span className="text-muted-foreground/40">—</span>}</td>
											<td className="px-2.5 py-2 text-center">
												<span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.14em] ${isActive ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-muted text-muted-foreground border border-border"}`}>
													<span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
													{isActive ? "Aktif" : "Nonaktif"}
												</span>
											</td>
											<td className="px-2.5 py-2 text-center hidden lg:table-cell">{row.hasFace ? <Camera className="inline h-3.5 w-3.5 text-primary" /> : <span className="text-muted-foreground/20">—</span>}</td>
											<td className="px-2.5 py-2 text-center hidden lg:table-cell">{r.cvUrl ? <a href={r.cvUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 rounded-md bg-primary/5 px-1.5 py-0.5 text-[11px] font-bold text-primary hover:bg-primary/10 transition-colors"><Eye className="h-3 w-3" />Lihat</a> : <span className="text-muted-foreground/20">—</span>}</td>
											<td className="px-1 py-2 text-center">
												<button
													title="Hapus"
													className="p-1 text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
													onClick={(e) => { e.stopPropagation(); handleSingleDelete(row); }}
													disabled={deletingIds.has(row._id)}
												>
													{deletingIds.has(row._id) ? (
														<Loader2 className="h-3 w-3 animate-spin" />
													) : (
														<Trash2 className="h-3 w-3" />
													)}
												</button>
											</td>
										</tr>
										<DetailRow row={row} expanded={isExpanded} />
									</React.Fragment>
								);
							})}
						</tbody>
					</table>
				)}
			</div>

			<ConfirmationModal
				isOpen={confirmModal.isOpen}
				onClose={() => setConfirmModal((p) => ({ ...p, isOpen: false }))}
				onConfirm={confirmModal.onConfirm}
				title={confirmModal.title}
				subtitle={confirmModal.subtitle}
				message={confirmModal.message}
				confirmText={confirmModal.confirmText}
				variant={confirmModal.variant}
				loading={confirmModal.loading}
			/>
		</div>
	);
}

export const Route = createLazyFileRoute("/admin/operational-team/karyawan/data")({
	component: DataKaryawanPage,
});
