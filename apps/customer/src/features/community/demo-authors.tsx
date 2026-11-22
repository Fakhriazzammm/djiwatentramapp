import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Akun contoh untuk mengisi Komunitas. Semua postingan dan komentarnya diberi
 * badge "Demo" agar pembaca tahu itu bukan pelanggan sungguhan.
 * ID harus sama dengan baris di pos.customers dan public.customer_community_*.
 */
export const DEMO_AUTHOR_IDS: ReadonlySet<string> = new Set([
	"demo0000000000000000000000000001",
	"demo0000000000000000000000000002",
	"demo0000000000000000000000000003",
	"demo0000000000000000000000000004",
	"demo0000000000000000000000000005",
	"demo0000000000000000000000000006",
	"demo0000000000000000000000000007",
	"demo0000000000000000000000000008",
	"demo0000000000000000000000000009",
	"demo0000000000000000000000000010",
]);

export function isDemoAuthor(sourceId: string | null | undefined): boolean {
	return Boolean(sourceId && DEMO_AUTHOR_IDS.has(sourceId));
}

export function DemoBadge({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[#f0d9ae] bg-[#fff7e8] text-[#8a5a00]",
				className,
			)}
			title="Konten demo, bukan pelanggan sungguhan"
			role="img"
			aria-label="Konten demo"
		>
			<Check className="h-2.5 w-2.5" strokeWidth={3.5} aria-hidden="true" />
		</span>
	);
}
