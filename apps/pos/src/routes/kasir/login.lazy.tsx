import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { listPublicYumiUsers, loginWithYumiPin, type YumiPublicUser } from "@/lib/yumi-auth-client";
import { IdentityPicker } from "@/components/auth/identity-picker";
import { LoginShell } from "@/components/auth/login-shell";
import { startGoogleLogin } from "@djiwaapps/web-shared/lib/staff-google";
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
			<div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true"><span className="h-px flex-1 bg-border" />atau<span className="h-px flex-1 bg-border" /></div>
			<button
				type="button"
				onClick={() => startGoogleLogin("login", "/menu")}
				className="mt-4 flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-background text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
			>
				<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" /><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>
				Masuk dengan Google
			</button>
		</LoginShell>
	);
}
