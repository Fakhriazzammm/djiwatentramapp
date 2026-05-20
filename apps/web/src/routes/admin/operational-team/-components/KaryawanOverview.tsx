import type { Id } from "@/types/backend-compat";
import {
	Users,
	User,
	UserPlus,
	Search,
	Pencil,
	Trash2,
	X,
	CheckCircle2,
	XCircle,
	Camera,
	ShieldCheck,
	Bell,
	ArrowUpRight,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
	useHybridStaffRoles,
	useHybridStaffUsers,
} from "@/hooks/use-hybrid-pos-data";
import {
	useHybridBindUserProfile,
	useHybridCreateUser,
	useHybridUpdateUser,
	useHybridDeleteUser,
} from "@/hooks/use-hybrid-write-actions";
import { authClient } from "@/lib/auth-client";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOME_PIN_REGEX = /^\d{6}$/;

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
	return EMAIL_REGEX.test(normalizeEmail(email));
}

function isValidHomePin(pin: string) {
	return HOME_PIN_REGEX.test(pin);
}

function getInitials(name: string) {
	return (name || "?").charAt(0).toUpperCase();
}

function fmtDate(val?: string | number) {
	if (!val) return "—";
	const d = new Date(val);
	if (isNaN(d.getTime())) return String(val);
	const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
	return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function KaryawanOverview() {
	const navigate = useNavigate();
	const [refreshTrigger, setRefreshTrigger] = useState(0);
	const users = useHybridStaffUsers(refreshTrigger);
	const roles = useHybridStaffRoles(refreshTrigger);
	const _createUser = useHybridCreateUser();
	const _updateUser = useHybridUpdateUser();
	const deleteUser = useHybridDeleteUser();
	const bindProfile = useHybridBindUserProfile();

	const [searchQuery, setSearchQuery] = useState("");
	const [showAddModal, setShowAddModal] = useState(false);
	const [savingUser, setSavingUser] = useState(false);

	// Create / Edit form state
	const [formUser, setFormUser] = useState<{
		_id?: Id<"users">;
		name: string;
		username: string;
		password: string;
		roleId: string;
		homePin: string;
		slug: string;
		isActive: boolean;
		receiveReportEmails: boolean;
	}>({
		name: "",
		username: "",
		password: "",
		roleId: "",
		homePin: "",
		slug: "",
		isActive: true,
		receiveReportEmails: false,
	});

	const [confirmDelete, setConfirmDelete] = useState<{
		isOpen: boolean;
		title: string;
		message: string;
		onConfirm: () => void;
		variant?: "danger" | "warning" | "info";
	}>({
		isOpen: false,
		title: "",
		message: "",
		onConfirm: () => {},
	});

	const isEditing = !!formUser._id;

	// Compute summary stats
	const stats = useMemo(() => {
		if (!Array.isArray(users)) return { total: 0, active: 0, inactive: 0, noRole: 0 };
		const total = users.length;
		const active = users.filter((u: any) => u.isActive !== false).length;
		const inactive = users.filter((u: any) => u.isActive === false).length;
		const noRole = users.filter((u: any) => !u.roleId).length;
		return { total, active, inactive, noRole };
	}, [users]);

	// Filter users by search
	const filteredUsers = useMemo(() => {
		if (!Array.isArray(users)) return [];
		const q = searchQuery.toLowerCase().trim();
		if (!q) return users;
		return users.filter((u: any) =>
			u.name?.toLowerCase().includes(q) ||
			u.username?.toLowerCase().includes(q) ||
			u.roleName?.toLowerCase().includes(q)
		);
	}, [users, searchQuery]);

	const openCreateModal = () => {
		setFormUser({
			name: "",
			username: "",
			password: "",
			roleId: "",
			homePin: "",
			slug: "",
			isActive: true,
			receiveReportEmails: false,
		});
		setShowAddModal(true);
	};

	const openEditModal = (user: any) => {
		setFormUser({
			_id: user._id,
			name: user.name || "",
			username: user.username || "",
			password: "",
			roleId: user.roleId || "",
			homePin: "",
			slug: user.slug || "",
			isActive: user.isActive ?? true,
			receiveReportEmails: user.receiveReportEmails ?? false,
		});
		setShowAddModal(true);
	};

	const handleSave = async () => {
		const normalizedEmail = normalizeEmail(formUser.username);
		const normalizedHomePin = formUser.homePin.trim();

		if (!formUser.name.trim()) {
			toast.error("Nama pengguna wajib diisi");
			return;
		}
		if (!normalizedEmail) {
			toast.error("Username/Email wajib diisi");
			return;
		}
		if (!isValidEmail(normalizedEmail)) {
			toast.error("Username harus berupa email yang valid");
			return;
		}
		if (!formUser.roleId) {
			toast.error("Role wajib dipilih");
			return;
		}
		if (!isEditing && !formUser.password) {
			toast.error("Password wajib diisi untuk user baru");
			return;
		}
		if (normalizedHomePin && !isValidHomePin(normalizedHomePin)) {
			toast.error("PIN akses harus 6 digit angka");
			return;
		}

		setSavingUser(true);
		try {
			if (isEditing) {
				await _updateUser({
					id: formUser._id!,
					name: formUser.name.trim(),
					username: normalizedEmail,
					roleId: formUser.roleId as Id<"roles">,
					isActive: formUser.isActive,
					receiveReportEmails: formUser.receiveReportEmails,
					homePin: normalizedHomePin || undefined,
					slug: formUser.slug,
				});
				toast.success("Pengguna berhasil diperbarui");
			} else {
				const createdUserId = await _createUser({
					username: normalizedEmail,
					password: formUser.password,
					name: formUser.name,
					roleId: formUser.roleId as Id<"roles">,
					homePin: normalizedHomePin || undefined,
					slug: formUser.slug || undefined,
				});

				// Best effort sync to external auth
				try {
					const result = await authClient.signUp.email({
						email: normalizedEmail,
						password: formUser.password,
						name: formUser.name,
					});
					const authUserId = result?.data?.user?.id;
					if (authUserId && authUserId !== "test-id") {
						await bindProfile({
							authUserId,
							name: formUser.name,
							email: normalizedEmail,
							roleId: formUser.roleId as Id<"roles">,
						});
					}
				} catch {
					// non-blocking
				}

				if (createdUserId) {
					toast.success("User berhasil dibuat!");
				}
			}

			setShowAddModal(false);
			setRefreshTrigger((n) => n + 1);
		} catch (error) {
			console.error(error);
			toast.error((error as Error).message || "Gagal menyimpan pengguna");
		} finally {
			setSavingUser(false);
		}
	};

	const handleDelete = (id: Id<"users">) => {
		setConfirmDelete({
			isOpen: true,
			title: "Hapus Pengguna?",
			message: "Akun ini tidak akan bisa login lagi ke sistem.",
			variant: "danger",
			onConfirm: async () => {
				setSavingUser(true);
				try {
					await deleteUser({ id });
					toast.success("User dihapus");
					setRefreshTrigger((n) => n + 1);
				} catch {
					toast.error("Gagal menghapus user");
				} finally {
					setSavingUser(false);
					setConfirmDelete((p) => ({ ...p, isOpen: false }));
				}
			},
		});
	};

	const isLoading = users === undefined;
	const isEmpty = Array.isArray(users) && users.length === 0;

	return (
		<div className="mx-auto w-full max-w-7xl space-y-4 md:space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
						<Users className="h-4.5 w-4.5" />
					</div>
					<div>
						<h1 className="text-base font-black tracking-tight uppercase">Karyawan</h1>
						<p className="text-[11px] font-medium text-muted-foreground">
							{isLoading
								? "Memuat..."
								: `${stats.total} staf terdaftar · ${stats.active} aktif`}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						className="h-8 rounded-lg text-[10px] font-bold px-2.5 gap-1.5"
						onClick={() => navigate({ to: "/admin/operational-team/karyawan/data" as any })}
					>
						<ArrowUpRight className="h-3.5 w-3.5" />
						<span>Data Karyawan</span>
					</Button>
					<Button
						size="sm"
						className="h-8 rounded-lg text-[10px] font-bold px-2.5 gap-1.5"
						onClick={openCreateModal}
					>
						<UserPlus className="h-3.5 w-3.5" />
						<span>Tambah Staf</span>
					</Button>
				</div>
			</div>

			{/* Summary Stats */}
			<div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
				{[
					{ label: "Total Staf", value: stats.total, color: "bg-primary/10 text-primary" },
					{ label: "Aktif", value: stats.active, color: "bg-emerald-100 text-emerald-700" },
					{ label: "Nonaktif", value: stats.inactive, color: "bg-red-100 text-red-700" },
					{ label: "Tanpa Role", value: stats.noRole, color: "bg-amber-100 text-amber-700" },
				].map((stat) => (
					<div
						key={stat.label}
						className="flex items-center gap-2.5 rounded-xl border bg-card p-3 md:p-4"
					>
						<div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black ${stat.color}`}>
							{stat.value}
						</div>
						<div className="min-w-0">
							<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
							<p className="text-lg font-black text-foreground">{stat.value}</p>
						</div>
					</div>
				))}
			</div>

			{/* Search */}
			<div className="relative max-w-xs">
				<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
				<Input
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder="Cari staf..."
					className="h-8 rounded-xl pl-8 text-[11px] font-medium"
				/>
			</div>

			{/* User Cards */}
			{isLoading ? (
				<div className="space-y-2">
					{[1,2,3,4,5].map((i) => (
						<div key={i} className="h-16 w-full rounded-xl bg-muted animate-pulse" />
					))}
				</div>
			) : isEmpty ? (
				<div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border bg-card">
					<User className="mb-3 h-10 w-10 text-muted-foreground/30" />
					<p className="text-sm font-bold text-muted-foreground">Belum ada staf terdaftar</p>
					<p className="text-[11px] text-muted-foreground/60 mt-1">Tambahkan staf baru untuk memulai.</p>
				</div>
			) : filteredUsers.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border bg-card">
					<Search className="mb-3 h-10 w-10 text-muted-foreground/30" />
					<p className="text-sm font-bold text-muted-foreground">Tidak ada hasil</p>
					<p className="text-[11px] text-muted-foreground/60 mt-1">Coba ubah kata kunci pencarian.</p>
				</div>
			) : (
				<div className="space-y-1.5">
					{filteredUsers.map((user: any) => {
						const isActive = user.isActive !== false;
						const hasFace = !!user.faceDescriptor;
						return (
							<div
								key={user._id}
								className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 hover:bg-muted/20 transition-colors group"
							>
								{/* Avatar */}
								<div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-black ${
									isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
								}`}>
									{getInitials(user.name)}
								</div>

								{/* Name & Username */}
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2 flex-wrap">
										<p className="font-bold text-xs truncate max-w-[180px]">{user.name}</p>
										{user.roleName && (
											<span className="inline-flex rounded-md bg-primary/5 px-1.5 py-0.5 text-[9px] font-bold text-primary uppercase tracking-wider">
												{user.roleName}
											</span>
										)}
										{isActive ? (
											<CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
										) : (
											<XCircle className="h-3 w-3 text-muted-foreground/40 shrink-0" />
										)}
									</div>
									<p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
										@{user.username || user.slug}
										{user.homePin && <span className="ml-2">· PIN Aktif</span>}
										{hasFace && <span className="ml-2">· Wajah Terdaftar</span>}
										{user.receiveReportEmails && <span className="ml-2">· Laporan Email</span>}
									</p>
								</div>

								{/* Action buttons */}
								<div className="flex items-center gap-0.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
									<button
										title="Edit Staf"
										className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"
										onClick={() => openEditModal(user)}
									>
										<Pencil className="h-3.5 w-3.5" />
									</button>
									<button
										title="Hapus Staf"
										className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
										onClick={() => handleDelete(user._id)}
										disabled={savingUser}
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</div>
							</div>
						);
					})}
				</div>
			)}

			{/* Add / Edit Modal */}
			<Dialog open={showAddModal} onOpenChange={setShowAddModal}>
				<DialogContent className="sm:max-w-lg">
					<DialogTitle className="text-sm font-black uppercase tracking-wider">
						{isEditing ? "Edit Staf" : "Tambah Staf Baru"}
					</DialogTitle>
					<DialogDescription className="text-[11px]">
						{isEditing
							? "Ubah data akses staf yang sudah terdaftar."
							: "Buat akun akses baru untuk staf."}
					</DialogDescription>
					<div className="space-y-3.5 pt-2">
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<div className="space-y-1">
								<label className="text-[10px] font-bold uppercase text-muted-foreground">Nama Lengkap</label>
								<Input
									className="h-9 text-xs rounded-xl"
									value={formUser.name}
									onChange={(e) => setFormUser((p) => ({ ...p, name: e.target.value }))}
									placeholder="Budi Santoso"
								/>
							</div>
							<div className="space-y-1">
								<label className="text-[10px] font-bold uppercase text-muted-foreground">Email / Username</label>
								<Input
									className="h-9 text-xs rounded-xl"
									value={formUser.username}
									onChange={(e) => setFormUser((p) => ({ ...p, username: normalizeEmail(e.target.value) }))}
									placeholder="budi@example.com"
								/>
							</div>
							{!isEditing && (
								<div className="space-y-1">
									<label className="text-[10px] font-bold uppercase text-muted-foreground">Password</label>
									<Input
										className="h-9 text-xs rounded-xl"
										type="password"
										value={formUser.password}
										onChange={(e) => setFormUser((p) => ({ ...p, password: e.target.value }))}
										placeholder="••••••••"
									/>
								</div>
							)}
							<div className="space-y-1">
								<label className="text-[10px] font-bold uppercase text-muted-foreground">Role</label>
								<select
									className="w-full h-9 rounded-xl border border-input bg-background px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
									value={formUser.roleId}
									onChange={(e) => setFormUser((p) => ({ ...p, roleId: e.target.value }))}
								>
									<option value="">Pilih Role</option>
									{roles?.map((r: any) => (
										<option key={r._id} value={r._id}>{r.name}</option>
									))}
								</select>
							</div>
							<div className="space-y-1">
								<label className="text-[10px] font-bold uppercase text-muted-foreground">PIN Akses (6 digit)</label>
								<Input
									className="h-9 text-xs rounded-xl"
									type="password"
									maxLength={6}
									value={formUser.homePin}
									onChange={(e) => setFormUser((p) => ({ ...p, homePin: e.target.value.replace(/\D/g, "") }))}
									placeholder="123456"
								/>
							</div>
							<div className="space-y-1">
								<label className="text-[10px] font-bold uppercase text-muted-foreground">Slug URL</label>
								<Input
									className="h-9 text-xs rounded-xl"
									value={formUser.slug}
									onChange={(e) => setFormUser((p) => ({ ...p, slug: e.target.value.toLowerCase() }))}
									placeholder="budi-barista"
								/>
							</div>
						</div>

						{isEditing && (
							<div className="flex flex-wrap gap-4 pt-1">
								<label className="flex items-center gap-2 cursor-pointer">
									<input
										type="checkbox"
										checked={formUser.isActive}
										onChange={() => setFormUser((p) => ({ ...p, isActive: !p.isActive }))}
										className="h-4 w-4 rounded"
									/>
									<span className="text-[11px] font-bold">Akun Aktif</span>
								</label>
								<label className="flex items-center gap-2 cursor-pointer">
									<input
										type="checkbox"
										checked={formUser.receiveReportEmails}
										onChange={() => setFormUser((p) => ({ ...p, receiveReportEmails: !p.receiveReportEmails }))}
										className="h-4 w-4 rounded"
									/>
									<span className="text-[11px] font-bold">Terima Laporan Email</span>
								</label>
							</div>
						)}

						<div className="flex justify-end gap-2 pt-2 border-t">
							<Button
								variant="outline"
								size="sm"
								className="h-8 rounded-lg text-[10px] font-bold"
								onClick={() => setShowAddModal(false)}
							>
								Batal
							</Button>
							<Button
								size="sm"
								className="h-8 rounded-lg text-[10px] font-bold"
								onClick={handleSave}
								disabled={savingUser}
								loading={savingUser}
							>
								{isEditing ? "Simpan Perubahan" : "Simpan Pengguna"}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>

			{/* Confirm Delete */}
			<ConfirmationModal
				isOpen={confirmDelete.isOpen}
				onClose={() => setConfirmDelete((p) => ({ ...p, isOpen: false }))}
				onConfirm={confirmDelete.onConfirm}
				title={confirmDelete.title}
				message={confirmDelete.message}
				variant={confirmDelete.variant}
			/>
		</div>
	);
}
