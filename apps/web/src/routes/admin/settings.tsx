import { createFileRoute } from "@tanstack/react-router";
import { api } from "@tkmpos/backend/convex/_generated/api";
import type { Id } from "@tkmpos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
	Bell,
	CreditCard,
	Layout,
	MapPin,
	Printer,
	Save,
	Settings2,
	Trash2,
	User,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { authClient } from "@/lib/auth-client";
import { bluetoothPrinter } from "@/lib/bluetooth-printer";

const AVAILABLE_PERMISSIONS = [
	{ id: "orders:view", label: "Lihat Pesanan" },
	{ id: "orders:create", label: "Buat Pesanan" },
	{ id: "orders:edit", label: "Edit Pesanan" },
	{ id: "products:manage", label: "Kelola Produk & Kategori" },
	{ id: "inventory:manage", label: "Kelola Stok & Resep" },
	{ id: "finance:view", label: "Lihat Laporan Keuangan" },
	{ id: "settings:manage", label: "Kelola Pengaturan Sistem" },
	{ id: "users:manage", label: "Kelola User & Role" },
];

export const Route = createFileRoute("/admin/settings")({
	component: SettingsPage,
});

function SettingsPage() {
	// Site Settings
	const siteSettings = useQuery(api.site_settings.getSettings);
	const updateSiteSettings = useMutation(api.site_settings.updateSettings);
	const generateUploadUrl = useMutation(api.site_settings.generateUploadUrl);

	// Users & Roles
	// Users & Roles
	// biome-ignore lint/suspicious/noExplicitAny: API types not ready
	const users = useQuery((api as any).users.getUsers);
	// biome-ignore lint/suspicious/noExplicitAny: API types not ready
	const roles = useQuery((api as any).roles.getRoles);
	// biome-ignore lint/suspicious/noExplicitAny: API types not ready
	const _createUser = useMutation((api as any).users.createUser);
	// biome-ignore lint/suspicious/noExplicitAny: API types not ready
	const _updateUser = useMutation((api as any).users.updateUser);
	// biome-ignore lint/suspicious/noExplicitAny: API types not ready
	const deleteUser = useMutation((api as any).users.deleteUser);
	// biome-ignore lint/suspicious/noExplicitAny: API types not ready
	const createRole = useMutation((api as any).roles.createRole);
	// biome-ignore lint/suspicious/noExplicitAny: API types not ready
	const deleteRole = useMutation((api as any).roles.deleteRole);

	const [settings, setSettings] = useState({
		storeName: "TKM Coffee",
		storeAddress: "",
		storePhone: "",
		receiptFooter: "Terima kasih!",
		autoPrint: false,
		taxRate: 10,
		serviceCharge: 5,
		currency: "IDR",
		timezone: "UTC+7 (Jakarta)",
		lowStockAlert: 10,
	});

	const [isConnected, setIsConnected] = useState(false);
	const [printerName, setPrinterName] = useState<string | null>(null);

	const [landingSettings, setLandingSettings] = useState({
		landingIcon: "Coffee",
		landingTitle: "TKM COFFEE",
		landingDescription: "Pengalaman Kopi Premium",
		landingButtonText: "Pesan Disini",
		logoUrl: "",
		paymentPopupImage: "",
	});

	const [activeTab, setActiveTab] = useState<
		"landing" | "pos" | "store" | "system" | "users"
	>("landing");

	// User/Role Form States
	const [newUser, setNewUser] = useState({
		username: "",
		password: "",
		name: "",
		roleId: "",
	});
	const [newRole, setNewRole] = useState({
		name: "",
		permissions: [] as string[],
	});
	const [confirmConfig, setConfirmConfig] = useState<{
		isOpen: boolean;
		title: string;
		message: string;
		onConfirm: () => void;
		variant?: "danger" | "warning" | "info";
	}>({
		isOpen: false,
		title: "",
		message: "",
		onConfirm: () => {
			/* no-op */
		},
	});

	useEffect(() => {
		if (siteSettings) {
			setLandingSettings({
				landingIcon: siteSettings.landingIcon || "Coffee",
				landingTitle: siteSettings.landingTitle,
				landingDescription: siteSettings.landingDescription,
				landingButtonText: siteSettings.landingButtonText,
				logoUrl: siteSettings.logoUrl || "",
				paymentPopupImage: siteSettings.paymentPopupImage || "",
			});
			setSettings((prev) => ({
				...prev,
				storeName: siteSettings.storeName || "TKM Coffee",
				storeAddress: siteSettings.storeAddress || "",
				storePhone: siteSettings.storePhone || "",
				receiptFooter: siteSettings.receiptFooter || "Terima kasih!",
				autoPrint: !!siteSettings.autoPrint,
			}));
		}
		setIsConnected(bluetoothPrinter.isConnected());
	}, [siteSettings]);

	const handleConnectPrinter = async () => {
		try {
			const name = await bluetoothPrinter.connect();
			setPrinterName(name);
			setIsConnected(true);
			toast.success(`Terhubung ke ${name}`);
		} catch (error) {
			toast.error((error as Error).message || "Gagal menghubungkan printer");
		}
	};

	const handleSave = async () => {
		try {
			await updateSiteSettings({
				...landingSettings,
				storeName: settings.storeName,
				storeAddress: settings.storeAddress,
				storePhone: settings.storePhone,
				receiptFooter: settings.receiptFooter,
				autoPrint: settings.autoPrint,
			});
			toast.success("Pengaturan berhasil disimpan!");
		} catch (error) {
			console.error(error);
			toast.error("Gagal menyimpan pengaturan");
		}
	};

	// biome-ignore lint/suspicious/noExplicitAny: API types not ready
	const bindProfile = useMutation((api as any).users.bindProfile);

	const handleCreateUser = async () => {
		if (
			!(newUser.username && newUser.password && newUser.name && newUser.roleId)
		) {
			toast.error("Mohon lengkapi data user");
			return;
		}
		try {
			// 1. Create User in Better Auth
			const result = await authClient.signUp.email({
				email: newUser.username, // Using username as email
				password: newUser.password,
				name: newUser.name,
			});

			if (result.error) {
				toast.error(result.error.message || "Gagal mendaftar user");
				return;
			}

			// 2. Bind to Profile with Role
			if (result.data) {
				await bindProfile({
					authUserId: result.data.user.id,
					name: newUser.name,
					email: newUser.username,
					roleId: newUser.roleId as Id<"roles">,
				});
				setNewUser({ username: "", password: "", name: "", roleId: "" });
				toast.success("User berhasil dibuat dan didaftarkan!");
			}
		} catch (error) {
			console.error(error);
			toast.error("Gagal membuat user");
		}
	};

	const handleDeleteUser = (id: Id<"users">) => {
		setConfirmConfig({
			isOpen: true,
			title: "Hapus Pengguna?",
			message: "Akun ini tidak akan bisa login lagi ke sistem.",
			variant: "danger",
			onConfirm: async () => {
				try {
					await deleteUser({ id });
					toast.success("User dihapus");
				} catch (_error) {
					toast.error("Gagal menghapus user");
				}
			},
		});
	};

	const handleCreateRole = async () => {
		if (!newRole.name) {
			toast.error("Nama role harus diisi");
			return;
		}
		try {
			await createRole({
				name: newRole.name,
				permissions: newRole.permissions,
			});
			toast.success("Role berhasil dibuat");
			setNewRole({ name: "", permissions: [] });
		} catch (error) {
			console.error(error);
			toast.error("Gagal membuat role");
		}
	};

	const handleDeleteRole = (id: Id<"roles">) => {
		setConfirmConfig({
			isOpen: true,
			title: "Hapus Role?",
			message: "User dengan role ini mungkin akan mengalami error saat login.",
			variant: "danger",
			onConfirm: async () => {
				try {
					await deleteRole({ id });
					toast.success("Role dihapus");
				} catch (error) {
					toast.error((error as Error).message);
				}
			},
		});
	};

	const tabs = [
		{ id: "landing", label: "Halaman Utama", icon: Layout },
		{ id: "pos", label: "Konfigurasi POS", icon: CreditCard },
		{ id: "store", label: "Informasi Toko", icon: MapPin },
		{ id: "users", label: "Pengguna & Akses", icon: Users },
		{ id: "system", label: "Sistem & Perangkat", icon: Settings2 },
	] as const;

	return (
		<div className="mx-auto max-w-5xl space-y-8">
			{/* Header */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 className="font-bold text-3xl text-foreground tracking-tight">
						Pengaturan Sistem
					</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						Konfigurasi & Personalisasi Toko
					</p>
				</div>
				<button
					className="flex items-center justify-center gap-3 rounded-xl bg-primary px-8 py-3.5 font-bold text-primary-foreground transition-all hover:opacity-90 active:scale-95"
					onClick={handleSave}
					type="button"
				>
					<Save className="h-4 w-4" /> Simpan Perubahan
				</button>
			</div>

			{/* Tab Switcher */}
			<div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-muted/50 p-1.5 shadow-inner">
				{tabs.map((tab) => (
					<button
						className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-6 py-3 font-bold transition-all ${
							activeTab === tab.id
								? "bg-card text-primary shadow-sm"
								: "text-muted-foreground hover:bg-card/50 hover:text-foreground"
						}`}
						key={tab.id}
						onClick={() => setActiveTab(tab.id)}
						type="button"
					>
						<tab.icon className="h-4 w-4" />
						<span className="text-sm">{tab.label}</span>
					</button>
				))}
			</div>

			{/* Tab Content */}
			<div className="space-y-6">
				{activeTab === "landing" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-8 rounded-2xl border border-border bg-card p-8 shadow-sm">
							<div className="flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
									<Layout className="h-6 w-6" />
								</div>
								<div>
									<h3 className="font-bold text-foreground text-xl tracking-tight">
										Kustomisasi Halaman Utama
									</h3>
									<p className="text-muted-foreground text-sm">
										Tampilan Depan Pelanggan
									</p>
								</div>
							</div>

							<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
								<div className="space-y-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="landing-title"
									>
										Judul Utama
									</label>
									<input
										className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-primary/20"
										id="landing-title"
										onChange={(e) =>
											setLandingSettings({
												...landingSettings,
												landingTitle: e.target.value,
											})
										}
										type="text"
										value={landingSettings.landingTitle}
									/>
								</div>
								<div className="space-y-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="landing-btn-text"
									>
										Teks Tombol
									</label>
									<input
										className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-primary/20"
										id="landing-btn-text"
										onChange={(e) =>
											setLandingSettings({
												...landingSettings,
												landingButtonText: e.target.value,
											})
										}
										type="text"
										value={landingSettings.landingButtonText}
									/>
								</div>
								<div className="space-y-2 md:col-span-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="landing-desc"
									>
										Deskripsi Singkat
									</label>
									<textarea
										className="min-h-[120px] w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-primary/20"
										id="landing-desc"
										onChange={(e) =>
											setLandingSettings({
												...landingSettings,
												landingDescription: e.target.value,
											})
										}
										value={landingSettings.landingDescription}
									/>
								</div>
								<div className="space-y-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="landing-icon"
									>
										Icon (Lucide Name)
									</label>
									<select
										className="w-full appearance-none rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
										id="landing-icon"
										onChange={(e) =>
											setLandingSettings({
												...landingSettings,
												landingIcon: e.target.value,
											})
										}
										value={landingSettings.landingIcon}
									>
										<option value="Coffee">Coffee</option>
										<option value="Utensils">Utensils</option>
										<option value="Pizza">Pizza</option>
										<option value="Beer">Beer</option>
										<option value="Cake">Cake</option>
										<option value="IceCream">Ice Cream</option>
									</select>
								</div>
								<div className="space-y-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="landing-logo"
									>
										URL Gambar Logo (Opsional)
									</label>
									<input
										className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-primary/20"
										id="landing-logo"
										onChange={(e) =>
											setLandingSettings({
												...landingSettings,
												logoUrl: e.target.value,
											})
										}
										placeholder="https://example.com/logo.png"
										type="text"
										value={landingSettings.logoUrl}
									/>
								</div>
							</div>
						</section>
					</div>
				)}

				{activeTab === "pos" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-8 rounded-2xl border border-border bg-card p-8 shadow-sm">
							<div className="flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
									<CreditCard className="h-6 w-6" />
								</div>
								<div>
									<h3 className="font-bold text-foreground text-xl tracking-tight">
										Konfigurasi POS & Pembayaran
									</h3>
									<p className="text-muted-foreground text-sm">
										Pengaturan Alur Transaksi
									</p>
								</div>
							</div>

							<div className="space-y-6">
								<div className="space-y-2">
									<p className="font-medium text-muted-foreground text-xs">
										Metode Pembayaran Tersedia
									</p>
									<div className="flex flex-wrap gap-2 pt-1">
										{["Tunai", "QRIS", "Transfer Bank"].map((method) => (
											<span
												className="rounded-lg bg-muted px-4 py-2 font-bold text-foreground text-xs"
												key={method}
											>
												{method}
											</span>
										))}
									</div>
								</div>

								<div className="space-y-4 pt-4">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="payment-popup-image"
									>
										Gambar Popup Pembayaran (QRIS/Promo)
									</label>
									<div className="flex flex-col gap-6 sm:flex-row sm:items-center">
										{landingSettings.paymentPopupImage && (
											<div className="relative h-48 w-48 overflow-hidden rounded-xl border-4 border-muted bg-muted shadow-inner">
												<img
													alt="Popup Preview"
													className="h-full w-full object-cover"
													height={192}
													src={landingSettings.paymentPopupImage}
													width={192}
												/>
											</div>
										)}
										<div className="flex flex-1 flex-col gap-3">
											<input
												accept="image/*"
												className="block w-full text-muted-foreground text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-6 file:py-2.5 file:font-bold file:text-primary-foreground file:text-xs file:transition-all hover:file:opacity-90"
												id="payment-popup-image"
												onChange={async (e) => {
													const file = e.target.files?.[0];
													if (!file) {
														return;
													}
													try {
														const postUrl = await generateUploadUrl();
														const result = await fetch(postUrl, {
															method: "POST",
															headers: { "Content-Type": file.type },
															body: file,
														});
														if (!result.ok) {
															throw new Error("Upload failed");
														}
														const { storageId } = await result.json();
														setLandingSettings({
															...landingSettings,
															paymentPopupImage: storageId,
															logoUrl: landingSettings.logoUrl,
														});
														toast.success(
															"Selesai! Klik Simpan untuk memperbarui."
														);
													} catch (error) {
														console.error(error);
														toast.error("Gagal mengupload gambar");
													}
												}}
												type="file"
											/>
											<p className="text-muted-foreground/60 text-xs">
												Rekomendasi ukuran: 800x800px (Max 1MB).
											</p>
										</div>
									</div>
								</div>
							</div>
						</section>
					</div>
				)}

				{activeTab === "store" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-8 rounded-2xl border border-border bg-card p-8 shadow-sm">
							<div className="flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
									<MapPin className="h-6 w-6" />
								</div>
								<div>
									<h3 className="font-bold text-foreground text-xl tracking-tight">
										Informasi & Biaya Toko
									</h3>
									<p className="text-muted-foreground text-sm">
										Profil Bisnis & Kebijakan Pajak
									</p>
								</div>
							</div>

							<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
								<div className="space-y-2 md:col-span-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="store-name"
									>
										Nama Toko
									</label>
									<input
										className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
										id="store-name"
										onChange={(e) =>
											setSettings({ ...settings, storeName: e.target.value })
										}
										type="text"
										value={settings.storeName}
									/>
								</div>

								<div className="space-y-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="store-address"
									>
										Alamat Toko
									</label>
									<input
										className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
										id="store-address"
										onChange={(e) =>
											setSettings({ ...settings, storeAddress: e.target.value })
										}
										placeholder="Jl. Contoh No. 123"
										type="text"
										value={settings.storeAddress}
									/>
								</div>

								<div className="space-y-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="store-phone"
									>
										Nomor Telepon
									</label>
									<input
										className="w-full rounded-xl bg-muted/50 p-3.5 font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
										id="store-phone"
										onChange={(e) =>
											setSettings({ ...settings, storePhone: e.target.value })
										}
										placeholder="08123456789"
										type="text"
										value={settings.storePhone}
									/>
								</div>

								<div className="space-y-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="tax-rate"
									>
										Pajak (%)
									</label>
									<div className="relative">
										<input
											className="w-full rounded-xl bg-muted/50 p-3.5 font-bold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
											id="tax-rate"
											onChange={(e) =>
												setSettings({
													...settings,
													taxRate: Number(e.target.value),
												})
											}
											type="number"
											value={settings.taxRate}
										/>
										<span className="absolute top-1/2 right-5 -translate-y-1/2 font-bold text-muted-foreground/40">
											%
										</span>
									</div>
								</div>

								<div className="space-y-2">
									<label
										className="font-medium text-muted-foreground text-xs"
										htmlFor="service-charge"
									>
										Service Charge (%)
									</label>
									<div className="relative">
										<input
											className="w-full rounded-xl bg-muted/50 p-3.5 font-bold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20"
											id="service-charge"
											onChange={(e) =>
												setSettings({
													...settings,
													serviceCharge: Number(e.target.value),
												})
											}
											type="number"
											value={settings.serviceCharge}
										/>
										<span className="absolute top-1/2 right-5 -translate-y-1/2 font-bold text-muted-foreground/40">
											%
										</span>
									</div>
								</div>
							</div>
						</section>
					</div>
				)}

				{activeTab === "users" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<section className="space-y-8 rounded-2xl border border-border bg-card p-8 shadow-sm">
							<div className="flex items-center gap-4">
								<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
									<Users className="h-6 w-6" />
								</div>
								<div>
									<h3 className="font-bold text-foreground text-xl tracking-tight">
										Manajemen Pengguna & Akses
									</h3>
									<p className="text-muted-foreground text-sm">
										Kelola akun staf dan hak akses
									</p>
								</div>
							</div>

							<div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
								{/* Create User Form */}
								<div className="space-y-6 rounded-2xl border border-border/50 bg-muted/30 p-6">
									<div className="flex items-center gap-2 border-border/50 border-b pb-4">
										<User className="h-4 w-4 text-primary" />
										<h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
											Tambah User Baru
										</h4>
									</div>
									<div className="space-y-4">
										<div className="space-y-1.5">
											<label
												className="font-medium text-muted-foreground text-xs"
												htmlFor="reg-name"
											>
												Nama Lengkap
											</label>
											<input
												className="w-full rounded-xl bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
												id="reg-name"
												onChange={(e) =>
													setNewUser({ ...newUser, name: e.target.value })
												}
												placeholder="Contoh: Budi Santoso"
												type="text"
												value={newUser.name}
											/>
										</div>
										<div className="space-y-2">
											<label
												className="font-medium text-muted-foreground text-xs"
												htmlFor="reg-username"
											>
												Username (Email)
											</label>
											<input
												className="w-full rounded-xl bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
												id="reg-username"
												onChange={(e) =>
													setNewUser({ ...newUser, username: e.target.value })
												}
												placeholder="budi@example.com"
												type="text"
												value={newUser.username}
											/>
										</div>
										<div className="space-y-2">
											<label
												className="font-medium text-muted-foreground text-xs"
												htmlFor="reg-password"
											>
												Password
											</label>
											<input
												className="w-full rounded-xl bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
												id="reg-password"
												onChange={(e) =>
													setNewUser({ ...newUser, password: e.target.value })
												}
												placeholder="••••••••"
												type="password"
												value={newUser.password}
											/>
										</div>
										<div className="space-y-2">
											<label
												className="font-medium text-muted-foreground text-xs"
												htmlFor="reg-role"
											>
												Pilih Role
											</label>
											<select
												className="w-full rounded-xl bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
												id="reg-role"
												onChange={(e) =>
													setNewUser({ ...newUser, roleId: e.target.value })
												}
												value={newUser.roleId}
											>
												<option disabled value="">
													Pilih Role
												</option>
												{/* biome-ignore lint/suspicious/noExplicitAny: missing types */}
												{roles?.map((role: any) => (
													<option key={role._id} value={role._id}>
														{role.name}
													</option>
												))}
											</select>
										</div>
										<button
											className="mt-2 w-full rounded-xl bg-primary py-3.5 font-bold text-primary-foreground text-sm transition-all hover:opacity-90 active:scale-95"
											onClick={handleCreateUser}
											type="button"
										>
											Buat Akun Pengguna
										</button>
									</div>
								</div>

								{/* Create Role Form */}
								<div className="space-y-6 rounded-2xl border border-border/50 bg-muted/30 p-6">
									<div className="flex items-center gap-2 border-border/50 border-b pb-4">
										<Settings2 className="h-4 w-4 text-primary" />
										<h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
											Tambah Role Baru
										</h4>
									</div>
									<div className="space-y-5">
										<div className="space-y-2">
											<label
												className="font-medium text-muted-foreground text-xs"
												htmlFor="role-name"
											>
												Nama Role
											</label>
											<input
												className="w-full rounded-xl bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
												id="role-name"
												onChange={(e) =>
													setNewRole({ ...newRole, name: e.target.value })
												}
												placeholder="Contoh: Kasir, Admin Stok"
												type="text"
												value={newRole.name}
											/>
										</div>

										<div className="space-y-3">
											<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
												Izin Akses (Permissions)
											</p>
											<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
												{AVAILABLE_PERMISSIONS.map((perm) => (
													<label
														className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${
															newRole.permissions.includes(perm.id)
																? "border-primary/30 bg-primary/5 text-primary"
																: "border-border/50 bg-background text-muted-foreground hover:border-border"
														}`}
														key={perm.id}
													>
														<input
															checked={newRole.permissions.includes(perm.id)}
															className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
															onChange={(e) => {
																const perms = e.target.checked
																	? [...newRole.permissions, perm.id]
																	: newRole.permissions.filter(
																			(p) => p !== perm.id
																		);
																setNewRole({ ...newRole, permissions: perms });
															}}
															type="checkbox"
														/>
														<span className="font-medium text-xs">
															{perm.label}
														</span>
													</label>
												))}
											</div>
										</div>

										<button
											className="mt-2 w-full rounded-xl bg-primary/10 py-3.5 font-bold text-primary text-sm transition-all hover:bg-primary/20 active:scale-95"
											onClick={handleCreateRole}
											type="button"
										>
											Buat Role Baru
										</button>
									</div>
								</div>

								{/* Lists: Users & Roles */}
								<div className="pt-8 lg:col-span-2">
									<div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
										<div className="space-y-4">
											<h4 className="px-2 font-bold text-base text-foreground">
												Daftar Pengguna
											</h4>
											<div className="space-y-2">
												{/* biome-ignore lint/suspicious/noExplicitAny: missing types */}
												{users?.map((user: any) => (
													<div
														className="flex items-center justify-between rounded-2xl border border-border bg-background p-4 shadow-sm"
														key={user._id}
													>
														<div className="flex items-center gap-3">
															<div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted font-bold text-primary text-sm">
																{user.name.charAt(0)}
															</div>
															<div>
																<p className="font-bold text-sm tracking-tight">
																	{user.name}
																</p>
																<p className="text-muted-foreground text-xs">
																	{user.email}
																</p>
															</div>
														</div>
														<button
															className="rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
															onClick={() => handleDeleteUser(user._id)}
															type="button"
														>
															<Trash2 className="h-4 w-4" />
														</button>
													</div>
												))}
												{!users?.length && (
													<p className="py-8 text-center text-muted-foreground text-sm italic">
														Belum ada user.
													</p>
												)}
											</div>
										</div>
										<div className="space-y-4">
											<h4 className="px-2 font-bold text-base text-foreground">
												Daftar Role
											</h4>
											<div className="flex flex-wrap gap-2">
												{/* biome-ignore lint/suspicious/noExplicitAny: missing types */}
												{roles?.map((role: any) => (
													<div
														className="group flex items-center gap-3 rounded-xl border border-border bg-background py-2.5 pr-2 pl-4 shadow-sm transition-all hover:border-primary/20"
														key={role._id}
													>
														<div>
															<p className="font-bold text-sm tracking-tight">
																{role.name}
															</p>
															<p className="text-[10px] text-muted-foreground uppercase tracking-wider">
																{role.permissions.length} Izin
															</p>
														</div>
														<button
															className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 lg:opacity-0"
															onClick={() => handleDeleteRole(role._id)}
															type="button"
														>
															<Trash2 className="h-3.5 w-3.5" />
														</button>
													</div>
												))}
												{!roles?.length && (
													<p className="w-full py-8 text-center text-muted-foreground text-sm italic">
														Belum ada role.
													</p>
												)}
											</div>
										</div>
									</div>
								</div>
							</div>
						</section>
					</div>
				)}

				{activeTab === "system" && (
					<div className="fade-in slide-in-from-bottom-4 animate-in duration-500">
						<div className="grid grid-cols-1 gap-8 md:grid-cols-2">
							<section className="space-y-8 rounded-2xl border border-border bg-card p-8 shadow-sm">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
										<Printer className="h-6 w-6" />
									</div>
									<div>
										<h3 className="font-bold text-foreground text-xl tracking-tight">
											Printer & Struk
										</h3>
										<p className="text-muted-foreground text-sm">
											Hardware & Output
										</p>
									</div>
								</div>

								<div className="space-y-6">
									<div className="flex items-center justify-between rounded-xl bg-muted/40 p-5 shadow-inner">
										<div>
											<span className="block font-bold text-foreground text-sm tracking-tight">
												Cetak Otomatis
											</span>
											<span className="text-muted-foreground text-xs">
												Cetak Struk per Transaksi
											</span>
										</div>
										<button
											className={`relative h-7 w-12 rounded-full transition-all duration-300 ${settings.autoPrint ? "bg-primary" : "bg-muted-foreground/20"}`}
											onClick={() =>
												setSettings({
													...settings,
													autoPrint: !settings.autoPrint,
												})
											}
											type="button"
										>
											<div
												className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.autoPrint ? "right-1" : "left-1"}`}
											/>
										</button>
									</div>

									<div className="space-y-3">
										<button
											className={`w-full rounded-xl border-2 py-4 font-bold text-sm transition-all active:scale-95 ${
												isConnected
													? "border-green-500/20 bg-green-500/10 text-green-600"
													: "border-border border-dashed bg-muted/30 text-muted-foreground hover:bg-muted/50"
											}`}
											onClick={handleConnectPrinter}
											type="button"
										>
											{isConnected
												? `TERHUBUNG: ${printerName || "PRINTER"}`
												: "HUBUNGKAN PRINTER BLUETOOTH"}
										</button>
										{isConnected && (
											<button
												className="w-full text-center font-bold text-destructive text-xs hover:underline"
												onClick={() => {
													bluetoothPrinter.disconnect();
													setIsConnected(false);
												}}
												type="button"
											>
												Putuskan Koneksi
											</button>
										)}
									</div>
								</div>
							</section>

							<section className="space-y-8 rounded-2xl border border-destructive/10 bg-destructive/5 p-8 shadow-sm">
								<div className="flex items-center gap-4">
									<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
										<Bell className="h-6 w-6" />
									</div>
									<div>
										<h3 className="font-bold text-destructive text-xl tracking-tight">
											Zona Bahaya
										</h3>
										<p className="text-destructive/60 text-sm">
											Reset & Pembersihan Data
										</p>
									</div>
								</div>

								<div className="space-y-6">
									<p className="text-muted-foreground text-sm leading-relaxed">
										Tindakan ini akan menghapus seluruh data transaksi sistem.
										Pastikan Anda telah melakukan backup sebelum melanjutkan.
									</p>
									<button
										className="w-full rounded-xl bg-destructive py-4 font-bold text-sm text-white transition-all hover:opacity-90 active:scale-95"
										type="button"
									>
										RESET SEMUA DATA
									</button>
								</div>
							</section>
						</div>
					</div>
				)}
			</div>

			<ConfirmationModal
				isOpen={confirmConfig.isOpen}
				message={confirmConfig.message}
				onClose={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
				onConfirm={() => {
					confirmConfig.onConfirm();
					setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
				}}
				title={confirmConfig.title}
				variant={confirmConfig.variant}
			/>
		</div>
	);
}
