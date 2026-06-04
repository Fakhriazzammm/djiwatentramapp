import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Search, Fingerprint, ShieldCheck, UserCheck } from "lucide-react";
import { useYumiAuth } from "@yumipos/web-shared";
import { toast } from "sonner";
import { listPublicYumiUsers, loginWithYumiPin, type YumiPublicUser } from "@yumipos/web-shared";

export const Route = createLazyFileRoute("/login")({
	component: KaryawanLoginPage,
});

function KaryawanLoginPage() {
	const navigate = useNavigate();
	const { login, isAuthenticated } = useYumiAuth();
	const [users, setUsers] = useState<YumiPublicUser[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedUser, setSelectedUser] = useState<YumiPublicUser | null>(null);
	const [pin, setPin] = useState(["", "", "", "", "", ""]);
	const [isVerifying, setIsVerifying] = useState(false);
	const pinIndexes = [0, 1, 2, 3, 4, 5];
	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
	const searchRef = useRef<HTMLInputElement>(null);

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

	// Auto-focus search on mount
	useEffect(() => {
		searchRef.current?.focus();
	}, []);

	const filteredUsers = useMemo(() => {
		const keyword = searchQuery.trim().toLowerCase();
		if (!keyword) return users;
		return users.filter((u) =>
			[u.name, u.slug, u.username, u.initial]
				.filter(Boolean)
				.some((v) => v!.toLowerCase().includes(keyword))
		);
	}, [users, searchQuery]);

	// Auto-select if only one match
	const exactMatch = useMemo(() => {
		return filteredUsers.length === 1 ? filteredUsers[0] : null;
	}, [filteredUsers]);

	const activeUser = selectedUser || exactMatch;

	// Focus first empty PIN digit when user is selected
	useEffect(() => {
		if (activeUser) {
			const firstEmpty = pin.findIndex((d) => !d);
			if (firstEmpty >= 0) {
				inputRefs.current[firstEmpty]?.focus();
			}
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeUser?._id]);

	const handlePinChange = (index: number, value: string) => {
		if (isVerifying) return;
		// Only allow digits
		if (value && !/^\d$/.test(value)) return;

		const newPin = [...pin];
		newPin[index] = value;
		setPin(newPin);

		// Auto-advance to next field
		if (value && index < 5) {
			inputRefs.current[index + 1]?.focus();
		}
	};

	const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
		if (e.key === "Backspace") {
			if (pin[index]) {
				// Clear current digit
				const newPin = [...pin];
				newPin[index] = "";
				setPin(newPin);
			} else if (index > 0) {
				// Move back
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
		// Focus next empty or last
		const nextIdx = Math.min(data.length, 5);
		inputRefs.current[nextIdx]?.focus();
	};

	const submitPin = async () => {
		const pinStr = pin.join("");
		if (pinStr.length !== 6 || !activeUser || isVerifying) return;

		setIsVerifying(true);
		try {
			const result = await loginWithYumiPin(activeUser._id, pinStr);
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
		if (pin.every((d) => d) && activeUser && !isVerifying) {
			submitPin();
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pin.join(""), activeUser?._id]);

	const handleSelectUser = (user: YumiPublicUser) => {
		setSelectedUser(user);
		setSearchQuery(user.name);
		setPin(["", "", "", "", "", ""]);
	};

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(e.target.value);
		setSelectedUser(null);
		setPin(["", "", "", "", "", ""]);
	};

	const isPinComplete = pin.every((d) => d);

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
							Cari nama, lalu masukkan PIN
						</p>
					</div>

					{/* Search */}
					<div className="relative mb-3">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<input
							ref={searchRef}
							type="text"
							placeholder="Cari nama atau username..."
							value={searchQuery}
							onChange={handleSearchChange}
							className="w-full rounded-xl border border-border/60 bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
						/>
					</div>

					{/* User list (compact, always visible) */}
					<div className="mb-4 max-h-[180px] overflow-y-auto rounded-xl border border-border/40 bg-background/50">
						{isLoading ? (
							<div className="space-y-0.5 p-2">
								{[1, 2, 3].map((i) => (
									<div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
										<div className="h-8 w-8 animate-pulse rounded-full bg-muted-foreground/10" />
										<div className="h-3.5 w-24 animate-pulse rounded bg-muted-foreground/10" />
									</div>
								))}
							</div>
						) : filteredUsers.length === 0 ? (
							<div className="py-6 text-center text-xs text-muted-foreground">
								{searchQuery ? "Karyawan tidak ditemukan" : "Belum ada karyawan terdaftar"}
							</div>
						) : (
							<div className="flex flex-col py-1">
								{filteredUsers.map((user) => {
									const isActive = activeUser?._id === user._id;
									return (
										<button
											key={user._id}
											onClick={() => handleSelectUser(user)}
											className={`flex items-center gap-3 px-3 py-2.5 text-left transition-all hover:bg-muted/60 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/20 ${
												isActive ? "bg-primary/5 font-semibold" : ""
											}`}
										>
											<div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow-sm ${
												isActive ? "from-primary to-sky-500 ring-2 ring-primary/30" : "from-primary/70 to-sky-400/70"
											}`}>
												{isActive ? (
													<UserCheck className="h-4 w-4" />
												) : (
													user.initial || user.name.charAt(0).toUpperCase()
												)}
											</div>
											<div className="min-w-0 flex-1">
												<div className={`text-sm truncate ${
													isActive ? "text-foreground" : "text-muted-foreground"
												}`}>
													{user.name}
												</div>
												{user.slug && (
													<div className="text-[11px] text-muted-foreground/60 truncate">
														@{user.slug}
													</div>
												)}
											</div>
											{isActive && (
												<ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
											)}
										</button>
									);
								})}
							</div>
						)}
					</div>

					{/* PIN Input — always visible */}
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
									disabled={!activeUser || isVerifying}
									className={`h-11 w-11 rounded-xl border text-center text-lg font-bold outline-none transition-all
										${isVerifying
											? "border-muted bg-muted/30 text-muted-foreground"
											: activeUser
												? "border-primary/40 bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
												: "border-muted/60 bg-muted/20 text-muted-foreground/30"
										}
										${pin[i] ? "border-primary/60 shadow-sm" : ""}
									`}
								/>
							))}
						</div>
						<p className="text-xs text-muted-foreground">
							{!activeUser
								? "Pilih nama dari daftar di atas"
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
