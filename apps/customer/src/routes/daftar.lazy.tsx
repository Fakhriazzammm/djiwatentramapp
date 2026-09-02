import { CustomerHeader } from "@/components/customer/customer-shell";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useOrderContext } from "@/hooks/use-order-context";

export const Route = createLazyFileRoute("/daftar")({
	component: DaftarPage,
});

function DaftarPage() {
	const navigate = useNavigate();
	const [fieldErrors, setFieldErrors] = useState<Partial<Record<"name" | "email" | "phone" | "description", string>>>({});
	const {
		guestName: name,
		setGuestName: setName,
		guestEmail: email,
		setGuestEmail: setEmail,
		guestPhone: phone,
		setGuestPhone: setPhone,
		guestDescription: description,
		setGuestDescription,
		guestMarketingConsent,
		setGuestMarketingConsent,
		tableNumber,
		setTableNumber,
		setCart,
	} = useOrderContext();

	const focusInvalidField = (fieldId: string, field: "name" | "email" | "phone" | "description", message: string) => {
		setFieldErrors((current) => ({ ...current, [field]: message }));
		toast.error(message);
		window.requestAnimationFrame(() => {
			const input = document.getElementById(fieldId) as HTMLInputElement | null;
			input?.scrollIntoView({ behavior: "smooth", block: "center" });
			input?.focus({ preventScroll: true });
		});
	};

	const clearFieldError = (field: "name" | "email" | "phone" | "description") => {
		setFieldErrors((current) => {
			if (!current[field]) return current;
			const next = { ...current };
			delete next[field];
			return next;
		});
	};

	const handleSubmit = () => {
		const trimmedName = name.trim();
		if (!trimmedName) {
			focusInvalidField("guest-name", "name", "Nama wajib diisi");
			return;
		}
		if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
			focusInvalidField("guest-email", "email", "Email wajib diisi dengan format yang valid");
			return;
		}
		if (phone.replace(/[^\d]/g, "").length < 10) {
			focusInvalidField("guest-phone", "phone", "Nomor WhatsApp wajib diisi minimal 10 digit");
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

		// Guest baru tidak boleh mewarisi draft cart guest sebelumnya pada device yang sama.
		setCart([]);

		localStorage.setItem(
			"guest-data",
			JSON.stringify({
				name: trimmedName,
				email: email.trim() || "",
				phone: phone.trim() || "",
				description: description.trim().slice(0, 160),
				marketingConsent: guestMarketingConsent,
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
				<CustomerHeader title="Data Diri" subtitle="Djiwa Tentram" onBack={() => navigate({ to: "/" })} leading={<ArrowLeft className="h-4 w-4" />} />

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
								onChange={(e) => { clearFieldError("name"); setName(e.target.value); }}
								placeholder="Nama kamu"
								aria-invalid={Boolean(fieldErrors.name)}
								aria-describedby={fieldErrors.name ? "guest-name-error" : undefined}
								className={`mt-1 min-h-11 w-full rounded-[14px] border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20 ${fieldErrors.name ? "border-destructive focus:border-destructive" : "border-border focus:border-primary/50"}`}
							/>
							{fieldErrors.name ? <p id="guest-name-error" role="alert" className="mt-1 text-[11px] font-semibold text-destructive">{fieldErrors.name}</p> : null}
						</div>

						{/* Email */}
						<div>
							<label htmlFor="guest-email" className="text-xs font-bold text-foreground">
								Email <span className="text-destructive">*</span>
							</label>
							<input
								id="guest-email"
								type="email"
								value={email}
								onChange={(e) => { clearFieldError("email"); setEmail(e.target.value); }}
								placeholder="email@example.com"
								required
								aria-invalid={Boolean(fieldErrors.email)}
								aria-describedby={fieldErrors.email ? "guest-email-error" : undefined}
								className={`mt-1 min-h-11 w-full rounded-[14px] border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20 ${fieldErrors.email ? "border-destructive focus:border-destructive" : "border-border focus:border-primary/50"}`}
							/>
							{fieldErrors.email ? <p id="guest-email-error" role="alert" className="mt-1 text-[11px] font-semibold text-destructive">{fieldErrors.email}</p> : null}
						</div>

						{/* No WhatsApp */}
						<div>
							<label htmlFor="guest-phone" className="text-xs font-bold text-foreground">
								No. WhatsApp <span className="text-destructive">*</span>
							</label>
							<input
								id="guest-phone"
								type="tel"
								value={phone}
								onChange={(e) => { clearFieldError("phone"); setPhone(e.target.value); }}
								placeholder="08xxxx"
								required
								aria-invalid={Boolean(fieldErrors.phone)}
								aria-describedby={fieldErrors.phone ? "guest-phone-error" : undefined}
								className={`mt-1 min-h-11 w-full rounded-[14px] border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20 ${fieldErrors.phone ? "border-destructive focus:border-destructive" : "border-border focus:border-primary/50"}`}
							/>
							{fieldErrors.phone ? <p id="guest-phone-error" role="alert" className="mt-1 text-[11px] font-semibold text-destructive">{fieldErrors.phone}</p> : null}
						</div>

						{/* Ciri khusus customer */}
						<div>
							<label htmlFor="guest-description" className="text-xs font-bold text-foreground">
								Ciri khusus customer <span className="text-muted-foreground">(opsional)</span>
							</label>
							<input
								id="guest-description"
								type="text"
								value={description}
								onChange={(e) => { clearFieldError("description"); setGuestDescription(e.target.value.slice(0, 160)); }}
								placeholder="Contoh: baju merah, topi hitam"
								maxLength={160}
								required
								aria-invalid={Boolean(fieldErrors.description)}
								aria-describedby={fieldErrors.description ? "guest-description-error" : undefined}
								className={`mt-1 min-h-11 w-full rounded-[14px] border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/20 ${fieldErrors.description ? "border-destructive focus:border-destructive" : "border-border focus:border-primary/50"}`}
							/>
							{fieldErrors.description ? <p id="guest-description-error" role="alert" className="mt-1 text-[11px] font-semibold text-destructive">{fieldErrors.description}</p> : null}
						</div>

						<label className="flex items-start gap-2 rounded-xl bg-muted/40 p-2 text-[10px] leading-relaxed text-muted-foreground">
							<input type="checkbox" checked={guestMarketingConsent} onChange={(e) => setGuestMarketingConsent(e.target.checked)} className="mt-0.5" />
							Saya bersedia menerima informasi promo dan layanan Djiwa Tentram.
						</label>

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
