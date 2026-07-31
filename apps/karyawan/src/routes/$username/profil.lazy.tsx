import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { useStaffProfile } from "../$username.lazy";
import { useYumiAuth } from "@yumipos/web-shared";
import {
	useHybridPrivateStaffData,
	useHybridUpdateUserPin,
	useHybridUpdateUserProfile,
	useHybridSiteSettings,
	createClient,
} from "@yumipos/web-shared";
import { Button } from "@yumipos/web-shared/components/ui/button";
import { Input } from "@yumipos/web-shared/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import {
	User, Clock, FileText, Camera, ShieldCheck, Bell, Check, Send, ExternalLink,
	LogOut, Calendar, KeyRound, X, AlertTriangle, MessageCircle, Sparkles,
	LogIn, ClipboardList, ArrowRight
} from "lucide-react";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/$username/profil")({
	component: ProfilPage,
});

/** Baca File jadi base64 murni (tanpa prefix data:...;base64,). */
function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("Gagal membaca file foto"));
		reader.onload = () => {
			const result = String(reader.result ?? "");
			const comma = result.indexOf(",");
			resolve(comma >= 0 ? result.slice(comma + 1) : result);
		};
		reader.readAsDataURL(file);
	});
}

function ProfilPage() {
	const { staff, username, isUnlocked, isAdmin, authUser, isAuthenticated, token, navigate, refreshKey } = useStaffProfile();
	const { logout: logoutYumi } = useYumiAuth();
	const now = new Date();

	// Auth
	// PIN state
	const [showChangePin, setShowChangePin] = useState(false);
	const [newPin, setNewPin] = useState("");
	const [oldPin, setOldPin] = useState("");
	const [isUpdatingPin, setIsUpdatingPin] = useState(false);
	const updatePinMutation = useHybridUpdateUserPin();

	// Edit profile
	const [isEditMode, setIsEditMode] = useState(false);
	const [editName, setEditName] = useState("");
	const [editUsername, setEditUsername] = useState("");
	const [editEmail, setEditEmail] = useState("");
	const [editSlug, setEditSlug] = useState("");
	const [editNewPassword, setEditNewPassword] = useState("");
	const [isSavingProfile, setIsSavingProfile] = useState(false);
	const [editPhone, setEditPhone] = useState("");
	const [editIdentityNumber, setEditIdentityNumber] = useState("");
	const [editAddress, setEditAddress] = useState("");
	const [editBirthDate, setEditBirthDate] = useState("");
	const [editPlaceOfBirth, setEditPlaceOfBirth] = useState("");
	const [editEmergencyContactName, setEditEmergencyContactName] = useState("");
	const [editEmergencyContactPhone, setEditEmergencyContactPhone] = useState("");
	const [editBankName, setEditBankName] = useState("");
	const [editBankAccount, setEditBankAccount] = useState("");
	const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
	const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

	const updateProfileMutation = useHybridUpdateUserProfile();

	// Fetch data
	const privateData = useHybridPrivateStaffData(isUnlocked && staff ? { slug: username, token } : undefined);
	const settings = useHybridSiteSettings() as any;
	const storeName = settings?.storeName || "TENTREM KOFFIE";

	const requiresPinChange = Boolean(authUser?.requiresPinChange && authUser.slug === username);

	// Telegram Bot status
	const [telegramStatus, setTelegramStatus] = useState<any>(null);
	const [loadingTelegram, setLoadingTelegram] = useState(false);

	useEffect(() => {
		if (!staff?._id) return;
		setLoadingTelegram(true);
		const supabase = createClient();
		supabase
			.from("employee_telegram_status")
			.select("*")
			.eq("employee_user_id", staff._id)
			.maybeSingle()
			.then(({ data }) => {
				setTelegramStatus(data);
				setLoadingTelegram(false);
			});
		}, [staff?._id]);

		// Telegram Bot registration code
		const [telegramCode, setTelegramCode] = useState<string | null>(null);

		useEffect(() => {
			if (!staff?._id) return;
			const supabase = createClient();
			supabase
				.from("pos_staff_users")
				.select("telegram_code")
				.eq("_id", staff._id)
				.maybeSingle()
				.then(({ data }) => {
					if (data?.telegram_code) {
						setTelegramCode(data.telegram_code);
					}
				});
		}, [staff?._id]);

	// Init edit form
	const hasLoadedRef = useRef(false);
	useEffect(() => {
		if (hasLoadedRef.current) return;
		if (staff && isUnlocked) {
			hasLoadedRef.current = true;
			setEditName(staff.name || "");
			setEditUsername(privateData?.username || staff.slug || "");
			setEditSlug(staff.slug || "");
		}
		if (privateData && isUnlocked) {
			setEditEmail(privateData.email || privateData.username || "");
			setEditUsername(privateData.username || editUsername || staff?.slug || "");
			const raw = (privateData as any).raw ?? {};
			setEditPhone(raw.phone || "");
			setEditIdentityNumber(raw.identityNumber || "");
			setEditAddress(raw.address || "");
			setEditBirthDate(raw.birthDate || "");
			setEditPlaceOfBirth(raw.placeOfBirth || "");
			setEditEmergencyContactName(raw.emergencyContactName || "");
			setEditEmergencyContactPhone(raw.emergencyContactPhone || "");
			setEditBankName(String((raw as any)?.bankName ?? ""));
			setEditBankAccount(String((raw as any)?.bankAccount ?? ""));
		}
	}, [staff, privateData, isUnlocked]);

	// Onboarding state
	const ONBOARDING_DISMISS_KEY = "karyawan_onboarding_dismissed";
	const [showOnboarding, setShowOnboarding] = useState(() => {
		if (typeof window === "undefined") return false;
		if (authUser?.slug !== username) return false;
		return !localStorage.getItem(ONBOARDING_DISMISS_KEY);
	});
	const [completedSteps, setCompletedSteps] = useState(0);
	const [isCelebrating, setIsCelebrating] = useState(false);
	const [showEditTooltip, setShowEditTooltip] = useState(false);

	const dismissOnboarding = useCallback(() => {
		setIsCelebrating(true);
		setTimeout(() => {
			localStorage.setItem(ONBOARDING_DISMISS_KEY, "true");
			setShowOnboarding(false);
			setIsCelebrating(false);
			setCompletedSteps(0);
		}, 800);
	}, []);

	const handleLengkapiData = useCallback(() => {
		setCompletedSteps(1);
		localStorage.setItem(ONBOARDING_DISMISS_KEY, "true");
		setShowOnboarding(false);
		setIsEditMode(true);
		setShowEditTooltip(true);
		setTimeout(() => setShowEditTooltip(false), 4000);
	}, []);

	const handleGabungGrup = useCallback(() => {
		setCompletedSteps(2);
		window.open("https://t.me/addlist/076D_FFRNFw5ZWI1", "_blank");
	}, []);

	const handleAvatarClick = useCallback(() => {
		navigate({ to: "/$username/absensi" as any, params: { username } });
	}, [navigate, username]);

	return (
		<div className="space-y-4">
			{/* Incomplete data badge */}
			{privateData?.raw && (() => {
				const r = privateData.raw as any;
				const missingFields = [r.phone, r.identityNumber, r.address, r.birthDate, r.emergencyContactName].filter(f => !f);
				if (missingFields.length === 0) return null;
				return (
					<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
						<div className="flex items-start gap-3">
							<AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
							<div className="flex-1 min-w-0">
								<p className="text-[10px] font-black uppercase tracking-wide">Lengkapi Data Diri</p>
								<p className="mt-0.5 text-[11px] font-medium">Isi No HP, Alamat, dan data lainnya untuk memudahkan administrasi.</p>
							</div>
							<Button variant="outline" size="sm" className="shrink-0 rounded-lg font-bold text-[10px] h-8 px-3 border-amber-300 text-amber-800 hover:bg-amber-100" onClick={() => setIsEditMode(true)}>EDIT NOW</Button>
						</div>
					</div>
				);
			})()}

			{/* Data Pribadi */}
			<div className="space-y-2">
				<div className="flex items-center justify-between px-2">
					<h3 className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px]">
						<User className="h-3 w-3 text-primary" />
						Data Pribadi
					</h3>
					<div className="flex items-center gap-1">
						<Button variant="ghost" size="sm" className="text-[10px] font-bold h-6 px-2" onClick={() => setIsEditMode(!isEditMode)}>
							{isEditMode ? "BATAL" : "EDIT"}
						</Button>
						{showEditTooltip && (
							<motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="relative inline-flex items-center gap-1.5">
								<motion.div animate={{ x: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
									<ArrowRight aria-hidden="true" className="h-4 w-4 text-primary" />
								</motion.div>
								<span className="whitespace-nowrap rounded-lg bg-primary px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-primary-foreground shadow-lg">Isi data dirimu!</span>
							</motion.div>
						)}
					</div>
				</div>
				<div className="rounded-xl border bg-card p-3 space-y-2.5">
					{!isEditMode ? (
						<div className="space-y-1.5">
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">Nama</span>
								<span className="font-bold text-right max-w-[200px] truncate">{staff.name}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">Email</span>
								<span className="font-bold text-right max-w-[200px] truncate">{privateData?.email || privateData?.username || "---"}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">Username</span>
								<span className="font-bold">@{staff.slug}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">No HP</span>
								<span className="font-bold">{privateData?.raw?.phone || "---"}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">KTP</span>
								<span className="font-bold">{privateData?.raw?.identityNumber || "---"}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">Tmp/Tgl Lahir</span>
								<span className="font-bold text-right max-w-[200px]">{[privateData?.raw?.placeOfBirth, privateData?.raw?.birthDate].filter(Boolean).join(", ") || "---"}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">Alamat</span>
								<span className="font-bold text-right max-w-[200px] truncate">{privateData?.raw?.address || "---"}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">Bank</span>
								<span className="font-bold">{(privateData as any)?.raw?.bankName || "---"}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">No Rekening</span>
								<span className="font-bold">{(privateData as any)?.raw?.bankAccount || "---"}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">Kontak Darurat</span>
								<span className="font-bold text-right max-w-[200px]">{privateData?.raw?.emergencyContactName ? `${privateData.raw.emergencyContactName} (${privateData.raw.emergencyContactPhone || "-"})` : "---"}</span>
							</div>
							<div className="border-t pt-2 mt-2 space-y-1.5">
								<p className="text-[10px] font-black text-primary uppercase">Pekerjaan</p>
								<div className="flex justify-between items-center text-[10px]">
									<span className="text-muted-foreground">Mulai</span>
									<span className="font-bold">{privateData?.raw?.startDate || "---"}</span>
								</div>
								<div className="flex justify-between items-center text-[10px]">
									<span className="text-muted-foreground">Status</span>
									<span className="font-bold">{privateData?.raw?.employmentType === "probation" ? "Probation" : privateData?.raw?.employmentType || "---"}</span>
								</div>
								<div className="flex justify-between items-center text-[10px]">
									<span className="text-muted-foreground">Lokasi</span>
									<span className="font-bold">{privateData?.raw?.location || "---"}</span>
								</div>
							</div>
						</div>
					) : (
						<form className="space-y-2" onSubmit={async (e) => {
							e.preventDefault();
							if (!token) return;
							setIsSavingProfile(true);
							try {
								// Foto dikirim sebagai base64 dan di-upload oleh edge function
								// dengan service_role. Upload langsung dari browser tidak
								// mungkin: anon tidak punya hak tulis ke storage.objects.
								let photoBase64: string | undefined;
								let photoContentType: string | undefined;
								if (editPhotoFile) {
									setIsUploadingPhoto(true);
									try {
										photoBase64 = await fileToBase64(editPhotoFile);
										photoContentType = editPhotoFile.type || "image/jpeg";
									} finally { setIsUploadingPhoto(false); }
								}
								await updateProfileMutation({
									token,
									name: editName !== staff?.name ? editName : undefined,
									username: editUsername !== privateData?.username ? editUsername : undefined,
									slug: editSlug !== staff?.slug ? editSlug : undefined,
									phone: editPhone || undefined,
									identityNumber: editIdentityNumber || undefined,
									address: editAddress || undefined,
									birthDate: editBirthDate || undefined,
									placeOfBirth: editPlaceOfBirth || undefined,
									emergencyContactName: editEmergencyContactName || undefined,
									emergencyContactPhone: editEmergencyContactPhone || undefined,
									bankName: editBankName || undefined,
									bankAccount: editBankAccount || undefined,
									photoBase64,
									photoContentType,
								});
								if (editEmail && editEmail !== privateData?.email && editEmail !== privateData?.username) {
									const supabase = createClient();
									// Cek apakah user sudah punya Supabase Auth account
									const { data: yumiUser } = await supabase
										.from("yumi_users")
										.select("auth_user_id, email")
										.eq("source_id", staff._id)
										.maybeSingle();
									const hasAuthUser = Boolean(yumiUser?.auth_user_id);
									const existingEmail = yumiUser?.email || privateData?.email || privateData?.username;
									if (!hasAuthUser) {
										// First time: create Supabase Auth user
										const authPassword = editNewPassword || Array.from({ length: 16 }, () =>
											Math.random().toString(36).charAt(2)
										).join("") + "Aa1!";
										const { error: createError } = await supabase.functions.invoke("yumi-auth", {
											body: {
												action: "createAuthUser",
												sourceId: staff._id,
												email: editEmail,
												password: authPassword,
												name: editName || staff?.name || "",
											},
										});
										if (createError) throw new Error(createError.message || "Gagal membuat akun auth");
									} else {
										// Already has auth
										if (editEmail !== existingEmail) {
											const { error: emailError } = await supabase.functions.invoke("yumi-auth", {
												body: { action: "updateEmail", userId: staff._id, newEmail: editEmail },
											});
											if (emailError) throw new Error(emailError.message || "Gagal update email");
										}
										if (editNewPassword) {
											const { error: pwError } = await supabase.auth.updateUser({ password: editNewPassword });
											if (pwError) throw pwError;
										}
									}
								}
								const usernameChanged = editUsername !== privateData?.username && editUsername !== undefined;
								toast.success(
									usernameChanged
										? `Username login diubah ke "${editUsername}". Gunakan username baru untuk login berikutnya.`
										: "Profil berhasil diperbarui!"
								);
								setIsEditMode(false);
								setEditNewPassword("");
								setEditPhotoFile(null);
								setIsUploadingPhoto(false);
								if (editSlug !== username) {
									navigate({ to: `/${editSlug}` as any, replace: true });
								}
							} catch (err: any) {
								toast.error(err?.message || "Gagal memperbarui profil");
							} finally { setIsSavingProfile(false); }
						}}>
							<div className="space-y-1.5">
								<div className="space-y-1">
									<label className="text-[11px] font-black text-muted-foreground uppercase ml-1">Nama Lengkap</label>
									<Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Nama Lengkap" />
								</div>
								<div className="space-y-1">
									<label className="text-[11px] font-black text-muted-foreground uppercase ml-1">Username (login)</label>
									<Input value={editUsername} onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} onBlur={() => setEditSlug(editUsername)} className="h-10 rounded-xl font-bold text-xs" placeholder="username-login" />
								</div>
								<div className="space-y-1">
									<label className="text-[11px] font-black text-muted-foreground uppercase ml-1">Email</label>
									<Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="email@example.com" />
								</div>
								<div className="space-y-1">
									<label className="text-[11px] font-black text-muted-foreground uppercase ml-1">Username Profil (Slug)</label>
									<Input value={editSlug} onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))} className="h-10 rounded-xl font-bold text-xs" placeholder="username-profil" />
								</div>

								<div className="pt-2 border-t mt-2 space-y-2.5">
									<p className="text-[11px] font-black text-primary uppercase ml-1">Data Tambahan</p>
									<div className="space-y-1"><label className="text-[11px] font-black text-muted-foreground uppercase ml-1">No HP / WA</label><Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Contoh: 08123456789" /></div>
									<div className="space-y-1"><label className="text-[11px] font-black text-muted-foreground uppercase ml-1">No Identitas (KTP)</label><Input value={editIdentityNumber} onChange={(e) => setEditIdentityNumber(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="KTP / SIM" /></div>
									<div className="space-y-1"><label className="text-[11px] font-black text-muted-foreground uppercase ml-1">Tempat Lahir</label><Input value={editPlaceOfBirth} onChange={(e) => setEditPlaceOfBirth(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Contoh: Jakarta" /></div>
									<div className="space-y-1"><label className="text-[11px] font-black text-muted-foreground uppercase ml-1">Tanggal Lahir</label><Input value={editBirthDate} onChange={(e) => setEditBirthDate(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="YYYY-MM-DD" /></div>
									<div className="space-y-1"><label className="text-[11px] font-black text-muted-foreground uppercase ml-1">Alamat</label><Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Alamat lengkap" /></div>
									<div className="space-y-1"><label className="text-[11px] font-black text-muted-foreground uppercase ml-1">Nama Bank</label><Input value={editBankName} onChange={(e) => setEditBankName(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Contoh: BCA, Mandiri" /></div>
									<div className="space-y-1"><label className="text-[11px] font-black text-muted-foreground uppercase ml-1">No Rekening</label><Input value={editBankAccount} onChange={(e) => setEditBankAccount(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Nomor rekening" /></div>
									<div className="space-y-1"><label className="text-[11px] font-black text-muted-foreground uppercase ml-1">Kontak Darurat (Nama)</label><Input value={editEmergencyContactName} onChange={(e) => setEditEmergencyContactName(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Nama kontak darurat" /></div>
									<div className="space-y-1"><label className="text-[11px] font-black text-muted-foreground uppercase ml-1">Kontak Darurat (No HP)</label><Input value={editEmergencyContactPhone} onChange={(e) => setEditEmergencyContactPhone(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="No HP kontak darurat" /></div>
								</div>

								<div className="pt-2 border-t mt-2 space-y-2.5">
									<p className="text-[11px] font-black text-primary uppercase ml-1">Foto Profile</p>
									<div className="space-y-2">
										{staff.photoUrl && !editPhotoFile && (
											<div className="flex items-center gap-3">
												<img src={staff.photoUrl} alt="Profile" className="h-16 w-16 rounded-full object-cover border-2 border-primary/20" />
												<span className="text-xs text-muted-foreground">Foto saat ini</span>
											</div>
										)}
										{editPhotoFile && (
											<div className="flex items-center gap-3">
												<img src={URL.createObjectURL(editPhotoFile)} alt="Preview" className="h-16 w-16 rounded-full object-cover border-2 border-primary/20" />
												<Button type="button" variant="ghost" size="sm" className="text-xs text-destructive h-8" onClick={() => setEditPhotoFile(null)}>Hapus</Button>
											</div>
										)}
										<label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
											<Camera className="h-4 w-4" />
											<span>{editPhotoFile ? editPhotoFile.name : "Pilih file foto"}</span>
											<input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) setEditPhotoFile(file); }} />
										</label>
									</div>
								</div>

								<div className="pt-2 border-t mt-2 space-y-2.5">
									<p className="text-[11px] font-black text-primary uppercase ml-1">Password Akun (untuk login web)</p>
									<div className="space-y-1">
										<label className="text-[11px] font-black text-muted-foreground uppercase ml-1">Password Baru</label>
										<Input type="password" value={editNewPassword} onChange={(e) => setEditNewPassword(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Minimal 6 karakter" />
									</div>
								</div>
							</div>
							<div className="pt-2">
								<Button type="submit" className="w-full h-10 rounded-xl font-bold shadow-md text-xs" disabled={isSavingProfile}>
									{isSavingProfile ? <Clock className="h-4 w-4 animate-spin" /> : "SIMPAN PERUBAHAN"}
								</Button>
							</div>
						</form>
					)}
				</div>
			</div>

			{/* Pengaturan Akun */}
			<div className="space-y-2">
				<h3 className="flex items-center gap-1.5 px-2 font-bold uppercase tracking-wider text-[10px]">
					<ShieldCheck className="h-3 w-3 text-primary" />
					Pengaturan Akun
				</h3>
				<div className="rounded-xl border bg-card p-3 space-y-2.5">
					{requiresPinChange && (
						<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
							<p className="text-[10px] font-black uppercase tracking-wide">PIN default masih aktif</p>
							<p className="mt-1 text-[11px] font-medium">Untuk keamanan akun, ganti PIN 696969 dengan PIN baru milik Anda.</p>
						</div>
					)}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
								<KeyRound className="h-4 w-4" />
							</div>
							<div>
								<p className="font-bold text-xs">PIN Keamanan</p>
								<p className="text-[11px] text-muted-foreground uppercase">Gunakan PIN untuk absensi</p>
							</div>
						</div>
						<Button variant="outline" size="sm" className="rounded-lg font-bold text-[10px] h-8 px-3" onClick={() => setShowChangePin(!showChangePin)}>
							{showChangePin ? "BATAL" : requiresPinChange ? "GANTI SEKARANG" : "UBAH PIN"}
						</Button>
					</div>

					<AnimatePresence>
						{showChangePin && (
							<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t pt-3">
								<form className="space-y-3" onSubmit={async (e) => {
									e.preventDefault();
									if (newPin.length !== 6 || oldPin.length !== 6) { toast.error("PIN harus 6 digit"); return; }
									if (newPin === "696969") { toast.error("PIN baru tidak boleh sama dengan PIN default"); return; }
									setIsUpdatingPin(true);
									try {
										await updatePinMutation({ token: token!, oldPin, newPin });
										toast.success("PIN berhasil diperbarui!");
										setShowChangePin(false);
										setNewPin("");
										setOldPin("");
									} catch (err) {
										toast.error((err as any).message || "Gagal memperbarui PIN");
									} finally { setIsUpdatingPin(false); }
								}}>
									<div className="grid grid-cols-2 gap-3">
										<div className="space-y-1">
											<label className="text-[11px] font-black text-muted-foreground uppercase ml-1">PIN Lama</label>
											<Input type="password" maxLength={6} value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ""))} className="h-10 rounded-xl text-center font-bold tracking-widest text-xs" placeholder="••••••" />
										</div>
										<div className="space-y-1">
											<label className="text-[11px] font-black text-muted-foreground uppercase ml-1">PIN Baru</label>
											<Input type="password" maxLength={6} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} className="h-10 rounded-xl text-center font-bold tracking-widest text-xs" placeholder="••••••" />
										</div>
									</div>
									<Button type="submit" className="w-full h-10 rounded-xl font-bold text-xs" disabled={isUpdatingPin || newPin.length !== 6 || oldPin.length !== 6}>
										{isUpdatingPin ? <Clock className="h-4 w-4 animate-spin" /> : "SIMPAN PIN BARU"}
									</Button>
								</form>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</div>

			{/* Scan Wajah */}
			<div className="space-y-2">
				<h3 className="flex items-center gap-1.5 px-2 font-bold uppercase tracking-wider text-[10px]">
					<Camera className="h-3 w-3 text-violet-500" />
					Data Biometrik
				</h3>
				<div className="rounded-xl border bg-card p-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
								<Camera className="h-4 w-4" />
							</div>
							<div>
								<p className="font-bold text-xs">Scan Wajah</p>
								<p className="text-[11px] text-muted-foreground uppercase">Daftarkan / perbarui wajah untuk absensi</p>
							</div>
						</div>
						<Button
							variant="outline"
							size="sm"
							className="rounded-lg font-bold text-[10px] h-8 px-3 border-violet-200 text-violet-700 hover:bg-violet-50"
							onClick={() => navigate({ to: `/${username}/absensi`, search: { enroll: 1 } } as any)}
						>
							<Camera className="mr-1.5 h-3 w-3" />
							SCAN WAJAH
						</Button>
					</div>
				</div>
			</div>

			{/* Grup Telegram */}
			<div className="space-y-2">
				<h3 className="flex items-center gap-1.5 px-2 font-bold uppercase tracking-wider text-[10px]">
					<Bell className="h-3 w-3 text-sky-500" />
					Grup Telegram
				</h3>
				<div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
					<div className="flex items-start gap-3">
						<MessageCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
						<div className="flex-1 min-w-0">
							<p className="text-[10px] font-black uppercase tracking-wide text-sky-800">Gabung Grup Karyawan</p>
							<p className="mt-0.5 text-[11px] font-medium text-sky-700">Dapatkan pengumuman, jadwal, dan info terbaru dari tim.</p>
							<Button variant="outline" size="sm" className="mt-2 h-8 rounded-lg text-[10px] font-bold px-3 border-sky-300 text-sky-700 hover:bg-sky-100 hover:text-sky-800" onClick={() => window.open("https://t.me/addlist/076D_FFRNFw5ZWI1", "_blank")}>
								GABUNG GRUP
							</Button>
						</div>
					</div>
				</div>
			</div>

			{/* Telegram Bot */}
			<div className="space-y-2">
				<h3 className="flex items-center gap-1.5 px-2 font-bold uppercase tracking-wider text-[10px]">
					<Send className="h-3 w-3 text-sky-500" />
					Telegram Bot
				</h3>
				<div className="rounded-xl border bg-card p-3">
					{loadingTelegram ? (
						<div className="animate-pulse space-y-2">
							<div className="flex items-center gap-3">
								<div className="h-9 w-9 rounded-lg bg-muted" />
								<div className="space-y-1 flex-1">
									<div className="h-3 w-28 rounded bg-muted" />
									<div className="h-2.5 w-20 rounded bg-muted" />
								</div>
							</div>
							<div className="h-3 w-48 rounded bg-muted" />
							<div className="h-3 w-32 rounded bg-muted" />
						</div>
					) : telegramStatus ? (
						<>
							<div className="flex items-center gap-3 mb-3">
								<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
									<Send className="h-4 w-4" />
								</div>
								<div>
									<p className="font-bold text-xs">Telegram Bot</p>
									<p className="text-[11px] text-muted-foreground uppercase">Absensi via Telegram</p>
								</div>
							</div>
							<div className="flex items-center gap-1.5 mb-2">
								<span className="h-2 w-2 rounded-full bg-emerald-500" />
								<span className="text-xs font-bold text-emerald-700">Terhubung sebagai {telegramStatus.employee_name || staff.name}</span>
							</div>
							{telegramStatus.registered_at && (
								<p className="text-[10px] text-muted-foreground mb-3">
									Tergabung sejak {new Date(telegramStatus.registered_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
								</p>
							)}
							<div className="rounded-lg bg-muted/50 p-2.5 mb-3">
								<p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Tombol Cepat</p>
								<div className="flex flex-wrap gap-1.5">
									{[
										{ label: "Absen Masuk", icon: LogIn, action: "https://t.me/yumihrdbot?start=checkin" },
										{ label: "Absen Keluar", icon: LogOut, action: "https://t.me/yumihrdbot?start=checkout" },
										{ label: "Status Saya", icon: ClipboardList, action: "https://t.me/yumihrdbot?start=status" },
									].map((btn) => (
										<button
											key={btn.label}
											onClick={() => window.open(btn.action, "_blank")}
											className="inline-flex min-h-11 items-center gap-1.5 rounded-[14px] bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary shadow-sm hover:bg-primary/20 transition-colors cursor-pointer border-0"
										>
											<btn.icon aria-hidden="true" className="h-3.5 w-3.5" />
											<span>{btn.label}</span>
										</button>
									))}
								</div>
							</div>
							<Button
								variant="outline"
								size="sm"
								className="w-full rounded-lg text-[10px] font-bold h-8"
								onClick={() => window.open("https://t.me/yumihrdbot", "_blank")}
							>
								<ExternalLink className="mr-1.5 h-3 w-3" />
								Buka Bot Telegram
							</Button>
						</>
					) : (
						<>
							<div className="flex items-center gap-3 mb-3">
								<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
									<Send className="h-4 w-4" />
								</div>
								<div>
									<p className="font-bold text-xs">Telegram Bot</p>
									<p className="text-[11px] text-muted-foreground uppercase">Absensi via Telegram</p>
								</div>
							</div>
							<div className="flex items-center gap-1.5 mb-3">
								<span className="h-2 w-2 rounded-full bg-red-500" />
								<span className="text-xs font-bold text-red-600">Belum terhubung</span>
							</div>
							{telegramCode && (
								<div className="rounded-lg bg-sky-50 border border-sky-200 p-3 mb-3 text-center">
									<p className="flex items-center justify-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-sky-700 mb-1.5"><KeyRound aria-hidden="true" className="h-3.5 w-3.5" /> Kode Registrasi</p>
									<p className="text-2xl font-black font-mono tracking-widest text-sky-900 select-all">{telegramCode}</p>
								</div>
							)}
							<div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 mb-3">
								<p className="text-[11px] font-black uppercase tracking-wider text-amber-800 mb-1.5">Cara Hubungkan:</p>
								<ol className="space-y-1 text-[11px] text-amber-900 list-decimal list-inside">
									<li>Buka bot Telegram di bawah</li>
									<li>Klik tombol <b>Daftar / Hubungkan</b> di bot</li>
									<li>Masukkan kode: <code className="rounded bg-amber-100 px-1 py-0.5 font-mono font-bold text-[10px]">{telegramCode || "DT-XXXX"}</code></li>
								</ol>
							</div>
							{telegramCode && (
								<Button
									variant="default"
									size="sm"
									className="w-full rounded-lg text-[10px] font-bold h-8 mb-3 bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-600 hover:to-blue-700 shadow-sm"
									onClick={() => window.open("https://t.me/yumihrdbot", "_blank")}
								>
									<ExternalLink className="mr-1.5 h-3 w-3" />
									Hubungkan Bot Telegram
								</Button>
							)}
							<Button
								variant="outline"
								size="sm"
								className="w-full rounded-lg text-[10px] font-bold h-8"
								onClick={() => window.open("https://t.me/yumihrdbot", "_blank")}
							>
								<ExternalLink className="mr-1.5 h-3 w-3" />
								Buka Bot Telegram
							</Button>
						</>
					)}
				</div>
			</div>

			{/* Logout */}
			<div className="space-y-2 pb-8">
				<div className="rounded-xl border border-destructive/20 bg-destructive/[0.03] p-3">
					<Button
						variant="destructive"
						size="sm"
						className="w-full h-10 rounded-xl font-bold text-xs shadow-sm"
						onClick={async () => {
							await logoutYumi();
							window.location.replace("/login");
						}}
					>
						<LogOut className="mr-2 h-4 w-4" />
						KELUAR / LOGOUT
					</Button>
					<p className="mt-1.5 text-center text-[11px] font-medium text-destructive/60">
						Akhiri sesi dan kembali ke halaman login
					</p>
				</div>
			</div>

			{/* Onboarding Overlay */}
			<AnimatePresence>
				{showOnboarding && (() => {
					return (
						<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
							<motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="relative w-full sm:max-w-md bg-card border rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 pb-8 sm:pb-6 shadow-2xl max-h-[85vh] overflow-y-auto">
								{isCelebrating && (
									<div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl z-10">
										{Array.from({ length: 12 }).map((_, i) => (
											<motion.div key={i} className="absolute h-2 w-2 rounded-full"
												style={{ left: `${10 + Math.random() * 80}%`, top: `${10 + Math.random() * 40}%`, background: ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"][i % 5] }}
												initial={{ opacity: 1, scale: 1, y: 0 }}
												animate={{ opacity: 0, scale: 0, y: -80 - Math.random() * 120, x: (Math.random() - 0.5) * 60, rotate: Math.random() * 360 }}
												transition={{ duration: 0.6, ease: "easeOut" }}
											/>
										))}
										<motion.div className="absolute inset-0 flex items-center justify-center"
											initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1.5, opacity: [0, 1, 1, 0] }} transition={{ duration: 0.6 }}>
											<div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30">
												<Check className="h-8 w-8 text-white" />
											</div>
										</motion.div>
									</div>
								)}
								<button aria-label="Tutup panduan awal" onClick={dismissOnboarding} className="absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-[14px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
									<X className="h-4 w-4" />
								</button>

								<div className="mb-5 mt-2">
									<div className="flex items-center justify-between mb-1.5">
										<span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
											{completedSteps === 0 ? 'Baru Mulai' : completedSteps === 1 ? '1 Langkah Selesai' : 'Selesai!'}
										</span>
										<span className="text-[11px] font-bold text-muted-foreground">{completedSteps}/2</span>
									</div>
									<div className="h-1.5 rounded-full bg-muted overflow-hidden">
										<motion.div initial={{ width: "0%" }} animate={{ width: `${(completedSteps / 2) * 100}%` }} transition={{ type: "spring", damping: 20, stiffness: 200 }} className={`h-full rounded-full ${completedSteps === 2 ? "bg-emerald-500" : "bg-primary"}`} />
									</div>
								</div>

								<div className="text-center mb-6">
									<motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", damping: 15 }} className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
										<Sparkles aria-hidden="true" className="h-7 w-7 text-primary" />
									</motion.div>
									<h2 className="text-lg sm:text-xl font-black tracking-tight">Selamat Datang!</h2>
									<p className="text-xs text-muted-foreground mt-1">Selesaikan 2 langkah berikut untuk memulai.</p>
								</div>

								{completedSteps >= 1 ? (
									<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 mb-3">
										<div className="flex items-center gap-3">
											<div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white"><Check className="h-4 w-4" /></div>
											<div><p className="font-bold text-sm text-emerald-800">Data Diri</p><p className="text-[11px] text-emerald-600">Sudah dilengkapi</p></div>
										</div>
									</div>
								) : (
									<motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="rounded-xl border p-3.5 mb-3">
										<div className="flex items-start gap-3">
											<div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm sm:text-base font-black text-primary">1</div>
											<div className="flex-1 min-w-0">
												<p className="font-bold text-sm">Lengkapi Data Diri</p>
												<p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">Isi No HP, alamat, dan data lainnya agar administrasi lebih mudah.</p>
												<Button size="sm" className="mt-2 h-8 rounded-lg text-[10px] font-bold px-3" onClick={handleLengkapiData}>LENGKAPI SEKARANG</Button>
											</div>
										</div>
									</motion.div>
								)}

								{completedSteps >= 2 ? (
									<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 mb-4">
										<div className="flex items-center gap-3">
											<div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white"><Check className="h-4 w-4" /></div>
											<div><p className="font-bold text-sm text-emerald-800">Grup Telegram</p><p className="text-[11px] text-emerald-600">Sudah bergabung</p></div>
										</div>
									</div>
								) : (
									<motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="rounded-xl border p-3.5 mb-4">
										<div className="flex items-start gap-3">
											<div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sm sm:text-base font-black text-sky-600">2</div>
											<div className="flex-1 min-w-0">
												<p className="font-bold text-sm">Gabung Grup Telegram</p>
												<p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">Dapatkan informasi terbaru, pengumuman, dan update dari tim.</p>
												<Button variant="outline" size="sm" className="mt-2 h-8 rounded-lg text-[10px] font-bold px-3" onClick={handleGabungGrup}>GABUNG GRUP</Button>
											</div>
										</div>
									</motion.div>
								)}

								<div className="text-center">
									<button onClick={dismissOnboarding} className="text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors">Nanti Saja</button>
								</div>
							</motion.div>
						</motion.div>
					);
				})()}
			</AnimatePresence>
		</div>
	);
}
