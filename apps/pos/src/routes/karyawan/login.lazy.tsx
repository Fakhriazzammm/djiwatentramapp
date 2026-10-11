import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	listPublicYumiUsers,
	loginWithYumiPin,
	useYumiAuth,
	type YumiPublicUser,
} from "@yumipos/web-shared";
import { IdentityPicker } from "@/components/auth/identity-picker";
import { LoginShell } from "@/components/auth/login-shell";
import { OneTimeCode, type OneTimeCodeStatus } from "@/components/ui/OneTimeCode";

export const Route = createLazyFileRoute("/karyawan/login")({
	component: KaryawanLoginPage,
});

function KaryawanLoginPage() {
	const navigate = useNavigate();
	const { login, isAuthenticated, user } = useYumiAuth();
	const [users, setUsers] = useState<YumiPublicUser[]>([]);
	const [isUsersLoading, setIsUsersLoading] = useState(true);
	const [usersError, setUsersError] = useState<string | null>(null);

	const [selectedUser, setSelectedUser] = useState<YumiPublicUser | null>(null);
	const [pin, setPin] = useState("");
	const [isVerifying, setIsVerifying] = useState(false);
	const [otpStatus, setOtpStatus] = useState<OneTimeCodeStatus>("idle");
	const submissionPending = useRef(false);

	const loadUsers = useCallback(async (refresh = false) => {
		setIsUsersLoading(true);
		setUsersError(null);
		try {
			const nextUsers = await listPublicYumiUsers(refresh ? { forceRefresh: true } : undefined);
			setUsers(nextUsers);
		} catch (error) {
			console.error("Failed to load public users:", error);
			setUsersError("Server tidak menjawab. Cek koneksi, lalu coba lagi.");
		} finally {
			setIsUsersLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadUsers();
	}, [loadUsers]);

	useEffect(() => {
		if (!isAuthenticated) return;
		// "/" is no longer a landing page, so a signed-in employee goes to
		// their own page instead of bouncing through the router root
		const slug = user?.slug || user?.username || user?._id;
		navigate({ to: (slug ? `/karyawan/${slug}` : "/menu") as any, replace: true });
	}, [isAuthenticated, user, navigate]);

	const handleSelectUser = (user: YumiPublicUser) => {
		setSelectedUser(user);
		setPin("");
		setOtpStatus("idle");
	};

	const handleBack = () => {
		setSelectedUser(null);
		setPin("");
		setOtpStatus("idle");
	};

	const handleSubmit = async () => {
		if (!/^[0-9]{6}$/.test(pin) || !selectedUser || submissionPending.current) return;
		submissionPending.current = true;

		setIsVerifying(true);
		setOtpStatus("checking");
		try {
			const result = await loginWithYumiPin(selectedUser._id, pin);

			// only a real success may draw the "Verified" capsule
			setOtpStatus("ok");
			login(result.token);

			toast.success(`Selamat datang, ${result.user.name}`);
			const slug = result.user.slug || result.user._id;
			navigate({ to: `/karyawan/${slug}` as any, replace: true });
		} catch (err: any) {
			toast.error(err.message || "PIN salah");
			setPin("");
			setOtpStatus("error");
			window.setTimeout(() => setOtpStatus("idle"), 1300);
		} finally {
			submissionPending.current = false;
			setIsVerifying(false);
		}
	};

	useEffect(() => {
		if (pin.length === 6 && !isVerifying) handleSubmit();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pin, isVerifying]);

	if (selectedUser) {
		return (
			<LoginShell
				accent="blue"
				roleLabel="Verifikasi PIN"
				title={selectedUser.name}
				subtitle="Masukkan 6 digit PIN kamu."
				onBack={handleBack}
				hero={
					<div className="mt-1 flex items-center gap-3">
						<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-black text-primary">
							{selectedUser.initial}
						</div>
					</div>
				}
			>
				<div className="mt-8 flex flex-col items-center gap-4">
					<OneTimeCode
						value={pin}
						onChange={setPin}
						status={otpStatus}
						disabled={isVerifying}
						autoFocus
						label="Masukkan 6 digit PIN"
					/>
					{isVerifying ? (
						<p
							role="status"
							className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
						>
							Memproses…
						</p>
					) : otpStatus === "error" ? (
						<p className="text-[11px] font-bold uppercase tracking-widest text-destructive">
							PIN salah, coba lagi.
						</p>
					) : null}
				</div>
			</LoginShell>
		);
	}

	return (
		<LoginShell
			accent="blue"
			roleLabel="Karyawan"
			title="Absen Karyawan"
			subtitle="Pilih nama kamu untuk masuk atau pulang."
		>
			<IdentityPicker
				accent="blue"
				recentKey="karyawan"
				noun="karyawan"
				users={users}
				isLoading={isUsersLoading}
				error={usersError}
				onRetry={() => void loadUsers(true)}
				onSelect={handleSelectUser}
			/>
		</LoginShell>
	);
}
