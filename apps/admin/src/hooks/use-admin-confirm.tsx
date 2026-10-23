import { useCallback, useState } from "react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

export interface AdminConfirmOptions {
	title: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	variant?: "danger" | "warning" | "info";
}

type PendingConfirm = AdminConfirmOptions & { resolve: (accepted: boolean) => void };

export function useAdminConfirm() {
	const [pending, setPending] = useState<PendingConfirm | null>(null);

	const confirm = useCallback(
		(options: AdminConfirmOptions) =>
			new Promise<boolean>((resolve) => {
				setPending((previous) => {
					previous?.resolve(false);
					return { ...options, resolve };
				});
			}),
		[],
	);

	const settle = useCallback((accepted: boolean) => {
		setPending((current) => {
			current?.resolve(accepted);
			return null;
		});
	}, []);

	const dialog = (
		<ConfirmationModal
			cancelText={pending?.cancelText ?? "Batal"}
			confirmText={pending?.confirmText ?? "Lanjutkan"}
			isOpen={pending !== null}
			message={pending?.message ?? ""}
			onClose={() => settle(false)}
			onConfirm={() => settle(true)}
			title={pending?.title ?? ""}
			variant={pending?.variant ?? "danger"}
		/>
	);

	return { confirm, dialog };
}
