import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { requestAdminConfirm } from "@/lib/admin-dialogs";
import { agoLabel, monoLabel, num, Pill } from "@/components/djiwa-app/ui";
import { automationApi, renderWith, type Automation, type AutomationHealth, type AutomationSend } from "@/components/djiwa-app/email-api";

const inputCls = "h-[34px] w-full border border-border bg-card px-2.5 text-[13px] outline-none focus:border-foreground/40";
const btn = "h-[34px] border border-border bg-card px-3 text-xs font-semibold hover:border-foreground/30 disabled:opacity-40";
const btnPrimary = "h-[34px] bg-[#111114] px-3.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-40";
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Terjadi kesalahan");
const pct = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : "—");
const SEND_STATUS: Record<string, [string, "ok" | "warn" | "bad" | "info" | ""]> = { sent: ["Terkirim", "info"], delivered: ["Sampai", "ok"], bounced: ["Bounce", "bad"], complained: ["Komplain", "bad"], failed: ["Gagal", "bad"], skipped: ["Dilewati", "warn"], queued: ["Antre", ""] };

export function Automations({ onChanged }: { onChanged?: () => void }) {
	const [items, setItems] = useState<Automation[] | null>(null);
	const [health, setHealth] = useState<AutomationHealth | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [open, setOpen] = useState<string | null>(null);

	const load = useCallback(async () => {
		try { const r = await automationApi<{ automations: Automation[]; health?: AutomationHealth | null }>("list"); setItems(r.automations); setHealth(r.health ?? null); setError(null); }
		catch (e) { setError(errorMessage(e)); }
	}, []);
	useEffect(() => { void load(); }, [load]);

	if (error) return <div className="border border-red-200 bg-red-50 px-3.5 py-3 text-[12.5px] text-red-800">{error} <button className="ml-2 underline" onClick={() => void load()}>Coba lagi</button></div>;
	if (!items) return <Skeleton className="h-72 w-full rounded-none" />;

	const active = items.filter((a) => a.enabled).length;
	return (
		<div className="grid gap-3">
			<div className="border border-border bg-card px-3.5 py-2.5 text-[12.5px] text-[#444450]">
				Email otomatis dikirim server setiap 5 menit sesuai aturan di bawah. Hanya yang <strong>aktif</strong> yang berjalan. Email marketing hanya ke pelanggan berizin dan mematuhi batas 72 jam; email transaksional (struk pesanan, reservasi) tidak memakai batas itu dan boleh ke pembeli yang belum berizin pemasaran.
				<span className="ml-2 font-mono text-[11px] text-muted-foreground">{active} dari {items.length} aktif</span>
			</div>
			{health ? <HealthBar health={health} /> : null}
			{items.map((item) => (
				<AutomationCard key={item.key} item={item} expanded={open === item.key} onToggleOpen={() => setOpen(open === item.key ? null : item.key)} onUpdated={(next) => { setItems(next); onChanged?.(); }} reload={load} />
			))}
		</div>
	);
}

function HealthBar({ health }: { health: AutomationHealth }) {
	const ratio = health.quotaLimit ? health.quotaUsed / health.quotaLimit : 0;
	const quotaTone = ratio >= 0.9 ? "bad" : ratio >= 0.7 ? "warn" : "ok";
	const domainOk = health.domain?.status === "verified" && health.domain.dkim === "success" && health.domain.spf && health.domain.dmarc;
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border border-border bg-card px-3.5 py-2 text-[12px]">
			<span><span className={monoLabel}>Kuota bulan ini</span> <Pill tone={quotaTone}>{num(health.quotaUsed)} / {health.quotaLimit ? num(health.quotaLimit) : "∞"}</Pill>{ratio >= 0.7 ? <span className="ml-1 text-muted-foreground">{ratio >= 0.9 ? "hampir habis, email otomatis bisa berhenti" : "mulai menipis"}</span> : null}</span>
			<span><span className={monoLabel}>Terkirim hari ini</span> <span className="font-semibold tabular-nums">{num(health.sentToday)}</span></span>
			<span><span className={monoLabel}>Domain pengirim</span> {health.domain ? <Pill tone={domainOk ? "ok" : "warn"}>{health.domain.name} · {domainOk ? "terverifikasi" : "perlu dicek"}</Pill> : <Pill tone="warn">belum ada</Pill>}</span>
		</div>
	);
}

