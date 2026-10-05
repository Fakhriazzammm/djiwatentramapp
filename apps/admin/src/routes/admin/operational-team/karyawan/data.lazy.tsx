import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useHybridAllPublicUsers } from "@/hooks/use-hybrid-attendance-data";
import { useHybridStaffRoles } from "@/hooks/use-hybrid-pos-data";
import { useHybridUpdateUser } from "@/hooks/use-hybrid-write-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Search,
	X,
	FileText,
	FileSpreadsheet,
	User,
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
			<td colSpan={8} className="p-0">
				<div className="px-3 py-2">
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
						<div className="rounded-lg border border-border/40 p-2 space-y-1">
							<div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-primary">
								<IdCard className="h-3 w-3" />
								Identitas
							</div>
							<div className="space-y-1">
								<div className="flex justify-between text-[11px]">
									<span className="text-muted-foreground">No Identitas</span>
									<span className="font-medium">{r.identityNumber || "\u2014"}</span>
								</div>
								<div className="flex justify-between text-[11px]">
									<span className="text-muted-foreground">TTL</span>
									<span className="font-medium text-right">
										{r.placeOfBirth ? `${r.placeOfBirth}, ` : ""}{fmtDate(r.birthDate)}
									</span>
								</div>
								<div className="flex justify-between text-[11px]">
									<span className="text-muted-foreground">Alamat</span>
									<span className="font-medium text-right max-w-[200px] truncate">{r.address || "\u2014"}</span>
								</div>
								<div className="flex justify-between text-[11px]">
									<span className="text-muted-foreground">No HP</span><span className="font-medium">{r.phone || "—"}</span>
								</div>
								<div className="flex justify-between text-[11px]">
									<span className="text-muted-foreground">Tipe kerja</span><span className="font-medium">{r.employmentType || "—"}</span>
								</div>
								<div className="flex justify-between text-[11px]">
									<span className="text-muted-foreground">Wajah / CV</span>
									<span className="font-medium">{row.hasFace ? "Wajah ✓" : "Wajah —"} · {r.cvUrl ? <a href={r.cvUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Buka CV</a> : "CV —"}</span>
								</div>
							</div>
						</div>
						<div className="rounded-lg border border-border/40 p-2 space-y-1">
							<div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-primary">
								<Building2 className="h-3 w-3" />
								Pekerjaan
							</div>
							<div className="space-y-1">
								<div className="flex justify-between text-[11px]">
									<span className="text-muted-foreground">Tgl Mulai</span>
									<span className="font-medium">{fmtDate(r.startDate)}</span>
								</div>
								<div className="flex justify-between text-[11px]">
									<span className="text-muted-foreground">Gaji Pokok</span>
									<span className="font-medium">{fmtCurrency(r.monthlySalary)}</span>
								</div>
								<div className="flex justify-between text-[11px]">
									<span className="text-muted-foreground">Lokasi</span>
									<span className="font-medium">{r.location || "\u2014"}</span>
								</div>
							</div>
						</div>
						<div className="rounded-lg border border-border/40 p-2 space-y-1">
							<div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-primary">
								<PhoneCall className="h-3 w-3" />
								Kontak Darurat
							</div>
							{r.emergencyContactName ? (
								<div className="space-y-1">
									<div className="flex justify-between text-[11px]">
										<span className="text-muted-foreground">Nama</span>
										<span className="font-medium">{r.emergencyContactName}</span>
									</div>
									<div className="flex justify-between text-[11px]">
										<span className="text-muted-foreground">No HP</span>
										<span className="font-medium">{r.emergencyContactPhone || "\u2014"}</span>
									</div>
								</div>
							) : (
								<p className="text-[11px] text-muted-foreground italic">Tidak ada data</p>
							)}
						</div>
					</div>
				</div>
			</td>
		</tr>
	);
}

