import { useCallback } from "react";
import { useMutation } from "@/lib/backend-bridge";
import { createClient } from "@/lib/client";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { useHybridCreateUser } from "./use-hybrid-write-actions";

const api = new Proxy(
	{},
	{
		get: () =>
			new Proxy(
				{},
				{
					get: () => undefined,
				}
			),
	}
) as any;

const hasSupabaseConfig = Boolean(
	import.meta.env.VITE_SUPABASE_URL &&
		import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

type HybridStorageUploadArgs = {
	file: Blob;
	contentType?: string;
	fileName?: string;
	folder?: string;
};

function getExtensionFromFileName(fileName?: string) {
	if (!fileName) return "";
	const match = fileName.match(/\.([a-zA-Z0-9]+)$/);
	return match ? match[1].toLowerCase() : "";
}

function getExtensionFromContentType(contentType?: string) {
	const type = String(contentType || "").toLowerCase();
	if (type.includes("html")) return "html";
	if (type.includes("pdf")) return "pdf";
	if (type.includes("jpeg")) return "jpg";
	if (type.includes("png")) return "png";
	if (type.includes("webp")) return "webp";
	return "bin";
}

function buildStoragePath(args: { folder: string; fileName?: string; contentType?: string }) {
	const extension = getExtensionFromFileName(args.fileName) || getExtensionFromContentType(args.contentType);
	const random =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID().replace(/-/g, "")
			: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
	return `${args.folder}/${Date.now()}-${random.slice(0, 20)}.${extension}`;
}

async function invokeYumiAiAction(action: string, payload: Record<string, unknown>) {
	const supabase = createClient();
	const { data, error } = await supabase.functions.invoke("yumi-ai", {
		body: { action, ...payload },
	});
	if (error) throw new Error(error.message || "Gagal menghubungi AI");
	if ((data as any)?.error) throw new Error((data as any).error);
	return data;
}

export function useHybridGenerateEmployeeOnboardingUploadUrl() {
	const fallback = useMutation((api as any).employee_onboarding?.generateUploadUrl);
	return useCallback(
		async (args: HybridStorageUploadArgs) => {
			if (!args?.file) throw new Error("file is required");
			if (!hasSupabaseConfig) {
				const postUrl = await fallback({});
				const result = await fetch(postUrl, {
					method: "POST",
					headers: { "Content-Type": args.contentType || "application/octet-stream" },
					body: args.file,
				});
				if (!result.ok) throw new Error(`Upload failed: ${result.status}`);
				const payload = await result.json();
				return String(payload?.storageId ?? "");
			}

			const supabase = createClient();
			const folder = String(args.folder || "employee-contracts").replace(/^\/+|\/+$/g, "") || "employee-contracts";
			const objectPath = buildStoragePath({ folder, fileName: args.fileName, contentType: args.contentType });
			const { error } = await supabase.storage.from("employee-contracts").upload(objectPath, args.file, {
				contentType: args.contentType || "application/octet-stream",
				upsert: false,
			});
			if (error) throw error;
			const { data } = supabase.storage.from("employee-contracts").getPublicUrl(objectPath);
			return data.publicUrl || objectPath;
		},
		[fallback]
	);
}

export function useHybridGenerateEmployeeContract() {
	return useCallback(async (args: any) => {
		const data = await invokeYumiAiAction("generateEmployeeContract", args ?? {});
		return data as {
			title?: string;
			plainText?: string;
			html?: string;
			clauses?: Array<{ title: string; body: string }>;
		};
	}, []);
}

export function useHybridSubmitEmployeeApplication() {
	const fallback = useMutation((api as any).employee_onboarding?.submitApplication);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const payload = args?.payload ?? args;
			if (!payload?.full_name || !payload?.phone) throw new Error("Data pendaftaran tidak lengkap");
			const { data, error } = await createClient()
				.from("employee_onboarding_applications")
				.insert({
					status: "pending",
					full_name: payload.full_name,
					email: payload.email ?? null,
					phone: payload.phone,
					identity_number: payload.identity_number ?? null,
					address: payload.address ?? null,
					birth_date: payload.birth_date ?? null,
					emergency_contact: payload.emergency_contact ?? {},
					employment: payload.employment ?? {},
					contract: payload.contract ?? {},
					signature_url: payload.signature_url ?? null,
					contract_pdf_url: payload.contract_pdf_url ?? null,
					attachments: payload.attachments ?? {},
					raw: payload.raw ?? {},
				})
				.select("id")
				.single();
			if (error) throw error;
			return data?.id;
		},
		[fallback]
	);
}

export function useHybridUpdateEmployeeApplicationStatus() {
	const fallback = useMutation((api as any).employee_onboarding?.updateStatus);
	const { user } = useYumiAuth();
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			const status = String(args?.status ?? "");
			if (!id || !["approved", "rejected", "needs_revision", "pending"].includes(status)) {
				throw new Error("Status pendaftaran tidak valid");
			}
			const { error } = await createClient()
				.from("employee_onboarding_applications")
				.update({
					status,
					approved_user_source_id: args?.approvedUserSourceId ?? null,
					review_notes: args?.reviewNotes ?? null,
					reviewed_by: user?.name ?? user?.username ?? "admin",
					reviewed_at: new Date().toISOString(),
				})
				.eq("id", id);
			if (error) throw error;
			return id;
		},
		[fallback, user?.name, user?.username]
	);
}

export { useHybridCreateUser };
