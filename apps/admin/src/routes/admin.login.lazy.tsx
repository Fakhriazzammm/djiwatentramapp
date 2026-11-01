import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
	ChevronLeft, 
	Delete, 
	Fingerprint, 
	ShieldCheck,
	Search
} from "lucide-react";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { Footer } from "@/components/layout/Footer";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { listPublicYumiUsers, loginWithYumiPin, type YumiPublicUser } from "@/lib/yumi-auth-client";

export const Route = createLazyFileRoute("/admin/login")({
	component: AdminLoginPage,
});

function AdminLoginPage() {
	const navigate = useNavigate();
	const { login, isAuthenticated, isAdmin } = useYumiAuth();
	const [users, setUsers] = useState<YumiPublicUser[]>([]);
	const [isUsersLoading, setIsUsersLoading] = useState(true);
	
	const [selectedUser, setSelectedUser] = useState<YumiPublicUser | null>(null);
	const [pin, setPin] = useState("");
	const [isVerifying, setIsVerifying] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	useEffect(() => {
		let active = true;

		void (async () => {
			try {
				const nextUsers = await listPublicYumiUsers();
				if (active) {
					setUsers(nextUsers);
				}
			} catch (error) {
				console.error("Failed to load public users:", error);
				if (active) {
					toast.error("Gagal memuat daftar pengguna");
				}
			} finally {
				if (active) {
					setIsUsersLoading(false);
				}
			}
		})();

		return () => {
			active = false;
		};
	}, []);

	const filteredUsers = useMemo(() => {
		const keyword = searchQuery.trim().toLowerCase();
		if (!keyword) {
			return users;
		}

		return users.filter((u) => {
			const haystacks = [u.name, u.slug, u.username, u.initial]
				.filter((value): value is string => Boolean(value))
				.map((value) => value.toLowerCase());
			return haystacks.some((value) => value.includes(keyword));
		});
	}, [users, searchQuery]);

	const handlePinInput = (num: string) => {
		if (pin.length < 6) {
			setPin(prev => prev + num);
		}
	};

	const handleDelete = () => {
		setPin(prev => prev.slice(0, -1));
	};

	const handleSubmitPin = async () => {
		if (pin.length !== 6 || !selectedUser) return;
		
		setIsVerifying(true);
		try {
			const result = await loginWithYumiPin(selectedUser._id, pin);
			
			login(result.token);
			
			toast.success(`Selamat datang, ${result.user.name}`);
			setPin("");
			navigate({ to: "/" as any, replace: true });
		} catch (err: any) {
			toast.error(err.message || "PIN salah");
			setPin("");
		} finally {
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
				navigate({ to: "/" as any, replace: true });
			} else {
				navigate({ to: "/" as any, replace: true });
			}
		}
	}, [isAuthenticated, isAdmin, navigate]);

	return (
		<div className="fixed inset-0 z-50 min-h-screen w-full overflow-hidden bg-background text-foreground">
			{/* Soft Light Background Bubbles */}
			<div className="absolute inset-0 overflow-hidden pointer-events-none">
				<div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px]" />
				<div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-accent/20 blur-[100px]" />
			</div>

			<main className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center p-4">
				<AnimatePresence mode="wait">
					{!selectedUser ? (
						<motion.div
							key="user-selection"
							initial={{ opacity: 0, y: 15 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.95 }}
							className="w-full max-w-2xl space-y-4 md:space-y-6"
						>
							<div className="text-center space-y-1 md:space-y-2">
								<motion.div 
									initial={{ scale: 0.9 }}
									animate={{ scale: 1 }}
									className="mx-auto mb-3 md:mb-4 flex h-14 w-14 md:h-16 md:w-16 items-center justify-center rounded-[1.5rem] md:rounded-[1.75rem] bg-primary text-white shadow-xl shadow-primary/20"
								>
									<Fingerprint className="h-7 w-7 md:h-8 md:w-8" />
								</motion.div>
								<h1 className="text-3xl font-black tracking-tight text-foreground md:text-5xl">Login Admin</h1>
								<p className="text-xs md:text-sm text-muted-foreground font-medium">Ketik nama untuk akses cepat atau pilih dari daftar</p>
							</div>

							<div className="relative mx-auto max-w-lg">
								<div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
									<Search className="h-4 w-4 md:h-5 md:w-5 text-primary/70" />
								</div>
								<Input 
									placeholder="Tulis nama kamu" 
									autoFocus
									className="h-12 md:h-14 w-full rounded-full border-border bg-card pl-12 pr-4 text-base md:text-lg font-semibold shadow-sm focus:border-primary focus:ring-primary/20 transition-all placeholder:font-medium placeholder:text-muted-foreground/60"
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
								/>
							</div>

							{/* ── Dropdown hasil pencarian ── */}
							<div className="relative mx-auto max-w-lg">
								{isUsersLoading ? (
									<div className="absolute z-20 mt-1 w-full rounded-2xl border border-border bg-card p-4 text-center shadow-xl">
										<div className="flex items-center justify-center gap-1.5">
											<div className="h-2 w-2 animate-bounce rounded-full bg-primary" />
											<div className="h-2 w-2 animate-bounce rounded-full bg-primary delay-75" />
											<div className="h-2 w-2 animate-bounce rounded-full bg-primary delay-150" />
										</div>
									</div>
								) : searchQuery.trim() && filteredUsers.length > 0 ? (
									<div className="absolute z-20 mt-2 w-full rounded-2xl border border-border bg-card shadow-xl max-h-72 overflow-y-auto">
										{filteredUsers.map((user) => (
											<button
												key={user._id}
												onClick={() => setSelectedUser(user)}
												className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 first:rounded-t-2xl last:rounded-b-2xl"
											>
												<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-black text-primary">
													{user.initial}
												</div>
												<div className="min-w-0 flex-1">
													<p className="text-sm font-bold text-foreground truncate">{user.name}</p>
													<p className="text-xs font-medium text-muted-foreground truncate">{user.slug || user.username}</p>
												</div>
											</button>
										))}
									</div>
								) : searchQuery.trim() && filteredUsers.length === 0 ? (
									<div className="absolute z-20 mt-2 w-full rounded-2xl border border-border bg-card px-5 py-4 text-center shadow-xl">
										<p className="text-xs font-bold text-muted-foreground">Pengguna tidak ditemukan</p>
									</div>
								) : null}
							</div>
						</motion.div>
					) : (
						<motion.div
							key="pin-entry"
							initial={{ opacity: 0, scale: 1.05 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.9 }}
							className="flex w-full max-w-sm flex-col items-center space-y-5 md:space-y-8"
						>
							<div className="flex flex-col items-center space-y-2 md:space-y-3">
								<button 
									onClick={() => {
										setSelectedUser(null);
										setPin("");
									}}
									className="group flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-bold uppercase tracking-widest text-muted-foreground shadow-sm transition-all hover:border-border/80 hover:bg-muted hover:text-foreground active:scale-95"
								>
									<ChevronLeft className="h-3 w-3 md:h-4 md:w-4 transition-transform group-hover:-translate-x-1" />
									Kembali
								</button>
								
								<div className="flex flex-col items-center gap-2 md:gap-3 py-2">
									<div className="flex h-14 w-14 md:h-16 md:w-16 items-center justify-center rounded-2xl md:rounded-[1.75rem] bg-primary text-2xl font-black text-white shadow-lg shadow-primary/30">
										{selectedUser.initial}
									</div>
									<div className="text-center">
										<p className="text-xl md:text-2xl font-black tracking-tight text-foreground">{selectedUser.name}</p>
										<div className="mt-1 inline-flex items-center justify-center gap-1 md:gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 md:py-1 text-[11px] md:text-[10px] font-black uppercase tracking-widest text-primary">
											<ShieldCheck className="h-3 w-3 md:h-3.5 md:w-3.5" />
											Verifikasi PIN
										</div>
									</div>
								</div>
							</div>

							{/* User PIN Display */}
							<div className="flex gap-3">
								{[...Array(6)].map((_, i) => (
									<div 
										key={i}
										className={`h-3 w-3 rounded-full transition-all duration-300 ${
											pin.length > i 
												? "scale-125 bg-primary shadow-sm" 
												: "bg-muted-foreground/20"
										}`}
									/>
								))}
							</div>

							{/* Keypad */}
							<div className="grid w-full grid-cols-3 gap-3 md:gap-4 mt-2 px-8 lg:px-0">
								{["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
									<button
										key={num}
										onClick={() => handlePinInput(num)}
										className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center mx-auto rounded-xl md:rounded-2xl border border-border bg-card text-xl md:text-2xl font-black text-foreground shadow-sm transition-all hover:bg-muted hover:shadow-md hover:-translate-y-0.5 active:scale-95 active:shadow-sm"
									>
										{num}
									</button>
								))}
								<div />
								<button
									onClick={() => handlePinInput("0")}
									className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center mx-auto rounded-xl md:rounded-2xl border border-border bg-card text-xl md:text-2xl font-black text-foreground shadow-sm transition-all hover:bg-muted hover:shadow-md hover:-translate-y-0.5 active:scale-95 active:shadow-sm"
								>
									0
								</button>
								<button
									onClick={handleDelete}
									className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center mx-auto rounded-xl md:rounded-2xl text-muted-foreground/60 transition-all hover:text-foreground active:scale-90"
								>
									<Delete className="h-6 w-6 md:h-7 md:w-7" />
								</button>
							</div>

							{isVerifying && (
								<motion.div 
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									className="flex items-center gap-3 rounded-full bg-card px-6 py-2.5 shadow-sm border border-border"
								>
									<div className="h-2 w-2 animate-bounce rounded-full bg-primary" />
									<div className="h-2 w-2 animate-bounce rounded-full bg-primary delay-75" />
									<div className="h-2 w-2 animate-bounce rounded-full bg-primary delay-150" />
									<span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Memproses...</span>
								</motion.div>
							)}
						</motion.div>
					)}
				</AnimatePresence>
			</main>
			
			<Footer className="absolute bottom-8 left-0 right-0 pointer-events-none" />
		</div>
	);
}
