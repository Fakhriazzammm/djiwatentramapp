import { createLazyFileRoute } from "@tanstack/react-router";
import { CheckCircle2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function RegisterCompletePage() {
	const { registrationNumber } = Route.useParams() as { registrationNumber: string };

	return (
		<div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 px-3 py-6 sm:px-4 sm:py-8">
			<div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
				<div className="flex flex-col gap-3 rounded-2xl border bg-card/80 p-4 shadow-lg backdrop-blur sm:rounded-3xl sm:p-6 md:flex-row md:items-center md:justify-between">
					<div>
						<Badge className="mb-2 sm:mb-3" variant="secondary">
							<UserPlus className="mr-1 h-3 w-3" /> Register Karyawan
						</Badge>
						<h1 className="text-xl font-bold sm:text-3xl">Pendaftaran Karyawan Baru</h1>
						<p className="mt-1 text-muted-foreground text-xs sm:mt-2 sm:text-sm">
							Data sudah dikirim. Simpan nomor pendaftaran untuk pengecekan admin.
						</p>
					</div>
					<div className="flex flex-wrap gap-2 text-xs">
						{["1. Data Diri", "2. Data Kerja", "3. Kontrak", "4. Tanda Tangan", "5. Selesai"].map((label, idx) => (
							<span key={label} className={`rounded-full px-3 py-1 ${idx === 4 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
								{label}
							</span>
						))}
					</div>
				</div>

				<Card className="mx-auto max-w-md text-center sm:max-w-xl">
					<CardContent className="space-y-4 px-6 py-8 sm:px-10 sm:py-12">
						<CheckCircle2 className="mx-auto h-12 w-12 text-green-500 sm:h-16 sm:w-16" />
						<h2 className="text-lg font-bold sm:text-2xl">Pendaftaran berhasil dikirim</h2>
						<p className="text-muted-foreground text-sm">
							Status saat ini: <b>menunggu approval admin</b>.<br />
							Nomor pendaftaran: <b className="break-all">{registrationNumber}</b>
						</p>
						<div className="rounded-xl border bg-muted/40 p-3 text-left text-xs text-muted-foreground">
							Setelah admin approve, nama Anda akan muncul di halaman login dan admin akan memberikan PIN 6 digit untuk masuk.
						</div>
						<Button onClick={() => { window.location.href = "/login"; }}>Ke Halaman Login</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

export const Route = createLazyFileRoute("/register/selesai-$registrationNumber" as any)({ component: RegisterCompletePage });
