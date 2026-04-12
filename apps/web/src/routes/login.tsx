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
		<div className="relative min-h-screen w-full overflow-hidden bg-[#0a0a0b] text-white">
			{/* Animated Background Gradients */}
			<div className="absolute inset-0 overflow-hidden pointer-events-none">
				<div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px] animate-pulse" />
				<div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-emerald-500/10 blur-[120px] animate-pulse delay-700" />
			</div>

			<main className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center p-6">
				<AnimatePresence mode="wait">
					{!selectedUser ? (
						<motion.div
							key="user-selection"
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.95 }}
							className="w-full space-y-8"
						>
							<div className="text-center space-y-2">
								<motion.div 
									initial={{ scale: 0.9 }}
									animate={{ scale: 1 }}
									className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/20 text-primary shadow-2xl shadow-primary/20"
								>
									<Fingerprint className="h-10 w-10" />
								</motion.div>
								<h1 className="text-4xl font-black tracking-tight md:text-5xl">Pilih Akun</h1>
								<p className="text-muted-foreground">Silakan pilih nama Anda untuk masuk ke sistem</p>
							</div>

							<div className="relative mx-auto max-w-md">
								<Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input 
									placeholder="Cari nama..." 
									className="h-12 border-white/5 bg-white/5 pl-10 text-lg rounded-2xl focus:ring-primary/20 focus:border-primary/50"
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
								/>
							</div>

							<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
								{filteredUsers.map((user: any) => (
									<motion.button
										key={user._id}
										whileHover={{ scale: 1.05 }}
										whileTap={{ scale: 0.95 }}
										onClick={() => setSelectedUser(user)}
										className="group relative flex flex-col items-center gap-4 rounded-3xl border border-white/5 bg-white/[0.03] p-6 transition-all hover:border-primary/30 hover:bg-white/[0.08] backdrop-blur-md"
									>
										<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-2xl font-black text-primary transition-transform group-hover:scale-110">
											{user.initial}
										</div>
										<span className="text-sm font-bold tracking-tight text-center truncate w-full">{user.name}</span>
										<div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
											<Sparkles className="h-3 w-3 text-primary" />
										</div>
									</motion.button>
								))}
							</div>
						</motion.div>
					) : (
						<motion.div
							key="pin-entry"
							initial={{ opacity: 0, scale: 1.1 }}
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
									className="group flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-white"
								>
									<ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
									Ganti Akun
								</button>
								
								<div className="flex flex-col items-center gap-4 py-4">
									<div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary text-3xl font-black text-white shadow-xl shadow-primary/30">
										{selectedUser.initial}
									</div>
									<div className="text-center">
										<p className="text-2xl font-black tracking-tight">{selectedUser.name}</p>
										<div className="mt-1 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary">
											<ShieldCheck className="h-3 w-3" />
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
												? "scale-125 bg-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]" 
												: "bg-white/10"
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
										className="flex h-16 w-16 items-center justify-center mx-auto rounded-2xl border border-white/5 bg-white/[0.03] text-2xl font-black transition-all hover:bg-white/[0.1] active:scale-90"
									>
										{num}
									</button>
								))}
								<div />
								<button
									onClick={() => handlePinInput("0")}
									className="flex h-16 w-16 items-center justify-center mx-auto rounded-2xl border border-white/5 bg-white/[0.03] text-2xl font-black transition-all hover:bg-white/[0.1] active:scale-90"
								>
									0
								</button>
								<button
									onClick={handleDelete}
									className="flex h-16 w-16 items-center justify-center mx-auto rounded-2xl text-muted-foreground transition-all hover:text-white active:scale-90"
								>
									<Delete className="h-6 w-6" />
								</button>
							</div>

							{isVerifying && (
								<motion.div 
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									className="flex items-center gap-3 rounded-full bg-white/5 px-6 py-2 border border-white/10"
								>
									<div className="h-2 w-2 animate-bounce rounded-full bg-primary" />
									<div className="h-2 w-2 animate-bounce rounded-full bg-primary delay-75" />
									<div className="h-2 w-2 animate-bounce rounded-full bg-primary delay-150" />
									<span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Memproses Sesi...</span>
								</motion.div>
							)}
						</motion.div>
					)}
				</AnimatePresence>
			</main>
			
			<footer className="absolute bottom-8 left-0 right-0 text-center opacity-20 pointer-events-none">
				<p className="text-[10px] font-bold tracking-[0.3em] uppercase">Djiwa Tentram Unified System</p>
			</footer>
		</div>
	);
}
