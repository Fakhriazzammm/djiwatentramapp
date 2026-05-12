import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Download, ExternalLink, FileSignature, Loader2, ShieldCheck, UserPlus, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/client";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { normalizeEmployeeOnboardingSettings } from "@/lib/employee-onboarding-settings";

function RegisterCompletePage() {
	const { registrationNumber } = Route.useParams() as { registrationNumber: string };
	const siteSettings = useHybridSiteSettings();
	const onboardingSettings = normalizeEmployeeOnboardingSettings(siteSettings?.employeeOnboarding);
	const companyDisplayName = String(siteSettings?.companyName || siteSettings?.businessName || siteSettings?.storeName || siteSettings?.name || onboardingSettings.signatoryName || "Djiwa Tentram").trim();
	const signatoryPersonName = onboardingSettings.signatoryPersonName || onboardingSettings.signatoryName;

	const [app, setApp] = useState<any | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [notFound, setNotFound] = useState(false);

	useEffect(() => {
		const supabase = createClient();
		supabase
			.from("employee_onboarding_applications")
			.select("*")
			.filter("raw->>registrationNumber", "eq", registrationNumber)
			.maybeSingle()
			.then(({ data, error }) => {
				if (error) {
					console.error("[Selesai] Query error:", error);
				}
				if (data) {
					setApp(data);
				} else {
					setNotFound(true);
				}
				setIsLoading(false);
			});
	}, [registrationNumber]);

	if (isLoading) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 px-3 py-6 sm:px-4 sm:py-8">
				<div className="flex min-h-[60vh] items-center justify-center">
					<div className="flex flex-col items-center gap-3">
						<Loader2 className="h-8 w-8 animate-spin text-primary" />
						<p className="text-sm text-muted-foreground">Memeriksa status pendaftaran...</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 px-3 py-6 sm:px-4 sm:py-8">
			<div className="mx-auto max-w-2xl space-y-4 sm:space-y-6">

				{/* ── Header ── */}
				<div className="flex flex-col gap-3 rounded-2xl border bg-card/80 p-4 shadow-lg backdrop-blur sm:rounded-3xl sm:p-6">
					<div>
						<Badge className="mb-2 sm:mb-3" variant="secondary">
							<UserPlus className="mr-1 h-3 w-3" /> Register Karyawan
						</Badge>
						<h1 className="text-xl font-bold sm:text-3xl">
							{notFound ? "Pendaftaran Tidak Ditemukan" : app?.full_name || "Pendaftaran Karyawan"}
						</h1>
						<p className="mt-1 text-xs text-muted-foreground sm:text-sm">
							{notFound
								? `Tidak ada pendaftaran dengan nomor ${registrationNumber}`
								: app?.employment?.roleName
									? `${app.employment.roleName} &middot; ${companyDisplayName}`
									: "Pendaftaran karyawan baru"
							}
						</p>
					</div>
				</div>

				{/* ── Content ── */}
				{notFound ? (
					<Card className="text-center">
						<CardContent className="space-y-4 px-6 py-10">
							<XCircle className="mx-auto h-12 w-12 text-amber-500" />
							<h2 className="text-lg font-bold">Pendaftaran Tidak Ditemukan</h2>
							<p className="text-sm text-muted-foreground">
								Nomor pendaftaran <b>{registrationNumber}</b> tidak ditemukan.
							</p>
							<Button onClick={() => { window.location.href = "/register"; }}>
								Daftar Baru
							</Button>
						</CardContent>
					</Card>
				) : app ? (
					<>
						{/* ── Status Card ── */}
						<Card>
							<CardContent className="space-y-4 px-6 py-8 text-center">
								{/* Pending */}
								{app.status === "pending" && (
									<>
										<Clock className="mx-auto h-14 w-14 text-amber-500" />
										<h2 className="text-xl font-bold">Menunggu Approval Admin</h2>
										<p className="text-sm text-muted-foreground">
											Pendaftaran Anda sedang ditinjau oleh admin. Kami akan memberitahu Anda begitu ada perkembangan.
										</p>
									</>
								)}

								{/* Approved */}
								{app.status === "approved" && (
									<>
										<CheckCircle2 className="mx-auto h-14 w-14 text-green-500" />
										<h2 className="text-xl font-bold">Pendaftaran Disetujui! 🎉</h2>
										<p className="text-sm text-muted-foreground">
											Akun Anda sudah aktif. Admin akan memberikan PIN 6 digit untuk login.
										</p>
										{app.contract_pdf_url && (
											<div className="rounded-xl border bg-muted/30 p-4 text-left">
												<p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
													<FileSignature className="h-3.5 w-3.5" /> Kontrak Kerja
												</p>
												<a
													href={app.contract_pdf_url}
													target="_blank"
													rel="noopener noreferrer"
													className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
												>
													<Download className="h-4 w-4" />
													Unduh PDF Kontrak
													<ExternalLink className="h-3 w-3" />
												</a>
											</div>
										)}
									</>
								)}

								{/* Rejected */}
								{app.status === "rejected" && (
									<>
										<XCircle className="mx-auto h-14 w-14 text-red-500" />
										<h2 className="text-xl font-bold">Pendaftaran Ditolak</h2>
										{app.review_notes && (
											<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-left text-sm text-red-700">
												<p className="font-semibold">Alasan:</p>
												<p>{app.review_notes}</p>
											</div>
										)}
										<p className="text-sm text-muted-foreground">
											Silakan hubungi admin untuk informasi lebih lanjut atau daftar ulang.
										</p>
									</>
								)}

								{/* Needs revision */}
								{app.status === "needs_revision" && (
									<>
										<ShieldCheck className="mx-auto h-14 w-14 text-amber-500" />
										<h2 className="text-xl font-bold">Perlu Revisi</h2>
										{app.review_notes && (
											<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-700">
												<p className="font-semibold">Catatan admin:</p>
												<p>{app.review_notes}</p>
											</div>
										)}
										<p className="text-sm text-muted-foreground">
											Silakan hubungi admin untuk memperbaiki data pendaftaran Anda.
										</p>
									</>
								)}

								<div className="rounded-xl border bg-muted/40 p-3 text-left text-xs text-muted-foreground">
									<p className="font-medium text-foreground">Nomor Pendaftaran</p>
									<p className="break-all font-mono text-xs">{registrationNumber}</p>
								</div>

								<Button onClick={() => { window.location.href = "/login"; }}>
									Ke Halaman Login
								</Button>
							</CardContent>
						</Card>
					</>
				) : null}
			</div>
		</div>
	);
}

export const Route = createLazyFileRoute("/register/selesai-$registrationNumber" as any)({
	component: RegisterCompletePage,
});
