import { createLazyFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ClipboardList, FileSignature, UserPlus, Eye, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { normalizeEmployeeOnboardingSettings } from "@/lib/employee-onboarding-settings";
import { createClient } from "@/lib/client";

function OperationalTeamRegisterPage() {
	const location = useLocation();
	const isNestedRoute =
		location.pathname.endsWith("/register/contract") ||
		location.pathname.endsWith("/register/onboarding") ||
		location.pathname.includes("/register/application/");

	if (isNestedRoute) {
		return <Outlet />;
	}

	return <RegisterLanding />;
}

function RegisterLanding() {
	const siteSettings = useHybridSiteSettings();
	const onboardingSettings = useMemo(
		() => normalizeEmployeeOnboardingSettings(siteSettings?.employeeOnboarding),
		[siteSettings?.employeeOnboarding],
	);
	const [pendingCount, setPendingCount] = useState<number | null>(null);

	useEffect(() => {
		const supabase = createClient();
		supabase
			.from("employee_onboarding_applications")
			.select("id", { count: "exact", head: true })
			.in("status", ["pending", "needs_revision"])
			.then(({ count }) => setPendingCount(count ?? 0));
	}, []);

	const templateCount = Object.keys(onboardingSettings.contractTemplatesByRoleId || {}).length;
	const requiredFields = Object.values(onboardingSettings.fields || {}).filter((f: any) => f?.required).length;
	const docCount = onboardingSettings.documentChecklist?.filter((d: any) => d?.required).length || 0;

	return (
		<div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
			{/* ── Header ── */}
			<div className="mb-8 text-center">
				<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
					<UserPlus className="h-7 w-7 text-primary" />
				</div>
				<h1 className="text-2xl font-bold tracking-tight">Register Karyawan</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Atur pendaftaran, kontrak, dan review kandidat dalam satu tempat
				</p>
			</div>

			{/* ── Stats ── */}
			<div className="mb-8 grid grid-cols-4 gap-2 sm:gap-3">
				<div className="rounded-xl border bg-card p-3 text-center shadow-sm">
					<p className="text-xl font-bold leading-tight sm:text-2xl">{templateCount}</p>
					<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
						Template
					</p>
				</div>
				<div className="rounded-xl border bg-card p-3 text-center shadow-sm">
					<p className="text-xl font-bold leading-tight sm:text-2xl">{requiredFields}</p>
					<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
						Wajib
					</p>
				</div>
				<div className="rounded-xl border bg-card p-3 text-center shadow-sm">
					<p className="text-xl font-bold leading-tight sm:text-2xl">{docCount}</p>
					<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
						Dokumen
					</p>
				</div>
				<div className="rounded-xl border bg-card p-3 text-center shadow-sm">
					<p className="text-xl font-bold leading-tight sm:text-2xl">{pendingCount ?? "—"}</p>
					<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
						Pending
					</p>
				</div>
			</div>

			{/* ── Registration Status Bar ── */}
			<div className="mb-6 flex items-center justify-between rounded-xl border bg-card p-4 shadow-sm">
				<div className="flex items-center gap-3">
					<span
						className={`h-3 w-3 rounded-full ${onboardingSettings.registrationEnabled ? "bg-emerald-500" : "bg-amber-500"}`}
					/>
					<div>
						<p className="text-sm font-semibold">
							{onboardingSettings.registrationEnabled ? "Pendaftaran Aktif" : "Pendaftaran Ditutup"}
						</p>
						<p className="text-xs text-muted-foreground">
							Mode: {onboardingSettings.registrationMode === "public" ? "Publik" : onboardingSettings.registrationMode === "internal" ? "Internal" : "Invite Only"}
						</p>
					</div>
				</div>
				<div className="flex gap-2">
					<Button size="sm" variant="outline" onClick={() => window.open("/register?preview=admin", "_blank")} className="gap-1.5 text-xs">
						<Eye className="h-3.5 w-3.5" /> Preview
					</Button>
					<Button size="sm" variant="outline" onClick={() => window.location.href = "/admin/operational-team/contracts"} className="gap-1.5 text-xs">
						<FileText className="h-3.5 w-3.5" /> Riwayat
					</Button>
				</div>
			</div>

			{/* ── Menu Cards ── */}
			<div className="flex flex-col gap-3">
				<Link
					to="/admin/operational-team/register/onboarding"
					className="group flex items-center gap-5 rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.99]"
				>
					<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600 transition-colors group-hover:bg-sky-200 dark:bg-sky-950/30 dark:text-sky-400">
						<ClipboardList className="h-6 w-6" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<h2 className="font-semibold">Onboarding Karyawan</h2>
							{pendingCount !== null && pendingCount > 0 && (
								<Badge variant="secondary" className="text-[10px] gap-1">
									{pendingCount} pending
								</Badge>
							)}
						</div>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Review, setujui, tolak, atau hapus pendaftaran kandidat
						</p>
					</div>
					<span className="shrink-0 text-sm text-muted-foreground/40 transition-colors group-hover:text-primary">&rarr;</span>
				</Link>

				<Link
					to="/admin/operational-team/register/contract"
					className="group flex items-center gap-5 rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.99]"
				>
					<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 transition-colors group-hover:bg-amber-200 dark:bg-amber-950/30 dark:text-amber-400">
						<FileSignature className="h-6 w-6" />
					</div>
					<div className="min-w-0 flex-1">
						<h2 className="font-semibold">Kontrak Kerja</h2>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Atur template kontrak default per role &amp; pengaturan tanda tangan
						</p>
					</div>
					<span className="shrink-0 text-sm text-muted-foreground/40 transition-colors group-hover:text-primary">&rarr;</span>
				</Link>
			</div>
		</div>
	);
}

export const Route = createLazyFileRoute("/admin/operational-team/register" as any)({
	component: OperationalTeamRegisterPage,
});
