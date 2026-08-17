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
		tableNumber,
		setTableNumber,
	} = useOrderContext();

	const handleSubmit = () => {
		const trimmedName = name.trim();
		if (!trimmedName) {
			toast.error("Nama wajib diisi");
			return;
		}

		// Generate unique guest username: {nama-slug}-{4digit}
		const slug = trimmedName
			.toLowerCase()
			.replace(/[^a-z0-9]/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "");
		const random = Math.floor(1000 + Math.random() * 9000);
		const guestUsername = `${slug}-${random}`;

		localStorage.setItem(
			"guest-data",
			JSON.stringify({
				name: trimmedName,
				email: email.trim() || "",
				phone: phone.trim() || "",
				username: guestUsername,
				table: tableNumber.trim() || "",
			}),
		);

		navigate({
			to: `/${guestUsername}`,
			search: tableNumber.trim()
				? { table: tableNumber.trim() }
				: undefined,
		});
	};

	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto flex min-h-app max-w-md flex-col bg-background">
				{/* Header */}
				<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
					<div className="flex items-center gap-2">
						<button
							type="button"
							className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
							aria-label="Kembali ke halaman utama"
							onClick={() => navigate({ to: "/" })}
						>
							<ArrowLeft className="h-3.5 w-3.5" />
						</button>
						<h1 className="font-display text-base font-black tracking-tight">Data Diri</h1>
					</div>
				</header>

				{/* Main Content */}
				<main className="flex-1 px-3 py-4">
					<div className="space-y-3">
						{/* Nama */}
						<div>
							<label htmlFor="guest-name" className="text-xs font-bold text-foreground">
								Nama <span className="text-destructive">*</span>
							</label>
							<input
								id="guest-name"
								type="text"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Nama kamu"
								className="mt-1 min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
							/>
						</div>

						{/* Email */}
						<div>
							<label htmlFor="guest-email" className="text-xs font-bold text-foreground">
								Email
							</label>
							<input
								id="guest-email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="email@example.com"
								className="mt-1 min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
							/>
						</div>

						{/* No WhatsApp */}
						<div>
							<label htmlFor="guest-phone" className="text-xs font-bold text-foreground">
								No. WhatsApp
							</label>
							<input
								id="guest-phone"
								type="tel"
								value={phone}
								onChange={(e) => setPhone(e.target.value)}
								placeholder="08xxxx"
								className="mt-1 min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
							/>
						</div>

						{/* No Meja */}
						<div>
							<label htmlFor="guest-table" className="text-xs font-bold text-foreground">
								No. Meja
							</label>
							<input
								id="guest-table"
								type="text"
								value={tableNumber}
								onChange={(e) => setTableNumber(e.target.value)}
								placeholder="Contoh: 5"
								className="mt-1 min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
							/>
						</div>

						{/* Submit */}
						<button
							type="button"
							onClick={handleSubmit}
							className="min-h-11 w-full rounded-[14px] bg-primary px-3 py-2.5 text-sm font-black text-white shadow-sm transition-transform duration-[180ms] active:scale-[.97]"
						>
							Lanjut memesan
						</button>
					</div>
				</main>
			</div>
		</div>
	);
}
