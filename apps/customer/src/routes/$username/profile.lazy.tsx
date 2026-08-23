import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LogIn, LogOut, Mail, Star, User, Wallet } from "lucide-react";
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
		if (!editName.trim()) return;
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
						{isEditing ? (
							<div className="pt-1.5 space-y-2">
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
				<div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
					<ProfileStat
						icon={<Wallet className="h-4 w-4 text-emerald-500" />}
						label="Djiwa Pay"
						value={currency(customer.walletBalance ?? 0)}
					/>
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
						label="Total Dipakai"
						value={currency(customer.walletTotalDebited ?? 0)}
					/>
				</div>

				<div className="mt-3 grid grid-cols-2 gap-2">
					<div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
						<p className="text-[10px] font-semibold text-emerald-700">Total saldo masuk / top up</p>
						<p className="mt-1 text-sm font-black text-emerald-900">{currency(customer.walletTotalCredited ?? 0)}</p>
					</div>
					<div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
						<p className="text-[10px] font-semibold text-amber-700">Saldo tertahan</p>
						<p className="mt-1 text-sm font-black text-amber-900">{currency(customer.walletHeldBalance ?? 0)}</p>
					</div>
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
