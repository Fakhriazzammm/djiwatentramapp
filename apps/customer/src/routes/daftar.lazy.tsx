import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useOrderContext } from "@/hooks/use-order-context";

export const Route = createLazyFileRoute("/daftar")({
	component: DaftarPage,
});

function DaftarPage() {
	const navigate = useNavigate();
	const {
		guestName: name,
		setGuestName: setName,
		guestEmail: email,
		setGuestEmail: setEmail,
		guestPhone: phone,
		setGuestPhone: setPhone,
	} = useOrderContext();

	const handleSubmit = () => {
		const trimmedName = name.trim();
		if (!trimmedName) {
			toast.error("Nama wajib diisi");
			return;
		}

		localStorage.setItem(
			"guest-data",
			JSON.stringify({
				name: trimmedName,
				email: email.trim() || "",
				phone: phone.trim() || "",
			}),
		);

		navigate({ to: "/order", search: { step: "party" } });
	};

	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto flex min-h-app max-w-md flex-col bg-background">
				{/* Header */}
				<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
					<div className="flex items-center gap-2">
						<button
							type="button"
							className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
							onClick={() => navigate({ to: "/" })}
						>
							<ArrowLeft className="h-3.5 w-3.5" />
						</button>
						<h1 className="text-sm font-black tracking-tight">Data Diri</h1>
					</div>
				</header>

				{/* Main Content */}
				<main className="flex-1 px-3 py-4">
					<div className="space-y-3">
						{/* Nama */}
						<div>
							<label className="text-xs font-bold text-foreground">
								Nama <span className="text-destructive">*</span>
							</label>
							<input
								type="text"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Nama kamu"
								className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
							/>
						</div>

						{/* Email */}
						<div>
							<label className="text-xs font-bold text-foreground">
								Email <span className="text-muted-foreground text-[10px]">(opsional)</span>
							</label>
							<input
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="email@example.com"
								className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
							/>
						</div>

						{/* No WhatsApp */}
						<div>
							<label className="text-xs font-bold text-foreground">
								No. WhatsApp <span className="text-muted-foreground text-[10px]">(opsional)</span>
							</label>
							<input
								type="tel"
								value={phone}
								onChange={(e) => setPhone(e.target.value)}
								placeholder="08xxxx"
								className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
							/>
						</div>

						{/* Submit */}
						<button
							type="button"
							onClick={handleSubmit}
							className="w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-black text-white shadow-sm"
						>
							Lanjut memesan
						</button>
					</div>
				</main>
			</div>
		</div>
	);
}