export function DataKaryawanPage() {
	const navigate = useNavigate();
	const [usersRefreshTrigger, setUsersRefreshTrigger] = useState(0);
	const allStaff = useHybridAllPublicUsers(usersRefreshTrigger);
	const staffRoles = useHybridStaffRoles() ?? [];
	const updateUserRole = useHybridUpdateUser();
	const [savingRoleIds, setSavingRoleIds] = useState<Set<string>>(new Set());
	const [bulkRoleId, setBulkRoleId] = useState("");
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
		const targets = filtered.filter((row: any) => selectedIds.has(row._id));
		if (targets.length === 0) return;
		setConfirmModal({
			isOpen: true,
			title: `Hapus ${targets.length} Karyawan?`,
			message: `${targets.length} data karyawan yang terlihat dan dipilih akan dihapus permanen dari onboarding, kontrak, dan daftar karyawan.`,
			confirmText: "Ya, Hapus Semua",
			variant: "danger",
			loading: false,
			onConfirm: async () => {
				setIsBulkDeleting(true);
				try {
					const ids = targets.map((row: any) => row._id);
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

	async function handleRoleChange(row: any, roleId: string) {
		if (!roleId || roleId === row.roleId || savingRoleIds.has(row._id)) return;
		setSavingRoleIds((prev) => new Set(prev).add(row._id));
		try {
			await updateUserRole({ id: row._id, roleId });
			setUsersRefreshTrigger((value) => value + 1);
			toast.success(`Role ${row.name} diperbarui`);
		} catch (error: any) {
			toast.error(error?.message || `Gagal mengubah role ${row.name}`);
		} finally {
			setSavingRoleIds((prev) => { const next = new Set(prev); next.delete(row._id); return next; });
		}
	}

	function handleBulkRoleChange() {
		const targets = filtered.filter((row: any) => selectedIds.has(row._id));
		const selectedRole = staffRoles.find((role: any) => String(role._id) === bulkRoleId);
		if (!targets.length || !selectedRole) return;
		setConfirmModal({
			isOpen: true,
			title: `Ubah role ${targets.length} karyawan?`,
			subtitle: `Role baru: ${selectedRole.name}`,
			message: `Akses akun ${targets.length} karyawan terpilih akan mengikuti role ${selectedRole.name}.`,
			confirmText: `Ubah ${targets.length} role`,
			variant: "warning",
			loading: false,
			onConfirm: async () => {
				setIsBulkDeleting(true);
				setConfirmModal((prev) => ({ ...prev, loading: true }));
				try {
					const results = await Promise.allSettled(targets.map((row: any) => updateUserRole({ id: row._id, roleId: bulkRoleId })));
					const succeeded = results.filter((result) => result.status === "fulfilled").length;
					const failed = results.length - succeeded;
					setUsersRefreshTrigger((value) => value + 1);
					setSelectedIds(new Set());
					setBulkRoleId("");
					if (failed) toast.error(`${succeeded} berhasil, ${failed} gagal. Periksa kembali role karyawan.`);
					else toast.success(`Role ${succeeded} karyawan diperbarui ke ${selectedRole.name}`);
				} finally {
					setIsBulkDeleting(false);
					setConfirmModal((prev) => ({ ...prev, isOpen: false }));
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
		const allVisibleSelected = filtered.length > 0 && filtered.every((row: any) => selectedIds.has(row._id));
		setSelectedIds((prev) => {
			const next = new Set(prev);
			for (const row of filtered as any[]) {
				if (allVisibleSelected) next.delete(row._id);
				else next.add(row._id);
			}
			return next;
		});
	};

	const ThButton = ({ col, children, className = "" }: { col: string; children: React.ReactNode; className?: string }) => (
		<button
			className={`flex items-center gap-0.5 whitespace-nowrap font-bold text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors ${className}`}
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
					<Button variant="outline" size="sm" className="h-9 rounded-lg text-[11px] font-bold px-2 gap-1.5" disabled={isExporting === "csv" || isLoading || isEmpty} onClick={exportCsv}>
						{isExporting === "csv" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
						CSV
					</Button>
					<Button variant="outline" size="sm" className="h-9 rounded-lg text-[11px] font-bold px-2 gap-1.5" disabled={isExporting === "pdf" || isLoading || isEmpty} onClick={exportPdf}>
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
						<Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cari nama, username, No HP..." className="h-9 rounded-xl pl-8 pr-8 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />
						{searchQuery && (
							<button aria-label="Bersihkan pencarian" onClick={() => setSearchQuery("")} className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
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

			{/* Bulk Actions */}
			{filtered.some((row: any) => selectedIds.has(row._id)) && (
				<div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-2">
					<span className="text-[10px] font-medium text-muted-foreground">{filtered.filter((row: any) => selectedIds.has(row._id)).length} dipilih dari {filtered.length} terlihat</span>
					<select aria-label="Role baru untuk karyawan terpilih" value={bulkRoleId} onChange={(e) => setBulkRoleId(e.target.value)} className="h-8 min-w-40 rounded-md border border-input bg-background px-2 text-[11px]" disabled={isBulkDeleting}>
						<option value="">Pilih role baru</option>
						{staffRoles.map((role: any) => <option key={role._id} value={role._id}>{role.name}</option>)}
					</select>
					<Button size="sm" className="h-8 text-[10px]" disabled={!bulkRoleId || !filtered.some((row: any) => selectedIds.has(row._id)) || isBulkDeleting} onClick={handleBulkRoleChange}>Terapkan role</Button>
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
						Hapus {filtered.filter((row: any) => selectedIds.has(row._id)).length}
					</Button>
				</div>
			)}

			{/* Table */}
			<div className="overflow-hidden rounded-xl border bg-card">
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
					<table id="karyawan-data-table" className="w-full table-fixed border-collapse text-xs [&_th]:overflow-hidden [&_td]:overflow-hidden [&_th]:text-ellipsis [&_td]:text-ellipsis [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
						<colgroup>
							<col className="w-[4%]" />
							<col className="w-[4%]" />
							<col className="w-[27%]" />
							<col className="w-[18%]" />
							<col className="w-[17%]" />
							<col className="w-[14%]" />
							<col className="w-[12%]" />
							<col className="w-[4%]" />
						</colgroup>
						<thead className="sticky top-0 z-10">
							<tr className="border-b bg-muted/40">
								<th className="px-1 py-1.5 text-center">
									<input
										type="checkbox"
										aria-label="Pilih semua karyawan yang terlihat"
										className="h-3.5 w-3.5 rounded cursor-pointer"
										checked={filtered.length > 0 && filtered.every((row: any) => selectedIds.has(row._id))}
										onChange={toggleSelectAll}
									/>
								</th>
								<th className="px-1 py-1.5 text-center"><span className="sr-only">Detail</span></th>
								<th className="px-1.5 py-1.5 text-left"><ThButton col="name">Nama</ThButton></th>
								<th className="px-1.5 py-1.5 text-left"><ThButton col="role">Role</ThButton></th>
								<th className="px-1.5 py-1.5 text-left"><ThButton col="phone">No HP</ThButton></th>
								<th className="px-1.5 py-1.5 text-left">Tipe kerja</th>
								<th className="px-1.5 py-1.5 text-center"><ThButton col="status">Status</ThButton></th>
								<th className="px-1 py-1.5 text-center"><span className="sr-only">Aksi</span></th>
							</tr>
						</thead>
						<tbody>
							{filtered.length === 0 ? (
								<tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-muted-foreground">Tidak ada karyawan yang cocok dengan filter.</td></tr>
							) : filtered.map((row: any) => {
								const r = (row as any).raw ?? {};
								const isActive = row.isActive !== false;
								const isExpanded = expandedId === row._id;
								return (
									<React.Fragment key={row._id}>
										<tr className={`border-b border-border/20 hover:bg-muted/10 transition-colors cursor-pointer focus-within:bg-muted/10 ${isExpanded ? "bg-primary/[0.02]" : ""} ${selectedIds.has(row._id) ? "bg-primary/[0.03]" : ""}`} onClick={() => navigate({ to: `/karyawan/${row.slug}` as any })}>
											<td className="px-1 py-1 text-center" onClick={(e) => { e.stopPropagation(); toggleSelect(row._id); }}>
												<input
													type="checkbox"
													aria-label={`Pilih ${row.name}`}
													className="h-3.5 w-3.5 rounded cursor-pointer"
													checked={selectedIds.has(row._id)}
													onChange={() => toggleSelect(row._id)}
												/>
											</td>
											<td className="px-1 py-1 text-center" onClick={(e) => toggleExpand(row._id, e)}>
												<button
													aria-label={`${isExpanded ? "Tutup" : "Buka"} detail ${row.name}`}
													aria-expanded={isExpanded}
													className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted transition-colors"
												>
													<ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
												</button>
											</td>
											<td className="px-1.5 py-1" onClick={(e) => toggleExpand(row._id, e)}>
												<div className="flex min-w-0 items-center gap-2">
													{row.photoUrl ? (
														<img src={row.photoUrl} alt={row.name || ""} className="h-6 w-6 shrink-0 rounded-lg object-cover ring-1 ring-border" />
													) : (
														<div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-black ring-1 ring-border/50 ${isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{(row.name || "?").charAt(0)}</div>
													)}
													<div className="min-w-0">
														<p className="max-w-full truncate text-[13px] font-bold" title={row.name}>{row.name}</p>
														<p className="max-w-full truncate text-[11px] text-muted-foreground" title={row.username || row.slug}>@{row.username || row.slug}</p>
													</div>
												</div>
											</td>
											<td className="px-1.5 py-1" onClick={(e) => e.stopPropagation()}>
												<select aria-label={`Role ${row.name}`} value={row.roleId || ""} onChange={(e) => void handleRoleChange(row, e.target.value)} disabled={savingRoleIds.has(row._id) || staffRoles.length === 0} className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-1.5 text-[11px] font-semibold text-primary disabled:opacity-60">
													<option value="" disabled>{row.roleName || "Tanpa role"}</option>
													{staffRoles.map((role: any) => <option key={role._id} value={role._id}>{role.name}</option>)}
												</select>
											</td>
											<td className="px-1.5 py-1 text-xs font-medium">
												{r.phone ? <span className="block truncate" title={r.phone}>{r.phone}</span> : <span className="text-muted-foreground/50">—</span>}
											</td>
											<td className="px-1.5 py-1">
												<span title={r.employmentType || "Tipe kerja belum diisi"} className={`inline-block max-w-full truncate rounded-md px-1.5 py-1 text-[11px] font-bold ${r.employmentType === "permanent" ? "bg-emerald-100 text-emerald-700" : r.employmentType === "probation" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
													{r.employmentType === "permanent" ? "Tetap" : r.employmentType === "probation" ? "Probation" : r.employmentType || "—"}
												</span>
											</td>
											<td className="px-1 py-1 text-center">
												<span className={`inline-flex items-center justify-center gap-1 rounded-full border px-1.5 py-1 text-[11px] font-bold uppercase tracking-normal ${isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-muted text-muted-foreground"}`}>
													<span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
													{isActive ? "Aktif" : "Nonaktif"}
												</span>
											</td>
											<td className="px-1 py-1 text-center">
												<button
													title="Hapus"
													aria-label={`Hapus ${row.name}`}
													className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg p-1 text-destructive/60 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
													onClick={(e) => { e.stopPropagation(); handleSingleDelete(row); }}
													disabled={deletingIds.has(row._id)}
												>
													{deletingIds.has(row._id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
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
