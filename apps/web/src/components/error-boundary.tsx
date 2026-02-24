import { Component, type ReactNode } from "react";

interface Props {
	children: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

// biome-ignore lint/style/useReactFunctionComponents: Error boundaries require class components - no function component equivalent exists in React
export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	render() {
		if (this.state.hasError) {
			return (
				<div
					style={{
						padding: "2rem",
						fontFamily: "system-ui, sans-serif",
						maxWidth: "600px",
						margin: "4rem auto",
					}}
				>
					<h1
						style={{
							fontSize: "1.5rem",
							marginBottom: "1rem",
							color: "#dc2626",
						}}
					>
						Aplikasi gagal dimuat
					</h1>
					<p style={{ marginBottom: "1rem", color: "#374151" }}>
						Terjadi kesalahan saat memuat aplikasi. Pastikan konfigurasi
						environment sudah benar.
					</p>
					<details
						style={{
							background: "#f3f4f6",
							padding: "1rem",
							borderRadius: "0.5rem",
						}}
					>
						<summary style={{ cursor: "pointer", fontWeight: 600 }}>
							Detail Error
						</summary>
						<pre
							style={{
								marginTop: "0.5rem",
								whiteSpace: "pre-wrap",
								fontSize: "0.875rem",
								color: "#991b1b",
							}}
						>
							{this.state.error?.message}
						</pre>
					</details>
					<button
						onClick={() => window.location.reload()}
						style={{
							marginTop: "1rem",
							padding: "0.5rem 1rem",
							background: "#2563eb",
							color: "white",
							border: "none",
							borderRadius: "0.375rem",
							cursor: "pointer",
							fontSize: "0.875rem",
						}}
						type="button"
					>
						Muat Ulang
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}
