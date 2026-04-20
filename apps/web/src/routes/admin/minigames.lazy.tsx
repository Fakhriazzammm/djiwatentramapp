import { createLazyFileRoute } from "@tanstack/react-router";
import type { Doc, Id } from "@/types/backend-compat";
import {
	useHybridCreateEntryManually,
	useHybridCreateGame,
	useHybridDeleteEntry,
	useHybridDeleteGame,
	useHybridUpdateEntry,
	useHybridUpdateGame,
} from "@/hooks/use-hybrid-write-actions";
import { Gift, Plus, Save, Trash2, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
	useHybridMiniGameEntries,
	useHybridMiniGameEntryStats,
	useHybridMiniGamesList,
} from "@/hooks/use-hybrid-minigames-data";

export const Route = createLazyFileRoute("/admin/minigames")({
	component: AdminMiniGamesPage,
});

type PrizeForm = {
	id: string;
	label: string;
	description: string;
	color: string;
	weight: number;
	stock: string;
	voucherCode: string;
	isActive: boolean;
};

type GameForm = {
	id?: Id<"miniGames">;
	brandSlug: string;
	name: string;
	slug: string;
	description: string;
	isActive: boolean;
	requireUniqueContact: boolean;
	maxSpinsPerContact: number;
	startAt: string;
	endAt: string;
	spinDurationMs: number;
	thankYouMessage: string;
	prizes: PrizeForm[];
};

type EntryForm = {
	id?: Id<"miniGameEntries">;
	gameId: Id<"miniGames"> | "";
	fullName: string;
	email: string;
	whatsapp: string;
	instagram: string;
	prizeLabel: string;
	voucherCode: string;
	contactStatus: "new" | "contacted" | "voucher_sent" | "invalid";
	adminNotes: string;
};

const ENTRY_STATUSES: EntryForm["contactStatus"][] = [
	"new",
	"contacted",
	"voucher_sent",
	"invalid",
];

