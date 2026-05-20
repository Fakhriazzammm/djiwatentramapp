import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useHybridPublicUsers } from "@/hooks/use-hybrid-attendance-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Search,
	Download,
	FileText,
	FileSpreadsheet,
	User,
	CheckCircle2,
	XCircle,
	Camera,
	Eye,
	Loader2,
	ChevronUp,
	ChevronDown,
	ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";

const MONTHS = [
	"Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
	"Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function fmtDate(val?: string | number) {
	if (!val) return "—";
	const d = new Date(val);
	if (isNaN(d.getTime())) return String(val);
	return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtCurrency(val?: number) {
	if (val == null || val === 0) return "—";
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

function DataKaryawanPage() {
	const navigate = useNavigate();
	const allStaff = useHybridPublicUsers();
	const [searchQuery, setSearchQuery] = useState("");
	const [roleFilter, setRoleFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState("");
	const [sortCol, setSortCol] = useState("name");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
	const [isExporting, setIsExporting] = useState<"pdf" | "csv" | null>(null);

	// Unique roles for filter
	const allRoles = useMemo(() => {
		const roles = new Set<string>();
		(allStaff ?? []).forEach((s: any) => {
			if (s.roleName) roles.add(s.roleName);
		});
		return Array.from(roles).sort();
	}, [allStaff]);

	// Filter + sort
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
		if (sortCol !== col) return <ArrowUpDown className="ml-1 h-3 w-3 shrink-0 opacity-30" />;
		return sortDir === "asc"
			? <ChevronUp className="ml-1 h-3 w-3 shrink-0" />
			: <ChevronDown className="ml-1 h-3 w-3 shrink-0" />;
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
		} catch (err) {
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
				// Multi-page
				let yPos = 8;
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
		} catch (err) {
			toast.error("Gagal export PDF");
		} finally {
			setIsExporting(null);
		}
	};

	const isLoading = allStaff === undefined;
	const isEmpty = Array.isArray(allStaff) && allStaff.length === 0;

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
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
					<Button
						variant="outline"
						size="sm"
						className="h-8 rounded-lg text-[10px] font-bold px-2.5"
						disabled={isExporting === "csv" || isLoading || isEmpty}
						onClick={exportCsv}
					>
						{isExporting === "csv" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
						<span className="hidden sm:inline ml-1">CSV</span>
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="h-8 rounded-lg text-[10px] font-bold px-2.5"
						disabled={isExporting === "pdf" || isLoading || isEmpty}
						onClick={exportPdf}
					>
						{isExporting === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
						<span className="hidden sm:inline ml-1">PDF</span>
					</Button>
				</div>
			</div>

			{/* Search & Filter */}
			<div className="flex items-center gap-2 flex-wrap">
				<div className="relative flex-1 min-w-[160px] max-w-xs">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
					<Input
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Cari nama, username, No HP..."
						className="h-8 rounded-xl pl-8 text-[11px] font-medium"
					/>
				</div>
				<select
					value={roleFilter}
					onChange={(e) => setRoleFilter(e.target.value)}
					className="h-8 rounded-xl border border-input bg-background px-2.5 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
				>
					<option value="">Semua Role</option>
					{allRoles.map((r) => <option key={r} value={r}>{r}</option>)}
				</select>
				<select
					value={statusFilter}
					onChange={(e) => setStatusFilter(e.target.value)}
					className="h-8 rounded-xl border border-input bg-background px-2.5 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
				>
					<option value="">Semua Status</option>
					<option value="active">Aktif</option>
					<option value="inactive">Nonaktif</option>
					<option value="no_phone">Belum Isi No HP</option>
					<option value="has_phone">Sudah Isi No HP</option>
				</select>
				<span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
					{filtered.length} data
				</span>
			</div>

			{/* Table */}
			<div className="overflow-x-auto rounded-xl border bg-card">
				{isLoading ? (
					<div className="p-6 space-y-3">
						{[1,2,3,4,5,6,7,8].map((i) => (
							<div key={i} className="h-6 w-full rounded-lg bg-muted animate-pulse" />
						))}
					</div>
				) : isEmpty ? (
					<div className="flex flex-col items-center justify-center py-12 text-center">
						<User className="mb-3 h-10 w-10 text-muted-foreground/30" />
						<p className="text-sm font-bold text-muted-foreground">Belum ada data karyawan</p>
						<p className="text-[11px] text-muted-foreground/60 mt-1">Karyawan akan muncul setelah registrasi dan disetujui.</p>
					</div>
				) : (
					<table id="karyawan-data-table" className="w-full border-collapse text-[11px]">
						<thead>
							<tr className="border-b bg-muted/30">
								<th className="sticky top-0 z-10 bg-muted/30 px-2.5 py-2 text-left">
									<ThButton col="name">Nama</ThButton>
								</th>
								<th className="px-2.5 py-2 text-left">
									<ThButton col="role">Role</ThButton>
								</th>
								<th className="px-2.5 py-2 text-left">
									<ThButton col="phone">No HP</ThButton>
								</th>
								<th className="px-2.5 py-2 text-left whitespace-nowrap">No Identitas</th>
								<th className="px-2.5 py-2 text-left whitespace-nowrap">TTL</th>
								<th className="px-2.5 py-2 text-left">Alamat</th>
								<th className="px-2.5 py-2 text-left whitespace-nowrap">Tgl Mulai</th>
								<th className="px-2.5 py-2 text-left whitespace-nowrap">Status Kerja</th>
								<th className="px-2.5 py-2 text-right">Gaji</th>
								<th className="px-2.5 py-2 text-left">Lokasi</th>
								<th className="px-2.5 py-2 text-left">Kontak Darurat</th>
								<th className="px-2.5 py-2 text-center">
									<ThButton col="status">Status</ThButton>
								</th>
								<th className="px-2.5 py-2 text-center">Wajah</th>
								<th className="px-2.5 py-2 text-center">CV</th>
							</tr>
						</thead>
						<tbody>
							{filtered.length === 0 ? (
								<tr>
									<td colSpan={14} className="px-4 py-8 text-center text-xs text-muted-foreground">
										Tidak ada karyawan yang cocok dengan filter.
									</td>
								</tr>
							) : (
								filtered.map((row: any) => {
									const r = (row as any).raw ?? {};
									const isActive = row.isActive !== false;
									return (
										<tr
											key={row._id}
											className="border-b border-border/40 hover:bg-muted/20 transition-colors cursor-pointer"
											onClick={() => navigate({ to: `/karyawan/${row.slug}` as any })}
										>
											<td className="px-2.5 py-2">
												<div className="flex items-center gap-2">
													<div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[9px] font-black ${isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
														{(row.name || "?").charAt(0)}
													</div>
													<div className="min-w-0">
														<p className="font-bold text-xs truncate max-w-[140px]">{row.name}</p>
														<p className="text-[9px] text-muted-foreground truncate max-w-[140px]">@{row.username || row.slug}</p>
													</div>
												</div>
											</td>
											<td className="px-2.5 py-2">
												<span className="inline-flex rounded-md bg-primary/5 px-2 py-0.5 text-[9px] font-bold text-primary uppercase tracking-wider">
													{row.roleName || "—"}
												</span>
											</td>
											<td className="px-2.5 py-2 font-medium">{r.phone || "—"}</td>
											<td className="px-2.5 py-2 text-muted-foreground">{r.identityNumber || "—"}</td>
											<td className="px-2.5 py-2 text-muted-foreground text-[10px]">
												{r.placeOfBirth ? `${r.placeOfBirth}, ` : ""}{fmtDate(r.birthDate)}
											</td>
											<td className="px-2.5 py-2 text-muted-foreground max-w-[150px] truncate">{r.address || "—"}</td>
											<td className="px-2.5 py-2 text-muted-foreground text-[10px]">{fmtDate(r.startDate)}</td>
											<td className="px-2.5 py-2">
												<span className={`inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
													r.employmentType === "permanent"
														? "bg-emerald-100 text-emerald-700"
														: r.employmentType === "probation"
														? "bg-amber-100 text-amber-700"
														: "bg-muted text-muted-foreground"
												}`}>
													{r.employmentType === "permanent" ? "Tetap" : r.employmentType === "probation" ? "Probation" : r.employmentType || "—"}
												</span>
											</td>
											<td className="px-2.5 py-2 text-right font-medium">{fmtCurrency(r.monthlySalary)}</td>
											<td className="px-2.5 py-2 text-muted-foreground">{r.location || "—"}</td>
											<td className="px-2.5 py-2 text-[10px]">
												{r.emergencyContactName ? (
													<div>
														<p className="font-medium">{r.emergencyContactName}</p>
														<p className="text-muted-foreground">{r.emergencyContactPhone || "—"}</p>
													</div>
												) : "—"}
											</td>
											<td className="px-2.5 py-2 text-center">
												{isActive
													? <CheckCircle2 className="inline h-4 w-4 text-emerald-500" />
													: <XCircle className="inline h-4 w-4 text-muted-foreground/40" />
												}
											</td>
											<td className="px-2.5 py-2 text-center">
												{row.hasFace
													? <Camera className="inline h-4 w-4 text-primary" />
													: <span className="text-muted-foreground/30">—</span>
												}
											</td>
											<td className="px-2.5 py-2 text-center">
												{r.cvUrl ? (
													<a
														href={r.cvUrl}
														target="_blank"
														rel="noopener noreferrer"
														onClick={(e) => e.stopPropagation()}
														className="inline-flex items-center gap-1 rounded-md bg-primary/5 px-1.5 py-0.5 text-[9px] font-bold text-primary hover:bg-primary/10 transition-colors"
													>
														<Eye className="h-3 w-3" />
														Lihat
													</a>
												) : <span className="text-muted-foreground/30">—</span>}
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}

export const Route = createLazyFileRoute("/admin/operational-team/karyawan/data" as any)({
	component: DataKaryawanPage,
});