function AutomationCard({ item, expanded, onToggleOpen, onUpdated, reload }: { item: Automation; expanded: boolean; onToggleOpen: () => void; onUpdated: (items: Automation[]) => void; reload: () => Promise<void> }) {
	const [busy, setBusy] = useState<string | null>(null);
	const s = item.stats;

	const toggle = async () => {
		if (!item.enabled && item.eligibleNow > 0) {
			const ok = await requestAdminConfirm({
				title: `Aktifkan "${item.name}"?`,
				message: `${num(item.eligibleNow)} penerima memenuhi syarat sekarang. Email mulai terkirim dalam ≤5 menit, maksimal ${num(item.dailyLimit)} per hari.`,
				confirmText: "Aktifkan",
			});
			if (!ok) return;
		}
		setBusy("toggle");
		try { onUpdated((await automationApi<{ automations: Automation[] }>("update", { key: item.key, enabled: !item.enabled })).automations); toast.success(item.enabled ? "Otomasi dinonaktifkan" : "Otomasi aktif"); }
		catch (e) { toast.error(errorMessage(e)); }
		finally { setBusy(null); }
	};

	return (
		<section className="border border-border bg-card">
			<div className="flex flex-wrap items-start justify-between gap-3 px-3.5 py-3">
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-1.5">
						<h3 className="text-[14px] font-semibold">{item.name}</h3>
						<Pill tone={item.kind === "marketing" ? "info" : "ok"}>{item.kind === "marketing" ? "Marketing" : "Transaksional"}</Pill>
						{item.customized ? <Pill>Teks diubah</Pill> : null}
						{item.lastError ? <Pill tone="bad">Ada error</Pill> : null}
					</div>
					<p className="mt-1 text-[12.5px] text-[#444450]">{item.description}</p>
					<p className="mt-1 text-[11.5px] text-muted-foreground">Aturan: {item.trigger}</p>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-[11.5px] text-muted-foreground">{item.enabled ? "Aktif" : "Nonaktif"}</span>
					<button type="button" role="switch" aria-checked={item.enabled} aria-label={`Aktifkan ${item.name}`} disabled={busy !== null} onClick={() => void toggle()} className={`relative h-5 w-9 flex-none border transition ${item.enabled ? "border-[#111114] bg-[#111114]" : "border-border bg-muted"} disabled:opacity-40`}>
						<span className={`absolute top-px h-[16px] w-[16px] bg-white shadow transition-all ${item.enabled ? "left-[18px]" : "left-px"}`} />
					</button>
				</div>
			</div>
			<div className="grid grid-cols-3 gap-px border-t border-border bg-border sm:grid-cols-6">
				{[
					["Menunggu", num(item.eligibleNow), "memenuhi syarat"],
					["Terkirim 30h", num(s.sent), item.lastRunAt ? `jalan ${agoLabel(item.lastRunAt)}` : "belum jalan"],
					["Sampai", pct(s.delivered, s.sent), `${num(s.delivered)} email`],
					["Dibuka", pct(s.opened, s.sent), `${num(s.opened)} email`],
					["Klik", pct(s.clicked, s.sent), `${num(s.clicked)} email`],
					item.focus === "clicks" ? ["Klik ulasan", pct(s.clicked, s.sent), `${num(s.clicked)} orang`] : s.tracksReturn ? ["Pesan lagi ≤7h", pct(s.returned, s.sent), `${num(s.returned)} orang`] : ["Gagal / bounce", num(s.failed), "30 hari"],
				].map(([label, value, hint]) => (
					<div key={label} className="grid content-start gap-0.5 bg-card px-3 py-2">
						<span className={monoLabel}>{label}</span>
						<span className="text-[17px] font-semibold tabular-nums">{value}</span>
						<span className="text-[11px] text-muted-foreground">{hint}</span>
					</div>
				))}
			</div>
			{item.lastError ? <p className="border-t border-border bg-red-50 px-3.5 py-2 text-[12px] text-red-800">Terakhir: {item.lastError}</p> : null}
			<div className="border-t border-border px-3.5 py-2">
				<button type="button" className="font-mono text-[11.5px] font-medium text-[#444450] hover:text-foreground" onClick={onToggleOpen}>{expanded ? "Tutup pengaturan ▲" : "Atur, pratinjau, riwayat ▼"}</button>
			</div>
			{expanded ? <AutomationEditor item={item} onUpdated={onUpdated} reload={reload} /> : null}
		</section>
	);
}

