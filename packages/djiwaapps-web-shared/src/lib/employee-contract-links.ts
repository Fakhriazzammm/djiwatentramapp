const storageOrigin = "https://supabase.djiwatentram.web.id";
const formerCloudOrigin = "https://xaemykhjpkgypqqpfdcb.supabase.co";
const contractOrigins = new Set([storageOrigin, "https://supabase.yumme.id", formerCloudOrigin]);
const contractPath = "/storage/v1/object/public/employee-contracts/contracts/";

export function employeeContractPdfLinks(value: string | null | undefined) {
	if (!value) return null;
	try {
		const url = new URL(value);
		if (!contractOrigins.has(url.origin) || !url.pathname.startsWith(contractPath) || !url.pathname.toLowerCase().endsWith(".pdf")) {
			return null;
		}
		const pdf = new URL(url.pathname, storageOrigin);
		const read = pdf.href;
		pdf.searchParams.set("download", "kontrak-kerja.pdf");
		return { read, download: pdf.href };
	} catch {
		return null;
	}
}

export function isUnavailableLegacyEmployeeCv(value: string | null | undefined) {
	return Boolean(value?.startsWith(formerCloudOrigin + "/"));
}
