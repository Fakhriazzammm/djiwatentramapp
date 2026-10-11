import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { listPublicYumiUsers, loginWithYumiPin, type YumiPublicUser } from "@/lib/yumi-auth-client";
import { IdentityPicker } from "@/components/auth/identity-picker";
import { LoginShell } from "@/components/auth/login-shell";
import { OneTimeCode, type OneTimeCodeStatus } from "@/components/ui/OneTimeCode";

export const Route = createLazyFileRoute("/admin/login")({
	component: AdminLoginPage,
});

function AdminLoginPage() {
	const navigate = useNavigate();
	const { login, isAuthenticated, isAdmin } = useYumiAuth();
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

	const handleSubmitPin = async () => {
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
			setPin("");
			navigate({ to: "/admin" as any, replace: true });
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

	// Auto-submit when pin reaches 6 digits
	useEffect(() => {
		if (pin.length === 6 && !isVerifying) {
			handleSubmitPin();
		}
	}, [pin, isVerifying]);

	// Redirect when already authenticated
	useEffect(() => {
		if (isAuthenticated) {
			if (isAdmin) {
				navigate({ to: "/admin" as any, replace: true });
			} else {
				navigate({ to: "/menu" as any, replace: true });
			}
		}
	}, [isAuthenticated, isAdmin, navigate]);

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
			roleLabel="Admin"
			title="Login Admin"
			subtitle="Akses dashboard operasional & keuangan."
		>
			<IdentityPicker
				accent="blue"
				recentKey="admin"
				noun="akun"
				emptyHint="Belum ada akun yang bisa dipakai. Tambahkan karyawan dari Admin → Karyawan, lalu muat ulang."
				users={users}
				isLoading={isUsersLoading}
				error={usersError}
				onRetry={() => void loadUsers(true)}
				onSelect={handleSelectUser}
			/>
		</LoginShell>
	);
}
