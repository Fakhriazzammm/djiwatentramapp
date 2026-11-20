import { employeeContractPdfLinks } from "@djiwaapps/web-shared/lib/employee-contract-links";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useStaffProfile } from "../$username.lazy";
import { createClient } from "@djiwaapps/web-shared";
import { DsEmpty, DsGroup, DsIcon, DsIconButton, DsNote, DsPageTitle, DsRow, DsTag, ds3d } from "@djiwaapps/web-shared/components/ds";

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
			.limit(1)
			.maybeSingle()
			.then((result: any) => {
				const { data, error } = result;
				if (data) setContractData(data);
				else if (error) console.warn("[Kontrak] fetch error:", error);
				setIsLoadingContract(false);
			});
	}, [staff?._id]);

	const pdf = employeeContractPdfLinks(contractData?.contract_pdf_url);
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

const fd = (d?: string | null) => (d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—");
	const emp = (contractData as any)?.employment ?? {};
	const daysLeft = computedEndDate ? Math.max(0, Math.ceil((new Date(computedEndDate).getTime() - Date.now()) / 86_400_000)) : null;
	return (
		<>
			<DsPageTitle left={<DsIconButton aria-label="Kembali" onClick={() => window.history.back()}>‹</DsIconButton>}>Kontrak</DsPageTitle>
			{isLoadingContract ? (
				<DsGroup white><DsRow title="Memuat kontrak…" /></DsGroup>
			) : !contractData ? (
				<DsEmpty icon={ds3d("employee-contract")}>Belum ada kontrak kerja. Kontrak aktif akan tersedia di sini.</DsEmpty>
			) : (
				<>
					<DsGroup>
						<div className="kx-cen">
							<img src={ds3d("employee-contract")} alt="" style={{ width: 64, height: 64, objectFit: "contain", margin: "0 auto" }} />
							<div style={{ margin: "4px 0" }}><DsTag tone={isActive ? "ok" : isAwaitingSignature ? "warn" : "danger"}>{isActive ? "Aktif" : isAwaitingSignature ? "Menunggu TTD" : "Berakhir"}</DsTag></div>
							<h2 className="ds-title" style={{ margin: "4px 0 2px", fontSize: 20 }}>{emp.type || "PKWT"}{staff?.roleName ? ` · ${staff.roleName}` : ""}</h2>
							<div className="ds-sub">{fd(startDate)} – {fd(computedEndDate)}{isActive && daysLeft !== null ? ` · sisa ${daysLeft} hari` : ""}</div>
						</div>
					</DsGroup>
					<DsGroup>
						{pdf ? (
							<>
								<DsRow icon={<DsIcon name="employee-contract" />} title="Baca kontrak" sub="Buka dokumen PDF" chevron onClick={() => window.open(pdf.read, "_blank", "noopener,noreferrer")} />
								<DsRow icon={<DsIcon name="employee-payslip" />} title="Unduh PDF" sub="Simpan ke perangkat" chevron onClick={() => { window.location.assign(pdf.download); }} />
							</>
						) : isAwaitingSignature && registrationNumber ? (
							<DsRow icon={<DsIcon name="employee-contract" />} title="Tanda tangani kontrak" sub="Buka halaman penandatanganan" chevron onClick={() => { window.location.href = `https://pos.djiwatentram.web.id/register/selesai/${registrationNumber}`; }} />
						) : (
							<DsRow icon={<DsIcon name="employee-contract" />} title="File PDF belum tersedia" sub="Hubungi manager bila perlu" />
						)}
					</DsGroup>
					{isActive && daysLeft !== null && daysLeft <= 60 && (
						<DsNote icon={<DsIcon name="employee-schedule" />}><b>Kontrak berakhir {fd(computedEndDate)}</b>Perpanjangan dibahas dengan manager.</DsNote>
					)}
				</>
			)}
		</>
	);
}

export const Route = createLazyFileRoute("/$username/kontrak")({
	component: KontrakPage,
});
