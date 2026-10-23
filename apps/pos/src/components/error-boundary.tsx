import { Component, type ReactNode } from "react";

interface Props {
	children: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

const CHUNK_RELOAD_SESSION_KEY = "__chunk_reload_once__";

function isChunkLoadError(error: unknown): boolean {
	const message =
		error instanceof Error
			? `${error.name} ${error.message}`
			: typeof error === "string"
				? error
				: "";
	const normalized = message.toLowerCase();
	return (
		normalized.includes("failed to fetch dynamically imported module") ||
		normalized.includes("importing a module script failed") ||
		normalized.includes("chunkloaderror") ||
		normalized.includes("loading chunk")
	);
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Error boundaries require class components
export class ErrorBoundary extends Component<Props, State> {
	private chunkRecoveryStarted = false;
	private chunkLoadFailed = false;

	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidMount() {
		window.addEventListener("error", this.handleWindowError);
		window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
	}

	componentDidCatch(error: Error) {
		// Keep logging for observability/debugging in browser console.
		console.error("Runtime error caught by ErrorBoundary:", error);
		if (isChunkLoadError(error)) {
			void this.recoverFromChunkLoadError();
			return;
		}
	}

	componentWillUnmount() {
		window.removeEventListener("error", this.handleWindowError);
		window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
	}

	private handleWindowError = (event: ErrorEvent) => {
		const nextError =
			event.error instanceof Error
				? event.error
				: new Error(event.message || "Unknown runtime error");
		if (isChunkLoadError(nextError)) {
			void this.recoverFromChunkLoadError();
		}
		// Non-chunk errors (API failures, RLS errors, network errors, etc.) are
		// intentionally NOT escalated to maintenance mode here — they should be
		// handled at the component/hook level, not by taking down the whole UI.
	};

	private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
		const reason = event.reason;
		const nextError =
			reason instanceof Error
				? reason
				: new Error(typeof reason === "string" ? reason : "Unhandled promise rejection");
		if (isChunkLoadError(nextError)) {
			void this.recoverFromChunkLoadError();
		}
		// Same as above: only chunk-load failures trigger recovery here.
		// Promise rejections from Supabase / fetch / etc. must not show maintenance mode.
	};

	private recoverFromChunkLoadError = async () => {
		this.chunkLoadFailed = true;
		if (this.chunkRecoveryStarted) {
			this.setState({ hasError: true });
			return;
		}
		this.chunkRecoveryStarted = true;
		try {
			if (sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY) === "1") {
				this.setState({ hasError: true, error: new Error("Halaman belum dapat dibuka. Silakan coba lagi.") });
				return;
			}
			sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, "1");
		} catch {
			// Without a durable guard, a reload could trap the user in a loop.
			this.setState({ hasError: true, error: new Error("Halaman belum dapat dibuka. Silakan coba lagi.") });
			return;
		}

		try {
			if ("serviceWorker" in navigator) {
				const registrations = await navigator.serviceWorker.getRegistrations();
				await Promise.all(registrations.map((registration) => registration.update()));
			}
		} catch (error) {
			console.warn("Failed to update service worker before reload:", error);
		}

		const url = new URL(window.location.href);
		url.searchParams.set("r", Date.now().toString());
		window.location.replace(url.toString());
	};

	private handleRetry = () => {
		// A failed app download needs a fresh request, only when the user chooses it.
		if (this.chunkLoadFailed) {
			window.location.reload();
			return;
		}
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError) {
			return (
				<main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
					<div role="alert" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
						<h1 className="text-xl font-bold">Halaman belum dapat dibuka</h1>
						<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
							Coba lagi atau kembali ke POS untuk melanjutkan. Halaman tidak akan dimuat ulang otomatis.
						</p>
						<div className="mt-5 flex flex-col gap-2 sm:flex-row">
							<button type="button" onClick={this.handleRetry} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
								Coba lagi
							</button>
							<a href="/menu" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
								Kembali ke POS
							</a>
						</div>
					</div>
				</main>
			);
		}
		return this.props.children;
	}
}
