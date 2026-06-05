import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Fingerprint, UserCheck, ShieldCheck, AlertCircle } from "lucide-react";
import { useYumiAuth, listPublicYumiUsers, loginWithYumiPin, type YumiPublicUser } from "@yumipos/web-shared";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/login")({
	component: KaryawanLoginPage,
});

function KaryawanLoginPage() {
	const navigate = useNavigate();
	const { login, isAuthenticated } = useYumiAuth();
	const [users, setUsers] = useState<YumiPublicUser[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [nameQuery, setNameQuery] = useState("");
	const [resolvedUser, setResolvedUser] = useState<YumiPublicUser | null>(null);
	const [resolveError, setResolveError] = useState("");
	const [pin, setPin] = useState(["", "", "", "", "", ""]);
	const [isVerifying, setIsVerifying] = useState(false);
	const pinIndexes = [0, 1, 2, 3, 4, 5];
	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
	const nameRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isAuthenticated) {
			navigate({ to: "/" as any, replace: true });
			return;
		}
	}, [isAuthenticated, navigate]);

	useEffect(() => {
		let active = true;
		void (async () => {
			try {
				const nextUsers = await listPublicYumiUsers();
				if (active) setUsers(nextUsers);
			} catch {
				if (active) toast.error("Gagal memuat daftar karyawan");
			} finally {
				if (active) setIsLoading(false);
			}
		})();
		return () => { active = false; };
	}, []);

	// Auto-focus name input on mount
	useEffect(() => {
		if (!isLoading) nameRef.current?.focus();
	}, [isLoading]);

	// Resolve user by name/username when typing stops
	const tryResolveUser = (keyword: string) => {
		const trimmed = keyword.trim().toLowerCase();
		if (!trimmed) {
			setResolvedUser(null);
			setResolveError("");
			return;
		}
		const matches = users.filter((u) =>
			[u.name, u.slug, u.username]
				.filter(Boolean)
				.some((v) => v!.toLowerCase() === trimmed)
		);
		if (matches.length === 0) {
			setResolvedUser(null);
			setResolveError("Karyawan tidak ditemukan");
		} else if (matches.length > 1) {
			setResolvedUser(null);
			setResolveError("Nama tidak unik — gunakan username");
		} else {
			setResolvedUser(matches[0]);
			setResolveError("");
		}
	};

	const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = e.target.value;
		setNameQuery(val);
		setPin(["", "", "", "", "", ""]);
		// Clear resolved on every keystroke
		setResolvedUser(null);
		setResolveError("");
	};

	const handleNameBlur = () => {
		if (nameQuery.trim()) {
			tryResolveUser(nameQuery);
		}
	};

	const handleNameKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			tryResolveUser(nameQuery);
			const firstEmpty = pin.findIndex((d) => !d);
			if (firstEmpty >= 0) {
				inputRefs.current[firstEmpty]?.focus();
			}
		}
	};

	const handlePinChange = (index: number, value: string) => {
		if (isVerifying) return;
		if (value && !/^\d$/.test(value)) return;

		const newPin = [...pin];
		newPin[index] = value;
		setPin(newPin);

		if (value && index < 5) {
			inputRefs.current[index + 1]?.focus();
		}
	};

	const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
		if (e.key === "Backspace") {
			if (pin[index]) {
				const newPin = [...pin];
				newPin[index] = "";
				setPin(newPin);
			} else if (index === 0) {
				nameRef.current?.focus();
			} else if (index > 0) {
				inputRefs.current[index - 1]?.focus();
			}
		}
	};

	const handlePinPaste = (e: React.ClipboardEvent) => {
		e.preventDefault();
		if (isVerifying) return;
		const data = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
		if (!data) return;
		const newPin = [...pin];
		for (let i = 0; i < data.length; i++) {
			newPin[i] = data[i];
		}
		setPin(newPin);
		const nextIdx = Math.min(data.length, 5);
		inputRefs.current[nextIdx]?.focus();
	};

	const submitPin = async () => {
		const pinStr = pin.join("");
		if (pinStr.length !== 6 || isVerifying) return;

		// Resolve user if not yet resolved
		if (!resolvedUser) {
			tryResolveUser(nameQuery);
			if (!resolvedUser) return;
		}

		setIsVerifying(true);
		try {
			const result = await loginWithYumiPin(resolvedUser!._id, pinStr);
			login(result.token);
			toast.success(`Selamat datang, ${result.user.name}`);
			const slug = result.user.slug || result.user._id;
			navigate({ to: `/${slug}/` as any, replace: true });
		} catch (err: any) {
			toast.error(err?.message || "Gagal masuk");
			setPin(["", "", "", "", "", ""]);
			inputRefs.current[0]?.focus();
		} finally {
			setIsVerifying(false);
		}
	};

	// Auto-submit when PIN fully entered
	useEffect(() => {
		if (pin.every((d) => d) && !isVerifying) {
			submitPin();
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pin.join(""), resolvedUser]);

	const isPinComplete = pin.every((d) => d);
	const canInputPin = resolvedUser && !resolveError;

	return (
		<div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-sky-50 via-white to-blue-50 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
			<motion.div
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				className="w-full max-w-sm"
			>
				<div className="rounded-2xl border border-border/60 bg-card p-6 shadow-lg">
					{/* Header */}
					<div className="mb-5 text-center">
						<div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
							<Fingerprint className="h-6 w-6 text-primary" />
						</div>
						<h1 className="text-lg font-bold text-foreground">Absen Karyawan</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							Ketik nama atau username, lalu masukkan PIN
						</p>
					</div>

					{/* Name/Username Input */}
					<div className="relative mb-3">
						<div className="relative">
							<input
								ref={nameRef}
								type="text"
								placeholder="Nama lengkap atau username..."
								value={nameQuery}
								onChange={handleNameChange}
								onBlur={handleNameBlur}
								onKeyDown={handleNameKeyDown}
								disabled={isLoading}
								className={`w-full rounded-xl border bg-background py-2.5 pl-3 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:ring-1 ${
									resolveError
										? "border-red-300 focus:border-red-400 focus:ring-red-200"
										: resolvedUser
											? "border-emerald-300 focus:border-emerald-400 focus:ring-emerald-200"
											: "border-border/60 focus:border-primary/50 focus:ring-primary/20"
								}`}
							/>
						</div>
						{/* Status indicator */}
						{resolvedUser && !resolveError && (
							<div className="mt-1.5 flex items-center gap-1.5">
								<div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100">
									<UserCheck className="h-3 w-3 text-emerald-600" />
								</div>
								<span className="text-xs font-medium text-emerald-600">{resolvedUser.name}</span>
							</div>
						)}
						{resolveError && (
							<div className="mt-1.5 flex items-center gap-1.5">
								<AlertCircle className="h-3.5 w-3.5 text-red-500" />
								<span className="text-xs font-medium text-red-500">{resolveError}</span>
							</div>
						)}
					</div>

					{/* PIN Input */}
					<div className="text-center">
						<div className="mb-3 flex items-center justify-center gap-2.5">
							{pinIndexes.map((i) => (
								<input
									key={i}
									ref={(el) => { inputRefs.current[i] = el; }}
									type="password"
									inputMode="numeric"
									maxLength={1}
									value={pin[i]}
									onChange={(e) => handlePinChange(i, e.target.value)}
									onKeyDown={(e) => handlePinKeyDown(i, e)}
									onPaste={i === 0 ? handlePinPaste : undefined}
									disabled={!canInputPin || isVerifying}
									className={`h-11 w-11 rounded-xl border text-center text-lg font-bold outline-none transition-all
										${isVerifying
											? "border-muted bg-muted/30 text-muted-foreground"
											: canInputPin
												? "border-primary/40 bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
												: "border-muted/60 bg-muted/20 text-muted-foreground/30"
										}
										${pin[i] ? "border-primary/60 shadow-sm" : ""}
									`}
								/>
							))}
						</div>
						<p className="text-xs text-muted-foreground">
							{!canInputPin
								? resolveError
									? "Perbaiki nama/username terlebih dahulu"
									: "Ketik nama atau username, tekan Enter"
								: isVerifying
									? "Memverifikasi..."
									: isPinComplete
										? ""
										: "Masukkan PIN 6 digit"}
						</p>
					</div>
				</div>

				{/* Footer */}
				<p className="mt-4 text-center text-xs text-muted-foreground/50">
					Djiwa Tentram — Kehadiran Karyawan
				</p>
			</motion.div>
		</div>
	);
}
