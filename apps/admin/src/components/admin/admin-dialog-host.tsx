import { useEffect, useRef, useState } from "react";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { subscribeAdminDialogs, type AdminDialogRequest } from "@/lib/admin-dialogs";

export function AdminDialogHost() {
	const [request, setRequest] = useState<AdminDialogRequest | null>(null);
	const [promptValue, setPromptValue] = useState("");
	const pending = useRef<AdminDialogRequest | null>(null);

	useEffect(() => {
		return subscribeAdminDialogs((next) => {
			settle(pending.current, next.kind === "confirm" ? false : null);
			pending.current = next;
			setPromptValue("");
			setRequest(next);
		});
	}, []);

	function settle(current: AdminDialogRequest | null, value: boolean | string | null) {
		if (!current) return;
		if (current.kind === "confirm") current.resolve(value === true);
		else current.resolve(typeof value === "string" ? value : null);
		pending.current = null;
	}

	const close = () => {
		settle(pending.current, pending.current?.kind === "confirm" ? false : null);
		setRequest(null);
	};

	const accept = () => {
		const current = pending.current;
		if (!current) return;
		if (current.kind === "confirm") settle(current, true);
		else settle(current, promptValue.trim());
		setRequest(null);
	};

	if (!request) return null;

	if (request.kind === "confirm") {
		return (
			<ConfirmationModal
				cancelText={request.cancelText ?? "Batal"}
				confirmText={request.confirmText ?? "Lanjutkan"}
				isOpen
				message={request.message}
				onClose={close}
				onConfirm={accept}
				title={request.title}
				variant={request.variant ?? "danger"}
			/>
		);
	}

	return (
		<div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
			<div className="fixed inset-0 bg-black/50" onClick={close} />
			<form
				aria-modal="true"
				aria-label={request.title}
				className="relative w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-5 shadow-2xl"
				onSubmit={(event) => {
					event.preventDefault();
					if (promptValue.trim()) accept();
				}}
				role="dialog"
			>
				<div className="space-y-1">
					<h2 className="text-base font-bold text-foreground">{request.title}</h2>
					{request.message ? <p className="text-sm text-muted-foreground">{request.message}</p> : null}
				</div>
				<input
					aria-label={request.title}
					autoFocus
					className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onChange={(event) => setPromptValue(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape") close();
					}}
					placeholder={request.placeholder}
					value={promptValue}
				/>
				<div className="flex justify-end gap-2">
					<button
						className="h-10 rounded-xl border border-border px-4 text-sm font-semibold text-muted-foreground hover:bg-muted"
						onClick={close}
						type="button"
					>
						Batal
					</button>
					<button
						className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
						disabled={!promptValue.trim()}
						type="submit"
					>
						{request.confirmText ?? "Simpan"}
					</button>
				</div>
			</form>
		</div>
	);
}
