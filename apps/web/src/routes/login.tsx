import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
	User, 
	ChevronLeft, 
	Delete, 
	Fingerprint, 
	LayoutDashboard,
	ShieldCheck,
	Sparkles,
	Search
} from "lucide-react";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/login" as any)({
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const { login, isAuthenticated, isAdmin, user: activeUser } = useYumiAuth();
	
	const users = useQuery(api.users.getPublicUsers);
	const loginMutation = useMutation(api.users.loginWithPin);
	
	const [selectedUser, setSelectedUser] = useState<any>(null);
	const [pin, setPin] = useState("");
	const [isVerifying, setIsVerifying] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	const filteredUsers = useMemo(() => {
		if (!users) return [];
		return users.filter((u: any) => 
			u.name.toLowerCase().includes(searchQuery.toLowerCase())
		);
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
			const result = await loginMutation({
				userId: selectedUser._id,
				pin: pin,
			});
			
			login(result.token);
			toast.success(`Selamat datang, ${result.user.name}`);
			
			// Redirect to home (Root guard will handle staff-specific redirects if needed)
			navigate({ to: "/home" as any });
		} catch (err: any) {
			toast.error(err.message || "PIN salah");
			setPin("");
		} finally {
			setIsVerifying(false);
		}
	};

	// Auto-submit when pin reaches 6 digits
	if (pin.length === 6 && !isVerifying) {
		handleSubmitPin();
	}

	return (
		<div className="app-page relative min-h-screen w-full overflow-hidden text-foreground">
			{/* Soft Light Background Bubbles */}
			<div className="absolute inset-0 overflow-hidden pointer-events-none">
				<div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px]" />
				<div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-accent/20 blur-[100px]" />
			</div>

			<main className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center p-6">
				<AnimatePresence mode="wait">
					{!selectedUser ? (
						<motion.div
							key="user-selection"
							initial={{ opacity: 0, y: 15 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.95 }}
							className="w-full max-w-2xl space-y-8"
						>
							<div className="text-center space-y-2">
								<motion.div 
									initial={{ scale: 0.9 }}
									animate={{ scale: 1 }}
									className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-primary text-white shadow-xl shadow-primary/20"
								>
									<Fingerprint className="h-10 w-10" />
								</motion.div>
								<h1 className="text-4xl font-black tracking-tight text-foreground md:text-5xl">Mulai Sesi</h1>
								<p className="text-muted-foreground font-medium">Ketik nama untuk akses cepat atau pilih dari daftar</p>
							</div>

							<div className="relative mx-auto max-w-lg">
								<div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
									<Search className="h-5 w-5 text-primary/70" />
								</div>
								<Input 
									placeholder="Cari Kasir, Barista..." 
									autoFocus
									className="h-14 w-full rounded-full border-border bg-card pl-14 pr-6 text-lg font-semibold shadow-sm focus:border-primary focus:ring-primary/20 transition-all placeholder:font-medium placeholder:text-muted-foreground/60"
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
								/>
							</div>

							<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 pt-4">
								{filteredUsers.map((user: any) => (
									<motion.button
										key={user._id}
										whileHover={{ y: -4, shadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }}
										whileTap={{ scale: 0.95 }}
										onClick={() => setSelectedUser(user)}
										className="group relative flex flex-col items-center gap-4 rounded-[1.5rem] border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/30"
									>
										<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-black text-primary transition-transform group-hover:scale-110">
											{user.initial}
										</div>
										<span className="text-sm font-bold tracking-tight text-foreground text-center line-clamp-2 w-full leading-snug">{user.name}</span>
										<div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100">
											<Sparkles className="h-3.5 w-3.5 text-primary" />
										</div>
									</motion.button>
								))}
							</div>
						</motion.div>
					) : (
						<motion.div
							key="pin-entry"
							initial={{ opacity: 0, scale: 1.05 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.9 }}
							className="flex w-full max-w-sm flex-col items-center space-y-10"
						>
							<div className="flex flex-col items-center space-y-4">
								<button 
									onClick={() => {
										setSelectedUser(null);
										setPin("");
									}}
									className="group flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground shadow-sm transition-all hover:border-border/80 hover:bg-muted hover:text-foreground active:scale-95"
								>
									<ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
									Kembali
								</button>
								
								<div className="flex flex-col items-center gap-4 py-4">
									<div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-primary text-3xl font-black text-white shadow-lg shadow-primary/30">
										{selectedUser.initial}
									</div>
									<div className="text-center">
										<p className="text-2xl font-black tracking-tight text-foreground">{selectedUser.name}</p>
										<div className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
											<ShieldCheck className="h-3.5 w-3.5" />
											Verifikasi PIN
										</div>
									</div>
								</div>
							</div>

							{/* User PIN Display */}
							<div className="flex gap-4">
								{[...Array(6)].map((_, i) => (
									<div 
										key={i}
										className={`h-4 w-4 rounded-full transition-all duration-300 ${
											pin.length > i 
												? "scale-125 bg-primary shadow-sm" 
												: "bg-muted-foreground/20"
										}`}
									/>
								))}
							</div>

							{/* Keypad */}
							<div className="grid w-full grid-cols-3 gap-6">
								{["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
									<button
										key={num}
										onClick={() => handlePinInput(num)}
										className="flex h-16 w-16 items-center justify-center mx-auto rounded-2xl border border-border bg-card text-2xl font-black text-foreground shadow-sm transition-all hover:bg-muted hover:shadow-md hover:-translate-y-0.5 active:scale-95 active:shadow-sm"
									>
										{num}
									</button>
								))}
								<div />
								<button
									onClick={() => handlePinInput("0")}
									className="flex h-16 w-16 items-center justify-center mx-auto rounded-2xl border border-border bg-card text-2xl font-black text-foreground shadow-sm transition-all hover:bg-muted hover:shadow-md hover:-translate-y-0.5 active:scale-95 active:shadow-sm"
								>
									0
								</button>
								<button
									onClick={handleDelete}
									className="flex h-16 w-16 items-center justify-center mx-auto rounded-2xl text-muted-foreground/60 transition-all hover:text-foreground active:scale-90"
								>
									<Delete className="h-7 w-7" />
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
			
			<footer className="absolute bottom-8 left-0 right-0 text-center opacity-30 pointer-events-none">
				<p className="text-[9px] font-black tracking-[0.3em] uppercase text-muted-foreground">Djiwa Tentram Unified System</p>
			</footer>
		</div>
	);
}
