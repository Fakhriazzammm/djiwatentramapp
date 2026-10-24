export interface AdminConfirmRequest {
	title: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	variant?: "danger" | "warning" | "info";
}

export interface AdminPromptRequest {
	title: string;
	message?: string;
	placeholder?: string;
	confirmText?: string;
}

export type AdminDialogRequest =
	| ({ kind: "confirm"; resolve: (accepted: boolean) => void } & AdminConfirmRequest)
	| ({ kind: "prompt"; resolve: (value: string | null) => void } & AdminPromptRequest);

type Listener = (request: AdminDialogRequest) => void;

const listeners = new Set<Listener>();

export function subscribeAdminDialogs(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function dispatch(request: AdminDialogRequest, fallback: () => void) {
	if (listeners.size === 0) {
		fallback();
		return;
	}
	for (const listener of listeners) listener(request);
}

export function requestAdminConfirm(options: AdminConfirmRequest): Promise<boolean> {
	return new Promise((resolve) => {
		dispatch({ kind: "confirm", ...options, resolve }, () => resolve(window.confirm(options.message)));
	});
}

export function requestAdminPrompt(options: AdminPromptRequest): Promise<string | null> {
	return new Promise((resolve) => {
		dispatch({ kind: "prompt", ...options, resolve }, () => resolve(window.prompt(options.title)));
	});
}
