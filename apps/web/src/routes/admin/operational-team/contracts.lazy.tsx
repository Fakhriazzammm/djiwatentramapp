import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileText, Search, Clock, CheckCircle2, XCircle, Download, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/client";

const STATUS_LABELS: Record<string, string> = {
	active: "Aktif",
	expired: "Berakhir",
	terminated: "PHK",
	renewed: "Diperpanjang",
};

const STATUS_COLORS: Record<string, string> = {
	active: "bg-emerald-100 text-emerald-700 border-emerald-200",
	expired: "bg-amber-100 text-amber-700 border-amber-200",
	terminated: "bg-red-100 text-red-700 border-red-200",
	renewed: "bg-blue-100 text-blue-700 border-blue-200",
};

function ContractHistoryPage() {
	const [applications, setApplications] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<string>("");

	useEffect(() => {
		(async () => {
			try {
				const supabase = createClient();
				const { data, error } = await supabase
					.from("employee_onboarding_applications")
					.select("*")
					.order("created_at", { ascending: false })
					.limit(200);
				if (error) throw error;
				setApplications(data ?? []);
			} catch (e: any) {
				console.error("Gagal memuat kontrak:", e);
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	const filtered = useMemo(() => {
		let list = applications;
		if (search.trim()) {
			const q = search.toLowerCase();
			list = list.filter((a) => (a.full_name || "").toLowerCase().includes(q) || (a.employment?.roleName || "").toLowerCase().includes(q));
		}
		if (statusFilter) {
			list = list.filter((a) => (a.raw?.contractStatus || "active") === statusFilter);
		}
		return list;
	}, [applications, search, statusFilter]);

	const downloadPdf = async (url: string, name: string) => {
		try {
			const resp = await fetch(url);
			const blob = await resp.blob();
			const a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = `kontrak-${name.replace(/\s+/g, "-").toLowerCase()}.pdf`;
			a.click();
		} catch {
			// silent
		}
	};

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<Badge variant="secondary" className="gap-1">
							<FileText className="h-3 w-3" /> Kontrak
						</Badge>
					</div>
					<h1 className="text-xl font-bold tracking-tight md:text-2xl">Riwayat Kontrak</h1>
					<p className="text-sm text-muted-foreground">Daftar semua kontrak kerja yang telah dibuat</p>
				</div>
			</div>

			<Card className="border-border/60">
				<CardContent className="p-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
						<div className="relative flex-1">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Cari nama atau jabatan..."
								className="h-9 pl-9 text-sm"
							/>
						</div>
						<div className="flex gap-2 overflow-x-auto">
							{["", "active", "expired", "renewed"].map((s) => (
								<Button
									key={s}
									size="sm"
									variant={statusFilter === s ? "default" : "outline"}
									onClick={() => setStatusFilter(s)}
									className="h-8 whitespace-nowrap text-xs"
								>
									{s ? STATUS_LABELS[s] : "Semua"}
								</Button>
							))}
						</div>
					</div>
				</CardContent>
			</Card>

			{loading ? (
				<div className="flex items-center justify-center py-20">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
				</div>
			) : filtered.length === 0 ? (
				<Card className="border-border/60">
					<CardContent className="flex flex-col items-center justify-center py-16 text-center">
						<FileText className="mb-3 h-10 w-10 text-muted-foreground/40" />
						<h3 className="text-sm font-medium">Belum ada kontrak</h3>
						<p className="mt-1 text-xs text-muted-foreground">Kontrak akan muncul setelah kandidat mendaftar dan menyelesaikan onboarding.</p>
					</CardContent>
				</Card>
			) : (
				<div className="overflow-x-auto rounded-xl border">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b bg-muted/50">
								<th className="px-4 py-3 text-left font-medium">Karyawan</th>
								<th className="px-4 py-3 text-left font-medium">Jabatan</th>
								<th className="px-4 py-3 text-left font-medium">Tipe</th>
								<th className="px-4 py-3 text-left font-medium">Mulai</th>
								<th className="px-4 py-3 text-left font-medium">Status</th>
								<th className="px-4 py-3 text-right font-medium">Aksi</th>
							</tr>
						</thead>
						<tbody>
							{filtered.map((app) => {
								const empName = app.full_name || "-";
								const roleName = app.employment?.roleName || "-";
								const empType = app.employment?.employmentType || "-";
								const startDate = app.employment?.startDate || "-";
								const status = app.raw?.contractStatus || "active";
								const pdfUrl = app.contract_pdf_url;
								return (
									<tr key={app.id} className="border-b last:border-0 hover:bg-muted/30">
										<td className="px-4 py-3 font-medium">{empName}</td>
										<td className="px-4 py-3 text-muted-foreground">{roleName}</td>
										<td className="px-4 py-3">
											<Badge variant="outline" className="text-[10px]">{empType}</Badge>
										</td>
										<td className="px-4 py-3 text-xs text-muted-foreground">{startDate}</td>
										<td className="px-4 py-3">
											<Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[status] || ""}`}>
												{STATUS_LABELS[status] || status}
											</Badge>
										</td>
										<td className="px-4 py-3 text-right">
											{pdfUrl ? (
												<Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => downloadPdf(pdfUrl, empName)}>
													<Download className="h-3 w-3" /> PDF
												</Button>
											) : (
												<span className="text-[10px] text-muted-foreground">-</span>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

export default ContractHistoryPage;

export const Route = createLazyFileRoute("/admin/operational-team/contracts" as any)({
	component: ContractHistoryPage,
});
