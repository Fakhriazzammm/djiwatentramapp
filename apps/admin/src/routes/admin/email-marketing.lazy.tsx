import { createLazyFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Automations } from "@/components/djiwa-app/email-automations";
import { agoLabel, Kpis, monoLabel, num, Panel, Pill, Tabs } from "@/components/djiwa-app/ui";
import {
	emailApi, renderPreview, STATUS_LABEL,
	type AudiencePreview, type Campaign, type CampaignDetail, type Overview, type Suppression, type TemplateRow,
} from "@/components/djiwa-app/email-api";

export const Route = createLazyFileRoute("/admin/email-marketing")({
	component: EmailMarketingPage,
});

type Tab = "campaigns" | "automations" | "templates" | "suppressions";
const statusTone = (status: Campaign["status"]) => status === "done" ? "ok" : status === "sending" ? "info" : status === "paused" || status === "scheduled" ? "warn" : status === "canceled" ? "bad" : "";
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Terjadi kesalahan");
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
const inputCls = "h-[34px] w-full border border-border bg-card px-2.5 text-[13px] outline-none focus:border-foreground/40";
const btn = "h-[34px] border border-border bg-card px-3 text-xs font-semibold hover:border-foreground/30 disabled:opacity-40";
const btnPrimary = "h-[34px] bg-[#111114] px-3.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-40";
const VARIABLES = ["{{nama}}", "{{saldo}}", "{{exp_member}}", "{{hari_tidak_aktif}}", "{{{link}}}", "{{{unsubscribe_url}}}"];

function EmailMarketingPage() {
	const [tab, setTab] = useState<Tab>("campaigns");
	const [overview, setOverview] = useState<Overview | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [composer, setComposer] = useState<{ template?: TemplateRow; segment?: string } | null>(null);
	const [templateEditor, setTemplateEditor] = useState<TemplateRow | "new" | null>(null);
	const [openCampaign, setOpenCampaign] = useState<string | null>(null);
	const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
	const [reloadKey, setReloadKey] = useState(0);

	const reload = useCallback(() => setReloadKey((value) => value + 1), []);
	useEffect(() => {
		let active = true;
		setLoadError(null);
		Promise.all([emailApi<Overview>("overview"), emailApi<{ campaigns: Campaign[] }>("list-campaigns")])
			.then(([data, list]) => { if (!active) return; setOverview(data); setCampaigns(list.campaigns); })
			.catch((error) => { if (active) setLoadError(errorMessage(error)); });
		return () => { active = false; };
	}, [reloadKey]);

	// Deep link from the Pelanggan page: /admin/email-marketing?segment=reactivate
	useEffect(() => {
		const segment = new URLSearchParams(window.location.search).get("segment");
		if (segment) setComposer({ segment });
	}, []);

	const header = (
		<div className="flex flex-wrap items-end justify-between gap-3">
			<div>
				<div className="font-mono text-[10px] tracking-[0.04em] text-muted-foreground">DJIWA APP / EMAIL MARKETING</div>
				<h1 className="text-[19px] font-semibold leading-tight tracking-tight">Email Marketing</h1>
			</div>
			<div className="flex gap-2">
				<button type="button" className={btn} onClick={reload} aria-label="Muat ulang"><RefreshCw className="mr-1.5 inline h-3.5 w-3.5" />Muat ulang</button>
				{!composer && !openCampaign ? <button type="button" className={btnPrimary} onClick={() => setComposer({})} disabled={!overview}>Kampanye baru</button> : null}
			</div>
		</div>
	);

	if (loadError) return <div className="space-y-3.5">{header}<div className="border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p className="font-bold">Gagal memuat Email Marketing.</p><p className="mt-1">{loadError}</p><button type="button" onClick={reload} className="mt-3 h-9 bg-red-600 px-4 text-xs font-bold text-white">Coba lagi</button></div></div>;
	if (!overview) return <div className="space-y-3.5">{header}<Skeleton className="h-20 w-full rounded-none" /><Skeleton className="h-9 w-72 rounded-none" /><Skeleton className="h-72 w-full rounded-none" /></div>;

	const { quota } = overview;
	const expiresSoon = quota?.expiredAt ? new Date(quota.expiredAt).getTime() - Date.now() < 3 * 86_400_000 : false;
	const quotaLow = quota?.remaining !== null && quota?.remaining !== undefined && quota.remaining < 200;

	if (composer) return (
		<div className="space-y-3.5 pb-24 md:pb-8">
			{header}
			<Composer overview={overview} initial={composer} onClose={() => setComposer(null)} onCreated={(id) => { setComposer(null); setOpenCampaign(id); reload(); }} />
		</div>
	);
	if (openCampaign) return (
		<div className="space-y-3.5 pb-24 md:pb-8">
			{header}
			<CampaignView id={openCampaign} onBack={() => { setOpenCampaign(null); reload(); }} />
		</div>
	);

	return (
		<div className="space-y-3.5 pb-24 md:pb-8">
			{header}
			<Kpis cols={5} items={[
				{ label: "Pelanggan", value: num(overview.customers.total), hint: "terdaftar" },
				{ label: "Setuju menerima", value: num(overview.customers.consented), hint: `${overview.customers.total ? Math.round((overview.customers.consented / overview.customers.total) * 100) : 0}% basis`, tone: "ok" },
				{ label: "Berhenti / diblokir", value: num(overview.customers.suppressed), hint: "tidak akan dikirimi" },
				{ label: "Kuota bulan ini", value: quota?.limit ? `${num(quota.used)} / ${num(quota.limit)}` : quota ? num(quota.used) : "—", hint: quota ? `plan ${quota.plan}${quota.payg ? " · PAYG aktif" : ""}` : "tidak terbaca", tone: quotaLow ? "warn" : undefined },
				{ label: "Pengirim", value: <span className="text-sm font-semibold break-all">{overview.from.replace(/^.*<|>$/g, "")}</span>, hint: "domain terverifikasi" },
			]} />
			{expiresSoon ? <div className="border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-900">Plan email berakhir {dateTime(quota!.expiredAt)}. Pastikan wallet Helipod cukup untuk perpanjangan agar kampanye tidak berhenti.</div> : null}
			{quotaLow ? <div className="border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-900">Sisa kuota bulan ini {num(quota!.remaining ?? 0)} email. Kampanye yang butuh lebih dari itu akan ditolak kecuali pay-as-you-go diaktifkan.</div> : null}
			<Tabs value={tab} onChange={setTab} items={[["campaigns", "Kampanye", campaigns?.length ?? 0], ["automations", "Otomasi"], ["templates", "Template", overview.builtinTemplates.length + overview.customTemplates.length], ["suppressions", "Daftar berhenti", overview.customers.suppressed]] as const} />
			{tab === "campaigns" ? <CampaignList campaigns={campaigns} onOpen={setOpenCampaign} onNew={() => setComposer({})} /> : null}
			{tab === "automations" ? <Automations /> : null}
			{tab === "templates" ? (
				templateEditor
					? <TemplateEditor template={templateEditor === "new" ? null : templateEditor} onClose={() => setTemplateEditor(null)} onSaved={() => { setTemplateEditor(null); reload(); }} />
					: <TemplateList overview={overview} onUse={(template) => setComposer({ template })} onEdit={setTemplateEditor} onChanged={reload} />
			) : null}
			{tab === "suppressions" ? <Suppressions onChanged={reload} /> : null}
		</div>
	);
}

