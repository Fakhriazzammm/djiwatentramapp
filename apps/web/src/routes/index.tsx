import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: IndexPage,
});

function IndexPage() {
	const navigate = useNavigate();

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-primary/5 to-background p-4">
			<div className="text-center">
				<h1 className="mb-2 font-bold text-4xl text-foreground">
					YumiPOS
				</h1>
				<p className="mb-8 text-muted-foreground">
					Point of Sale System
				</p>
				<div className="flex flex-col gap-3 sm:flex-row">
					<button
						className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition hover:opacity-90"
						onClick={() => navigate({ to: "/booking" })}
						type="button"
					>
						Booking
					</button>
					<button
						className="rounded-lg border border-border bg-background px-6 py-3 font-medium text-foreground transition hover:bg-muted"
						onClick={() => navigate({ to: "/admin/booking" })}
						type="button"
					>
						Admin
					</button>
				</div>
			</div>
		</div>
	);
}
