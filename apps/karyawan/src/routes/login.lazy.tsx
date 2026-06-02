import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Search, Fingerprint, ShieldCheck } from "lucide-react";
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
	const [selectedUser, setSelectedUser] = useState<YumiPublicUser | null>(null);
	const [pin, setPin] = useState("");
	const [isVerifying, setIsVerifying] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

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

	const filteredUsers = useMemo(() => {
		const keyword = searchQuery.trim().toLowerCase();
		if (!keyword) return users;
		return users.filter((u) =>
			[u.name, u.slug, u.username, u.initial]
				.filter(Boolean)
				.some((v) => v!.toLowerCase().includes(keyword))
		);
	}, [users, searchQuery]);

	const handlePinDigit = (num: string) => {
		if (pin.length < 6) setPin((prev) => prev + num);
	};

	const handlePinDelete = () => {
		setPin((prev) => prev.slice(0, -1));
	};

	const handleSubmit = async () => {
		if (pin.length !== 6 || !selectedUser || isVerifying) return;
		setIsVerifying(true);
		try {
			const result = await loginWithYumiPin(selectedUser._id, pin);
			login(result.token);
			toast.success(`Selamat datang, ${result.user.name}`);
			const slug = result.user.slug || result.user._id;
			navigate({ to: `/${slug}` as any, replace: true });
		} catch (err: any) {
			toast.error(err?.message || "PIN salah");
			setPin("");
		} finally {
			setIsVerifying(false);
		}
	};

	useEffect(() => {
		if (pin.length === 6 && !isVerifying) handleSubmit();
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pin, isVerifying]);

	const handleBack = () => {
		setSelectedUser(null);
		setPin("");
	};

	const handleSelectUser = (user: YumiPublicUser) => {
		setSelectedUser(user);
		setPin("");
	};

	return (
		<div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-sky-50 via-white to-blue-50 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
			<motion.div
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				className="w-full max-w-sm"
			>
				<AnimatePresence mode="wait">
					{!selectedUser ? (
						/* ── Step 1: Pilih Karyawan ── */
						<motion.div
							key="select"
							initial={{ opacity: 0, x: -20 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: 20 }}
							transition={{ duration: 0.2 }}
							className="rounded-2xl border border-border/60 bg-card p-6 shadow-lg"
						>
							{/* Header */}
							<div className="mb-6 text-center">
								<div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
									<Fingerprint className="h-6 w-6 text-primary" />
								</div>
								<h1 className="text-lg font-bold text-foreground">Absen Karyawan</h1>
								<p className="mt-1 text-sm text-muted-foreground">
									Pilih nama kamu untuk masuk
								</p>
							</div>

							{/* Search */}
							<div className="relative mb-4">
								<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<input
									type="text"
									placeholder="Cari nama..."
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="w-full rounded-xl border border-border/60 bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
								/>
							</div>

							{/* User list */}
							{isLoading ? (
								<div className="space-y-2">
									{[1, 2, 3, 4].map((i) => (
										<div key={i} className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
											<div className="h-10 w-10 animate-pulse rounded-full bg-muted-foreground/10" />
											<div className="h-4 w-28 animate-pulse rounded bg-muted-foreground/10" />
										</div>
									))}
								</div>
							) : filteredUsers.length === 0 ? (
								<div className="py-8 text-center text-sm text-muted-foreground">
									{searchQuery ? "Karyawan tidak ditemukan" : "Belum ada karyawan terdaftar"}
								</div>
							) : (
								<div className="flex flex-col gap-1.5">
									{filteredUsers.map((user) => (
										<button
											key={user._id}
											onClick={() => handleSelectUser(user)}
											className="flex items-center gap-3 rounded-xl p-3 text-left transition-all hover:bg-muted/80 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
										>
											<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-sky-400 text-sm font-bold text-white shadow-sm">
												{user.initial || user.name.charAt(0).toUpperCase()}
											</div>
											<div className="min-w-0 flex-1">
												<div className="text-sm font-semibold text-foreground truncate">
													{user.name}
												</div>
												{user.slug && (
													<div className="text-xs text-muted-foreground truncate">
														@{user.slug}
													</div>
												)}
											</div>
											<ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground/30" />
										</button>
									))}
								</div>
							)}
						</motion.div>
					) : (
						/* ── Step 2: Masukkan PIN ── */
						<motion.div
							key="pin"
							initial={{ opacity: 0, x: 20 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -20 }}
							transition={{ duration: 0.2 }}
							className="rounded-2xl border border-border/60 bg-card p-6 shadow-lg"
						>
							{/* Back + selected user */}
							<div className="mb-6 flex items-center gap-3">
								<button
									onClick={handleBack}
									className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
								>
									<ChevronLeft className="h-5 w-5" />
								</button>
								<div className="flex items-center gap-2.5">
									<div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-sky-400 text-xs font-bold text-white">
										{selectedUser.initial || selectedUser.name.charAt(0).toUpperCase()}
									</div>
									<span className="text-sm font-semibold text-foreground">
										{selectedUser.name}
									</span>
								</div>
							</div>

							{/* PIN dots */}
							<div className="mb-6 text-center">
								<div className="mb-2 flex items-center justify-center gap-2.5">
									{[0, 1, 2, 3, 4, 5].map((i) => (
										<div
											key={i}
											className={`h-3 w-3 rounded-full transition-all duration-150 ${
												i < pin.length
													? "bg-primary scale-100"
													: "bg-muted-foreground/15 scale-90"
											}`}
										/>
									))}
								</div>
								<p className="text-xs text-muted-foreground">
									Masukkan PIN 6 digit
								</p>
								{isVerifying && (
									<p className="mt-1 text-xs text-muted-foreground animate-pulse">
										Memverifikasi...
									</p>
								)}
							</div>

							{/* Numpad */}
							<div className="grid grid-cols-3 gap-2.5">
								{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
									<button
										key={num}
										onClick={() => handlePinDigit(String(num))}
										disabled={isVerifying || pin.length >= 6}
										className="flex h-14 items-center justify-center rounded-xl bg-muted/60 text-lg font-bold text-foreground transition-all hover:bg-muted active:scale-95 disabled:opacity-40"
									>
										{num}
									</button>
								))}
								<div />
								<button
									onClick={() => handlePinDigit("0")}
									disabled={isVerifying || pin.length >= 6}
									className="flex h-14 items-center justify-center rounded-xl bg-muted/60 text-lg font-bold text-foreground transition-all hover:bg-muted active:scale-95 disabled:opacity-40"
								>
									0
								</button>
								<button
									onClick={handlePinDelete}
									disabled={isVerifying || pin.length === 0}
									className="flex h-14 items-center justify-center rounded-xl bg-muted/60 text-sm font-medium text-muted-foreground transition-all hover:bg-muted active:scale-95 disabled:opacity-40"
								>
									Hapus
								</button>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Footer */}
				<p className="mt-4 text-center text-xs text-muted-foreground/50">
					Djiwa Tentram — Kehadiran Karyawan
				</p>
			</motion.div>
		</div>
	);
}
