import { Component, type ReactNode } from "react";

interface Props {
	children: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
	countdown: number;
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Error boundaries require class components
export class ErrorBoundary extends Component<Props, State> {
	private countdownTimer: number | null = null;
	private readonly retryDelaySeconds = 15;

	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null, countdown: this.retryDelaySeconds };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error, countdown: 15 };
	}

	componentDidMount() {
		window.addEventListener("error", this.handleWindowError);
		window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
	}

	componentDidCatch(error: Error) {
		// Keep logging for observability/debugging in browser console.
		console.error("Runtime error caught by ErrorBoundary:", error);
		this.startAutoRetryCountdown();
	}

	componentDidUpdate(_: Props, prevState: State) {
		if (this.state.hasError && !prevState.hasError) {
			this.startAutoRetryCountdown();
		}
	}

	componentWillUnmount() {
		window.removeEventListener("error", this.handleWindowError);
		window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
		this.clearCountdown();
	}

	private clearCountdown = () => {
		if (this.countdownTimer !== null) {
			window.clearInterval(this.countdownTimer);
			this.countdownTimer = null;
		}
	};

	private startAutoRetryCountdown = () => {
		this.clearCountdown();
		this.setState({ countdown: this.retryDelaySeconds });
		this.countdownTimer = window.setInterval(() => {
			this.setState((prev) => {
				if (prev.countdown <= 1) {
					this.clearCountdown();
					window.location.reload();
					return { ...prev, countdown: 0 };
				}
				return { ...prev, countdown: prev.countdown - 1 };
			});
		}, 1000);
	};

	private handleWindowError = (event: ErrorEvent) => {
		const nextError =
			event.error instanceof Error
				? event.error
				: new Error(event.message || "Unknown runtime error");
		this.setState({ hasError: true, error: nextError, countdown: this.retryDelaySeconds });
	};

	private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
		const reason = event.reason;
		const nextError =
			reason instanceof Error
				? reason
				: new Error(typeof reason === "string" ? reason : "Unhandled promise rejection");
		this.setState({ hasError: true, error: nextError, countdown: this.retryDelaySeconds });
	};

	private handleRefresh = () => {
		window.location.reload();
	}

	render() {
		if (this.state.hasError) {
			return (
				<div
					className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-8 text-white"
				>
					<div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-400/30 blur-3xl" />
					<div className="pointer-events-none absolute -bottom-20 right-0 h-60 w-60 rounded-full bg-fuchsia-500/20 blur-3xl" />
					<div className="relative w-full max-w-2xl rounded-2xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-sm md:p-8">
						<div className="mb-4 inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
							Maintenance Mode Aktif
						</div>
						<h1 className="text-3xl font-bold leading-tight md:text-4xl">
							Sistem sedang dipulihkan
						</h1>
						<p className="mt-3 text-sm text-slate-200 md:text-base">
							Kami mendeteksi gangguan runtime dan otomatis memindahkan aplikasi
							ke mode aman agar pengguna tidak melihat halaman kosong.
						</p>
						<div className="mt-6 grid gap-3 sm:grid-cols-2">
							<div className="rounded-xl border border-white/20 bg-black/20 p-4">
								<p className="text-xs uppercase tracking-wider text-cyan-200/80">
									Auto Retry
								</p>
								<p className="mt-1 text-3xl font-bold text-cyan-200">
									{this.state.countdown}s
								</p>
								<p className="mt-1 text-xs text-slate-300">
									Reload otomatis saat hitung mundur selesai.
								</p>
							</div>
							<div className="rounded-xl border border-white/20 bg-black/20 p-4">
								<p className="text-xs uppercase tracking-wider text-rose-200/80">
									Status
								</p>
								<p className="mt-1 text-lg font-semibold text-rose-100">
									Runtime Error Terdeteksi
								</p>
								<p className="mt-1 text-xs text-slate-300">
									Tim tetap bisa cek detail teknis di bawah.
								</p>
							</div>
						</div>
						<div className="mt-6 flex flex-wrap gap-3">
							<button
								onClick={this.handleRefresh}
								className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
								type="button"
							>
								Coba Muat Ulang Sekarang
							</button>
							<a
								href="/"
								className="rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
							>
								Kembali ke Beranda
							</a>
						</div>
						<details className="mt-6 rounded-xl border border-white/15 bg-black/20 p-3 text-sm">
							<summary className="cursor-pointer font-semibold text-slate-100">
								Detail error (untuk debugging)
							</summary>
							<pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-xs text-amber-100">
								{this.state.error?.stack || this.state.error?.message || "Unknown error"}
							</pre>
						</details>
					</div>
					<div
						className="sr-only"
						role="status"
						aria-live="polite"
					>
						Mode maintenance aktif. Reload otomatis dalam {this.state.countdown} detik.
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