// ---------------- campaigns list ----------------
function CampaignList({ campaigns, onOpen, onNew }: { campaigns: Campaign[] | null; onOpen: (id: string) => void; onNew: () => void }) {
	if (!campaigns) return <Skeleton className="h-60 w-full rounded-none" />;
	return (
		<Panel title={`${num(campaigns.length)} kampanye`} flush>
			{campaigns.length === 0 ? (
				<div className="py-14 text-center"><p className="text-sm text-muted-foreground">Belum ada kampanye.</p><button type="button" className={`${btnPrimary} mt-3`} onClick={onNew}>Buat kampanye pertama</button></div>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full border-collapse text-[12.5px]">
						<thead><tr className="border-b border-border"><th className={`${monoLabel} px-3.5 py-2.5 text-left`}>Kampanye</th><th className={`${monoLabel} px-3.5 py-2.5 text-left`}>Status</th><th className={`${monoLabel} px-3.5 py-2.5 text-right`}>Penerima</th><th className={`${monoLabel} px-3.5 py-2.5 text-right`}>Terkirim</th><th className={`${monoLabel} px-3.5 py-2.5 text-right`}>Dibuat</th></tr></thead>
						<tbody>
							{campaigns.map((campaign) => {
								const stats = campaign.stats ?? {};
								const delivered = (stats.sent ?? 0) + (stats.delivered ?? 0) + (stats.bounced ?? 0) + (stats.complained ?? 0);
								return (
									<tr key={campaign.id} className="cursor-pointer border-b border-muted last:border-0 hover:bg-[#fafafb]" onClick={() => onOpen(campaign.id)}>
										<td className="px-3.5 py-2.5"><b className="block max-w-[320px] truncate">{campaign.name}</b><small className="block max-w-[320px] truncate text-[11.5px] text-muted-foreground">{campaign.subject}</small></td>
										<td className="px-3.5 py-2.5"><Pill tone={statusTone(campaign.status)}>{STATUS_LABEL[campaign.status]}</Pill>{campaign.scheduled_at ? <small className="block text-[11.5px] text-muted-foreground">{dateTime(campaign.scheduled_at)}</small> : null}</td>
										<td className="px-3.5 py-2.5 text-right tabular-nums">{num(campaign.total_recipients)}</td>
										<td className="px-3.5 py-2.5 text-right tabular-nums">{num(delivered)}{campaign.total_recipients ? <small className="block text-[11.5px] text-muted-foreground">{Math.round((delivered / campaign.total_recipients) * 100)}%</small> : null}</td>
										<td className="px-3.5 py-2.5 text-right tabular-nums">{dateTime(campaign.created_at)}</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</Panel>
	);
}

// ---------------- composer ----------------
function Composer({ overview, initial, onClose, onCreated }: { overview: Overview; initial: { template?: TemplateRow; segment?: string }; onClose: () => void; onCreated: (id: string) => void }) {
	const all = useMemo(() => [...overview.builtinTemplates, ...overview.customTemplates], [overview]);
	const [template, setTemplate] = useState<TemplateRow | null>(initial.template ?? null);
	const [name, setName] = useState(initial.template ? `${initial.template.name} · ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "short" })}` : "");
	const [segment, setSegment] = useState(initial.segment ?? (initial.template as { segment?: string } | undefined)?.segment ?? "reactivate");
	const [subject, setSubject] = useState(initial.template?.subject ?? "");
	const [html, setHtml] = useState(initial.template?.html ?? "");
	const [preview, setPreview] = useState<AudiencePreview | null>(null);
	const [previewing, setPreviewing] = useState(false);
	const [testTo, setTestTo] = useState("");
	const [scheduledAt, setScheduledAt] = useState("");
	const [busy, setBusy] = useState<string | null>(null);
	const [confirming, setConfirming] = useState(false);

	const pickTemplate = (item: TemplateRow) => {
		setTemplate(item); setSubject(item.subject); setHtml(item.html);
		if (item.segment) setSegment(item.segment);
		if (!name) setName(`${item.name} · ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`);
	};

	useEffect(() => {
		let active = true;
		setPreviewing(true);
		emailApi<AudiencePreview>("preview-audience", { segment })
			.then((data) => { if (active) setPreview(data); })
			.catch((error) => { if (active) { setPreview(null); toast.error(errorMessage(error)); } })
			.finally(() => { if (active) setPreviewing(false); });
		return () => { active = false; };
	}, [segment]);

	const segmentLabel = overview.segments.find((item) => item.key === segment)?.label ?? segment;
	const valid = name.trim() && subject.trim() && html.trim().length > 20 && html.includes("{{{unsubscribe_url}}}");
	const remaining = overview.quota?.remaining;
	const overQuota = preview && remaining !== null && remaining !== undefined && !overview.quota?.payg && preview.total > remaining;

	const sendTest = async () => {
		setBusy("test");
		try { await emailApi("send-test", { to: testTo, subject, html }); toast.success(`Email uji dikirim ke ${testTo}`); }
		catch (error) { toast.error(errorMessage(error)); }
		finally { setBusy(null); }
	};
	const create = async (mode: "now" | "schedule" | "draft") => {
		setBusy(mode);
		try {
			const created = await emailApi<{ campaign: Campaign }>("create-campaign", { name, subject, html, segment, templateId: template?.id ?? null, scheduledAt: mode === "schedule" ? new Date(scheduledAt).toISOString() : null });
			if (mode === "now") await emailApi("start-campaign", { id: created.campaign.id });
			toast.success(mode === "now" ? "Kampanye mulai dikirim" : mode === "schedule" ? "Kampanye dijadwalkan" : "Draf disimpan");
			onCreated(created.campaign.id);
		} catch (error) { toast.error(errorMessage(error)); setBusy(null); setConfirming(false); }
	};

	return (
		<div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<div className="space-y-3.5">
				<Panel title="1 · Pilih template" action={<button type="button" className="text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={onClose}>← Kembali</button>}>
					<div className="grid gap-2 sm:grid-cols-2">
						{all.map((item) => (
							<button key={item.id} type="button" onClick={() => pickTemplate(item)} className={`border p-2.5 text-left hover:border-foreground/40 ${template?.id === item.id ? "border-[#111114] bg-muted/50" : "border-border"}`}>
								<b className="block text-[12.5px]">{item.name}</b>
								<small className="line-clamp-2 text-[11.5px] text-muted-foreground">{item.description || item.subject}</small>
							</button>
						))}
						<button type="button" onClick={() => { setTemplate(null); setSubject(""); setHtml(`<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;max-width:520px;margin:0 auto;padding:24px"><h2>Halo {{nama}},</h2><p>Tulis pesanmu di sini.</p><p><a href="{{{link}}}">Buka Djiwa Tentram</a></p><hr><p style="font-size:12px;color:#777"><a href="{{{unsubscribe_url}}}">Berhenti berlangganan</a></p></div>`); }} className="border border-dashed border-border p-2.5 text-left hover:border-foreground/40"><b className="block text-[12.5px]">Kosong</b><small className="text-[11.5px] text-muted-foreground">Tulis email sendiri.</small></button>
					</div>
				</Panel>
				<Panel title="2 · Audiens & isi">
					<div className="space-y-3">
						<label className="block"><span className={monoLabel}>Nama kampanye</span><input className={`${inputCls} mt-1`} value={name} onChange={(event) => setName(event.target.value)} placeholder="mis. Reaktivasi November" /></label>
						<label className="block"><span className={monoLabel}>Segmen penerima</span>
							<select className={`${inputCls} mt-1`} value={segment} onChange={(event) => setSegment(event.target.value)}>{overview.segments.map((item) => <option key={item.key} value={item.key}>{item.label} — {num(item.eligible)} layak</option>)}</select>
						</label>
						<div className="border border-border bg-muted/30 px-3 py-2 text-[12.5px]">
							{previewing || !preview ? <span className="text-muted-foreground">Menghitung penerima…</span> : (
								<>
									<b>{num(preview.total)} penerima</b> <span className="text-muted-foreground">di segmen “{segmentLabel}”</span>
									<div className="mt-1 text-[11.5px] text-muted-foreground">Dilewati: {num(preview.skipped.noConsent)} belum setuju · {num(preview.skipped.suppressed)} berhenti · {num(preview.skipped.recent)} baru menerima email (&lt;72 jam) · {num(preview.skipped.invalid)} email tidak valid</div>
									{preview.sample.length ? <div className="mt-1 truncate text-[11.5px] text-muted-foreground">Contoh: {preview.sample.map((item) => item.email).join(", ")}</div> : null}
								</>
							)}
						</div>
						<label className="block"><span className={monoLabel}>Subjek</span><input className={`${inputCls} mt-1`} value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
						<label className="block"><span className={monoLabel}>Isi email (HTML)</span><textarea className="mt-1 min-h-[220px] w-full border border-border bg-card p-2.5 font-mono text-[11.5px] outline-none focus:border-foreground/40" value={html} onChange={(event) => setHtml(event.target.value)} spellCheck={false} /></label>
						<div className="flex flex-wrap gap-1.5">{VARIABLES.map((variable) => <button key={variable} type="button" className="border border-border bg-card px-1.5 py-0.5 font-mono text-[10.5px] hover:border-foreground/40" onClick={() => void navigator.clipboard?.writeText(variable).then(() => toast.success(`${variable} disalin`))}>{variable}</button>)}</div>
						{!html.includes("{{{unsubscribe_url}}}") && html ? <p className="text-[12px] text-red-700">Email wajib memuat link berhenti berlangganan <code>{"{{{unsubscribe_url}}}"}</code>.</p> : null}
					</div>
				</Panel>
				<Panel title="3 · Uji & kirim">
					<div className="space-y-3">
						<div className="flex gap-2"><input className={inputCls} type="email" placeholder="email untuk uji coba" value={testTo} onChange={(event) => setTestTo(event.target.value)} /><button type="button" className={btn} disabled={!valid || !testTo || busy !== null} onClick={() => void sendTest()}>{busy === "test" ? "Mengirim…" : "Kirim uji"}</button></div>
						<div className="flex flex-wrap items-center gap-2"><input className={`${inputCls} max-w-[220px]`} type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /><button type="button" className={btn} disabled={!valid || !scheduledAt || busy !== null} onClick={() => void create("schedule")}>Jadwalkan</button></div>
						{overQuota ? <p className="text-[12px] text-red-700">Kuota tersisa {num(remaining ?? 0)} email, kurang dari {num(preview!.total)} penerima.</p> : null}
						<div className="flex gap-2 border-t border-border pt-3"><button type="button" className={btn} disabled={!valid || busy !== null} onClick={() => void create("draft")}>Simpan draf</button><button type="button" className={btnPrimary} disabled={!valid || busy !== null || !preview?.total || Boolean(overQuota)} onClick={() => setConfirming(true)}>Kirim sekarang…</button></div>
					</div>
				</Panel>
			</div>
			<div className="lg:sticky lg:top-3 lg:self-start">
				<Panel title="Pratinjau" meta={subject ? renderPreview(subject) : "—"} flush>
					<iframe title="Pratinjau email" sandbox="" srcDoc={renderPreview(html)} className="h-[640px] w-full border-0 bg-white" />
				</Panel>
			</div>
			{confirming ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy === null) setConfirming(false); }}>
					<div role="dialog" aria-modal="true" className="w-full max-w-md border border-border bg-card p-5 shadow-xl">
						<p className="text-lg font-bold">Kirim kampanye sekarang?</p>
						<p className="mt-2 text-sm text-muted-foreground">Email akan dikirim ke <b className="text-foreground">{num(preview?.total ?? 0)} pelanggan</b> di segmen “{segmentLabel}”. Pengiriman tidak bisa ditarik kembali, tetapi bisa dijeda.</p>
						<p className="mt-2 text-xs text-muted-foreground">Subjek: {renderPreview(subject)}</p>
						<div className="mt-5 grid grid-cols-2 gap-2"><button type="button" className={btn} disabled={busy !== null} onClick={() => setConfirming(false)}>Batal</button><button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => void create("now")}>{busy === "now" ? "Memulai…" : "Ya, kirim"}</button></div>
					</div>
				</div>
			) : null}
		</div>
	);
}

// ---------------- campaign detail ----------------
function CampaignView({ id, onBack }: { id: string; onBack: () => void }) {
	const [detail, setDetail] = useState<CampaignDetail | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState("");
	const [busy, setBusy] = useState(false);
	const driving = useRef(false);

	const load = useCallback(async (status = filter) => {
		try { setDetail(await emailApi<CampaignDetail>("get-campaign", { id, status })); setError(null); }
		catch (err) { setError(errorMessage(err)); }
	}, [id, filter]);
	useEffect(() => { void load(); }, [load]);

	// While a campaign is "sending", drive batches from here (the server also does it on a 5-minute cron).
	const status = detail?.campaign.status;
	useEffect(() => {
		if (status !== "sending" || driving.current) return;
		driving.current = true;
		let active = true;
		(async () => {
			while (active) {
				try {
					const next = await emailApi<CampaignDetail>("process-campaign", { id });
					if (!active) break;
					setDetail((current) => current && next.campaign.status === current.campaign.status && filter ? { ...next, recipients: current.recipients } : next);
					if (next.campaign.status !== "sending") break;
				} catch (err) { if (active) setError(errorMessage(err)); break; }
				await new Promise((resolve) => setTimeout(resolve, 1500));
			}
			driving.current = false;
		})();
		return () => { active = false; driving.current = false; };
	}, [status, id]); // eslint-disable-line react-hooks/exhaustive-deps

	const act = async (action: string, success: string, confirmText?: string) => {
		if (confirmText && !window.confirm(confirmText)) return;
		setBusy(true);
		try {
			const next = await emailApi<CampaignDetail>(action, { id });
			if (action === "delete-campaign") { toast.success(success); onBack(); return; }
			setDetail(next); toast.success(success);
		} catch (err) { toast.error(errorMessage(err)); }
		finally { setBusy(false); }
	};

	if (error && !detail) return <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error} <button type="button" className="font-bold underline" onClick={onBack}>Kembali</button></div>;
	if (!detail) return <Skeleton className="h-96 w-full rounded-none" />;
	const { campaign, stats, recipients } = detail;
	const total = campaign.total_recipients;
	const sentTotal = (stats.sent ?? 0) + (stats.delivered ?? 0) + (stats.bounced ?? 0) + (stats.complained ?? 0);
	const pct = total ? Math.round((sentTotal / total) * 100) : 0;

	return (
		<div className="space-y-3.5">
			<Panel title={<button type="button" onClick={onBack} className="uppercase hover:text-foreground">← Semua kampanye</button>} action={<Pill tone={statusTone(campaign.status)}>{STATUS_LABEL[campaign.status]}</Pill>}>
				<h2 className="text-lg font-semibold">{campaign.name}</h2>
				<p className="text-[12.5px] text-muted-foreground">{campaign.subject}</p>
				<p className="mt-1 text-[11.5px] text-muted-foreground">Dibuat {dateTime(campaign.created_at)}{campaign.started_at ? ` · mulai ${dateTime(campaign.started_at)}` : ""}{campaign.finished_at ? ` · selesai ${dateTime(campaign.finished_at)}` : ""}</p>
				{campaign.last_error ? <p className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">Dijeda otomatis: {campaign.last_error}</p> : null}
				{error ? <p className="mt-2 text-[12px] text-red-700">{error}</p> : null}
				<div className="mt-3 flex flex-wrap gap-2">
					{["draft", "scheduled", "paused"].includes(campaign.status) ? <button type="button" className={btnPrimary} disabled={busy} onClick={() => void act("start-campaign", "Pengiriman dimulai", `Kirim kampanye ke ${total || "semua"} penerima sekarang?`)}>{campaign.status === "paused" ? "Lanjutkan" : "Kirim sekarang"}</button> : null}
					{campaign.status === "sending" ? <button type="button" className={btn} disabled={busy} onClick={() => void act("pause-campaign", "Kampanye dijeda")}>Jeda</button> : null}
					{["draft", "scheduled", "sending", "paused"].includes(campaign.status) ? <button type="button" className={btn} disabled={busy} onClick={() => void act("cancel-campaign", "Kampanye dibatalkan", "Batalkan kampanye? Email yang belum terkirim tidak akan dikirim.")}>Batalkan</button> : null}
					{["draft", "scheduled", "canceled"].includes(campaign.status) ? <button type="button" className={`${btn} text-red-700`} disabled={busy} onClick={() => void act("delete-campaign", "Kampanye dihapus", "Hapus kampanye ini?")}>Hapus</button> : null}
				</div>
			</Panel>
			{total ? (
				<div className="border border-border bg-card px-3.5 py-3">
					<div className="flex justify-between text-[12px]"><span className={monoLabel}>Progres pengiriman</span><b>{num(sentTotal)} / {num(total)} · {pct}%</b></div>
					<div className="mt-2 h-2 bg-muted"><div className="h-full bg-[#1a5dc6] transition-all" style={{ width: `${pct}%` }} /></div>
					{campaign.status === "sending" ? <p className="mt-1.5 text-[11.5px] text-muted-foreground">Sedang mengirim… biarkan halaman ini terbuka, atau server melanjutkan otomatis tiap 5 menit.</p> : null}
				</div>
			) : null}
			<Kpis cols={6} items={[
				{ label: "Penerima", value: num(total) },
				{ label: "Terkirim", value: num(sentTotal), hint: `${num(stats.queued ?? 0)} antre` },
				{ label: "Sampai", value: num(stats.delivered ?? 0), tone: "ok" },
				{ label: "Dibuka", value: num(detail.opened), hint: sentTotal ? `${Math.round((detail.opened / sentTotal) * 100)}%` : undefined },
				{ label: "Klik", value: num(detail.clicked), hint: sentTotal ? `${Math.round((detail.clicked / sentTotal) * 100)}%` : undefined },
				{ label: "Bermasalah", value: num((stats.bounced ?? 0) + (stats.complained ?? 0) + (stats.failed ?? 0)), hint: `${num(stats.bounced ?? 0)} bounce · ${num(stats.complained ?? 0)} komplain`, tone: (stats.bounced ?? 0) + (stats.complained ?? 0) + (stats.failed ?? 0) > 0 ? "bad" : undefined },
			]} />
			<Tabs value={filter} onChange={(next) => { setFilter(next); void load(next); }} items={[["", "Semua"], ["queued", "Antre", stats.queued ?? 0], ["sent", "Terkirim", stats.sent ?? 0], ["delivered", "Sampai", stats.delivered ?? 0], ["bounced", "Bounce", stats.bounced ?? 0], ["failed", "Gagal", stats.failed ?? 0], ["skipped", "Dilewati", stats.skipped ?? 0]] as const} />
			<Panel title="Penerima" meta={recipients.length >= 300 ? "300 pertama" : `${recipients.length} baris`} flush>
				{recipients.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Tidak ada penerima pada filter ini.</p> : (
					<div className="overflow-x-auto"><table className="w-full border-collapse text-[12.5px]"><thead><tr className="border-b border-border"><th className={`${monoLabel} px-3.5 py-2 text-left`}>Penerima</th><th className={`${monoLabel} px-3.5 py-2 text-left`}>Status</th><th className={`${monoLabel} px-3.5 py-2 text-right`}>Terkirim</th><th className={`${monoLabel} px-3.5 py-2 text-right`}>Dibuka</th></tr></thead>
						<tbody>{recipients.map((row) => <tr key={row.id} className="border-b border-muted last:border-0"><td className="px-3.5 py-2"><b className="block max-w-[260px] truncate">{row.name || "—"}</b><small className="block max-w-[260px] truncate text-[11.5px] text-muted-foreground">{row.email}</small></td><td className="px-3.5 py-2"><Pill tone={row.status === "delivered" ? "ok" : row.status === "bounced" || row.status === "complained" || row.status === "failed" ? "bad" : row.status === "queued" ? "warn" : ""}>{row.status}</Pill>{row.error ? <small className="block max-w-[260px] truncate text-[11px] text-muted-foreground">{row.error}</small> : null}</td><td className="px-3.5 py-2 text-right text-muted-foreground">{agoLabel(row.sent_at)}</td><td className="px-3.5 py-2 text-right text-muted-foreground">{row.opened_at ? agoLabel(row.opened_at) : "—"}</td></tr>)}</tbody></table></div>
				)}
			</Panel>
		</div>
	);
}

// ---------------- templates ----------------
function TemplateList({ overview, onUse, onEdit, onChanged }: { overview: Overview; onUse: (template: TemplateRow) => void; onEdit: (template: TemplateRow | "new") => void; onChanged: () => void }) {
	const remove = async (template: TemplateRow) => {
		if (!window.confirm(`Hapus template “${template.name}”?`)) return;
		try { await emailApi("delete-template", { id: template.id }); toast.success("Template dihapus"); onChanged(); } catch (error) { toast.error(errorMessage(error)); }
	};
	const duplicate = async (template: TemplateRow) => {
		try { await emailApi("save-template", { name: `${template.name} (salinan)`, description: template.description, subject: template.subject, html: template.html }); toast.success("Template disalin ke template saya"); onChanged(); } catch (error) { toast.error(errorMessage(error)); }
	};
	return (
		<div className="space-y-3.5">
			<Panel title="Template bawaan" meta="siap pakai · bisa disalin">
				<div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
					{overview.builtinTemplates.map((template) => (
						<div key={template.id} className="flex flex-col border border-border p-3">
							<b className="text-[13px]">{template.name}</b>
							<p className="mt-0.5 flex-1 text-[12px] text-muted-foreground">{template.description}</p>
							<p className="mt-1.5 truncate font-mono text-[10.5px] text-muted-foreground">{template.subject}</p>
							<div className="mt-2.5 flex gap-2"><button type="button" className={btnPrimary} onClick={() => onUse(template)}>Pakai</button><button type="button" className={btn} onClick={() => void duplicate(template)}>Salin</button></div>
						</div>
					))}
				</div>
			</Panel>
			<Panel title="Template saya" action={<button type="button" className={btn} onClick={() => onEdit("new")}>Template baru</button>}>
				{overview.customTemplates.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">Belum ada template buatan sendiri.</p> : (
					<div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
						{overview.customTemplates.map((template) => (
							<div key={template.id} className="flex flex-col border border-border p-3">
								<b className="text-[13px]">{template.name}</b>
								<p className="mt-0.5 flex-1 truncate font-mono text-[10.5px] text-muted-foreground">{template.subject}</p>
								<small className="text-[11px] text-muted-foreground">Diubah {agoLabel(template.updated_at ?? null)}</small>
								<div className="mt-2.5 flex gap-2"><button type="button" className={btnPrimary} onClick={() => onUse(template)}>Pakai</button><button type="button" className={btn} onClick={() => onEdit(template)}>Ubah</button><button type="button" className={`${btn} text-red-700`} onClick={() => void remove(template)}>Hapus</button></div>
							</div>
						))}
					</div>
				)}
			</Panel>
		</div>
	);
}

function TemplateEditor({ template, onClose, onSaved }: { template: TemplateRow | null; onClose: () => void; onSaved: () => void }) {
	const [name, setName] = useState(template?.name ?? "");
	const [description, setDescription] = useState(template?.description ?? "");
	const [subject, setSubject] = useState(template?.subject ?? "");
	const [html, setHtml] = useState(template?.html ?? `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;max-width:520px;margin:0 auto;padding:24px"><h2>Halo {{nama}},</h2><p>Tulis pesanmu di sini.</p><p><a href="{{{link}}}">Buka Djiwa Tentram</a></p><hr><p style="font-size:12px;color:#777"><a href="{{{unsubscribe_url}}}">Berhenti berlangganan</a></p></div>`);
	const [busy, setBusy] = useState(false);
	const save = async () => {
		setBusy(true);
		try { await emailApi("save-template", { id: template?.id, name, description, subject, html }); toast.success("Template disimpan"); onSaved(); }
		catch (error) { toast.error(errorMessage(error)); setBusy(false); }
	};
	return (
		<div className="grid gap-3.5 lg:grid-cols-2">
			<Panel title={template ? "Ubah template" : "Template baru"} action={<button type="button" className="text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={onClose}>← Kembali</button>}>
				<div className="space-y-3">
					<label className="block"><span className={monoLabel}>Nama</span><input className={`${inputCls} mt-1`} value={name} onChange={(event) => setName(event.target.value)} /></label>
					<label className="block"><span className={monoLabel}>Deskripsi</span><input className={`${inputCls} mt-1`} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
					<label className="block"><span className={monoLabel}>Subjek</span><input className={`${inputCls} mt-1`} value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
					<label className="block"><span className={monoLabel}>Isi (HTML)</span><textarea className="mt-1 min-h-[300px] w-full border border-border bg-card p-2.5 font-mono text-[11.5px] outline-none focus:border-foreground/40" value={html} onChange={(event) => setHtml(event.target.value)} spellCheck={false} /></label>
					<div className="flex flex-wrap gap-1.5">{VARIABLES.map((variable) => <span key={variable} className="border border-border px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">{variable}</span>)}</div>
					<button type="button" className={btnPrimary} disabled={busy || !name.trim() || !subject.trim() || !html.includes("{{{unsubscribe_url}}}")} onClick={() => void save()}>{busy ? "Menyimpan…" : "Simpan template"}</button>
					{!html.includes("{{{unsubscribe_url}}}") ? <p className="text-[12px] text-red-700">Wajib memuat <code>{"{{{unsubscribe_url}}}"}</code>.</p> : null}
				</div>
			</Panel>
			<Panel title="Pratinjau" flush><iframe title="Pratinjau template" sandbox="" srcDoc={renderPreview(html)} className="h-[560px] w-full border-0 bg-white" /></Panel>
		</div>
	);
}

// ---------------- suppressions ----------------
function Suppressions({ onChanged }: { onChanged: () => void }) {
	const [rows, setRows] = useState<Suppression[] | null>(null);
	const [email, setEmail] = useState("");
	const load = useCallback(async () => { try { setRows((await emailApi<{ suppressions: Suppression[] }>("list-suppressions")).suppressions); } catch (error) { toast.error(errorMessage(error)); setRows([]); } }, []);
	useEffect(() => { void load(); }, [load]);
	const add = async () => { try { setRows((await emailApi<{ suppressions: Suppression[] }>("add-suppression", { email })).suppressions); setEmail(""); toast.success("Email diblokir"); onChanged(); } catch (error) { toast.error(errorMessage(error)); } };
	const remove = async (target: string) => {
		if (!window.confirm(`Izinkan ${target} menerima email lagi? Lakukan hanya jika orangnya memintanya.`)) return;
		try { setRows((await emailApi<{ suppressions: Suppression[] }>("remove-suppression", { email: target })).suppressions); onChanged(); } catch (error) { toast.error(errorMessage(error)); }
	};
	const REASON: Record<string, string> = { unsubscribed: "berhenti sendiri", bounce: "bounce", complaint: "komplain spam", manual: "manual" };
	return (
		<Panel title={`${num(rows?.length ?? 0)} email diblokir`} action={<div className="flex gap-2"><input className={`${inputCls} w-56`} type="email" placeholder="blokir email…" value={email} onChange={(event) => setEmail(event.target.value)} /><button type="button" className={btn} disabled={!email} onClick={() => void add()}>Blokir</button></div>} flush>
			{!rows ? <Skeleton className="h-40 w-full rounded-none" /> : rows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Belum ada yang berhenti berlangganan atau bounce.</p> : (
				<div className="overflow-x-auto"><table className="w-full border-collapse text-[12.5px]"><thead><tr className="border-b border-border"><th className={`${monoLabel} px-3.5 py-2 text-left`}>Email</th><th className={`${monoLabel} px-3.5 py-2 text-left`}>Alasan</th><th className={`${monoLabel} px-3.5 py-2 text-right`}>Sejak</th><th className="w-20" /></tr></thead>
					<tbody>{rows.map((row) => <tr key={row.email} className="border-b border-muted last:border-0"><td className="px-3.5 py-2">{row.email}</td><td className="px-3.5 py-2"><Pill tone={row.reason === "unsubscribed" || row.reason === "manual" ? "" : "bad"}>{REASON[row.reason] ?? row.reason}</Pill></td><td className="px-3.5 py-2 text-right text-muted-foreground">{agoLabel(row.created_at)}</td><td className="px-3.5 py-2 text-right"><button type="button" className="text-[11.5px] font-semibold text-muted-foreground hover:text-foreground" onClick={() => void remove(row.email)}>Lepas</button></td></tr>)}</tbody></table></div>
			)}
		</Panel>
	);
}
