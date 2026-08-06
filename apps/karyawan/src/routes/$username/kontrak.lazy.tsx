import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useStaffProfile } from "../$username.lazy";
import { createClient } from "@yumipos/web-shared";
import { Button } from "@yumipos/web-shared/components/ui/button";
import { FileText, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";

function KontrakPage() {
	const { staff, isUnlocked } = useStaffProfile();
	const [contractData, setContractData] = useState<any>(null);
	const [isLoadingContract, setIsLoadingContract] = useState(false);

	useEffect(() => {
		if (!staff?._id) return;
		setIsLoadingContract(true);
		const supabase = createClient();
		supabase
			.from("employee_onboarding_applications")
			.select("id, full_name, contract, contract_pdf_url, employment, raw, created_at, status")
			.eq("approved_user_source_id", staff._id)
			.in("status", ["approved", "contract_signed", "expired", "completed"])
			.order("created_at", { ascending: false })
			.maybeSingle()
			.then((result: any) => {
				const { data, error } = result;
				if (data) setContractData(data);
				else if (error) console.warn("[Kontrak] fetch error:", error);
				setIsLoadingContract(false);
			});
	}, [staff?._id]);

	const endDate = (contractData as any)?.employment?.endDate;
	const startDate = (contractData as any)?.employment?.startDate;
	const durationMonths = Number((contractData as any)?.employment?.contractDuration ?? 0);
	const computedEndDate = endDate || (startDate && durationMonths > 0 ? new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + durationMonths, new Date(startDate).getDate()).toISOString() : null);
	const isExpired = (computedEndDate && new Date(computedEndDate) < new Date()) || (contractData as any)?.status === "expired" || (contractData as any)?.status === "completed";
	const status = (contractData as any)?.status;
	const isContractSigned = Boolean((contractData as any)?.contract_pdf_url || (contractData as any)?.raw?.pipelineStep === "contract_signed");
	const isAwaitingSignature = !isExpired && status === "approved" && !isContractSigned;
	const isActive = !isExpired && isContractSigned;
	const registrationNumber = (contractData as any)?.raw?.registrationNumber;

	return (
		<div className="mx-auto max-w-lg py-4">
			<div className="space-y-2">
				<h3 className="flex items-center gap-1.5 px-2 font-bold uppercase tracking-wider text-[10px]">
					<FileText className="h-3 w-3 text-emerald-500" />
					Kontrak Kerja
				</h3>
				<div className="karyawan-card border bg-card p-5">
					{isLoadingContract ? (
						<div className="animate-pulse space-y-2">
							<div className="h-3 w-40 rounded bg-muted" />
							<div className="h-3 w-32 rounded bg-muted" />
							<div className="h-8 w-full rounded-lg bg-muted mt-3" />
						</div>
					) : contractData ? (
						<>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Status</span>
									<span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${isActive ? "bg-emerald-100 text-emerald-700" : isAwaitingSignature ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{isActive ? "Aktif" : isAwaitingSignature ? "Menunggu TTD" : "Berakhir"}</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Jenis</span>
									<span className="text-xs font-bold">{((contractData as any)?.employment?.type) || "PKWT - Full Time"}</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Mulai</span>
									<span className="text-xs font-bold">{((contractData as any)?.employment?.startDate) ? new Date((contractData as any).employment.startDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—"}</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Berakhir</span>
									<span className="text-xs font-bold">{computedEndDate ? new Date(computedEndDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : status === "expired" || status === "completed" ? "Selesai" : "—"}</span>
								</div>
							</div>
							{contractData.contract_pdf_url ? (
								<div className="mt-4 grid grid-cols-2 gap-2">
									<Button variant="outline" size="sm" className="karyawan-control w-full text-xs font-bold" onClick={() => window.open(contractData.contract_pdf_url, "_blank", "noopener,noreferrer")}>
										<ExternalLink className="mr-1.5 h-3 w-3" />
										Baca Kontrak
									</Button>
									<a href={contractData.contract_pdf_url} target="_blank" rel="noopener noreferrer" download className="karyawan-control inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-bold">
										<Download className="mr-1.5 h-3 w-3" />
										Download PDF
									</a>
								</div>
							) : isAwaitingSignature && registrationNumber ? (
								<a href={`/register/selesai/${registrationNumber}`} className="karyawan-control mt-4 inline-flex h-10 w-full items-center justify-center rounded-md bg-emerald-600 px-3 text-xs font-bold text-white">
									<ExternalLink className="mr-1.5 h-3 w-3" />
									Buka & Tanda Tangani Kontrak
								</a>
							) : (
								<p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-center text-[11px] text-muted-foreground">File PDF kontrak belum tersedia.</p>
							)}
						</>
					) : (
						<div className="py-8 text-center">
							<FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" /><p className="text-sm font-bold">Belum ada kontrak kerja</p><p className="mt-1 text-xs text-muted-foreground">Kontrak aktif akan tersedia di halaman ini.</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export const Route = createLazyFileRoute("/$username/kontrak")({
	component: KontrakPage,
});
