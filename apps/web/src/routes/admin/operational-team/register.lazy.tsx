import { createLazyFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { ClipboardList, FileSignature } from "lucide-react";

function OperationalTeamRegisterPage() {
	const location = useLocation();
	const isNestedRoute =
		location.pathname.endsWith("/register/contract") ||
		location.pathname.endsWith("/register/onboarding") ||
		location.pathname.includes("/register/application/");

	if (isNestedRoute) {
		return <Outlet />;
	}

	return (
		<div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
			{/* Icon */}
			<div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
				<ClipboardList className="h-7 w-7 text-primary" />
			</div>

			{/* Title */}
			<h1 className="text-2xl font-bold tracking-tight">Register Karyawan</h1>
			<p className="mt-2 max-w-md text-sm text-muted-foreground">
				Pilih menu di bawah untuk mengelola pendaftaran dan kontrak kerja karyawan.
			</p>

			{/* Menu cards */}
			<div className="mt-10 flex w-full flex-col gap-4">
				<Link
					to="/admin/operational-team/register/onboarding"
					className="group flex items-center gap-5 rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.99]"
				>
					<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600 transition-colors group-hover:bg-sky-200 dark:bg-sky-950/30 dark:text-sky-400">
						<ClipboardList className="h-6 w-6" />
					</div>
					<div className="min-w-0 flex-1">
						<h2 className="font-semibold">Onboarding Karyawan</h2>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Review, setujui, tolak, atau hapus pendaftaran karyawan baru
						</p>
					</div>
					<span className="shrink-0 text-sm text-muted-foreground/40 transition-colors group-hover:text-primary">
						&rarr;
					</span>
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
							Atur template kontrak default per role dan pengaturan tanda tangan
						</p>
					</div>
					<span className="shrink-0 text-sm text-muted-foreground/40 transition-colors group-hover:text-primary">
						&rarr;
					</span>
				</Link>
			</div>
		</div>
	);
}

export const Route = createLazyFileRoute("/admin/operational-team/register" as any)({
	component: OperationalTeamRegisterPage,
});
