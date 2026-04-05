import { createLazyFileRoute, Link } from "@tanstack/react-router";

const HOME_MENU_ITEMS = [
	{ section: "ai-chat", label: "AI Chat" },
	{ section: "dapur", label: "Dapur" },
	{ section: "bar", label: "Bar" },
	{ section: "layanan-operasional", label: "Layanan Operasional" },
	{ section: "keuangan", label: "Keuangan" },
	{ section: "pesanan", label: "Pesanan" },
	{ section: "produk", label: "Produk" },
	{ section: "pengaturan", label: "Pengaturan" },
] as const;

export const Route = createLazyFileRoute("/home")({
	component: HomePage,
});

function HomePage() {
	return (
		<div className="min-h-screen bg-background px-4 py-6 text-foreground">
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
				<div>
					<h1 className="font-black text-2xl tracking-tight">Home</h1>
					<p className="text-muted-foreground text-sm">
						Pilih halaman penting yang ingin dibuka.
					</p>
				</div>

				<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
					{HOME_MENU_ITEMS.map((item) => (
						<Link
							className="rounded-2xl border border-border bg-card px-4 py-5 text-center font-bold text-sm transition-colors hover:bg-muted"
							key={item.section}
							params={{ section: item.section }}
							to="/home/$section"
						>
							{item.label}
						</Link>
					))}
				</div>
			</div>
		</div>
	);
}

