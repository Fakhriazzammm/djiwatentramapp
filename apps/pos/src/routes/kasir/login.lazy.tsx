import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { listPublicYumiUsers, loginWithYumiPin, type YumiPublicUser } from "@/lib/yumi-auth-client";
import { IdentityPicker } from "@/components/auth/identity-picker";
import { LoginShell } from "@/components/auth/login-shell";
import { OneTimeCode, type OneTimeCodeStatus } from "@/components/ui/OneTimeCode";
import { getKasirLoginErrorMessage } from "@/lib/kasir-login-utils";

export const Route = createLazyFileRoute("/kasir/login")({
	component: KasirLoginPage,
});

function KasirLoginPage() {
	const navigate = useNavigate();
	const { login, isAuthenticated } = useYumiAuth();
	const [users, setUsers] = useState<YumiPublicUser[]>([]);
	const [isUsersLoading, setIsUsersLoading] = useState(true);
	const [usersError, setUsersError] = useState<string | null>(null);

	const [selectedUser, setSelectedUser] = useState<YumiPublicUser | null>(null);
	const [pin, setPin] = useState("");
	const [isVerifying, setIsVerifying] = useState(false);
	const [pinError, setPinError] = useState<string | null>(null);
	// the caller's verdict on the code; OneTimeCode only draws it
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
			// the roster is the whole screen here: a toast that disappears would
			// leave the cashier guessing between an empty roster and a dead network
			setUsersError("Server tidak menjawab. Cek koneksi terminal, lalu coba lagi.");
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
		setPinError(null);
		setOtpStatus("idle");
	};

	const handleBack = () => {
		setSelectedUser(null);
		setPin("");
		setPinError(null);
		setOtpStatus("idle");
	};

	const handlePinChange = (nextPin: string) => {
		if (pinError) setPinError(null);
		setPin(nextPin);
	};

	const handleSubmitPin = async () => {
		if (!/^[0-9]{6}$/.test(pin) || !selectedUser || submissionPending.current) return;
		submissionPending.current = true;

		setIsVerifying(true);
		setPinError(null);
		setOtpStatus("checking");
		try {
			const result = await loginWithYumiPin(selectedUser._id, pin);

			// only a real success may draw the "Verified" capsule
			setOtpStatus("ok");
			login(result.token);

			toast.success(`Selamat datang, ${result.user.name}`);
			setPin("");
			navigate({ to: "/menu" as any, replace: true });
		} catch (err: unknown) {
			const message = getKasirLoginErrorMessage(err);
			toast.error(message);
			setPin("");
			setPinError(message);
			// let the row shiver and drain, then hand it back empty
			setOtpStatus("error");
			window.setTimeout(() => setOtpStatus("idle"), 1300);
		} finally {
			submissionPending.current = false;
			setIsVerifying(false);
		}
	};

	// Auto-submit when pin reaches 6 digits
	useEffect(() => {
		if (pin.length === 6 && !isVerifying && !pinError) {
			handleSubmitPin();
		}
	}, [pin, isVerifying, pinError]);

	// Redirect when already authenticated
	useEffect(() => {
		if (isAuthenticated) {
			navigate({ to: "/menu" as any, replace: true });
		}
	}, [isAuthenticated, navigate]);

	if (selectedUser) {
		return (
			<LoginShell
				accent="amber"
				roleLabel="Verifikasi PIN"
				title={selectedUser.name}
				subtitle="Masukkan 6 digit PIN kamu."
				onBack={handleBack}
				hero={
					<div className="mt-1 flex items-center gap-3">
						<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-2xl font-black text-amber-600">
							{selectedUser.initial}
						</div>
					</div>
				}
			>
				<div className="mt-8 flex flex-col items-center gap-4">
					<OneTimeCode
						value={pin}
						onChange={handlePinChange}
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
						<p className="max-w-xs text-center text-xs font-medium leading-relaxed text-destructive">
							{pinError || "PIN salah, coba lagi."}
						</p>
					) : null}
					<button
						type="button"
						onClick={() => void handleSubmitPin()}
						disabled={pin.length !== 6 || isVerifying}
						className="mt-2 h-11 w-full max-w-[280px] rounded-xl bg-amber-500 px-5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
					>
						{isVerifying ? "Memproses…" : "Masuk"}
					</button>
					<p className="text-center text-xs text-muted-foreground">
						PIN tidak bisa digunakan? Hubungi admin outlet untuk reset.
					</p>
				</div>
			</LoginShell>
		);
	}

	return (
		<LoginShell
			accent="amber"
			roleLabel="Kasir"
			title="Login Kasir"
			subtitle="Pilih nama kamu untuk mulai shift."
		>
			<IdentityPicker
				accent="amber"
				recentKey="kasir"
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
