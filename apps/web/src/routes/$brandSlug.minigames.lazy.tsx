import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Gift, Sparkles, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createLazyFileRoute("/$brandSlug/minigames")({
	component: BrandMiniGamesPage,
});

function BrandMiniGamesPage() {
	const { brandSlug } = Route.useParams();
	const game = useQuery(api.minigames.getActiveGameByBrand, { brandSlug });
	const spin = useMutation(api.minigames.spin);

	const [form, setForm] = useState({
		fullName: "",
		email: "",
		whatsapp: "",
		instagram: "",
	});
	const [isSpinning, setIsSpinning] = useState(false);
	const [rotation, setRotation] = useState(0);
	const [result, setResult] = useState<null | {
		prizeLabel: string;
		prizeDescription?: string;
		voucherCode?: string;
		thankYouMessage: string;
	}>(null);

	const gradient = useMemo(() => {
		if (!game || game.prizes.length === 0) {
			return "conic-gradient(#94a3b8 0deg 360deg)";
		}
		const segment = 360 / game.prizes.length;
		const stops = game.prizes.map((prize: any, index: number) => {
			const start = Math.floor(index * segment);
			const end = Math.floor((index + 1) * segment);
			return `${prize.color ?? "#f59e0b"} ${start}deg ${end}deg`;
		});
		return `conic-gradient(${stops.join(", ")})`;
	}, [game]);

	const handleSpin = async () => {
		if (!game) return;
		if (!form.fullName || !form.email || !form.whatsapp || !form.instagram) {
			toast.error("Lengkapi nama, email, WhatsApp, dan Instagram terlebih dahulu");
			return;
		}

		setIsSpinning(true);
		setResult(null);
		try {
			const spinResult = await spin({
				gameId: game._id,
				fullName: form.fullName,
				email: form.email,
				whatsapp: form.whatsapp,
				instagram: form.instagram,
			});

			setRotation((prev) => prev + spinResult.spinAngle);
			window.setTimeout(() => {
				setResult({
					prizeLabel: spinResult.prizeLabel,
					prizeDescription: spinResult.prizeDescription,
					voucherCode: spinResult.voucherCode,
					thankYouMessage: spinResult.thankYouMessage,
				});
				setIsSpinning(false);
				toast.success(`Selamat! Kamu dapat: ${spinResult.prizeLabel}`);
			}, spinResult.spinDurationMs);
		} catch (error: any) {
			setIsSpinning(false);
			toast.error(error?.message ?? "Gagal melakukan spin");
		}
	};

	if (game === undefined) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<p className="text-muted-foreground">Memuat mini games...</p>
			</div>
		);
	}

	if (!game) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background p-6">
				<div className="max-w-md space-y-3 rounded-2xl border bg-card p-6 text-center">
					<h1 className="font-bold text-2xl">Mini Games Belum Aktif</h1>
					<p className="text-muted-foreground text-sm">
						Tidak ada mini game aktif untuk brand ini saat ini.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-orange-50 px-4 py-8">
			<div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.2fr,1fr]">
				<div className="space-y-4 rounded-3xl border bg-card p-6 shadow-sm">
					<div className="flex items-center gap-2 text-primary">
						<Sparkles className="h-5 w-5" />
						<p className="font-semibold text-sm uppercase tracking-wide">
							Mini Games Marketing
						</p>
					</div>
					<h1 className="font-black text-3xl leading-tight">{game.name}</h1>
					{game.description && (
						<p className="text-muted-foreground text-sm">{game.description}</p>
					)}

					<div className="mt-3 flex justify-center">
						<div className="relative h-[320px] w-[320px]">
							<div className="absolute -top-3 left-1/2 z-10 h-0 w-0 -translate-x-1/2 border-r-[12px] border-r-transparent border-b-[20px] border-l-[12px] border-l-transparent border-b-red-500" />
							<motion.div
								animate={{ rotate: rotation }}
								className="relative h-full w-full rounded-full border-[10px] border-white shadow-xl"
								style={{ backgroundImage: gradient }}
								transition={{
									duration: (game.spinDurationMs ?? 5200) / 1000,
									ease: [0.12, 0.9, 0.18, 1],
								}}
							>
								<div className="absolute inset-[38%] flex items-center justify-center rounded-full bg-white shadow-inner">
									<Trophy className="h-7 w-7 text-amber-500" />
								</div>
								{game.prizes.map((prize: any, index: number) => {
									const angle = (360 / game.prizes.length) * index;
									return (
										<div
											className="absolute left-1/2 top-1/2 w-[105px] origin-left -translate-y-1/2 text-center"
											key={prize.id}
											style={{ transform: `rotate(${angle}deg) translateX(46px)` }}
										>
											<span className="line-clamp-2 block text-[10px] font-bold text-white drop-shadow">
												{prize.label}
											</span>
										</div>
									);
								})}
							</motion.div>
						</div>
					</div>

					<Button className="h-12 w-full text-base" disabled={isSpinning} onClick={handleSpin}>
						{isSpinning ? "Memutar..." : "SPIN SEKARANG"}
					</Button>

					{result && (
						<div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
							<p className="font-semibold text-emerald-700 text-sm">Hasil Spin</p>
							<p className="font-black text-2xl text-emerald-900">{result.prizeLabel}</p>
							{result.prizeDescription && (
								<p className="text-emerald-800 text-sm">{result.prizeDescription}</p>
							)}
							{result.voucherCode && (
								<div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2">
									<Gift className="h-4 w-4 text-emerald-700" />
									<span className="font-mono font-bold text-sm">{result.voucherCode}</span>
								</div>
							)}
							<p className="text-emerald-700 text-xs">{result.thankYouMessage}</p>
						</div>
					)}
				</div>

				<div className="space-y-4 rounded-3xl border bg-card p-6 shadow-sm">
					<div>
						<h2 className="font-semibold text-lg">Isi Data Untuk Klaim Hadiah</h2>
						<p className="text-muted-foreground text-xs">
							Hadiah/voucher akan dihubungi melalui data berikut.
						</p>
					</div>

					<div className="space-y-3">
						<Field
							label="Nama Lengkap"
							value={form.fullName}
							onChange={(value) => setForm((prev) => ({ ...prev, fullName: value }))}
						/>
						<Field
							label="Email"
							type="email"
							value={form.email}
							onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
						/>
						<Field
							label="Nomor WhatsApp"
							value={form.whatsapp}
							onChange={(value) => setForm((prev) => ({ ...prev, whatsapp: value }))}
						/>
						<Field
							label="Instagram"
							value={form.instagram}
							onChange={(value) => setForm((prev) => ({ ...prev, instagram: value }))}
							placeholder="@username"
						/>
					</div>

					<div className="rounded-xl border bg-muted/30 p-3">
						<p className="mb-2 font-semibold text-xs uppercase tracking-wide">Daftar Hadiah</p>
						<ul className="space-y-1 text-xs">
							{game.prizes.map((prize: any) => (
								<li className="flex items-center justify-between" key={prize.id}>
									<span>{prize.label}</span>
									{prize.stock !== undefined && (
										<span className="text-muted-foreground">Sisa {prize.stock}</span>
									)}
								</li>
							))}
						</ul>
					</div>

					<p className="text-muted-foreground text-[11px]">
						Dengan menekan spin, Anda menyetujui data dipakai untuk proses verifikasi hadiah
						dan komunikasi promo brand.
					</p>
				</div>
			</div>
		</div>
	);
}

function Field({
	label,
	value,
	onChange,
	type = "text",
	placeholder,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	type?: string;
	placeholder?: string;
}) {
	return (
		<div className="space-y-1">
			<p className="font-medium text-xs">{label}</p>
			<Input
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				type={type}
				value={value}
			/>
		</div>
	);
}