function createEmptyPrize(): PrizeForm {
	return {
		id: `prize-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
		label: "",
		description: "",
		color: "#f59e0b",
		weight: 1,
		stock: "",
		voucherCode: "",
		isActive: true,
	};
}

function createEmptyGame(): GameForm {
	return {
		brandSlug: "djiwatentram",
		name: "",
		slug: "",
		description: "",
		isActive: true,
		requireUniqueContact: true,
		maxSpinsPerContact: 1,
		startAt: "",
		endAt: "",
		spinDurationMs: 5200,
		thankYouMessage:
			"Terima kasih sudah bermain. Tim marketing akan menghubungi Anda via WA/Email/Instagram.",
		prizes: [
			createEmptyPrize(),
			{
				...createEmptyPrize(),
				color: "#10b981",
			},
		],
	};
}

function createEntryDraft(): EntryForm {
	return {
		gameId: "",
		fullName: "",
		email: "",
		whatsapp: "",
		instagram: "",
		prizeLabel: "",
		voucherCode: "",
		contactStatus: "new",
		adminNotes: "",
	};
}

function toDateTimeInput(timestamp?: number) {
	if (!timestamp) return "";
	const date = new Date(timestamp);
	const offset = date.getTimezoneOffset();
	const localDate = new Date(date.getTime() - offset * 60000);
	return localDate.toISOString().slice(0, 16);
}

function toTimestamp(value: string) {
	if (!value) return undefined;
	const parsed = new Date(value).getTime();
	return Number.isNaN(parsed) ? undefined : parsed;
}

function mapGameToForm(game: Doc<"miniGames">): GameForm {
	return {
		id: game._id,
		brandSlug: game.brandSlug,
		name: game.name,
		slug: game.slug,
		description: game.description ?? "",
		isActive: game.isActive,
		requireUniqueContact: game.requireUniqueContact,
		maxSpinsPerContact: game.maxSpinsPerContact,
		startAt: toDateTimeInput(game.startAt),
		endAt: toDateTimeInput(game.endAt),
		spinDurationMs: game.spinDurationMs ?? 5200,
		thankYouMessage: game.thankYouMessage ?? "",
			prizes: game.prizes.map((prize: any) => ({
				id: prize.id,
				label: prize.label,
			description: prize.description ?? "",
			color: prize.color ?? "#f59e0b",
			weight: prize.weight,
			stock: prize.stock === undefined ? "" : String(prize.stock),
			voucherCode: prize.voucherCode ?? "",
			isActive: prize.isActive,
		})),
	};
}

function AdminMiniGamesPage() {
	const games = useHybridMiniGamesList({ includeInactive: true, limit: 100 });
	const stats = useHybridMiniGameEntryStats({});
	const entries = useHybridMiniGameEntries({ limit: 300 });

	const createGame = useHybridCreateGame();
	const updateGame = useHybridUpdateGame();
	const deleteGame = useHybridDeleteGame();
	const createEntryManually = useHybridCreateEntryManually();
	const updateEntry = useHybridUpdateEntry();
	const deleteEntry = useHybridDeleteEntry();

	const [activeTab, setActiveTab] = useState("settings");
	const [gameForm, setGameForm] = useState<GameForm>(createEmptyGame);
	const [savingGame, setSavingGame] = useState(false);
	const [entryDraft, setEntryDraft] = useState<EntryForm>(createEntryDraft);
	const [editingEntry, setEditingEntry] = useState<EntryForm | null>(null);
	const [savingEntry, setSavingEntry] = useState(false);
	const [statusFilter, setStatusFilter] = useState<"all" | EntryForm["contactStatus"]>("all");
	const [gameFilter, setGameFilter] = useState<Id<"miniGames"> | "all">("all");

	const filteredEntries = useMemo(() => {
		if (!entries) return [];
		return entries.filter((entry: any) => {
			const statusPass = statusFilter === "all" || entry.contactStatus === statusFilter;
			const gamePass = gameFilter === "all" || entry.gameId === gameFilter;
			return statusPass && gamePass;
		});
	}, [entries, statusFilter, gameFilter]);

	const submitGame = async () => {
		if (!gameForm.name || !gameForm.slug || gameForm.prizes.length < 2) {
			toast.error("Nama, slug, dan minimal 2 hadiah wajib diisi");
			return;
		}
		if (gameForm.prizes.some((prize) => !prize.label.trim())) {
			toast.error("Nama hadiah tidak boleh kosong");
			return;
		}

		setSavingGame(true);
		try {
			const payload = {
				brandSlug: gameForm.brandSlug.trim(),
				name: gameForm.name.trim(),
				slug: gameForm.slug.trim(),
				description: gameForm.description.trim() || undefined,
				isActive: gameForm.isActive,
				requireUniqueContact: gameForm.requireUniqueContact,
				maxSpinsPerContact: Math.max(1, Number(gameForm.maxSpinsPerContact) || 1),
				startAt: toTimestamp(gameForm.startAt),
				endAt: toTimestamp(gameForm.endAt),
				spinDurationMs: Math.max(2500, Number(gameForm.spinDurationMs) || 5200),
				thankYouMessage: gameForm.thankYouMessage.trim() || undefined,
				prizes: gameForm.prizes.map((prize) => ({
					id: prize.id,
					label: prize.label.trim(),
					description: prize.description.trim() || undefined,
					color: prize.color.trim() || undefined,
					weight: Math.max(1, Number(prize.weight) || 1),
					stock: prize.stock.trim() === "" ? undefined : Math.max(0, Number(prize.stock) || 0),
					voucherCode: prize.voucherCode.trim() || undefined,
					isActive: prize.isActive,
				})),
			};

			if (gameForm.id) {
				await updateGame({ id: gameForm.id, ...payload });
				toast.success("Mini game berhasil diperbarui");
			} else {
				await createGame(payload);
				toast.success("Mini game berhasil dibuat");
				setGameForm(createEmptyGame());
			}
		} catch (error: any) {
			toast.error(error?.message ?? "Gagal menyimpan mini game");
		} finally {
			setSavingGame(false);
		}
	};

	const submitManualEntry = async () => {
		if (!entryDraft.gameId) {
			toast.error("Pilih mini game terlebih dahulu");
			return;
		}
		if (!entryDraft.fullName || !entryDraft.email || !entryDraft.whatsapp || !entryDraft.instagram) {
			toast.error("Nama, email, WhatsApp, dan Instagram wajib diisi");
			return;
		}
		if (!entryDraft.prizeLabel) {
			toast.error("Hadiah wajib diisi");
			return;
		}

		setSavingEntry(true);
		try {
			await createEntryManually({
				gameId: entryDraft.gameId,
				fullName: entryDraft.fullName.trim(),
				email: entryDraft.email.trim(),
				whatsapp: entryDraft.whatsapp.trim(),
				instagram: entryDraft.instagram.trim(),
				prizeLabel: entryDraft.prizeLabel.trim(),
				voucherCode: entryDraft.voucherCode.trim() || undefined,
				contactStatus: entryDraft.contactStatus,
				adminNotes: entryDraft.adminNotes.trim() || undefined,
			});
			toast.success("Data peserta berhasil ditambahkan");
			setEntryDraft(createEntryDraft());
		} catch (error: any) {
			toast.error(error?.message ?? "Gagal menambahkan data");
		} finally {
			setSavingEntry(false);
		}
	};

	const saveEntryEdit = async () => {
		if (!editingEntry?.id) return;
		setSavingEntry(true);
		try {
			await updateEntry({
				id: editingEntry.id,
				fullName: editingEntry.fullName.trim(),
				email: editingEntry.email.trim(),
				whatsapp: editingEntry.whatsapp.trim(),
				instagram: editingEntry.instagram.trim(),
				prizeLabel: editingEntry.prizeLabel.trim(),
				voucherCode: editingEntry.voucherCode.trim() || undefined,
				contactStatus: editingEntry.contactStatus,
				adminNotes: editingEntry.adminNotes.trim() || undefined,
			});
			toast.success("Data peserta diperbarui");
			setEditingEntry(null);
		} catch (error: any) {
			toast.error(error?.message ?? "Gagal memperbarui data");
		} finally {
			setSavingEntry(false);
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="font-bold text-2xl">Mini Games</h1>
					<p className="text-muted-foreground text-sm">
						Kelola roulette marketing, hadiah, dan data peserta lead.
					</p>
				</div>
				<div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
					<StatCard label="Total Data" value={stats?.total ?? 0} />
					<StatCard label="Baru" value={stats?.new ?? 0} />
					<StatCard label="Dihubungi" value={stats?.contacted ?? 0} />
					<StatCard label="Voucher Terkirim" value={stats?.voucher_sent ?? 0} />
				</div>
			</div>

			<Tabs onValueChange={setActiveTab} value={activeTab}>
				<TabsList className="w-full justify-start sm:w-fit">
					<TabsTrigger value="settings">Pengaturan Mini Games</TabsTrigger>
					<TabsTrigger value="data">Data Peserta</TabsTrigger>
				</TabsList>

				<TabsContent value="settings">
					<div className="grid gap-4 lg:grid-cols-[1.4fr,1fr]">
						<div className="space-y-3 rounded-xl border bg-card p-4">
							<div className="flex items-center justify-between">
								<h2 className="font-semibold text-base">
									{gameForm.id ? "Edit Mini Game" : "Buat Mini Game Baru"}
								</h2>
								{gameForm.id && (
									<Button
										onClick={() => setGameForm(createEmptyGame())}
										size="sm"
										variant="outline"
									>
										Reset Form
									</Button>
								)}
							</div>

							<div className="grid gap-3 sm:grid-cols-2">
								<Field label="Brand Slug">
									<Input
										onChange={(e) => setGameForm((prev) => ({ ...prev, brandSlug: e.target.value }))}
										placeholder="djiwatentram"
										value={gameForm.brandSlug}
									/>
								</Field>
								<Field label="Nama Mini Game">
									<Input
										onChange={(e) => setGameForm((prev) => ({ ...prev, name: e.target.value }))}
										placeholder="Roulette Voucher April"
										value={gameForm.name}
									/>
								</Field>
								<Field label="Slug URL Game">
									<Input
										onChange={(e) =>
											setGameForm((prev) => ({
												...prev,
												slug: e.target.value.toLowerCase().replace(/\s+/g, "-"),
											}))
										}
										placeholder="roulette-voucher-april"
										value={gameForm.slug}
									/>
								</Field>
								<Field label="Durasi Spin (ms)">
									<Input
										min={2500}
										onChange={(e) =>
											setGameForm((prev) => ({
												...prev,
												spinDurationMs: Number(e.target.value) || 5200,
											}))
										}
										type="number"
										value={gameForm.spinDurationMs}
									/>
								</Field>
							</div>

							<Field label="Deskripsi">
								<Textarea
									onChange={(e) => setGameForm((prev) => ({ ...prev, description: e.target.value }))}
									placeholder="Mini game spin untuk campaign marketing..."
									rows={2}
									value={gameForm.description}
								/>
							</Field>

							<Field label="Pesan Setelah Menang">
								<Textarea
									onChange={(e) =>
										setGameForm((prev) => ({ ...prev, thankYouMessage: e.target.value }))
									}
									rows={2}
									value={gameForm.thankYouMessage}
								/>
							</Field>

							<div className="grid gap-3 sm:grid-cols-2">
								<Field label="Mulai">
									<Input
										onChange={(e) => setGameForm((prev) => ({ ...prev, startAt: e.target.value }))}
										type="datetime-local"
										value={gameForm.startAt}
									/>
								</Field>
								<Field label="Selesai">
									<Input
										onChange={(e) => setGameForm((prev) => ({ ...prev, endAt: e.target.value }))}
										type="datetime-local"
										value={gameForm.endAt}
									/>
								</Field>
							</div>

							<div className="grid gap-3 sm:grid-cols-3">
								<SwitchField
									checked={gameForm.isActive}
									label="Game Aktif"
									onChange={(checked) => setGameForm((prev) => ({ ...prev, isActive: checked }))}
								/>
								<SwitchField
									checked={gameForm.requireUniqueContact}
									label="Batasi per Kontak"
									onChange={(checked) =>
										setGameForm((prev) => ({ ...prev, requireUniqueContact: checked }))
									}
								/>
								<Field label="Maksimal Spin/Kontak">
									<Input
										min={1}
										onChange={(e) =>
											setGameForm((prev) => ({
												...prev,
												maxSpinsPerContact: Math.max(1, Number(e.target.value) || 1),
											}))
										}
										type="number"
										value={gameForm.maxSpinsPerContact}
									/>
								</Field>
							</div>

							<div className="space-y-2 rounded-lg border p-3">
								<div className="flex items-center justify-between">
									<h3 className="font-semibold text-sm">Hadiah Roulette</h3>
									<Button
										onClick={() =>
											setGameForm((prev) => ({
												...prev,
												prizes: [...prev.prizes, createEmptyPrize()],
											}))
										}
										size="sm"
										type="button"
										variant="outline"
									>
										<Plus className="mr-1 h-4 w-4" />
										Tambah Hadiah
									</Button>
								</div>
								<div className="space-y-2">
									{gameForm.prizes.map((prize, index) => (
										<div className="grid gap-2 rounded-md border p-2 sm:grid-cols-12" key={prize.id}>
											<Input
												className="sm:col-span-3"
												onChange={(e) =>
													setGameForm((prev) => ({
														...prev,
														prizes: prev.prizes.map((row, rowIndex) =>
															rowIndex === index ? { ...row, label: e.target.value } : row
														),
													}))
												}
												placeholder="Nama hadiah"
												value={prize.label}
											/>
											<Input
												className="sm:col-span-2"
												onChange={(e) =>
													setGameForm((prev) => ({
														...prev,
														prizes: prev.prizes.map((row, rowIndex) =>
															rowIndex === index ? { ...row, color: e.target.value } : row
														),
													}))
												}
												placeholder="#f59e0b"
												value={prize.color}
											/>
											<Input
												className="sm:col-span-2"
												min={1}
												onChange={(e) =>
													setGameForm((prev) => ({
														...prev,
														prizes: prev.prizes.map((row, rowIndex) =>
															rowIndex === index
																? { ...row, weight: Math.max(1, Number(e.target.value) || 1) }
																: row
														),
													}))
												}
												placeholder="Bobot"
												type="number"
												value={prize.weight}
											/>
											<Input
												className="sm:col-span-2"
												onChange={(e) =>
													setGameForm((prev) => ({
														...prev,
														prizes: prev.prizes.map((row, rowIndex) =>
															rowIndex === index ? { ...row, stock: e.target.value } : row
														),
													}))
												}
												placeholder="Stok"
												type="number"
												value={prize.stock}
											/>
											<Input
												className="sm:col-span-2"
												onChange={(e) =>
													setGameForm((prev) => ({
														...prev,
														prizes: prev.prizes.map((row, rowIndex) =>
															rowIndex === index ? { ...row, voucherCode: e.target.value } : row
														),
													}))
												}
												placeholder="Kode voucher"
												value={prize.voucherCode}
											/>
											<Button
												className="sm:col-span-1"
												disabled={gameForm.prizes.length <= 2}
												onClick={() =>
													setGameForm((prev) => ({
														...prev,
														prizes: prev.prizes.filter((row) => row.id !== prize.id),
													}))
												}
												size="icon"
												type="button"
												variant="ghost"
											>
												<Trash2 className="h-4 w-4 text-destructive" />
											</Button>
											<Textarea
												className="sm:col-span-9"
												onChange={(e) =>
													setGameForm((prev) => ({
														...prev,
														prizes: prev.prizes.map((row, rowIndex) =>
															rowIndex === index ? { ...row, description: e.target.value } : row
														),
													}))
												}
												placeholder="Deskripsi hadiah"
												rows={1}
												value={prize.description}
											/>
											<label className="flex items-center gap-2 text-xs sm:col-span-3">
												<input
													checked={prize.isActive}
													onChange={(e) =>
														setGameForm((prev) => ({
															...prev,
															prizes: prev.prizes.map((row, rowIndex) =>
																rowIndex === index
																	? { ...row, isActive: e.target.checked }
																	: row
															),
														}))
													}
													type="checkbox"
												/>
												Hadiah aktif
											</label>
										</div>
									))}
								</div>
							</div>

							<Button disabled={savingGame} onClick={submitGame}>
								<Save className="mr-2 h-4 w-4" />
								{savingGame ? "Menyimpan..." : gameForm.id ? "Perbarui Mini Game" : "Simpan Mini Game"}
							</Button>
						</div>

						<div className="space-y-3 rounded-xl border bg-card p-4">
							<div className="flex items-center gap-2">
								<Trophy className="h-4 w-4 text-primary" />
								<h2 className="font-semibold text-base">Daftar Mini Games</h2>
							</div>
							<div className="space-y-2">
								{games === undefined && <p className="text-muted-foreground text-sm">Memuat data...</p>}
								{games?.length === 0 && (
									<p className="text-muted-foreground text-sm">Belum ada mini game.</p>
								)}
								{games?.map((game: any) => (
									<div
										className="space-y-2 rounded-lg border p-3"
										key={game._id}
									>
										<div className="flex items-start justify-between gap-2">
											<div>
												<p className="font-semibold text-sm">{game.name}</p>
												<p className="text-muted-foreground text-xs">
													/{game.brandSlug}/minigames â€¢ {game.slug}
												</p>
											</div>
											<span
												className={`rounded-full px-2 py-0.5 text-[10px] ${
													game.isActive
														? "bg-emerald-100 text-emerald-700"
														: "bg-muted text-muted-foreground"
												}`}
											>
												{game.isActive ? "AKTIF" : "NONAKTIF"}
											</span>
										</div>
										<div className="flex items-center justify-between">
											<p className="text-muted-foreground text-xs">
												Hadiah: {game.prizes.length} â€¢ Spin/Kontak: {game.maxSpinsPerContact}
											</p>
											<div className="flex gap-1">
												<Button
													onClick={() => setGameForm(mapGameToForm(game))}
													size="sm"
													type="button"
													variant="outline"
												>
													Edit
												</Button>
												<Button
													onClick={async () => {
														try {
															await deleteGame({ id: game._id });
															toast.success("Mini game dihapus");
															if (gameForm.id === game._id) {
																setGameForm(createEmptyGame());
															}
														} catch (error: any) {
															toast.error(error?.message ?? "Gagal menghapus mini game");
														}
													}}
													size="sm"
													type="button"
													variant="ghost"
												>
													<Trash2 className="h-4 w-4 text-destructive" />
												</Button>
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="data">
					<div className="space-y-4 rounded-xl border bg-card p-4">
						<div className="grid gap-3 lg:grid-cols-4">
							<Field label="Filter Mini Game">
								<select
									className="h-9 rounded-md border px-3 text-sm"
									onChange={(e) =>
										setGameFilter(
											e.target.value === "all"
												? "all"
												: (e.target.value as Id<"miniGames">)
										)
									}
									value={gameFilter}
								>
									<option value="all">Semua Mini Game</option>
									{games?.map((game: any) => (
										<option key={game._id} value={game._id}>
											{game.name}
										</option>
									))}
								</select>
							</Field>
							<Field label="Filter Status">
								<select
									className="h-9 rounded-md border px-3 text-sm"
									onChange={(e) =>
										setStatusFilter(e.target.value as "all" | EntryForm["contactStatus"])
									}
									value={statusFilter}
								>
									<option value="all">Semua Status</option>
									{ENTRY_STATUSES.map((status) => (
										<option key={status} value={status}>
											{status}
										</option>
									))}
								</select>
							</Field>
						</div>

						<div className="rounded-lg border bg-muted/20 p-3">
							<h3 className="mb-2 font-semibold text-sm">Tambah Data Manual</h3>
							<div className="grid gap-2 md:grid-cols-4">
								<select
									className="h-9 rounded-md border px-3 text-sm"
									onChange={(e) =>
										setEntryDraft((prev) => ({
											...prev,
											gameId: e.target.value as Id<"miniGames">,
										}))
									}
									value={entryDraft.gameId}
								>
									<option value="">Pilih Game</option>
									{games?.map((game: any) => (
										<option key={game._id} value={game._id}>
											{game.name}
										</option>
									))}
								</select>
								<Input
									onChange={(e) =>
										setEntryDraft((prev) => ({ ...prev, fullName: e.target.value }))
									}
									placeholder="Nama lengkap"
									value={entryDraft.fullName}
								/>
								<Input
									onChange={(e) =>
										setEntryDraft((prev) => ({ ...prev, email: e.target.value }))
									}
									placeholder="Email"
									value={entryDraft.email}
								/>
								<Input
									onChange={(e) =>
										setEntryDraft((prev) => ({ ...prev, whatsapp: e.target.value }))
									}
									placeholder="WhatsApp"
									value={entryDraft.whatsapp}
								/>
								<Input
									onChange={(e) =>
										setEntryDraft((prev) => ({ ...prev, instagram: e.target.value }))
									}
									placeholder="Instagram"
									value={entryDraft.instagram}
								/>
								<Input
									onChange={(e) =>
										setEntryDraft((prev) => ({ ...prev, prizeLabel: e.target.value }))
									}
									placeholder="Hadiah"
									value={entryDraft.prizeLabel}
								/>
								<Input
									onChange={(e) =>
										setEntryDraft((prev) => ({ ...prev, voucherCode: e.target.value }))
									}
									placeholder="Voucher (opsional)"
									value={entryDraft.voucherCode}
								/>
								<Button disabled={savingEntry} onClick={submitManualEntry} type="button">
									<Plus className="mr-2 h-4 w-4" />
									Tambah Data
								</Button>
							</div>
						</div>

						<div className="overflow-x-auto rounded-lg border">
							<table className="min-w-full text-xs">
								<thead className="bg-muted/40 text-left">
									<tr>
										<th className="px-3 py-2">Waktu</th>
										<th className="px-3 py-2">Mini Game</th>
										<th className="px-3 py-2">Peserta</th>
										<th className="px-3 py-2">Hadiah</th>
										<th className="px-3 py-2">Status</th>
										<th className="px-3 py-2">Aksi</th>
									</tr>
								</thead>
								<tbody>
									{filteredEntries.map((entry: any) => {
										const game = games?.find((row: any) => row._id === entry.gameId);
										return (
											<tr className="border-t" key={entry._id}>
												<td className="px-3 py-2">
													{new Date(entry.createdAt).toLocaleString("id-ID")}
												</td>
												<td className="px-3 py-2">{game?.name ?? "-"}</td>
												<td className="space-y-0.5 px-3 py-2">
													<p className="font-medium">{entry.fullName}</p>
													<p className="text-muted-foreground">{entry.email}</p>
													<p className="text-muted-foreground">{entry.whatsapp}</p>
													<p className="text-muted-foreground">@{entry.instagram}</p>
												</td>
												<td className="px-3 py-2">
													<p className="font-medium">{entry.prizeLabel}</p>
													<p className="text-muted-foreground">{entry.voucherCode ?? "-"}</p>
												</td>
												<td className="px-3 py-2">{entry.contactStatus}</td>
												<td className="px-3 py-2">
													<div className="flex gap-1">
														<Button
															onClick={() =>
																setEditingEntry({
																	id: entry._id,
																	gameId: entry.gameId,
																	fullName: entry.fullName,
																	email: entry.email,
																	whatsapp: entry.whatsapp,
																	instagram: entry.instagram,
																	prizeLabel: entry.prizeLabel,
																	voucherCode: entry.voucherCode ?? "",
																	contactStatus: entry.contactStatus,
																	adminNotes: entry.adminNotes ?? "",
																})
															}
															size="sm"
															type="button"
															variant="outline"
														>
															Edit
														</Button>
														<Button
															onClick={async () => {
																try {
																	await deleteEntry({ id: entry._id });
																	toast.success("Data peserta dihapus");
																} catch (error: any) {
																	toast.error(error?.message ?? "Gagal menghapus data");
																}
															}}
															size="sm"
															type="button"
															variant="ghost"
														>
															<Trash2 className="h-4 w-4 text-destructive" />
														</Button>
													</div>
												</td>
											</tr>
										);
									})}
									{filteredEntries.length === 0 && (
										<tr>
											<td className="px-3 py-6 text-center text-muted-foreground" colSpan={6}>
												Belum ada data peserta.
											</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>
					</div>
				</TabsContent>
			</Tabs>

			{editingEntry && (
				<div className="rounded-xl border bg-card p-4">
					<div className="mb-3 flex items-center justify-between">
						<h3 className="font-semibold text-sm">Edit Data Peserta</h3>
						<Button onClick={() => setEditingEntry(null)} size="sm" variant="outline">
							Tutup
						</Button>
					</div>
					<div className="grid gap-2 md:grid-cols-2">
						<Input
							onChange={(e) =>
								setEditingEntry((prev) => (prev ? { ...prev, fullName: e.target.value } : prev))
							}
							placeholder="Nama lengkap"
							value={editingEntry.fullName}
						/>
						<Input
							onChange={(e) =>
								setEditingEntry((prev) => (prev ? { ...prev, email: e.target.value } : prev))
							}
							placeholder="Email"
							value={editingEntry.email}
						/>
						<Input
							onChange={(e) =>
								setEditingEntry((prev) => (prev ? { ...prev, whatsapp: e.target.value } : prev))
							}
							placeholder="WhatsApp"
							value={editingEntry.whatsapp}
						/>
						<Input
							onChange={(e) =>
								setEditingEntry((prev) => (prev ? { ...prev, instagram: e.target.value } : prev))
							}
							placeholder="Instagram"
							value={editingEntry.instagram}
						/>
						<Input
							onChange={(e) =>
								setEditingEntry((prev) => (prev ? { ...prev, prizeLabel: e.target.value } : prev))
							}
							placeholder="Hadiah"
							value={editingEntry.prizeLabel}
						/>
						<Input
							onChange={(e) =>
								setEditingEntry((prev) => (prev ? { ...prev, voucherCode: e.target.value } : prev))
							}
							placeholder="Voucher"
							value={editingEntry.voucherCode}
						/>
						<select
							className="h-9 rounded-md border px-3 text-sm"
							onChange={(e) =>
								setEditingEntry((prev) =>
									prev
										? {
												...prev,
												contactStatus: e.target.value as EntryForm["contactStatus"],
											}
										: prev
								)
							}
							value={editingEntry.contactStatus}
						>
							{ENTRY_STATUSES.map((status) => (
								<option key={status} value={status}>
									{status}
								</option>
							))}
						</select>
						<Textarea
							onChange={(e) =>
								setEditingEntry((prev) => (prev ? { ...prev, adminNotes: e.target.value } : prev))
							}
							placeholder="Catatan admin"
							rows={2}
							value={editingEntry.adminNotes}
						/>
					</div>
					<div className="mt-3">
						<Button disabled={savingEntry} onClick={saveEntryEdit}>
							<Save className="mr-2 h-4 w-4" />
							{savingEntry ? "Menyimpan..." : "Simpan Perubahan"}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

function StatCard({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-lg border bg-card px-3 py-2">
			<p className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</p>
			<p className="font-bold text-base">{value}</p>
		</div>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1">
			<p className="font-medium text-muted-foreground text-xs">{label}</p>
			{children}
		</div>
	);
}

function SwitchField({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<label className="flex h-9 items-center gap-2 rounded-md border px-3 text-xs">
			<input
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				type="checkbox"
			/>
			{label}
		</label>
	);
}

