import { CustomerHeader } from "@/components/customer/customer-shell";
import { ImageWithPlaceholder } from "@/components/customer/image-with-placeholder";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Check, Eye, EyeOff, LogIn, LogOut, Mail, MapPin, Phone, ShieldCheck, Star, User, Wallet } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { invokeEdgeFunction } from "@/lib/api-helper";

import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useOrderContext } from "@/hooks/use-order-context";
import { currency } from "@/components/customer/types";
import { CustomerPageSkeleton } from "@/components/customer/customer-states";
import { useCustomerOrderCount } from "@/hooks/use-customer-data";

export const Route = createLazyFileRoute("/$username/profile")({
	component: ProfilePage,
});

function ProfilePage() {
	const { username } = Route.useParams();
	const navigate = useNavigate();
	const { customer, logout, isLoading: authLoading, refreshCustomer } = useCustomerAuth();
	const { setCart } = useOrderContext();
	const goHome = () => navigate({ to: "/$username", params: { username } });
	const { orderCount } = useCustomerOrderCount();
	const reduceMotion = useReducedMotion();

	const [isEditing, setIsEditing] = useState(false);
	const [editName, setEditName] = useState("");
	const [editPhone, setEditPhone] = useState("");
	const [editUsername, setEditUsername] = useState("");
	const [editNickname, setEditNickname] = useState("");
	const [editBirthDate, setEditBirthDate] = useState("");
	const [editGender, setEditGender] = useState("");
	const [editAddress, setEditAddress] = useState("");
	const [editCity, setEditCity] = useState("");
	const [editProvince, setEditProvince] = useState("");
	const [editPostalCode, setEditPostalCode] = useState("");
	const [editMarketingConsent, setEditMarketingConsent] = useState(false);
	const [editSharePurchaseActivity, setEditSharePurchaseActivity] = useState(false);
	const [editPurchaseActivityNameMode, setEditPurchaseActivityNameMode] = useState<"first_name" | "full_name">("first_name");
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	if (authLoading) {
		return <CustomerPageSkeleton label="Memuat profil" />;
	}

	if (!customer) {
		return (
			<div className="app-page min-h-app">
				<div className="app-shell mx-auto flex min-h-app max-w-md items-center justify-center bg-background px-4">
				<div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
						<User className="h-5 w-5" />
					</div>
					<h1 className="mt-3 font-display text-lg font-black">Profil member</h1>
					<p className="mt-1 text-xs leading-relaxed text-muted-foreground">Masuk atau daftar untuk melihat Djiwa Pay, riwayat, dan mengelola profilmu.</p>
					<div className="mt-4 space-y-2">
						<button type="button" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-primary px-3 py-2.5 text-xs font-black text-white" onClick={() => navigate({ to: "/" })}>
							<LogIn className="h-3.5 w-3.5" /> Masuk / Daftar
						</button>
						<button type="button" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-border px-3 py-2.5 text-xs font-bold text-muted-foreground" onClick={() => navigate({ to: "/$username", params: { username } })}>
							<ArrowLeft className="h-3.5 w-3.5" /> Kembali ke beranda
						</button>
					</div>
				</div>
				</div>
			</div>
		);
	}

	const initials = (customer.name || "U")
		.split(" ")
		.map((s) => s[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	const handleSave = async () => {
		if (!editName.trim()) {
			toast.error("Nama lengkap wajib diisi");
			return;
		}
		if (editPhone.trim() && editPhone.replace(/[^\d]/g, "").length < 10) {
			toast.error("Nomor WhatsApp minimal 10 digit");
			return;
		}
		if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/.test(editUsername.trim().toLowerCase())) {
			toast.error("Username 3–32 karakter: huruf kecil, angka, dan tanda hubung");
			return;
		}
		if (!customer) return;
		setSaving(true);
		try {
			// Update via edge function customer-sync (service_role + email ownership guard)
			await invokeEdgeFunction("customer-sync", {
				action: "updateProfile",
				sourceId: customer.sourceId,
				email: customer.email ?? undefined,
				name: editName.trim(),
				username: editUsername.trim().toLowerCase(),
				phone: editPhone.trim() || undefined,
				nickname: editNickname.trim() || undefined,
				birthDate: editBirthDate || undefined,
				gender: editGender || undefined,
				address: editAddress.trim() || undefined,
				city: editCity.trim() || undefined,
				province: editProvince.trim() || undefined,
				postalCode: editPostalCode.trim() || undefined,
				marketingConsent: editMarketingConsent,
				sharePurchaseActivity: editSharePurchaseActivity,
				purchaseActivityNameMode: editPurchaseActivityNameMode,
			});
			await refreshCustomer();
			setSaving(false);
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
			setIsEditing(false);
			if (editUsername.trim().toLowerCase() !== username) {
				await navigate({ to: "/$username/profile", params: { username: editUsername.trim().toLowerCase() } });
			}
			toast.success("Profil berhasil diperbarui");
		} catch (err) {
			setSaving(false);
			toast.error((err as Error).message || "Gagal menyimpan profil");
		}
	};

	const startEditing = () => {
		setEditName(customer.name || "");
		setEditUsername(customer.username || "");
		setEditPhone(customer.phone || "");
		setEditNickname(customer.nickname || "");
		setEditBirthDate(customer.birthDate || "");
		setEditGender(customer.gender || "");
		setEditAddress(customer.address || "");
		setEditCity(customer.city || "");
		setEditProvince(customer.province || "");
		setEditPostalCode(customer.postalCode || "");
		setEditMarketingConsent(customer.marketingConsent);
		setEditSharePurchaseActivity(customer.sharePurchaseActivity);
		setEditPurchaseActivityNameMode(customer.purchaseActivityNameMode);
		setIsEditing(true);
	};

	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto min-h-app max-w-md bg-background">
			{/* Header */}
			<CustomerHeader title="Profil Saya" subtitle="Djiwa Tentram" onBack={goHome} leading={<ArrowLeft className="h-4 w-4" />} />

			<main className="space-y-3 px-3 pb-28 pt-4 sm:px-4">
				{!customer.email || !customer.phone ? <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-black text-amber-900">Profile belum lengkap untuk QRIS</p><p className="mt-1 text-[10px] leading-relaxed text-amber-800">Lengkapi email dan nomor WhatsApp agar invoice Mayar dapat dibuat.</p></div> : null}
				{/* Member Card */}
				<section className="relative isolate overflow-hidden rounded-[28px] bg-[#111d4a] text-white shadow-[0_18px_44px_rgba(15,23,42,0.18)]" aria-label="Kartu member Djiwa Tentram">
					<ImageWithPlaceholder src="/assets/djiwa-member-card-cafe.webp" alt="" aria-hidden="true" containerClassName="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-[0.96]" className="object-cover object-center" loading="eager" decoding="async" />
					<div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(110deg,rgba(8,17,53,0.72)_0%,rgba(12,26,70,0.42)_46%,rgba(12,26,70,0.08)_100%)]" />
					<motion.div aria-hidden="true" className="pointer-events-none absolute -inset-y-16 left-[-32%] z-[3] w-1/4 rotate-[18deg] bg-gradient-to-r from-transparent via-[#f4d27a]/35 to-transparent blur-lg" animate={reduceMotion ? undefined : { x: [0, 420, 840] }} transition={reduceMotion ? undefined : { duration: 4.8, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }} />
					<div className="relative z-[2] flex min-h-[238px] flex-col justify-between p-5 sm:min-h-[260px] sm:p-6">
						<div className="flex items-start justify-between gap-3">
							<div className="flex items-center gap-2.5">
								<div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#f4d27a]/40 bg-[#f4d27a]/10 text-[#f4d27a] shadow-sm"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></div>
								<div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#f4d27a]">Djiwa Tentram</p><p className="mt-0.5 text-xs font-semibold text-blue-100/80">Member Card</p></div>
							</div>
							<span className="rounded-full border border-[#f4d27a]/45 bg-[#0b1740]/55 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#f4d27a]">Member</span>
						</div>
						<div className="max-w-[78%]">
							<motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} className="break-words font-display text-[26px] font-black leading-[1.05] tracking-[-0.04em] text-white sm:text-[30px]">{customer.name || customer.nickname || "Member"}</motion.p>
							<p className="mt-2 break-all text-sm font-semibold text-blue-100/90">@{customer.username}</p>
						</div>
						<div className="flex items-end justify-between gap-3 border-t border-white/15 pt-3"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-100/70">Member ID</p><p className="mt-1 break-all font-mono text-xs font-bold tracking-[0.14em] text-[#f4d27a]">{String(customer.sourceId || "-").toUpperCase()}</p></div><div className="shrink-0 text-right"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#f4d27a]">EXP MEMBERSHIP</p><p className="mt-1 text-[9px] font-semibold text-blue-100/75">Berlaku s/d Des 2026</p></div></div>
					</div>
				</section>

				{/* Profile details */}
				<div className="overflow-hidden rounded-2xl bg-card">
					<div className="flex items-center justify-between border-b border-border/60 px-4 py-4 sm:px-5">
						<div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Akun & profil</p><h2 className="mt-1 text-base font-black tracking-[-0.02em]">Informasi kamu</h2></div>
						{!isEditing ? <button type="button" onClick={startEditing} className="inline-flex min-h-11 items-center gap-1.5 rounded-[13px] bg-primary/10 px-3 text-xs font-black text-primary transition-colors hover:bg-primary/15 active:scale-[.97]"><User className="h-3.5 w-3.5" /> Edit</button> : null}
					</div>
					<div className="p-4 sm:p-5">
						{!isEditing ? (
							<div className="divide-y divide-border/60">
								<InfoRow icon={<Mail className="h-4 w-4 text-primary" />} label="Email" value={customer.email || "Belum diisi"} />
								<InfoRow icon={<Phone className="h-4 w-4 text-primary" />} label="Nomor WhatsApp" value={customer.phone || "Belum diisi"} />
								<InfoRow icon={<User className="h-4 w-4 text-primary" />} label="Username" value={`@${customer.username}`} />
								<div className="divide-y divide-border/60">
									<InfoRow icon={<User className="h-4 w-4 text-muted-foreground" />} label="Nama panggilan" value={customer.nickname || "Belum diisi"} />
									<InfoRow icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />} label="Tanggal lahir" value={customer.birthDate || "Belum diisi"} />
									<InfoRow icon={<User className="h-4 w-4 text-muted-foreground" />} label="Jenis kelamin" value={customer.gender === "female" ? "Perempuan" : customer.gender === "male" ? "Laki-laki" : customer.gender === "other" ? "Lainnya" : "Belum diisi"} />
									<InfoRow icon={<MapPin className="h-4 w-4 text-muted-foreground" />} label="Kota / Provinsi" value={[customer.city, customer.province].filter(Boolean).join(" · ") || "Belum diisi"} />
								</div>
								<InfoRow icon={<MapPin className="h-4 w-4 text-muted-foreground" />} label="Alamat" value={customer.address || "Belum diisi"} />
								<InfoRow icon={<MapPin className="h-4 w-4 text-muted-foreground" />} label="Kode pos" value={customer.postalCode || "Belum diisi"} />
								<InfoRow icon={<Star className="h-4 w-4 text-muted-foreground" />} label="Informasi promo" value={customer.marketingConsent ? "Diaktifkan" : "Tidak diaktifkan"} />
								<InfoRow icon={customer.sharePurchaseActivity ? <Eye className="h-4 w-4 text-cyan-600" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />} label="Aktivitas pembelian Komunitas" value={customer.sharePurchaseActivity ? `Diaktifkan · ${customer.purchaseActivityNameMode === "full_name" ? "nama lengkap" : "nama depan"}` : "Tidak diaktifkan"} />
							</div>
						) : null}
						{isEditing ? (
							<div className="pt-1.5 space-y-2">
								<div>
									<p className="mb-1 text-[10px] font-semibold text-muted-foreground">Email akun</p>
									<input type="email" value={customer.email || ""} readOnly disabled className="min-h-11 w-full rounded-[14px] border border-border bg-muted px-3 py-2 text-xs font-medium text-muted-foreground outline-none" />
									<p className="mt-1 text-[10px] text-muted-foreground">Email akun tidak dapat diubah dari sini.</p>
								</div>

								<div>
									<p className="text-[10px] font-semibold text-muted-foreground mb-1">Nama lengkap</p>
									<input
										type="text"
										value={editName}
										onChange={(e) => setEditName(e.target.value)}
										className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs font-medium outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
										placeholder="Nama lengkap"
									/>
								</div>
								<div>
									<p className="text-[10px] font-semibold text-muted-foreground mb-1">Nomor telepon</p>
									<input
										type="tel"
										value={editPhone}
										onChange={(e) => setEditPhone(e.target.value)}
										className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs font-medium outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
										placeholder="+62 xxx"
									/>
								</div>
								<div>
									<p className="mb-1 text-[10px] font-semibold text-muted-foreground">Username</p>
									<div className="flex items-center rounded-[14px] border border-border bg-background px-3 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20"><span className="text-sm font-bold text-muted-foreground">@</span><input type="text" value={editUsername} onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32))} className="min-h-11 w-full bg-transparent px-1.5 py-2 text-xs font-medium outline-none" placeholder="username" maxLength={32} autoCapitalize="none" autoComplete="username" /><span className="sr-only">Username 3 sampai 32 karakter, huruf kecil, angka, dan tanda hubung</span></div>
									<p className="mt-1 text-[10px] text-muted-foreground">Dipakai pada alamat profil kamu.</p>
								</div>
								<div className="grid grid-cols-2 gap-2">
									<div><p className="mb-1 text-[10px] font-semibold text-muted-foreground">Nama panggilan</p><input type="text" value={editNickname} onChange={(e) => setEditNickname(e.target.value)} placeholder="Opsional" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs outline-none" /></div>
									<div><p className="mb-1 text-[10px] font-semibold text-muted-foreground">Tanggal lahir</p><input type="date" value={editBirthDate} onChange={(e) => setEditBirthDate(e.target.value)} className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs outline-none" /></div>
								</div>
								<div><p className="mb-1 text-[10px] font-semibold text-muted-foreground">Jenis kelamin</p><select value={editGender} onChange={(e) => setEditGender(e.target.value)} className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs outline-none"><option value="">Tidak ingin mengisi</option><option value="female">Perempuan</option><option value="male">Laki-laki</option><option value="other">Lainnya</option></select></div>
								<div><p className="mb-1 text-[10px] font-semibold text-muted-foreground">Alamat (opsional)</p><textarea value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Untuk kebutuhan delivery" className="min-h-20 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs outline-none" /></div>
								<div className="grid grid-cols-2 gap-2"><input type="text" value={editCity} onChange={(e) => setEditCity(e.target.value)} placeholder="Kota/Kabupaten" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs outline-none" /><input type="text" value={editProvince} onChange={(e) => setEditProvince(e.target.value)} placeholder="Provinsi" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs outline-none" /></div>
								<div><input type="text" value={editPostalCode} onChange={(e) => setEditPostalCode(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Kode pos" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs outline-none" /></div>
								<label className="flex min-h-11 items-center gap-2 border-b border-border/60 py-2 text-[10px] leading-relaxed"><input type="checkbox" checked={editMarketingConsent} onChange={(e) => setEditMarketingConsent(e.target.checked)} className="mt-0.5" />Saya bersedia menerima informasi promo dan layanan Djiwa Tentram.</label>
								<div className="border-b border-border/60 py-3">
									<label className="flex min-h-11 items-center gap-2 text-[10px] leading-relaxed text-foreground"><input type="checkbox" checked={editSharePurchaseActivity} onChange={(e) => setEditSharePurchaseActivity(e.target.checked)} className="mt-0.5" />Tampilkan aktivitas pembelian saya di Komunitas.</label>
									<p className="mt-1 pl-5 text-[10px] leading-relaxed text-cyan-800">Ini terpisah dari persetujuan informasi promo. Hanya pesanan yang sudah dibayar yang dapat muncul.</p>
									{editSharePurchaseActivity ? <div className="mt-2 flex flex-wrap gap-3 pl-5"><label className="flex min-h-11 items-center gap-1.5 text-[10px] font-bold text-foreground"><input type="radio" name="purchase-activity-name-mode" checked={editPurchaseActivityNameMode === "first_name"} onChange={() => setEditPurchaseActivityNameMode("first_name")} />Nama depan</label><label className="flex min-h-11 items-center gap-1.5 text-[10px] font-bold text-foreground"><input type="radio" name="purchase-activity-name-mode" checked={editPurchaseActivityNameMode === "full_name"} onChange={() => setEditPurchaseActivityNameMode("full_name")} />Nama lengkap</label></div> : null}
									</div>
								<div className="flex gap-2 pt-1">
									<Button
										variant="outline"
										size="default"
										className="min-h-11 flex-1 text-xs"
										onClick={() => setIsEditing(false)}
									>
										Batal
									</Button>
									<Button
										className="min-h-11 flex-1 text-xs"
										size="default"
										disabled={!editName.trim() || saving}
										loading={saving}
										onClick={handleSave}
									>
										{saved ? "Tersimpan!" : "Simpan"}
									</Button>
								</div>
							</div>
						) : null}
					</div>
				</div>
				{/* Stats */}
				<div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-card" aria-label="Ringkasan akun">
					<ProfileStat
						icon={<Wallet className="h-4 w-4 text-emerald-500" />}
						label="Djiwa Pay"
						value={currency(customer.walletBalance ?? 0)}
					/>
					<ProfileStat
						icon={<User className="h-4 w-4 text-blue-500" />}
						label="Pesanan"
						value={String(orderCount)}
					/>
					<ProfileStat
						icon={<Star className="h-4 w-4 text-emerald-500" />}
						label="Total Dipakai"
						value={currency(customer.walletTotalDebited ?? 0)}
					/>
				</div>

				<section aria-labelledby="profile-balance-heading">
					<h2 id="profile-balance-heading" className="mb-2 px-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Saldo</h2>
					<div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-card">
						<div className="flex min-h-11 items-center justify-between gap-3 px-4 py-3">
							<p className="text-xs text-muted-foreground">Total saldo masuk / top up</p>
							<p className="shrink-0 text-xs font-bold text-emerald-700">{currency(customer.walletTotalCredited ?? 0)}</p>
						</div>
						<div className="flex min-h-11 items-center justify-between gap-3 px-4 py-3">
							<p className="text-xs text-muted-foreground">Saldo tertahan</p>
							<p className="shrink-0 text-xs font-bold text-amber-700">{currency(customer.walletHeldBalance ?? 0)}</p>
						</div>
					</div>
				</section>

				{/* Logout */}
				<div className="pt-1">
					<button
						type="button"
						className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-card px-3 py-2.5 text-xs font-bold text-destructive transition-colors hover:bg-destructive/5"
						onClick={() => {
							setCart([]);
							logout();
							navigate({ to: "/$username", params: { username } });
						}}
					>
						<LogOut className="h-3.5 w-3.5" />
						Keluar
					</button>
				</div>
			</main>
			</div>
		</div>
	);
}

function InfoRow({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
}) {
	return (
		<div className="flex min-h-11 items-center gap-2.5 py-3">
			<div className="flex h-8 w-8 items-center justify-center text-muted-foreground">
				{icon}
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
				<p className="break-words text-xs font-bold text-foreground">{value}</p>
			</div>
		</div>
	);
}

function ProfileStat({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
}) {
	return (
		<div className="flex min-h-11 items-center gap-2.5 px-4 py-3">
			{icon}
			<p className="min-w-0 flex-1 text-xs text-muted-foreground">{label}</p>
			<p className="shrink-0 text-xs font-bold text-foreground">{value}</p>
		</div>
	);
}
