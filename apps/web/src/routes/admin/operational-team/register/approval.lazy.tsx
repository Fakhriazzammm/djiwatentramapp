import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, FileText, Loader2, Search, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/client";
import { useNavigate } from "@tanstack/react-router";

function ContractApprovalPage() {
	const [applications, setApplications] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const navigate = useNavigate();

	useEffect(() => {
		(async () => {
			try {
				const supabase = createClient();
				const { data, error } = await supabase
					.from("employee_onboarding_applications")
					.select("*")
					.in("status", ["pending", "needs_revision"])
					.order("created_at", { ascending: false })
					.limit(100);
				if (error) throw error;
				setApplications(data ?? []);
			} catch (e: any) {
				console.error("Gagal memuat:", e);
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	const filtered = useMemo(() => {
		if (!search.trim()) return applications;
		const q = search.toLowerCase();
		return applications.filter((a) => (a.full_name || "").toLowerCase().includes(q));
	}, [applications, search]);

	const handleApprove = async (app: any) => {
		try {
			const supabase = createClient();
			const { error } = await supabase
				.from("employee_onboarding_applications")
				.update({
					status: "approved",
					reviewed_by: "admin",
					reviewed_at: new Date().toISOString(),
					raw: { ...(app.raw || {}), contractStatus: "active" },
				})
				.eq("id", app.id);
			if (error) throw error;
			setApplications((prev) => prev.filter((a) => a.id !== app.id));
		} catch (e: any) {
			console.error("Gagal approve:", e);
		}
	};

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<Badge variant="secondary" className="gap-1"><FileText className="h-3 w-3" /> Approval</Badge>
					</div>
					<h1 className="text-xl font-bold tracking-tight md:text-2xl">Persetujuan Kontrak</h1>
					<p className="text-sm text-muted-foreground">Review dan setujui kontrak kerja karyawan baru</p>
				</div>
			</div>

			<Card className="border-border/60">
				<CardContent className="p-4">
					<div className="relative flex-1">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama karyawan..." className="h-9 pl-9 text-sm" />
					</div>
				</CardContent>
			</Card>

			{loading ? (
				<div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
			) : filtered.length === 0 ? (
				<Card className="border-border/60">
					<CardContent className="flex flex-col items-center justify-center py-16 text-center">
						<CheckCircle2 className="mb-3 h-10 w-10 text-emerald-400" />
						<h3 className="text-sm font-medium">Semua kontrak sudah disetujui</h3>
						<p className="mt-1 text-xs text-muted-foreground">Tidak ada kontrak yang menunggu persetujuan.</p>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-3">
					{filtered.map((app) => (
						<Card key={app.id} className="border-border/60">
							<CardContent className="flex items-center justify-between p-4">
								<div className="space-y-1">
									<h3 className="text-sm font-medium">{app.full_name || "-"}</h3>
									<p className="text-xs text-muted-foreground">
										{app.employment?.roleName || "-"} — {app.employment?.startDate || "-"}
									</p>
									<div className="flex gap-2 mt-1">
										<Badge variant="outline" className="text-[10px]">{app.employment?.employmentType || "-"}</Badge>
										{app.contract_pdf_url && (
											<Badge variant="secondary" className="text-[10px] gap-1">
												<CheckCircle2 className="h-2.5 w-2.5" /> Kontrak siap
											</Badge>
										)}
									</div>
								</div>
								<div className="flex items-center gap-2">
									<Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => navigate({ to: `/admin/operational-team/register/${app.registration_number || app.id}` })}>
										<Eye className="h-3 w-3" /> Detail
									</Button>
									<Button size="sm" variant="default" className="h-8 gap-1 text-xs" onClick={() => handleApprove(app)}>
										<CheckCircle2 className="h-3 w-3" /> Setujui
									</Button>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}

export default ContractApprovalPage;

export const Route = createLazyFileRoute("/admin/operational-team/register/approval" as any)({
	component: ContractApprovalPage,
});
