import { createLazyFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  Check,
  CircleDot,
  Clock3,
  Footprints,
  RefreshCw,
  Search,
  Settings2,
  Trophy,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { invokeDirectFetch } from "@/lib/api-helper";

export const Route = createLazyFileRoute("/admin/djiwa-run")({
  component: AdminDjiwaRun,
});

type RunRow = Record<string, unknown> & { id?: string; status?: string };
type LoadState = "loading" | "ready" | "unavailable";
type ViewState = { state: LoadState; rows: RunRow[]; error?: string };
type CampaignDraft = { id?: string; name: string; period_type: "weekly" | "monthly"; starts_at: string; ends_at: string; timezone: string; status: "draft" | "active" | "ended" | "archived"; settings: string };
type TierDraft = { id?: string; campaign_id: string; code: string; name: string; target_km: string; period_scope: "weekly" | "monthly"; reward_category: "" | "coffee" | "breakfast" | "merchandise"; eligible_product_ids: string; max_amount: string; expiry_hours: string; reward_config: string; is_active: boolean };

type ReviewStatus = "accepted" | "rejected" | "review";

const EMPTY_VIEW: ViewState = { state: "loading", rows: [] };
const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET || "";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";

function adminFunctionUrl() {
  return `${SUPABASE_URL}/functions/v1/djiwa-run`;
}


function asText(value: unknown, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function first(row: RunRow, keys: string[], fallback = "—") {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null && row[key] !== "") return asText(row[key], fallback);
  return fallback;
}

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusClass(status: string) {
  if (["accepted", "completed", "credited", "redeemed"].includes(status)) return "bg-emerald-100 text-emerald-700";
  if (["rejected", "revoked", "expired"].includes(status)) return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
}

function ViewUnavailable({ label, error, onRetry }: { label: string; error?: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-5 text-sm text-amber-900">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{titleCase(label)} belum tersedia</p>
          <p className="mt-1 text-xs text-amber-800">Backend Djiwa Run belum menyediakan read contract untuk bagian ini. Tidak ada data contoh yang ditampilkan.</p>
          {error && <p className="mt-2 truncate font-mono text-[10px] text-amber-700" title={error}>{error}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Coba lagi</Button>
      </div>
    </div>
  );
}

function LoadingRows() {
  return <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <Skeleton className="h-12 w-full" key={index} />)}</div>;
}

