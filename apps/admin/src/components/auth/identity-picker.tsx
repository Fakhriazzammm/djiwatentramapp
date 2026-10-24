import { useMemo, useState } from "react";
import { ChevronRight, RefreshCw, Search, UserPlus, Users, X } from "lucide-react";
import type { YumiPublicUser } from "@/lib/yumi-auth-client";
import { useRecentIdentities } from "@/hooks/use-recent-identities";
import type { LoginAccent } from "./login-shell";
import { normalizeKasirSearch } from "@/lib/kasir-login-utils";

const ACCENT_AVATAR: Record<LoginAccent, string> = {
	amber: "bg-amber-500/10 text-amber-600",
	blue: "bg-primary/10 text-primary",
};

/* Who is at the till is a short list read quickly, so the roster is drawn
   inline instead of in a dropdown that floats over the page: one state to
   read, no overlay to dismiss, and it still works when the list is long. */
export function IdentityPicker({
	users,
	isLoading,
	error,
	onRetry,
	onSelect,
	accent = "blue",
	recentKey,
	noun = "karyawan",
	emptyHint = "Tambahkan karyawan dari Admin → Karyawan, lalu muat ulang halaman ini.",
}: {
	users: YumiPublicUser[];
	isLoading: boolean;
	error: string | null;
	onRetry: () => void;
	onSelect: (user: YumiPublicUser) => void;
	accent?: LoginAccent;
	recentKey: string;
	noun?: string;
	emptyHint?: string;
}) {
	const [query, setQuery] = useState("");
	const { recent, remember } = useRecentIdentities(recentKey);

	const filtered = useMemo(() => {
		const keyword = normalizeKasirSearch(query).toLowerCase();
		if (!keyword) return users;
		return users.filter((user) => {
			const haystacks = [user.name, user.slug, user.username, user.initial]
				.filter((value): value is string => Boolean(value))
				.map((value) => value.toLowerCase());
			return haystacks.some((value) => value.includes(keyword));
		});
	}, [users, query]);

	/* a remembered id only becomes a chip while that person is still on the
	   roster — a deactivated account must not stay reachable from here */
	const recentUsers = useMemo(
		() =>
			recent
				.map((entry) => users.find((user) => user._id === entry.id))
				.filter((user): user is YumiPublicUser => Boolean(user)),
		[recent, users],
	);

	const handleSelect = (user: YumiPublicUser) => {
		remember({
			id: user._id,
			name: user.name,
			slug: user.slug || user.username,
			initial: user.initial,
		});
		onSelect(user);
	};

	const searching = query.trim().length > 0;
	// The initial screen stays quiet: recent accounts are available as quick
	// chips, while the full roster is only rendered after an explicit search.
	const visibleUsers = searching ? filtered : [];
	const avatarTone = ACCENT_AVATAR[accent];

	return (
		<div className="mt-6 flex min-h-0 flex-1 flex-col">
			<label
				className={`flex h-14 items-center gap-3 rounded-[16px] border bg-card px-4 shadow-sm transition-[border-color,box-shadow] focus-within:ring-4 ${
					accent === "amber"
						? "border-border focus-within:border-amber-500 focus-within:ring-amber-500/10"
						: "border-border focus-within:border-primary focus-within:ring-primary/10"
				}`}
			>
				<Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
				<input
					autoFocus
					type="text"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Cari nama atau username…"
					aria-label={`Cari nama atau username ${noun}`}
					className="h-full min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium outline-none ring-0 placeholder:font-normal placeholder:text-muted-foreground/70 focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0"
				/>
				{query ? (
					<button
						type="button"
						onClick={() => setQuery("")}
						aria-label="Hapus pencarian"
						className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
					>
						<X className="h-4 w-4" aria-hidden="true" />
					</button>
				) : null}
			</label>

			{!searching && recentUsers.length > 0 ? (
				<>
					<div className="mt-6 flex items-baseline justify-between">
						<h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
							Pilih cepat
						</h2>
						<span className="text-xs text-muted-foreground">Akun terakhir dipakai</span>
					</div>
					<div className="mt-2.5 flex flex-wrap gap-2">
						{recentUsers.slice(0, 4).map((user) => (
							<button
								key={user._id}
								type="button"
								onClick={() => handleSelect(user)}
								className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-3.5 text-[13px] font-semibold shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-[0.98]"
							>
								<span
									className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${avatarTone}`}
								>
									{user.initial}
								</span>
								{user.name}
							</button>
						))}
					</div>
				</>
			) : null}

			<div className="mt-6 flex items-baseline justify-between gap-3">
				<h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
					{searching ? "Hasil pencarian" : "Cari akun untuk melanjutkan"}
				</h2>
				<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
					{searching ? `${filtered.length} hasil` : "Nama atau username"}
				</span>
			</div>

			<div className="mt-2.5">
				{isLoading ? (
					<div className="overflow-hidden rounded-[18px] border border-border bg-card">
						{[0, 1, 2, 3, 4].map((index) => (
							<div
								key={index}
								className={`flex items-center gap-3 p-3.5 ${index === 0 ? "" : "border-t border-border/60"}`}
							>
								<div className="h-9 w-9 shrink-0 animate-pulse rounded-[11px] bg-muted" />
								<div className="flex-1 space-y-2">
									<div className="h-3 w-36 animate-pulse rounded bg-muted" />
									<div className="h-2.5 w-24 animate-pulse rounded bg-muted/70" />
								</div>
							</div>
						))}
					</div>
				) : error ? (
					<div className="rounded-[18px] border border-border bg-card px-6 py-10 text-center">
						<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
							<RefreshCw className="h-5 w-5" aria-hidden="true" />
						</div>
						<h3 className="text-[15px] font-bold tracking-tight">Daftar gagal dimuat</h3>
						<p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">{error}</p>
						<button
							type="button"
							onClick={onRetry}
							className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-5 text-sm font-semibold text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-[0.98]"
						>
							<RefreshCw className="h-4 w-4" aria-hidden="true" />
							Coba lagi
						</button>
					</div>
				) : users.length === 0 ? (
					<div className="rounded-[18px] border border-border bg-card px-6 py-10 text-center">
						<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
							<UserPlus className="h-5 w-5" aria-hidden="true" />
						</div>
						<h3 className="text-[15px] font-bold tracking-tight">Belum ada {noun} terdaftar</h3>
						<p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
							{emptyHint}
						</p>
						<button
							type="button"
							onClick={onRetry}
							className="mt-5 inline-flex h-11 items-center rounded-xl border border-border px-5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
						>
							Muat ulang
						</button>
					</div>
				) : searching && filtered.length === 0 ? (
					<div className="rounded-[18px] border border-border bg-card px-6 py-10 text-center">
						<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
							<Search className="h-5 w-5" aria-hidden="true" />
						</div>
						<h3 className="text-[15px] font-bold tracking-tight">Tidak ada yang cocok</h3>
						<p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
							Tidak ada nama atau username yang mengandung “{normalizeKasirSearch(query)}”. Coba kata kunci lain.
						</p>
						<button
							type="button"
							onClick={() => setQuery("")}
							className="mt-5 inline-flex h-11 items-center rounded-xl border border-border px-5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
						>
							Hapus pencarian
						</button>
					</div>
				) : !searching ? (
					recentUsers.length > 0 ? null : (
						<div className="rounded-[18px] border border-dashed border-border bg-card px-6 py-10 text-center">
							<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
								<Search className="h-5 w-5" aria-hidden="true" />
							</div>
							<h3 className="text-[15px] font-bold tracking-tight">Cari nama {noun}</h3>
							<p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
								Ketik nama atau username di kolom pencarian untuk menemukan akun yang akan dipakai.
							</p>
						</div>
					)
				) : (
					<>
						{/* phone: rows. A list is the fastest thing to read on a narrow screen. */}
						<div className="overflow-hidden rounded-[18px] border border-border bg-card shadow-sm md:hidden">
							{visibleUsers.map((user, index) => (
								<button
									key={user._id}
									type="button"
									onClick={() => handleSelect(user)}
									className={`flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 ${
										index === 0 ? "" : "border-t border-border/60"
									}`}
								>
									<span
										className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-[13px] font-bold ${avatarTone}`}
									>
										{user.initial}
									</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-[15px] font-semibold tracking-tight">{user.name}</span>
										<span className="block truncate text-xs text-muted-foreground">
											@{user.slug || user.username || "-"}
										</span>
									</span>
									<ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
								</button>
							))}
						</div>

						{/* terminal: name cards. Fewer pixels per decision, and a bigger target
						    for a finger that is holding something else. */}
						<div className="hidden gap-3.5 md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
							{visibleUsers.map((user) => (
								<button
									key={user._id}
									type="button"
									onClick={() => handleSelect(user)}
									className="flex flex-col items-center gap-2.5 rounded-[18px] border border-border bg-card p-4 text-center shadow-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-[0.98]"
								>
									<span
										className={`flex h-12 w-12 items-center justify-center rounded-[14px] text-lg font-bold ${avatarTone}`}
									>
										{user.initial}
									</span>
									<span className="w-full truncate text-sm font-semibold leading-tight tracking-tight">
										{user.name}
									</span>
									<span className="w-full truncate text-[11px] text-muted-foreground">
										@{user.slug || user.username || "-"}
									</span>
								</button>
							))}
						</div>
					</>
				)}
			</div>

			{!isLoading && !error && users.length > 0 ? (
				<p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/70">
					<Users className="h-3 w-3" aria-hidden="true" />
					{searching
						? "Pilih hasil yang sesuai, lalu masukkan 6 digit PIN."
						: "Cari akun lain dengan nama atau username."}
				</p>
			) : null}
		</div>
	);
}
