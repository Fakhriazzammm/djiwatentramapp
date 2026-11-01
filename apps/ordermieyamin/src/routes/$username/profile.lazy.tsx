import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LogIn, LogOut, Mail, Star, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { invokeEdgeFunction } from "@/lib/api-helper";

import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { currency } from "@/components/customer/types";
import { CustomerPageSkeleton } from "@/components/customer/customer-states";

export const Route = createLazyFileRoute("/$username/profile")({
	component: ProfilePage,
});

function ProfilePage() {
	const { username } = Route.useParams();
	const navigate = useNavigate();
	const { customer, logout, isLoading: authLoading, refreshCustomer } = useCustomerAuth();

	const [isEditing, setIsEditing] = useState(false);
	const [editName, setEditName] = useState("");
	const [editPhone, setEditPhone] = useState("");
	const [editNickname, setEditNickname] = useState("");
	const [editBirthDate, setEditBirthDate] = useState("");
	const [editGender, setEditGender] = useState("");
	const [editAddress, setEditAddress] = useState("");
	const [editCity, setEditCity] = useState("");
	const [editProvince, setEditProvince] = useState("");
	const [editPostalCode, setEditPostalCode] = useState("");
	const [editMarketingConsent, setEditMarketingConsent] = useState(false);
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
					<p className="mt-1 text-xs leading-relaxed text-muted-foreground">Masuk atau daftar untuk melihat poin, riwayat, dan mengelola profilmu.</p>
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
		if (!customer) return;
		setSaving(true);
		try {
			// Update via edge function customer-sync (service_role + email ownership guard)
			await invokeEdgeFunction("customer-sync", {
				action: "updateProfile",
				sourceId: customer.sourceId,
				email: customer.email ?? undefined,
				name: editName.trim(),
				phone: editPhone.trim() || undefined,
				nickname: editNickname.trim() || undefined,
				birthDate: editBirthDate || undefined,
				gender: editGender || undefined,
				address: editAddress.trim() || undefined,
				city: editCity.trim() || undefined,
				province: editProvince.trim() || undefined,
				postalCode: editPostalCode.trim() || undefined,
				marketingConsent: editMarketingConsent,
			});
			await refreshCustomer();
			setSaving(false);
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
			setIsEditing(false);
			toast.success("Profil berhasil diperbarui");
		} catch (err) {
			setSaving(false);
			toast.error((err as Error).message || "Gagal menyimpan profil");
		}
	};

	const startEditing = () => {
		setEditName(customer.name || "");
		setEditPhone(customer.phone || "");
		setEditNickname(customer.nickname || "");
		setEditBirthDate(customer.birthDate || "");
		setEditGender(customer.gender || "");
		setEditAddress(customer.address || "");
		setEditCity(customer.city || "");
		setEditProvince(customer.province || "");
		setEditPostalCode(customer.postalCode || "");
		setEditMarketingConsent(customer.marketingConsent);
		setIsEditing(true);
	};

	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto min-h-app max-w-md bg-background">
			{/* Header */}
			<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
						aria-label="Kembali ke halaman member"
						onClick={() => navigate({ to: "/$username", params: { username } })}
					>
						<ArrowLeft className="h-3.5 w-3.5" />
					</button>
					<h1 className="font-display text-base font-black tracking-tight">Profil Saya</h1>
				</div>
			</header>

			<main className="px-3 py-4">
				{!customer.email || !customer.phone ? <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-black text-amber-900">Profile belum lengkap untuk QRIS</p><p className="mt-1 text-[10px] leading-relaxed text-amber-800">Lengkapi email dan nomor WhatsApp agar invoice Mayar dapat dibuat.</p></div> : null}
				{/* Avatar & Username */}
				<div className="flex flex-col items-center py-4">
					{customer.photoUrl ? (
						<img
							src={customer.photoUrl}
							alt="Avatar"
							className="h-16 w-16 rounded-full object-cover ring-4 ring-border"
						/>
					) : (
						<div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-black text-primary ring-4 ring-border">
							{initials}
						</div>
					)}
					<p className="mt-2 text-lg font-black">{customer.name}</p>
					<p className="text-[11px] text-muted-foreground">@{username}</p>
				</div>

				{/* Info Card */}
				<div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
					<div className="space-y-2.5">
						{!isEditing ? (
							<>
						<InfoRow
							icon={<Mail className="h-3.5 w-3.5 text-muted-foreground" />}
							label="Email"
							value={customer.email || "—"}
						/>
						<InfoRow
							icon={<User className="h-3.5 w-3.5 text-muted-foreground" />}
							label="Nama"
							value={customer.name || "—"}
						/>
						<InfoRow
							icon={<User className="h-3.5 w-3.5 text-muted-foreground" />}
							label="Nomor WhatsApp"
							value={customer.phone || "Belum diisi"}
						/>
						<div className="my-1 border-t border-border/70" />
						<InfoRow icon={<User className="h-3.5 w-3.5 text-muted-foreground" />} label="Nama panggilan" value={customer.nickname || "Belum diisi"} />
						<InfoRow icon={<User className="h-3.5 w-3.5 text-muted-foreground" />} label="Tanggal lahir" value={customer.birthDate || "Belum diisi"} />
						<InfoRow icon={<User className="h-3.5 w-3.5 text-muted-foreground" />} label="Jenis kelamin" value={customer.gender === "female" ? "Perempuan" : customer.gender === "male" ? "Laki-laki" : customer.gender === "other" ? "Lainnya" : "Belum diisi"} />
						<InfoRow icon={<User className="h-3.5 w-3.5 text-muted-foreground" />} label="Alamat" value={customer.address || "Belum diisi"} />
						<InfoRow icon={<User className="h-3.5 w-3.5 text-muted-foreground" />} label="Kota/Kabupaten" value={customer.city || "Belum diisi"} />
						<InfoRow icon={<User className="h-3.5 w-3.5 text-muted-foreground" />} label="Provinsi" value={customer.province || "Belum diisi"} />
						<InfoRow icon={<User className="h-3.5 w-3.5 text-muted-foreground" />} label="Kode pos" value={customer.postalCode || "Belum diisi"} />
						<InfoRow icon={<Star className="h-3.5 w-3.5 text-muted-foreground" />} label="Informasi promo" value={customer.marketingConsent ? "Diaktifkan" : "Tidak diaktifkan"} />
							</>
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
								<div className="grid grid-cols-2 gap-2">
									<div><p className="mb-1 text-[10px] font-semibold text-muted-foreground">Nama panggilan</p><input type="text" value={editNickname} onChange={(e) => setEditNickname(e.target.value)} placeholder="Opsional" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs outline-none" /></div>
									<div><p className="mb-1 text-[10px] font-semibold text-muted-foreground">Tanggal lahir</p><input type="date" value={editBirthDate} onChange={(e) => setEditBirthDate(e.target.value)} className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs outline-none" /></div>
								</div>
								<div><p className="mb-1 text-[10px] font-semibold text-muted-foreground">Jenis kelamin</p><select value={editGender} onChange={(e) => setEditGender(e.target.value)} className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs outline-none"><option value="">Tidak ingin mengisi</option><option value="female">Perempuan</option><option value="male">Laki-laki</option><option value="other">Lainnya</option></select></div>
								<div><p className="mb-1 text-[10px] font-semibold text-muted-foreground">Alamat (opsional)</p><textarea value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Untuk kebutuhan delivery" className="min-h-20 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs outline-none" /></div>
								<div className="grid grid-cols-2 gap-2"><input type="text" value={editCity} onChange={(e) => setEditCity(e.target.value)} placeholder="Kota/Kabupaten" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs outline-none" /><input type="text" value={editProvince} onChange={(e) => setEditProvince(e.target.value)} placeholder="Provinsi" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs outline-none" /></div>
								<div><input type="text" value={editPostalCode} onChange={(e) => setEditPostalCode(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Kode pos" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs outline-none" /></div>
								<label className="flex items-start gap-2 rounded-xl bg-muted/40 p-2 text-[10px] leading-relaxed"><input type="checkbox" checked={editMarketingConsent} onChange={(e) => setEditMarketingConsent(e.target.checked)} className="mt-0.5" />Saya bersedia menerima informasi promo dan layanan Djiwa Tentram.</label>
								<div className="flex gap-2 pt-1">
									<Button
										variant="outline"
										size="default"
										className="flex-1 text-xs"
										onClick={() => setIsEditing(false)}
									>
										Batal
									</Button>
									<Button
										className="flex-1 text-xs"
										size="default"
										disabled={!editName.trim() || saving}
										loading={saving}
										onClick={handleSave}
									>
										{saved ? "Tersimpan!" : "Simpan"}
									</Button>
								</div>
							</div>
						) : (
							<button
								type="button"
								className="mt-1 min-h-11 w-full rounded-[14px] bg-primary/10 py-2 text-xs font-bold text-primary transition-all hover:bg-primary/20"
								onClick={startEditing}
							>
								Edit profil
							</button>
						)}
					</div>
				</div>

				{/* Stats */}
				<div className="mt-2.5 grid grid-cols-3 gap-1.5">
					<ProfileStat
						icon={<Star className="h-4 w-4 text-amber-500" />}
						label="Yumi Poin"
						value={String(customer.totalPoints ?? 0)}
					/>
					<ProfileStat
						icon={<User className="h-4 w-4 text-blue-500" />}
						label="Pesanan"
						value={String(customer.totalOrders ?? 0)}
					/>
					<ProfileStat
						icon={<Star className="h-4 w-4 text-emerald-500" />}
						label="Total"
						value={currency(customer.totalSpent ?? 0)}
					/>
				</div>

				{/* Logout */}
				<div className="mt-4">
					<button
						type="button"
						className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs font-bold text-destructive transition-all hover:bg-destructive/10"
						onClick={() => {
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
		<div className="flex items-center gap-2.5">
			<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
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
		<div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm">
			{icon}
			<div>
				<p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
				<p className="text-xs font-black text-foreground">{value}</p>
			</div>
		</div>
	);
}
