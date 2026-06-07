import { createLazyFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Loader2, LogOut, Mail, Save, Star, User } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { currency } from "@/components/customer/types";

export const Route = createLazyFileRoute("/profile")({
	component: ProfilePage,
});

/** Generate a username from email */
function emailToUsername(email: string): string {
	return email
		.split("@")[0]
		.replace(/[^a-zA-Z0-9._-]/g, "")
		.toLowerCase()
		.slice(0, 32);
}

function ProfilePage() {
	const router = useRouter();
	const { customer, login, logout, isLoading: authLoading } = useCustomerAuth();

	const [isEditing, setIsEditing] = useState(false);
	const [editName, setEditName] = useState("");
	const [editPhone, setEditPhone] = useState("");
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	if (authLoading) {
		return (
			<div className="flex min-h-app items-center justify-center bg-background">
				<div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
					<Loader2 className="h-4 w-4 animate-spin text-primary" />
					<span className="text-xs font-medium text-muted-foreground">
						Memuat profil...
					</span>
				</div>
			</div>
		);
	}

	if (!customer) {
		return (
			<div className="flex min-h-app items-center justify-center bg-background px-4">
				<div className="text-center">
					<p className="text-sm text-muted-foreground">Silakan login terlebih dahulu.</p>
				</div>
			</div>
		);
	}

	const username = emailToUsername(customer.email || customer.email || "");
	const initials = (customer.name || "U")
		.split(" ")
		.map((s) => s[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	const handleSave = async () => {
		if (!editName.trim()) return;
		setSaving(true);
		// Simulate save — in real implementation, call an edge function
		await new Promise((r) => setTimeout(r, 600));
		setSaving(false);
		setSaved(true);
		setTimeout(() => setSaved(false), 2000);
		setIsEditing(false);
	};

	const startEditing = () => {
		setEditName(customer.name || "");
		setEditPhone(customer.phone || "");
		setIsEditing(true);
	};

	return (
		<div className="app-page min-h-app bg-background">
			{/* Header */}
			<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground"
						onClick={() => router.history.back()}
					>
						<ArrowLeft className="h-3.5 w-3.5" />
					</button>
					<h1 className="text-sm font-black tracking-tight">Profil Saya</h1>
				</div>
			</header>

			<main className="px-3 py-3">
				{/* Avatar & Username */}
				<div className="flex flex-col items-center py-4">
					{customer.photo_url ? (
						<img
							src={customer.photo_url}
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
				<div className="rounded-xl border border-border bg-card p-3 shadow-sm">
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
										className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
										placeholder="Nama lengkap"
									/>
								</div>
								<div>
									<p className="text-[10px] font-semibold text-muted-foreground mb-1">Nomor telepon</p>
									<input
										type="tel"
										value={editPhone}
										onChange={(e) => setEditPhone(e.target.value)}
										className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
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
								className="mt-1 w-full rounded-xl bg-primary/10 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-all"
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
						label="Poin"
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
						className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs font-bold text-destructive hover:bg-destructive/10 transition-all"
						onClick={() => {
							logout();
							router.history.back();
						}}
					>
						<LogOut className="h-3.5 w-3.5" />
						Keluar
					</button>
				</div>
			</main>
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
				<p className="truncate text-xs font-bold text-foreground">{value}</p>
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