function AutomationEditor({ item, onUpdated, reload }: { item: Automation; onUpdated: (items: Automation[]) => void; reload: () => Promise<void> }) {
	const [delay, setDelay] = useState(String(item.delayHours));
	const [limit, setLimit] = useState(String(item.dailyLimit));
	const [subject, setSubject] = useState(item.subject);
	const [html, setHtml] = useState(item.html);
	const [testTo, setTestTo] = useState("");
	const [sends, setSends] = useState<AutomationSend[] | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const dirty = delay !== String(item.delayHours) || limit !== String(item.dailyLimit) || subject !== item.subject || html !== item.html;

	useEffect(() => { void automationApi<{ sends: AutomationSend[] }>("recent", { key: item.key }).then((r) => setSends(r.sends)).catch(() => setSends([])); }, [item.key]);

	const run = async (name: string, fn: () => Promise<void>) => {
		setBusy(name);
		try { await fn(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
	};
	const save = () => run("save", async () => {
		const r = await automationApi<{ automations: Automation[] }>("update", { key: item.key, delayHours: Number(delay), dailyLimit: Number(limit), subject, html });
		onUpdated(r.automations); toast.success("Pengaturan disimpan");
	});
	const reset = () => run("reset", async () => {
		if (!(await requestAdminConfirm({ title: "Kembalikan teks bawaan?", message: "Subjek dan isi email kembali ke versi bawaan sistem.", confirmText: "Kembalikan" }))) return;
		const r = await automationApi<{ automations: Automation[] }>("update", { key: item.key, reset: true });
		onUpdated(r.automations); setSubject(item.defaultSubject); setHtml(item.defaultHtml); toast.success("Teks dikembalikan");
	});
	const test = () => run("test", async () => { await automationApi("send-test", { key: item.key, to: testTo }); toast.success(`Email uji dikirim ke ${testTo}`); });
	const runNow = () => run("run", async () => {
		const r = await automationApi<{ result: { sent: number; note: string; eligible: number }; automations: Automation[] }>("run-now", { key: item.key });
		onUpdated(r.automations);
		toast.success(r.result.sent ? `${r.result.sent} email terkirim` : r.result.note || "Tidak ada yang perlu dikirim");
		setSends((await automationApi<{ sends: AutomationSend[] }>("recent", { key: item.key })).sends); void reload();
	});

	return (
		<div className="grid gap-4 border-t border-border bg-[#fafafb] p-3.5 lg:grid-cols-2">
			<div className="grid content-start gap-3">
				<div className="grid grid-cols-2 gap-3">
					<label className="grid gap-1"><span className={monoLabel}>Jeda (jam)</span><input className={inputCls} type="number" min={0} max={720} value={delay} onChange={(e) => setDelay(e.target.value)} /></label>
					<label className="grid gap-1"><span className={monoLabel}>Maks. per hari</span><input className={inputCls} type="number" min={1} max={1000} value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
				</div>
				<label className="grid gap-1"><span className={monoLabel}>Subjek</span><input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
				<label className="grid gap-1">
					<span className={monoLabel}>Isi email (HTML)</span>
					<textarea className="min-h-[200px] w-full border border-border bg-card p-2.5 font-mono text-[11.5px] leading-5 outline-none focus:border-foreground/40" value={html} onChange={(e) => setHtml(e.target.value)} spellCheck={false} />
					<span className="text-[11px] text-muted-foreground">Variabel: {item.variables.map((v) => (v === "link" ? "{{{link}}}" : `{{${v}}}`)).join(" ")}{item.kind === "marketing" ? " · wajib {{{unsubscribe_url}}}" : ""}</span>
				</label>
				<div className="flex flex-wrap gap-2">
					<button className={btnPrimary} disabled={!dirty || busy !== null} onClick={() => void save()}>{busy === "save" ? "Menyimpan…" : "Simpan"}</button>
					{item.customized ? <button className={btn} disabled={busy !== null} onClick={() => void reset()}>Kembalikan bawaan</button> : null}
					<button className={btn} disabled={!item.enabled || busy !== null} title={item.enabled ? "Kirim yang memenuhi syarat sekarang" : "Aktifkan dulu"} onClick={() => void runNow()}>{busy === "run" ? "Mengirim…" : "Jalankan sekarang"}</button>
				</div>
				<div className="flex gap-2">
					<input className={inputCls} type="email" placeholder="Kirim uji ke email…" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
					<button className={btn} disabled={!testTo || busy !== null} onClick={() => void test()}>{busy === "test" ? "…" : "Kirim uji"}</button>
				</div>
			</div>
			<div className="grid content-start gap-3">
				<div>
					<span className={monoLabel}>Pratinjau (data contoh)</span>
					<p className="mt-1 text-[12px] font-medium">{renderWith(subject, item.sampleVars)}</p>
					<iframe title={`Pratinjau ${item.name}`} sandbox="" className="mt-1 h-[340px] w-full border border-border bg-white" srcDoc={renderWith(html, item.sampleVars)} />
				</div>
				<div>
					<span className={monoLabel}>Riwayat terbaru</span>
					{!sends ? <Skeleton className="mt-1 h-20 w-full rounded-none" /> : sends.length === 0 ? <p className="mt-1 text-[12px] text-muted-foreground">Belum ada pengiriman.</p> : (
						<ul className="mt-1 max-h-48 divide-y divide-border overflow-auto border border-border bg-card text-[12px]">
							{sends.map((row) => {
								const [label, tone] = SEND_STATUS[row.status] ?? [row.status, ""];
								return <li key={row.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5"><span className="min-w-0 truncate">{row.name || row.email}<span className="ml-1.5 text-muted-foreground">{row.email}</span></span><span className="flex-none">{row.opened_at ? <Pill tone="ok">Dibuka</Pill> : null}<Pill tone={tone}>{label}</Pill><span className="ml-1 text-muted-foreground">{agoLabel(row.sent_at ?? row.created_at)}</span></span></li>;
							})}
						</ul>
					)}
				</div>
			</div>
		</div>
	);
}
