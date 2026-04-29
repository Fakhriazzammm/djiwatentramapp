import type { EmployeeOnboardingDraft } from "./employee-onboarding-schema";

export async function dataUrlToBlob(dataUrl: string) {
	const res = await fetch(dataUrl);
	return res.blob();
}

export async function generateContractPdfBlob(draft: EmployeeOnboardingDraft, element?: HTMLElement | null) {
	const html = element?.outerHTML || `<article><h1>${draft.contract.title}</h1><pre>${draft.contract.plainText}</pre></article>`;
	return new Blob(
		[
			"<!doctype html><html><head><meta charset=\"utf-8\"><title>",
			draft.contract.title,
			"</title></head><body>",
			html,
			"</body></html>",
		],
		{ type: "text/html;charset=utf-8" }
	);
}
