import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

const SECTION_LABELS: Record<string, string> = {
	"ai-chat": "AI Chat",
	dapur: "Dapur",
	bar: "Bar",
	"layanan-operasional": "Layanan Operasional",
	keuangan: "Keuangan",
	pesanan: "Pesanan",
	produk: "Produk",
	pengaturan: "Pengaturan",
};

export const Route = createLazyFileRoute("/home/$section")({
	component: HomeSectionPage,
});

function HomeSectionPage() {
	const { section } = Route.useParams();
	const sectionLabel = SECTION_LABELS[section] ?? "Halaman";

	return (
		<div className="flex min-h-app items-center justify-center bg-background p-6">
			<div className="flex w-full max-w-3xl flex-col items-center justify-center gap-8 rounded-3xl border border-border bg-card p-8 text-center">
				<h1 className="font-black text-4xl tracking-tight md:text-5xl">
					{sectionLabel}
				</h1>
				<Link
					className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground transition-opacity hover:opacity-90"
					to="/home"
				>
					<ArrowLeft className="h-4 w-4" />
					Kembali
				</Link>
			</div>
		</div>
	);
}