function EmptyRows({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">Belum ada {label}.</div>;
}

function DataState({ view, label, children, onRetry }: { view: ViewState; label: string; children: (rows: RunRow[]) => React.ReactNode; onRetry: () => void }) {
  if (view.state === "loading") return <LoadingRows />;
  if (view.state === "unavailable") return <ViewUnavailable error={view.error} label={label} onRetry={onRetry} />;
  if (!view.rows.length) return <EmptyRows label={label} />;
  return <>{children(view.rows)}</>;
}

function RowValue({ row, keys }: { row: RunRow; keys: string[] }) {
  return <span className="break-words">{first(row, keys)}</span>;
}

function ReviewActions({ row, onReview, busy }: { row: RunRow; onReview: (row: RunRow, status: ReviewStatus) => void; busy: boolean }) {
  const current = first(row, ["status", "review_status"], "review").toLowerCase();
  const activityId = first(row, ["activity_id", "run_activity_id", "id"], "");
  if (!activityId || ["accepted", "rejected"].includes(current)) return <Badge className={statusClass(current)}>{titleCase(current)}</Badge>;
  return (
    <div className="flex flex-wrap gap-1">
      <Button disabled={busy} size="sm" variant="outline" onClick={() => onReview(row, "accepted")}><Check className="mr-1 h-3.5 w-3.5" />Setujui</Button>
      <Button disabled={busy} size="sm" variant="outline" onClick={() => onReview(row, "rejected")}><X className="mr-1 h-3.5 w-3.5" />Tolak</Button>
      <Button disabled={busy} size="sm" variant="ghost" onClick={() => onReview(row, "review")}><Clock3 className="mr-1 h-3.5 w-3.5" />Review</Button>
    </div>
  );
}

function AdminDjiwaRun() {
  const [campaigns, setCampaigns] = useState<ViewState>(EMPTY_VIEW);
  const [tiers, setTiers] = useState<ViewState>(EMPTY_VIEW);
  const [progress, setProgress] = useState<ViewState>(EMPTY_VIEW);
  const [rewards, setRewards] = useState<ViewState>(EMPTY_VIEW);
  const [activities, setActivities] = useState<ViewState>(EMPTY_VIEW);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"overview" | "review">("overview");
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [campaignDraft, setCampaignDraft] = useState<CampaignDraft>({ name: "", period_type: "weekly", starts_at: "", ends_at: "", timezone: "Asia/Jakarta", status: "draft", settings: "{}" });
  const [tierDraft, setTierDraft] = useState<TierDraft>({ campaign_id: "", code: "", name: "", target_km: "", period_scope: "weekly", reward_category: "", eligible_product_ids: "", max_amount: "", expiry_hours: "", reward_config: "{}", is_active: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const views = [
      ["campaigns", setCampaigns],
      ["tiers", setTiers],
      ["progress", setProgress],
      ["rewards", setRewards],
      ["activities", setActivities],
    ] as const;
    for (const [, setter] of views) setter({ state: "loading", rows: [] });
    try {
      if (!ADMIN_SECRET || !SUPABASE_URL) throw new Error("VITE_ADMIN_SECRET atau VITE_SUPABASE_URL belum dikonfigurasi");
      const result = await invokeDirectFetch<{ success?: boolean; campaigns?: RunRow[]; tiers?: RunRow[]; progress?: RunRow[]; rewards?: RunRow[]; activities?: RunRow[]; error?: { message?: string } }>(adminFunctionUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
        body: JSON.stringify({ action: "admin_overview" }),
      });
      if (result.success === false) throw new Error(result.error?.message || "Admin overview gagal dimuat");
      setCampaigns({ state: "ready", rows: result.campaigns ?? [] });
      setTiers({ state: "ready", rows: result.tiers ?? [] });
      setProgress({ state: "ready", rows: result.progress ?? [] });
      setRewards({ state: "ready", rows: result.rewards ?? [] });
      setActivities({ state: "ready", rows: result.activities ?? [] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Admin overview gagal dimuat";
      for (const [, setter] of views) setter({ state: "unavailable", rows: [], error: message });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredProgress = useMemo(() => progress.rows.filter((row) => {
    const haystack = JSON.stringify(row).toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    const status = first(row, ["status", "progress_status"], "").toLowerCase();
    return matchesQuery && (statusFilter === "all" || status === statusFilter);
  }), [progress.rows, query, statusFilter]);

  const reviewRows = useMemo(() => activities.rows.filter((row) => {
    const status = first(row, ["status", "review_status"], "review").toLowerCase();
    return statusFilter === "all" ? status === "review" : status === statusFilter;
  }), [activities.rows, statusFilter]);

  async function saveSettings(action: "admin_save_campaign" | "admin_save_tier" | "admin_delete_campaign" | "admin_delete_tier", payload: Record<string, unknown>) {
    setSaving(true);
    try {
      const response = await invokeDirectFetch<{ success?: boolean; error?: { message?: string } }>(adminFunctionUrl(), { method: "POST", headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET }, body: JSON.stringify({ action, ...payload, actor_id: "admin" }) });
      if (response.success === false) throw new Error(response.error?.message || "Penyimpanan gagal");
      await load();
      window.alert("Konfigurasi tersimpan dan tercatat di audit log.");
    } catch (error) { window.alert(error instanceof Error ? error.message : "Penyimpanan gagal"); }
    finally { setSaving(false); }
  }

  function editCampaign(row: RunRow) {
    setCampaignDraft({ id: String(row.id ?? ""), name: String(row.name ?? ""), period_type: row.period_type === "monthly" ? "monthly" : "weekly", starts_at: String(row.starts_at ?? "").slice(0, 16), ends_at: String(row.ends_at ?? "").slice(0, 16), timezone: String(row.timezone ?? "Asia/Jakarta"), status: ["draft", "active", "ended", "archived"].includes(String(row.status)) ? row.status as CampaignDraft["status"] : "draft", settings: JSON.stringify(row.settings ?? {}, null, 2) });
  }
  function editTier(row: RunRow) {
    setTierDraft({ id: String(row.id ?? ""), campaign_id: String(row.campaign_id ?? ""), code: String(row.code ?? ""), name: String(row.name ?? ""), target_km: String(row.target_km ?? ""), period_scope: row.period_scope === "monthly" ? "monthly" : "weekly", reward_category: ["coffee", "breakfast", "merchandise"].includes(String(row.reward_category)) ? row.reward_category as TierDraft["reward_category"] : "", eligible_product_ids: Array.isArray(row.eligible_product_ids) ? row.eligible_product_ids.join(", ") : "", max_amount: row.max_amount == null ? "" : String(row.max_amount), expiry_hours: row.expiry_hours == null ? "" : String(row.expiry_hours), reward_config: JSON.stringify(row.reward_config ?? {}, null, 2), is_active: row.is_active !== false });
  }

  function dateIso(value: string) { return value ? new Date(value).toISOString() : value; }
  async function submitCampaign(event: React.FormEvent) {
    event.preventDefault();
    let settings: unknown; try { settings = JSON.parse(campaignDraft.settings || "{}"); } catch { window.alert("Settings campaign harus JSON valid"); return; }
    await saveSettings("admin_save_campaign", { ...campaignDraft, starts_at: dateIso(campaignDraft.starts_at), ends_at: dateIso(campaignDraft.ends_at), settings });
  }
  async function submitTier(event: React.FormEvent) {
    event.preventDefault();
    let rewardConfig: unknown; try { rewardConfig = JSON.parse(tierDraft.reward_config || "{}"); } catch { window.alert("Reward config harus JSON valid"); return; }
    await saveSettings("admin_save_tier", { ...tierDraft, eligible_product_ids: tierDraft.eligible_product_ids.split(",").map((id) => id.trim()).filter(Boolean), max_amount: tierDraft.max_amount || null, expiry_hours: tierDraft.expiry_hours || null, reward_config: rewardConfig });
  }

  async function deleteSetting(action: "admin_delete_campaign" | "admin_delete_tier", id: string) {
    if (!window.confirm("Hapus konfigurasi ini? Data yang masih direferensikan database akan menolak penghapusan.")) return;
    await saveSettings(action, { id });
  }

  async function reviewActivity(row: RunRow, status: ReviewStatus) {
    const activityId = first(row, ["activity_id", "run_activity_id", "id"], "");
    if (!activityId) return;
    setActionKey(`${activityId}:${status}`);
    const response = await invokeDirectFetch<{ success?: boolean; error?: { message?: string } }>(adminFunctionUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
      body: JSON.stringify({ action: "admin_review_activity", activity_id: activityId, status, reviewed_by: "admin" }),
    });
    setActionKey(null);
    if (response.success !== false) await load();
    else window.alert(`Aksi review gagal: ${response.error?.message || "unknown error"}`);
  }

  return (
    <main className="flex-1 overflow-y-auto bg-muted/20 p-3 pb-24 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <header className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Footprints className="h-5 w-5" /></div><div><p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Djiwa App · Operations</p><h1 className="text-xl font-bold tracking-tight">Djiwa Run</h1><p className="mt-1 text-sm text-muted-foreground">Campaign, tier, reward, progress, dan review aktivitas.</p></div></div>
          <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[{ label: "Campaign aktif", icon: Trophy, value: campaigns }, { label: "Customer progress", icon: Activity, value: progress }, { label: "Operasi reward", icon: Settings2, value: rewards }, { label: "Review aktivitas", icon: CircleDot, value: activities }].map(({ label, icon: Icon, value }) => (
            <div className="rounded-xl border border-border bg-card p-3" key={label}><div className="flex items-center justify-between text-muted-foreground"><span className="text-xs">{label}</span><Icon className="h-4 w-4" /></div><p className="mt-2 text-2xl font-semibold">{value.state === "loading" ? "…" : value.state === "ready" ? value.rows.length : "—"}</p><p className="text-[10px] text-muted-foreground">{value.state === "unavailable" ? "Contract belum tersedia" : "Read dari backend"}</p></div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border"><Button variant={activeTab === "overview" ? "default" : "ghost"} onClick={() => setActiveTab("overview")}>Campaign & progress</Button><Button variant={activeTab === "review" ? "default" : "ghost"} onClick={() => setActiveTab("review")}>Review aktivitas {activities.state === "ready" && <span className="ml-1 rounded-full bg-background/70 px-1.5 text-[10px]">{reviewRows.length}</span>}</Button></div>

        {activeTab === "overview" ? <>
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" /><h2 className="font-semibold">Campaign, tier & reward configuration</h2></div><div className="grid gap-3 xl:grid-cols-2"><form className="space-y-2 rounded-xl border border-border bg-muted/20 p-3" onSubmit={submitCampaign}><p className="text-sm font-semibold">Campaign</p><div className="grid gap-2 sm:grid-cols-2"><Input required placeholder="Nama campaign" value={campaignDraft.name} onChange={(event) => setCampaignDraft({ ...campaignDraft, name: event.target.value })} /><select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={campaignDraft.period_type} onChange={(event) => setCampaignDraft({ ...campaignDraft, period_type: event.target.value as CampaignDraft["period_type"] })}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select><Input required type="datetime-local" value={campaignDraft.starts_at} onChange={(event) => setCampaignDraft({ ...campaignDraft, starts_at: event.target.value })} /><Input required type="datetime-local" value={campaignDraft.ends_at} onChange={(event) => setCampaignDraft({ ...campaignDraft, ends_at: event.target.value })} /><Input required placeholder="Timezone" value={campaignDraft.timezone} onChange={(event) => setCampaignDraft({ ...campaignDraft, timezone: event.target.value })} /><select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={campaignDraft.status} onChange={(event) => setCampaignDraft({ ...campaignDraft, status: event.target.value as CampaignDraft["status"] })}><option value="draft">Draft</option><option value="active">Active</option><option value="ended">Ended</option><option value="archived">Archived</option></select></div><textarea className="min-h-16 w-full rounded-md border border-input bg-background p-2 text-xs font-mono" placeholder="Campaign settings JSON" value={campaignDraft.settings} onChange={(event) => setCampaignDraft({ ...campaignDraft, settings: event.target.value })} /><div className="flex gap-2"><Button disabled={saving} type="submit">{campaignDraft.id ? "Simpan campaign" : "Buat campaign"}</Button><Button type="button" variant="ghost" onClick={() => setCampaignDraft({ name: "", period_type: "weekly", starts_at: "", ends_at: "", timezone: "Asia/Jakarta", status: "draft", settings: "{}" })}>Reset</Button></div></form><form className="space-y-2 rounded-xl border border-border bg-muted/20 p-3" onSubmit={submitTier}><p className="text-sm font-semibold">Tier & reward</p><div className="grid gap-2 sm:grid-cols-2"><select required className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={tierDraft.campaign_id} onChange={(event) => setTierDraft({ ...tierDraft, campaign_id: event.target.value })}><option value="">Pilih campaign</option>{campaigns.rows.map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.name ?? row.id)}</option>)}</select><Input required placeholder="Kode tier" value={tierDraft.code} onChange={(event) => setTierDraft({ ...tierDraft, code: event.target.value })} /><Input required placeholder="Nama tier" value={tierDraft.name} onChange={(event) => setTierDraft({ ...tierDraft, name: event.target.value })} /><Input required min="0.01" step="0.01" type="number" placeholder="Target km" value={tierDraft.target_km} onChange={(event) => setTierDraft({ ...tierDraft, target_km: event.target.value })} /><select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={tierDraft.period_scope} onChange={(event) => setTierDraft({ ...tierDraft, period_scope: event.target.value as TierDraft["period_scope"] })}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select><select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={tierDraft.reward_category} onChange={(event) => setTierDraft({ ...tierDraft, reward_category: event.target.value as TierDraft["reward_category"] })}><option value="">Kategori reward</option><option value="coffee">Coffee</option><option value="breakfast">Breakfast</option><option value="merchandise">Merchandise</option></select><Input min="0" step="1" type="number" placeholder="Maksimum reward" value={tierDraft.max_amount} onChange={(event) => setTierDraft({ ...tierDraft, max_amount: event.target.value })} /><Input min="1" step="1" type="number" placeholder="Expiry (jam)" value={tierDraft.expiry_hours} onChange={(event) => setTierDraft({ ...tierDraft, expiry_hours: event.target.value })} /></div><Input placeholder="ID produk eligible, pisahkan koma" value={tierDraft.eligible_product_ids} onChange={(event) => setTierDraft({ ...tierDraft, eligible_product_ids: event.target.value })} /><textarea className="min-h-16 w-full rounded-md border border-input bg-background p-2 text-xs font-mono" placeholder="Reward config JSON" value={tierDraft.reward_config} onChange={(event) => setTierDraft({ ...tierDraft, reward_config: event.target.value })} /><div className="flex gap-2"><Button disabled={saving} type="submit">{tierDraft.id ? "Simpan tier" : "Buat tier"}</Button><Button type="button" variant="ghost" onClick={() => setTierDraft({ campaign_id: "", code: "", name: "", target_km: "", period_scope: "weekly", reward_category: "", eligible_product_ids: "", max_amount: "", expiry_hours: "", reward_config: "{}", is_active: true })}>Reset</Button></div></form></div><DataState label="campaign aktif" onRetry={() => void load()} view={campaigns}>{(rows) => <div className="grid gap-3 lg:grid-cols-2">{rows.map((row, index) => <div className="rounded-xl border border-border p-3" key={String(row.id ?? index)}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold"><RowValue keys={["name", "campaign_name", "title", "campaign_id"]} row={row} /></p><p className="mt-1 text-xs text-muted-foreground"><RowValue keys={["period_label", "starts_at", "start_at"]} row={row} /> — <RowValue keys={["ends_at", "end_at"]} row={row} /></p></div><Badge className={statusClass(first(row, ["status"], "active"))}>{titleCase(first(row, ["status"], "active"))}</Badge></div><dl className="mt-3 grid grid-cols-2 gap-2 text-xs">{[["Tier", ["tier_name", "tier_code", "tier_id"]], ["Target", ["target_km", "target_distance_km"]], ["Kategori reward", ["reward_category"]], ["Produk eligible", ["eligible_product_ids", "eligible_products"]], ["Maksimum", ["max_amount"]], ["Expiry", ["expires_at", "reward_expires_at"]]].map(([label, keys]) => <div className="rounded-lg bg-muted/50 p-2" key={String(label)}><dt className="text-[10px] text-muted-foreground">{String(label)}</dt><dd className="mt-0.5 break-words font-medium"><RowValue keys={keys as string[]} row={row} /></dd></div>)}</dl><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => editCampaign(row)}>Edit</Button>{row.id && <Button size="sm" variant="ghost" onClick={() => void deleteSetting("admin_delete_campaign", String(row.id))}>Hapus</Button>}</div></div>)}</div>}</DataState><div className="mt-3 rounded-xl border border-border p-3"><p className="mb-2 text-sm font-semibold">Tier tersimpan</p><DataState label="tier" onRetry={() => void load()} view={tiers}>{(rows) => <div className="grid gap-2 md:grid-cols-2">{rows.map((row, index) => <div className="flex items-center justify-between rounded-lg bg-muted/50 p-2 text-xs" key={String(row.id ?? index)}><span><b>{String(row.name ?? row.code ?? "Tier")}</b> · {String(row.target_km ?? "—")} km · {String(row.reward_category ?? "Reward belum dikonfigurasi")}</span><span className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => editTier(row)}>Edit</Button>{row.id && <Button size="sm" variant="ghost" onClick={() => void deleteSetting("admin_delete_tier", String(row.id))}>Hapus</Button>}</span></div>)}</div>}</DataState></div><p className="mt-3 text-[11px] text-muted-foreground">Nilai tier, reward, produk eligible, expiry, dan geofence berasal dari konfigurasi backend; tidak ada nominal, produk, atau koordinat yang di-hardcode.</p></section>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="font-semibold">Customer progress</h2><p className="text-xs text-muted-foreground">Progress hanya ditampilkan dari read model server.</p></div><div className="flex flex-wrap gap-2"><div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="w-56 pl-8" placeholder="Cari customer / campaign" value={query} onChange={(event) => setQuery(event.target.value)} /></div><select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Semua status</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="upgraded">Upgraded</option></select></div></div><DataState label="progress customer" onRetry={() => void load()} view={progress}>{() => <><div className="hidden overflow-x-auto rounded-xl border border-border md:block"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-muted/70 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-2.5 py-2">Customer</th><th className="px-2.5 py-2">Campaign / tier</th><th className="px-2.5 py-2">Progress</th><th className="px-2.5 py-2">Target</th><th className="px-2.5 py-2">Status</th></tr></thead><tbody className="divide-y divide-border">{filteredProgress.map((row, index) => <tr className="hover:bg-muted/30" key={String(row.id ?? index)}><td className="px-2.5 py-2"><RowValue keys={["customer_name", "customer_email", "customer_source_id", "customer_id"]} row={row} /></td><td className="px-2.5 py-2"><RowValue keys={["campaign_name", "campaign_id", "tier_name", "tier_code"]} row={row} /></td><td className="px-2.5 py-2"><RowValue keys={["distance_km", "progress_km"]} row={row} /> km</td><td className="px-2.5 py-2"><RowValue keys={["target_km", "target_distance_km"]} row={row} /> km</td><td className="px-2.5 py-2"><Badge className={statusClass(first(row, ["status", "progress_status"], "in_progress"))}>{titleCase(first(row, ["status", "progress_status"], "in_progress"))}</Badge></td></tr>)}</tbody></table></div><div className="space-y-2 md:hidden">{filteredProgress.length ? filteredProgress.map((row, index) => <div className="rounded-xl border border-border p-3" key={String(row.id ?? index)}><div className="flex justify-between gap-2 font-medium text-sm"><RowValue keys={["customer_name", "customer_email", "customer_source_id"]} row={row} /><Badge className={statusClass(first(row, ["status"], "in_progress"))}>{titleCase(first(row, ["status"], "in_progress"))}</Badge></div><p className="mt-2 text-xs text-muted-foreground"><RowValue keys={["campaign_name", "tier_name", "tier_code"]} row={row} /> · <RowValue keys={["distance_km", "progress_km"]} row={row} /> / <RowValue keys={["target_km", "target_distance_km"]} row={row} /> km</p></div>) : <EmptyRows label="progress sesuai filter" />}</div></>}</DataState></section>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><h2 className="mb-3 font-semibold">Reward operations</h2><DataState label="operasi reward" onRetry={() => void load()} view={rewards}>{(rows) => <div className="space-y-2">{rows.map((row, index) => <div className="flex flex-col gap-2 rounded-xl border border-border p-3 text-xs md:flex-row md:items-center md:justify-between" key={String(row.id ?? index)}><div><p className="font-medium"><RowValue keys={["customer_name", "customer_source_id", "customer_id"]} row={row} /> · <RowValue keys={["tier_name", "tier_code", "reward_category"]} row={row} /></p><p className="mt-1 text-muted-foreground">Sisa: <RowValue keys={["remaining_amount"]} row={row} /> · Expiry: <RowValue keys={["expires_at"]} row={row} /></p></div><Badge className={statusClass(first(row, ["status"], "unlocked"))}>{titleCase(first(row, ["status"], "unlocked"))}</Badge></div>)}</div>}</DataState></section>
        </> : <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="font-semibold">Activity review</h2><p className="text-xs text-muted-foreground">Approve/reject/review memakai Edge Function jika contract backend tersedia.</p></div><select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Needs review</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="review">Review</option></select></div><DataState label="riwayat aktivitas" onRetry={() => void load()} view={activities}>{(rows) => <><div className="hidden overflow-x-auto rounded-xl border border-border md:block"><table className="w-full min-w-[980px] text-left text-xs"><thead className="bg-muted/70 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-2.5 py-2">Customer</th><th className="px-2.5 py-2">Aktivitas</th><th className="px-2.5 py-2">Jarak</th><th className="px-2.5 py-2">Tanggal</th><th className="px-2.5 py-2">Status / aksi</th></tr></thead><tbody className="divide-y divide-border">{reviewRows.map((row, index) => <tr className="hover:bg-muted/30" key={String(row.id ?? index)}><td className="px-2.5 py-2"><RowValue keys={["customer_name", "customer_source_id", "customer_id"]} row={row} /></td><td className="px-2.5 py-2"><RowValue keys={["activity_type", "source_app", "activity_id"]} row={row} /></td><td className="px-2.5 py-2"><RowValue keys={["distance_km"]} row={row} /> km</td><td className="px-2.5 py-2"><RowValue keys={["activity_date", "start_time", "created_at"]} row={row} /></td><td className="px-2.5 py-2"><ReviewActions busy={actionKey?.startsWith(first(row, ["activity_id", "run_activity_id", "id"], "")) ?? false} onReview={reviewActivity} row={row} /></td></tr>)}</tbody></table></div><div className="space-y-2 md:hidden">{reviewRows.length ? reviewRows.map((row, index) => <div className="rounded-xl border border-border p-3" key={String(row.id ?? index)}><div className="font-medium text-sm"><RowValue keys={["customer_name", "customer_source_id", "customer_id"]} row={row} /></div><p className="mt-1 text-xs text-muted-foreground"><RowValue keys={["activity_type", "activity_date", "distance_km"]} row={row} /> km</p><div className="mt-3"><ReviewActions busy={actionKey?.startsWith(first(row, ["activity_id", "run_activity_id", "id"], "")) ?? false} onReview={reviewActivity} row={row} /></div></div>) : <EmptyRows label="aktivitas untuk filter ini" />}</div></>}</DataState></section>}
      </div>
    </main>
  );
}
