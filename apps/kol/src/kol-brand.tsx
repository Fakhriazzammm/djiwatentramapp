import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  ClipboardList,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import {
  KolBrandDecision,
  type BrandDecision,
} from "../../../packages/djiwaapps-web-shared/src/components/kol-brand-decision";
import "./kol-brand.css";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { errorText, kolApi, logoutKol } from "./kol-lib";
import { rupiah } from "./kol-rewards";

export const BRAND_STATUS: Record<string, string> = {
  active: "Aktif",
  pending: "Menunggu",
  approved: "Diterima",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
  draft: "Draft",
  published: "Terbit",
  closed: "Ditutup",
  awaiting: "Belum dikirim",
  submitted: "Dalam review",
  needs_revision: "Perlu revisi",
  paid: "Dibayar",
  expired: "Kedaluwarsa",
  creating: "Menyiapkan tagihan",
  review: "Diperiksa Finance",
  void: "Dibatalkan",
};

const BRAND_ERRORS: Record<string, string> = {
  BRAND_EMAIL_UNVERIFIED: "Gunakan akun Google dengan email terverifikasi.",
  INVALID_BRAND_REGISTRATION: "Periksa nama brand dan nomor WhatsApp.",
  INVALID_BRAND_CAMPAIGN: "Periksa brief, tugas, nominal, dan urutan tenggat.",
  BRAND_NO_FUNDED_SLOT: "Anggaran atau kuota belum cukup untuk satu KOL.",
  BRAND_DRAFT_REQUIRED: "Pengaturan ini hanya bisa diubah pada draft.",
  BRAND_PAYMENTS_UNAVAILABLE: "Top-up belum tersedia.",
  BRAND_PROVIDER_UNAVAILABLE: "Status pembayaran belum bisa dicek. Coba lagi.",
  TOPUP_ALREADY_PENDING: "Selesaikan tagihan yang sedang berjalan sebelum membuat tagihan baru.",
  CAMPAIGN_NOT_OPEN: "Tenggat atau status kampanye sudah berubah.",
  REPORT_WITH_ADMIN: "Laporan ini sedang ditangani Admin.",
  DISPUTE_UNAVAILABLE: "Laporan ini sudah selesai atau pernah diajukan ke Admin.",
  DELIVERY_CHANGED: "Laporan sudah diperbarui. Buka ulang sebelum mereview.",
  DELIVERY_CLOSED: "Tenggat pengiriman sudah lewat.",
  DELIVERY_NOT_IN_REVIEW: "Status laporan sudah berubah. Muat ulang halaman.",
  INVALID_BRAND_POST: "Tempel link HTTPS langsung ke postingan di platform yang dipilih.",
  SCREENSHOT_REQUIRED: "Sertakan tautan screenshot untuk tugas ini.",
  BRAND_DUPLICATE: "Post atau permintaan ini sudah tercatat.",
  WALLET_BLOCKED: "Saldo penerima belum bisa dikredit. Hubungi Admin.",
  CREATOR_NOT_ELIGIBLE: "Akun creator ini belum memenuhi syarat untuk menerima reward kampanye.",
};
export const brandError = (error: unknown) =>
  (error instanceof Error ? BRAND_ERRORS[error.message] : undefined) ||
  errorText(error, "Permintaan belum berhasil.") ||
  "Permintaan belum berhasil.";

export function brandFormFields(form: HTMLFormElement) {
  const fields: Record<string, FormDataEntryValue> = {};
  new FormData(form).forEach((value, name) => {
    fields[name] = value;
  });
  return fields;
}

type Brand = { id: string; name: string; status: "pending" | "active" | "rejected"; review_note?: string };
type Money = number | string;
export type BrandTask = { label: string; platform: string; amount: number; requiresScreenshot: boolean };
export type FixedReward = {
  brand: string;
  total: number;
  quota: number;
  slotsLeft: number;
  tasks: BrandTask[];
};
type Campaign = {
  id: string;
  slug: string;
  title: string;
  brand: string;
  status: string;
  pending: Money;
  in_review: Money;
  application_deadline: string;
  end_date: string;
  quota: number;
  reward_per_kol: Money;
  funded: Money;
  available: Money;
  reserved: Money;
  paid: Money;
  refunded: Money;
};
type Application = { id: string; name: string; username: string; status: string; review_note: string | null };
type Delivery = {
  id: string;
  name: string;
  username: string;
  label: string;
  platform: string;
  amount: Money;
  status: string;
  content_url: string | null;
  insight_screenshot_url: string | null;
  note: string | null;
  proof_revision: string | null;
  with_admin: boolean;
};
type Deposit = {
  id: string;
  nominal: Money;
  fee: Money;
  total: Money;
  state: string;
  invoice_url: string | null;
  created_at: string;
};
type Ledger = {
  id: string;
  kind: string;
  note: string | null;
  available_delta: Money;
  reserved_delta: Money;
  paid_delta: Money;
  refunded_delta: Money;
  created_at: string;
};
type Details = {
  campaign: Campaign & { brief: string; terms: string[]; tasks: BrandTask[]; deadline_passed: boolean };
  applications: Application[];
  deliveries: Delivery[];
  deposits: Deposit[];
  ledger: Ledger[];
  paymentsEnabled: boolean;
  feePercent: number;
};

const dateFormatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
const dateLabel = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value)) ? dateFormatter.format(new Date(value)) : "—";
const money = (value: Money) => rupiah(Number(value));
const send = <T,>(path: string, payload: unknown, method = "POST") =>
  kolApi<T>(path, { method, body: JSON.stringify(payload) });

const tabs = [
  { value: "ringkasan", title: "Ringkasan", icon: FileText },
  { value: "anggaran", title: "Anggaran", icon: Wallet },
  { value: "pendaftar", title: "Pendaftar", icon: Users },
  { value: "laporan", title: "Laporan", icon: ClipboardList },
] as const;
type CampaignTab = (typeof tabs)[number]["value"];
type BrandRoute = { brand?: string; campaign?: string; tab: CampaignTab; draft?: "baru" | "edit" };
const idFrom = (value: string | null) => (value && /^\d{1,18}$/.test(value) ? value : undefined);

function readBrandRoute(): BrandRoute {
  const query = new URLSearchParams(window.location.search);
  const campaign = idFrom(query.get("campaign"));
  const draft = query.get("draft");
  return {
    brand: idFrom(query.get("brand")),
    campaign,
    tab: tabs.find((tab) => tab.value === query.get("tab"))?.value || "ringkasan",
    draft: draft === "baru" && !campaign ? "baru" : draft === "edit" && campaign ? "edit" : undefined,
  };
}

function useBrandRoute() {
  const [route, setRoute] = useState(readBrandRoute);
  useEffect(() => {
    const sync = () => setRoute(readBrandRoute());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const open = (next: BrandRoute, replace = false) => {
    const query = new URLSearchParams();
    if (next.brand) query.set("brand", next.brand);
    if (next.campaign) query.set("campaign", next.campaign);
    if (next.campaign && next.tab !== "ringkasan") query.set("tab", next.tab);
    if (next.draft) query.set("draft", next.draft);
    const search = query.toString();
    const url = search ? `/brand?${search}` : "/brand";
    if (replace) window.history.replaceState({}, "", url);
    else if (window.location.pathname + window.location.search !== url) window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  return { route, open };
}

function Status({ state }: { state: string }) {
  const tone = ["active", "approved", "published", "paid"].includes(state)
    ? "good"
    : ["pending", "submitted", "review", "creating", "needs_revision"].includes(state)
      ? "wait"
      : ["rejected", "expired", "void"].includes(state)
        ? "bad"
        : "neutral";
  return (
    <span className="bs-status" data-tone={tone}>
      {BRAND_STATUS[state] ?? state}
    </span>
  );
}

function Button({
  children,
  onClick,
  disabled,
  kind = "secondary",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  kind?: "secondary" | "primary" | "text";
}) {
  return (
    <button type="button" className={`bs-button bs-${kind}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="bs-empty">
      <ClipboardList size={22} aria-hidden />
      <p>{children}</p>
      {action}
    </div>
  );
}

function Notice({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return (
    <p className={danger ? "bs-note bs-error" : "bs-note"} role={danger ? "alert" : "status"}>
      {children}
    </p>
  );
}

function BrandShell({ children, signed }: { children: ReactNode; signed: boolean }) {
  return (
    <div className="brand-studio">
      <header className="bs-shell-bar">
        <div className="bs-shell-inner">
          <a className="bs-wordmark" href="/brand">
            <img src="/logo-djiwa.png" alt="" width={36} height={36} />
            <span>Portal Brand</span>
          </a>
          <nav aria-label="Akun Brand" className="bs-shell-links">
            <a href="/masuk">Ganti portal</a>
            {signed && (
              <button type="button" onClick={() => void logoutKol()}>
                Keluar
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="bs-page">{children}</main>
    </div>
  );
}

export function BrandEntry({
  signed,
  loading,
  loginError,
  onLogin,
}: {
  signed: boolean;
  loading: boolean;
  loginError: string;
  onLogin: () => Promise<void>;
}) {
  const [signingIn, setSigningIn] = useState(false);
  return (
    <BrandShell signed={signed}>
      {signed ? (
        <BrandWorkspace />
      ) : (
        <section className="bs-entry bs-panel">
          <div className="bs-entry-icon">
            <Building2 size={27} aria-hidden />
          </div>
          <h1>Kelola kampanye KOL</h1>
          <p>Atur brief, anggaran, dan review laporan dari akun Brand kamu.</p>
          {loginError && <Notice danger>{loginError}</Notice>}
          <Button
            kind="primary"
            disabled={loading || signingIn}
            onClick={async () => {
              setSigningIn(true);
              try {
                await onLogin();
              } finally {
                setSigningIn(false);
              }
            }}
          >
            {loading ? "Memeriksa sesi…" : signingIn ? "Membuka Google…" : "Lanjutkan dengan Google"}
            <ArrowRight size={17} />
          </Button>
        </section>
      )}
    </BrandShell>
  );
}

function BrandWorkspace() {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigation = useBrandRoute();
  const reload = useCallback(async () => {
    try {
      setBrands(await kolApi<Brand[]>("/brand/session"));
      setError("");
    } catch (reason) {
      setError(brandError(reason));
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const active = brands?.filter((brand) => brand.status === "active") ?? [];
  const selected = active.find((brand) => String(brand.id) === navigation.route.brand) ?? active[0];
  const pending = brands?.some((brand) => brand.status === "pending");
  const atCampaignList = !navigation.route.campaign && !navigation.route.draft;

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = brandFormFields(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await send("/brand/register", fields);
      setRegister(false);
      await reload();
    } catch (reason) {
      setError(brandError(reason));
    } finally {
      setBusy(false);
    }
  }

  const brandOptions = selected && (
    <label className="bs-field bs-switch">
      <span>Brand aktif</span>
      <select
        aria-label="Brand aktif"
        value={String(selected.id)}
        onChange={(event) => navigation.open({ brand: event.target.value, tab: "ringkasan" })}
      >
        {active.map((brand) => (
          <option key={brand.id} value={brand.id}>
            {brand.name}
          </option>
        ))}
      </select>
    </label>
  );

  if (!brands)
    return (
      <section className="bs-panel">
        {error ? (
          <>
            <Notice danger>{error}</Notice>
            <Button onClick={() => void reload()}>Coba lagi</Button>
          </>
        ) : (
          <Notice>Memuat akun Brand…</Notice>
        )}
      </section>
    );

  return (
    <>
      {error && <Notice danger>{error}</Notice>}
      {selected && (
        <BrandCampaigns
          key={selected.id}
          brand={selected}
          brandOptions={brandOptions}
          navigation={navigation}
        />
      )}
      {brands.filter((brand) => brand.status !== "active").length > 0 && (
        <section className="bs-panel">
          <div className="bs-section-head">
            <h2>Pengajuan Brand</h2>
            {pending && (
              <Button kind="text" onClick={() => void reload()}>
                <RefreshCw size={14} /> Cek status
              </Button>
            )}
          </div>
          <div className="bs-rows">
            {brands
              .filter((brand) => brand.status !== "active")
              .map((brand) => (
                <article className="bs-row" key={brand.id}>
                  <div>
                    <b>{brand.name}</b>
                    {brand.review_note && <small>{brand.review_note}</small>}
                  </div>
                  <span className="bs-status" data-tone={brand.status === "pending" ? "wait" : "bad"}>
                    {brand.status === "pending" ? "Menunggu verifikasi" : "Ditolak"}
                  </span>
                </article>
              ))}
          </div>
        </section>
      )}
      {!pending && (!selected || register) && (
        <form className="bs-panel bs-register" onSubmit={(event) => void apply(event)}>
          <div className="bs-section-head">
            <div>
              <h2>Daftar sebagai Brand</h2>
              <p>Pengajuan akan ditinjau sebelum Brand bisa mulai membuat kampanye.</p>
            </div>
          </div>
          <div className="bs-field-grid">
            <label className="bs-field">
              Nama Brand
              <input name="name" required minLength={2} maxLength={120} />
            </label>
            <label className="bs-field">
              Nomor WhatsApp
              <input name="phone" type="tel" required maxLength={30} autoComplete="tel" />
            </label>
          </div>
          <div className="bs-actions">
            {selected && <Button onClick={() => setRegister(false)}>Batal</Button>}
            <button className="bs-button bs-primary" disabled={busy}>
              {busy ? "Mengirim…" : "Ajukan verifikasi"}
            </button>
          </div>
        </form>
      )}
      {selected && atCampaignList && !pending && !register && (
        <div className="bs-footer-actions">
          <Button kind="text" onClick={() => setRegister(true)}>
            <Plus size={16} /> Daftarkan Brand lain
          </Button>
        </div>
      )}
    </>
  );
}

function BrandCampaigns({
  brand,
  brandOptions,
  navigation,
}: {
  brand: Brand;
  brandOptions: ReactNode;
  navigation: ReturnType<typeof useBrandRoute>;
}) {
  const brandId = String(brand.id);
  const endpoint = `/brand/${brand.id}/campaigns`;
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const { route, open } = navigation;
  const sameBrand = !route.brand || route.brand === brandId;
  const selected = sameBrand ? route.campaign : undefined;
  const go = (next: Omit<BrandRoute, "brand">, replace = false) => open({ brand: brandId, ...next }, replace);

  const load = useCallback(async () => {
    try {
      setCampaigns(await kolApi<Campaign[]>(endpoint));
      setError("");
    } catch (reason) {
      setError(brandError(reason));
    }
  }, [endpoint]);
  useEffect(() => {
    void load();
  }, [load, selected, route.draft]);

  if (selected)
    return <BrandCampaign key={selected} endpoint={`${endpoint}/${selected}`} route={route} go={go} />;
  if (sameBrand && route.draft === "baru")
    return (
      <>
        <Button kind="text" onClick={() => go({ tab: "ringkasan" })}>
          <ArrowLeft size={17} /> Semua kampanye
        </Button>
        <div className="bs-page-title">
          <div>
            <p>{brand.name}</p>
            <h1>Buat kampanye</h1>
          </div>
        </div>
        <CampaignForm
          endpoint={endpoint}
          onCancel={() => go({ tab: "ringkasan" })}
          onSaved={(id) => go({ campaign: String(id), tab: "ringkasan" }, true)}
        />
      </>
    );

  const visible =
    campaigns?.filter(
      (item) =>
        (filter === "all" || item.status === filter) &&
        item.title.toLowerCase().includes(search.trim().toLowerCase()),
    ) ?? [];
  const reviewCount = campaigns?.reduce((total, item) => total + Number(item.in_review), 0) ?? 0;
  const totalAvailable = campaigns?.reduce((total, item) => total + Number(item.available), 0) ?? 0;
  const newCampaign = () => go({ tab: "ringkasan", draft: "baru" });

  return (
    <>
      <header className="bs-page-title">
        <div>
          <p>{brand.name}</p>
          <h1>Kampanye</h1>
        </div>
        <div className="bs-heading-actions">
          {brandOptions}
          <Button kind="primary" onClick={newCampaign}>
            <Plus size={18} /> Buat kampanye
          </Button>
        </div>
      </header>
      {error && (
        <div className="bs-toolbar">
          <Notice danger>{error}</Notice>
          <Button onClick={() => void load()}>Coba lagi</Button>
        </div>
      )}
      {!campaigns && !error && <Notice>Memuat kampanye…</Notice>}
      {campaigns && (
        <>
          <dl className="bs-overview">
            <div>
              <Wallet size={18} aria-hidden />
              <dt>Dana tersedia</dt>
              <dd>{money(totalAvailable)}</dd>
            </div>
            <div>
              <ClipboardList size={18} aria-hidden />
              <dt>Laporan dalam review</dt>
              <dd>{reviewCount}</dd>
            </div>
            <div>
              <Check size={18} aria-hidden />
              <dt>Kampanye terbit</dt>
              <dd>{campaigns.filter((item) => item.status === "published").length}</dd>
            </div>
          </dl>
          <section className="bs-panel">
            <div className="bs-section-head">
              <div>
                <h2>Daftar kampanye</h2>
                <p>{campaigns.length} kampanye</p>
              </div>
              <Button kind="text" onClick={() => void load()}>
                <RefreshCw size={15} /> Muat ulang
              </Button>
            </div>
            <div className="bs-filters">
              <label className="bs-search">
                <Search size={17} aria-hidden />
                <input
                  aria-label="Cari kampanye"
                  type="search"
                  placeholder="Cari kampanye"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label className="bs-field">
                <select
                  aria-label="Status kampanye"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                >
                  <option value="all">Semua status</option>
                  <option value="draft">Draft</option>
                  <option value="published">Terbit</option>
                  <option value="closed">Ditutup</option>
                </select>
              </label>
            </div>
            {visible.length ? (
              <div className="bs-campaign-list">
                <div className="bs-campaign-columns" aria-hidden>
                  <span>Kampanye</span>
                  <span>Status</span>
                  <span>Saldo tersedia</span>
                  <span>Perlu review</span>
                  <span />
                </div>
                {visible.map((item) => (
                  <button
                    className="bs-campaign-row"
                    type="button"
                    key={item.id}
                    onClick={() => go({ campaign: String(item.id), tab: "ringkasan" })}
                  >
                    <span className="bs-campaign-name">
                      <b>{item.title}</b>
                      <small>
                        {item.pending} pelamar menunggu · laporan sampai {dateLabel(item.end_date)}
                      </small>
                    </span>
                    <Status state={item.status} />
                    <span className="bs-campaign-money">{money(item.available)}</span>
                    <span className="bs-campaign-review">
                      {item.in_review}
                      <small> dalam review</small>
                    </span>
                    <ArrowRight size={17} aria-hidden />
                  </button>
                ))}
              </div>
            ) : (
              <Empty>
                {campaigns.length ? "Tidak ada kampanye yang cocok." : "Belum ada kampanye untuk Brand ini."}
              </Empty>
            )}
          </section>
        </>
      )}
    </>
  );
}

const platforms = ["TikTok", "Instagram", "YouTube", "Threads", "X", "LinkedIn"];
type TaskInput = Omit<BrandTask, "amount"> & { amount: string; key: string };
const emptyTask = (): TaskInput => ({
  label: "",
  platform: "TikTok",
  amount: "",
  requiresScreenshot: false,
  key: crypto.randomUUID(),
});

function CampaignForm({
  endpoint,
  initial,
  onSaved,
  onCancel,
}: {
  endpoint: string;
  initial?: Details["campaign"];
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const [tasks, setTasks] = useState<TaskInput[]>(
    () =>
      initial?.tasks.map((item) => ({ ...item, amount: String(item.amount), key: crypto.randomUUID() })) ?? [
        emptyTask(),
      ],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = (key: string, patch: Partial<TaskInput>) =>
    setTasks((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const fields = brandFormFields(event.currentTarget);
    try {
      const result = await send<{ id: string }>(
        endpoint,
        { ...fields, tasks: tasks.map(({ key: _key, ...task }) => task) },
        initial ? "PATCH" : "POST",
      );
      onSaved(result.id);
    } catch (reason) {
      setError(brandError(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="bs-editor" onSubmit={(event) => void save(event)}>
      <section className="bs-panel bs-form-section">
        <div className="bs-section-head">
          <div>
            <h2>Detail kampanye</h2>
            <p>Brief dan tenggat akan terlihat oleh KOL.</p>
          </div>
        </div>
        <label className="bs-field">
          Nama kampanye
          <input name="title" minLength={2} maxLength={120} required defaultValue={initial?.title} />
        </label>
        <label className="bs-field">
          Brief
          <textarea
            name="brief"
            minLength={10}
            maxLength={5000}
            rows={5}
            required
            defaultValue={initial?.brief}
          />
        </label>
        <label className="bs-field">
          Syarat dan ketentuan
          <textarea
            name="terms"
            maxLength={3000}
            rows={3}
            required
            defaultValue={initial?.terms.join("\n")}
          />
        </label>
        <div className="bs-field-grid bs-dates">
          <label className="bs-field">
            Pendaftaran sampai
            <input
              name="applicationDeadline"
              type="date"
              required
              defaultValue={initial?.application_deadline}
            />
          </label>
          <label className="bs-field">
            Laporan sampai
            <input name="deadline" type="date" required defaultValue={initial?.end_date} />
          </label>
          <label className="bs-field">
            Kuota KOL
            <input name="quota" type="number" min={1} max={100} required defaultValue={initial?.quota ?? 1} />
          </label>
        </div>
      </section>
      <section className="bs-panel bs-form-section">
        <div className="bs-section-head">
          <div>
            <h2>Tugas dan reward</h2>
            <p>Tentukan nominal untuk setiap jenis konten.</p>
          </div>
        </div>
        {tasks.map((item, index) => (
          <fieldset className="bs-task" key={item.key}>
            <legend>Tugas {index + 1}</legend>
            <div className="bs-field-grid bs-task-fields">
              <label className="bs-field">
                Jenis konten
                <input
                  maxLength={100}
                  placeholder="Contoh: Instagram Reel"
                  value={item.label}
                  onChange={(event) => change(item.key, { label: event.target.value })}
                  required
                />
              </label>
              <label className="bs-field">
                Platform
                <select
                  value={item.platform}
                  onChange={(event) => change(item.key, { platform: event.target.value })}
                >
                  {platforms.map((platform) => (
                    <option key={platform}>{platform}</option>
                  ))}
                </select>
              </label>
              <label className="bs-field">
                Reward (Rp)
                <input
                  type="number"
                  min={1000}
                  max={10000000}
                  step={1}
                  required
                  value={item.amount}
                  onChange={(event) => change(item.key, { amount: event.target.value })}
                />
              </label>
            </div>
            <div className="bs-toolbar">
              <label className="bs-check">
                <input
                  type="checkbox"
                  checked={item.requiresScreenshot}
                  onChange={(event) => change(item.key, { requiresScreenshot: event.target.checked })}
                />{" "}
                Wajibkan screenshot
              </label>
              {tasks.length > 1 && (
                <Button
                  kind="text"
                  onClick={() => setTasks((list) => list.filter((task) => task.key !== item.key))}
                >
                  Hapus tugas {index + 1}
                </Button>
              )}
            </div>
          </fieldset>
        ))}
        {tasks.length < 10 && (
          <Button onClick={() => setTasks((items) => [...items, emptyTask()])}>
            <Plus size={16} /> Tambah tugas
          </Button>
        )}
      </section>
      {error && <Notice danger>{error}</Notice>}
      <div className="bs-save-bar">
        <div>
          <span>Reward per KOL</span>
          <b>{money(tasks.reduce((sum, item) => sum + (Number(item.amount) || 0), 0))}</b>
        </div>
        <div className="bs-actions">
          <Button onClick={onCancel} disabled={busy}>
            Batal
          </Button>
          <button className="bs-button bs-primary" disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan draft"}
          </button>
        </div>
      </div>
    </form>
  );
}

type Act = (path: string, payload: unknown) => Promise<void>;
type Decide = (decision: BrandDecision) => void;
function BrandCampaign({
  endpoint,
  route,
  go,
}: {
  endpoint: string;
  route: BrandRoute;
  go: (route: Omit<BrandRoute, "brand">, replace?: boolean) => void;
}) {
  const [detail, setDetail] = useState<Details | null>(null);
  const [error, setError] = useState("");
  const [decision, decide] = useState<BrandDecision | null>(null);
  const load = useCallback(async () => {
    try {
      setDetail(await kolApi<Details>(endpoint));
      setError("");
    } catch (reason) {
      setError(brandError(reason));
    }
  }, [endpoint]);
  useEffect(() => {
    void load();
  }, [load]);

  const act: Act = async (path, payload) => {
    try {
      await send(endpoint + path, payload);
    } catch (reason) {
      throw new Error(brandError(reason));
    }
    await load();
  };
  const openTab = (tab: CampaignTab) => go({ campaign: route.campaign, tab });
  const item = detail?.campaign;
  const canPublish = item?.status === "draft" && Number(item.available) >= Number(item.reward_per_kol);

  return (
    <>
      <div className="bs-toolbar">
        <Button kind="text" onClick={() => go({ tab: "ringkasan" })}>
          <ArrowLeft size={17} /> Semua kampanye
        </Button>
        <Button kind="text" onClick={() => void load()}>
          <RefreshCw size={15} /> Muat ulang
        </Button>
      </div>
      {error && <Notice danger>{error}</Notice>}
      {!item && !error && <Notice>Memuat kampanye…</Notice>}
      {detail && item && (
        <>
          <header className="bs-page-title bs-detail-title">
            <div>
              <div className="bs-heading-meta">
                <span>{item.brand}</span>
                <Status state={item.status} />
              </div>
              <h1>{route.draft === "edit" ? "Edit kampanye" : item.title}</h1>
            </div>
            {route.draft !== "edit" && item.status === "draft" && (
              <Button
                kind="primary"
                onClick={() => {
                  if (!canPublish) {
                    openTab("anggaran");
                    return;
                  }
                  decide({
                    title: "Terbitkan kampanye",
                    detail: `${item.title} akan tampil di portal KOL dan menerima pendaftaran.`,
                    confirm: "Terbitkan",
                    submit: () => act("/status", { status: "published" }),
                  });
                }}
              >
                {canPublish ? "Terbitkan kampanye" : "Isi anggaran"}
                <ArrowRight size={17} />
              </Button>
            )}
          </header>
          {route.draft === "edit" && item.status === "draft" ? (
            <CampaignForm
              key={item.id}
              endpoint={endpoint}
              initial={item}
              onCancel={() => openTab("ringkasan")}
              onSaved={() => {
                go({ campaign: route.campaign, tab: "ringkasan" }, true);
                void load();
              }}
            />
          ) : (
            <>
              <nav className="bs-tabs" aria-label="Menu kampanye Brand">
                {tabs.map(({ value, title, icon: Icon }) => {
                  const count =
                    value === "pendaftar"
                      ? Number(item.pending)
                      : value === "laporan"
                        ? Number(item.in_review)
                        : 0;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => openTab(value)}
                      aria-pressed={route.tab === value}
                    >
                      <Icon size={16} aria-hidden />
                      {title}
                      {count > 0 && <span>{count}</span>}
                    </button>
                  );
                })}
              </nav>
              {route.tab === "ringkasan" && (
                <div className="bs-summary">
                  <section className="bs-panel">
                    <div className="bs-section-head">
                      <h2>Brief kampanye</h2>
                      {item.status === "draft" && (
                        <Button
                          kind="text"
                          onClick={() => go({ campaign: route.campaign, tab: "ringkasan", draft: "edit" })}
                        >
                          Edit draft
                        </Button>
                      )}
                    </div>
                    <p className="bs-brief">{item.brief}</p>
                    <h3>Ketentuan</h3>
                    <ul className="bs-terms">
                      {item.terms.map((term, index) => (
                        <li key={index}>{term}</li>
                      ))}
                    </ul>
                  </section>
                  <section className="bs-panel">
                    <div className="bs-section-head">
                      <h2>Tenggat & kuota</h2>
                    </div>
                    <dl className="bs-kv">
                      <div>
                        <dt>Pendaftaran sampai</dt>
                        <dd>{dateLabel(item.application_deadline)}</dd>
                      </div>
                      <div>
                        <dt>Laporan sampai</dt>
                        <dd>{dateLabel(item.end_date)}</dd>
                      </div>
                      <div>
                        <dt>Kuota KOL</dt>
                        <dd>{item.quota}</dd>
                      </div>
                      <div>
                        <dt>Reward per KOL</dt>
                        <dd>{money(item.reward_per_kol)}</dd>
                      </div>
                    </dl>
                    {item.status === "published" && (
                      <a className="bs-button bs-secondary" href={`/campaigns/${item.slug}`}>
                        Halaman publik <ArrowUpRight size={15} />
                      </a>
                    )}
                  </section>
                  <section className="bs-panel bs-full">
                    <div className="bs-section-head">
                      <h2>Tugas dan reward</h2>
                    </div>
                    <div className="bs-rows">
                      {item.tasks.map((task) => (
                        <article className="bs-row" key={task.platform + task.label}>
                          <div>
                            <b>{task.label}</b>
                            <small>
                              {task.platform}
                              {task.requiresScreenshot ? " · Wajib screenshot" : ""}
                            </small>
                          </div>
                          <strong>{money(task.amount)}</strong>
                        </article>
                      ))}
                    </div>
                    {item.status === "draft" && !canPublish && (
                      <Notice>
                        Siapkan minimal {money(item.reward_per_kol)} untuk satu slot KOL sebelum terbit.
                      </Notice>
                    )}
                    {item.status === "closed" && (
                      <Notice>
                        Laporan aktif tetap bisa diselesaikan sesuai tenggat. Finance memproses sisa dana
                        setelah semua kewajiban selesai.
                      </Notice>
                    )}
                  </section>
                  {["published", "draft"].includes(item.status) && (
                    <div className="bs-full bs-footer-actions">
                      <Button
                        kind="text"
                        onClick={() =>
                          decide({
                            title: "Tutup kampanye",
                            detail:
                              "Pendaftaran baru akan berhenti. Laporan aktif tetap mengikuti tenggat kampanye.",
                            confirm: "Tutup kampanye",
                            danger: true,
                            submit: () => act("/status", { status: "closed" }),
                          })
                        }
                      >
                        Tutup kampanye
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {route.tab === "anggaran" && <Budget detail={detail} endpoint={endpoint} onChanged={load} />}
              {route.tab === "pendaftar" && (
                <ApplicantList
                  applications={detail.applications}
                  canAccept={item.status === "published" && !item.deadline_passed}
                  act={act}
                  decide={decide}
                />
              )}
              {route.tab === "laporan" && (
                <ReportList
                  deliveries={detail.deliveries}
                  expired={item.deadline_passed}
                  act={act}
                  decide={decide}
                />
              )}
            </>
          )}
        </>
      )}
      {decision && <KolBrandDecision decision={decision} onClose={() => decide(null)} />}
    </>
  );
}
function Budget({
  endpoint,
  detail,
  onChanged,
}: {
  endpoint: string;
  detail: Details;
  onChanged: () => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const fee = Math.ceil((Number(amount || 0) * detail.feePercent) / 100);
  const outstanding = detail.deposits.find((item) => ["creating", "pending", "review"].includes(item.state));
  const canTopUp = ["published", "draft"].includes(detail.campaign.status);
  const change = (value: string) => {
    setAmount(value);
    setKey(crypto.randomUUID());
  };

  async function update(path: string, payload: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await send<{ state?: string; status?: string }>(endpoint + path, payload);
      const state = result.state ?? result.status ?? "";
      setNotice(
        state === "review"
          ? "Tagihan sedang diperiksa Finance."
          : state === "pending"
            ? "Tagihan menunggu pembayaran."
            : (BRAND_STATUS[state] ?? state),
      );
      if (path === "/topups") change("");
      await onChanged();
    } catch (reason) {
      setError(brandError(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bs-budget">
      <section className="bs-balance bs-full">
        <div className="bs-balance-main">
          <div>
            <p>Anggaran tersedia</p>
            <strong>{money(detail.campaign.available)}</strong>
          </div>
          <img src="/assets/3d/payment-wallet.png" alt="" width={100} height={100} />
        </div>
        <dl>
          {(
            [
              ["Dicadangkan", detail.campaign.reserved],
              ["Dibayar", detail.campaign.paid],
              ["Dikembalikan", detail.campaign.refunded],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{money(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="bs-panel">
        <div className="bs-section-head">
          <div>
            <h2>{canTopUp ? "Isi anggaran" : "Status anggaran"}</h2>
            {canTopUp && <p>Pembayaran diproses melalui Mayar.</p>}
          </div>
        </div>
        {error && <Notice danger>{error}</Notice>}
        {notice && <Notice>{notice}</Notice>}
        {canTopUp && !detail.paymentsEnabled && <Notice>Top-up belum tersedia.</Notice>}
        {outstanding && (
          <div className="bs-outstanding">
            <div className="bs-toolbar">
              <b>Tagihan berjalan</b>
              <Status state={outstanding.state} />
            </div>
            <p>
              {money(outstanding.total)} · {dateLabel(outstanding.created_at)}
            </p>
            <div className="bs-actions">
              {outstanding.state === "pending" && outstanding.invoice_url && (
                <a
                  className="bs-button bs-primary"
                  href={outstanding.invoice_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Bayar di Mayar <ArrowUpRight size={16} />
                </a>
              )}
              {outstanding.invoice_url && (
                <Button disabled={busy} onClick={() => void update(`/topups/${outstanding.id}/check`, {})}>
                  Cek pembayaran
                </Button>
              )}
            </div>
          </div>
        )}
        {canTopUp && detail.paymentsEnabled && !outstanding && (
          <form
            className="bs-topup"
            onSubmit={(event) => {
              event.preventDefault();
              void update("/topups", { nominal: Number(amount), key });
            }}
          >
            <label className="bs-field">
              Nominal top-up (Rp)
              <input
                type="number"
                inputMode="numeric"
                value={amount}
                min={1000}
                max={100000000}
                required
                onChange={(event) => change(event.target.value)}
              />
            </label>
            <div className="bs-chips" aria-label="Nominal cepat">
              {[100000, 250000, 500000].map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={Number(amount) === value}
                  onClick={() => change(String(value))}
                >
                  {money(value)}
                </button>
              ))}
            </div>
            <dl className="bs-kv">
              <div>
                <dt>Biaya</dt>
                <dd>{money(fee)}</dd>
              </div>
              <div>
                <dt>Total tagihan</dt>
                <dd>{money(Number(amount || 0) + fee)}</dd>
              </div>
            </dl>
            <button className="bs-button bs-primary" disabled={busy}>
              {busy ? "Memproses…" : "Buat tagihan Mayar"}
            </button>
          </form>
        )}
        {!canTopUp && !outstanding && (
          <Notice>Kampanye telah ditutup. Riwayat anggaran tetap dapat dilihat.</Notice>
        )}
      </section>
      <section className="bs-panel">
        <div className="bs-section-head">
          <h2>Riwayat tagihan</h2>
        </div>
        {detail.deposits.length ? (
          <div className="bs-rows">
            {detail.deposits.map((item) => (
              <article className="bs-row bs-bill" key={item.id}>
                <div>
                  <b>{money(item.total)}</b>
                  <small>
                    Top-up {money(item.nominal)} · {dateLabel(item.created_at)}
                  </small>
                </div>
                <Status state={item.state} />
                {item.id !== outstanding?.id &&
                  item.invoice_url &&
                  ["pending", "review", "expired"].includes(item.state) && (
                    <Button
                      kind="text"
                      disabled={busy}
                      onClick={() => void update(`/topups/${item.id}/check`, {})}
                    >
                      Cek pembayaran
                    </Button>
                  )}
              </article>
            ))}
          </div>
        ) : (
          <Empty>Belum ada tagihan.</Empty>
        )}
      </section>
      <section className="bs-panel bs-full">
        <div className="bs-section-head">
          <h2>Mutasi anggaran</h2>
        </div>
        {detail.ledger.length ? (
          <div className="bs-rows">
            {detail.ledger.map((item) => {
              const title =
                {
                  deposit: "Top-up",
                  reserve: "Dana dicadangkan",
                  payout: "Reward dibayar",
                  release: "Cadangan dilepas",
                  refund: "Pengembalian dana",
                }[item.kind] ?? item.kind;
              const value = Math.max(
                ...[item.available_delta, item.reserved_delta, item.paid_delta, item.refunded_delta].map(
                  Number,
                ),
              );
              return (
                <article className="bs-row" key={item.id}>
                  <div>
                    <b>{title}</b>
                    <small>
                      {dateLabel(item.created_at)}
                      {item.note && ` · ${item.note}`}
                    </small>
                  </div>
                  <strong>{money(value)}</strong>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty>Belum ada mutasi anggaran.</Empty>
        )}
      </section>
    </div>
  );
}

function ApplicantList({
  applications,
  canAccept,
  act,
  decide,
}: {
  applications: Application[];
  canAccept: boolean;
  act: Act;
  decide: Decide;
}) {
  const [filter, setFilter] = useState("all");
  const items = applications.filter((item) => filter === "all" || item.status === filter);
  return (
    <section className="bs-panel">
      <div className="bs-section-head">
        <div>
          <h2>Pendaftar</h2>
          <p>{applications.filter((item) => item.status === "pending").length} menunggu keputusan</p>
        </div>
        <label className="bs-field">
          <select
            aria-label="Status pendaftar"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">Semua status</option>
            <option value="pending">Menunggu</option>
            <option value="approved">Diterima</option>
            <option value="rejected">Ditolak</option>
          </select>
        </label>
      </div>
      {items.length ? (
        <div className="bs-rows">
          {items.map((item) => (
            <article className="bs-row bs-person" key={item.id}>
              <div className="bs-person-info">
                <span className="bs-avatar" aria-hidden>
                  {item.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <b>{item.name}</b>
                  <small>
                    {item.username}
                    {item.review_note && ` · ${item.review_note}`}
                  </small>
                </div>
              </div>
              <Status state={item.status} />
              {item.status === "pending" && (
                <div className="bs-actions">
                  {canAccept && (
                    <Button
                      kind="primary"
                      onClick={() =>
                        decide({
                          title: "Terima pendaftar",
                          detail: `Anggaran reward akan dicadangkan untuk ${item.name}.`,
                          confirm: "Terima & cadangkan",
                          submit: () => act(`/applications/${item.id}`, { approve: true }),
                        })
                      }
                    >
                      Terima
                    </Button>
                  )}
                  <Button
                    onClick={() =>
                      decide({
                        title: "Tolak pendaftar",
                        detail: item.name,
                        confirm: "Tolak",
                        danger: true,
                        note: "Alasan penolakan",
                        submit: ({ note }) => act(`/applications/${item.id}`, { approve: false, note }),
                      })
                    }
                  >
                    Tolak
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty>Belum ada pendaftar untuk status ini.</Empty>
      )}
    </section>
  );
}

function ReportList({
  deliveries,
  expired,
  act,
  decide,
}: {
  deliveries: Delivery[];
  expired: boolean;
  act: Act;
  decide: Decide;
}) {
  const [filter, setFilter] = useState("submitted");
  const items = deliveries.filter((item) => filter === "all" || item.status === filter);
  const review = (item: Delivery, action: "approve" | "revision" | "reject") => {
    const title = { approve: "Setujui & bayar", revision: "Minta revisi", reject: "Tolak laporan" }[action];
    decide({
      title,
      confirm: title,
      danger: action === "reject",
      detail:
        action === "approve"
          ? `${money(item.amount)} akan masuk ke saldo Djiwa Pay ${item.name}.`
          : `${item.label} · ${item.name}`,
      note:
        action === "revision"
          ? "Catatan yang perlu direvisi"
          : action === "reject"
            ? "Alasan penolakan"
            : undefined,
      submit: ({ note }) => act(`/reports/${item.id}`, { action, note, revision: item.proof_revision }),
    });
  };
  return (
    <section className="bs-panel">
      <div className="bs-section-head">
        <div>
          <h2>Laporan KOL</h2>
          <p>{deliveries.filter((item) => item.status === "submitted").length} menunggu review</p>
        </div>
      </div>
      <nav className="bs-chips" aria-label="Filter laporan">
        {["submitted", "all", "needs_revision", "paid", "rejected"].map((item) => (
          <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>
            {item === "all" ? "Semua" : BRAND_STATUS[item]}
          </button>
        ))}
      </nav>
      {items.length ? (
        <div className="bs-rows">
          {items.map((item) => (
            <article className="bs-report" key={item.id}>
              <div className="bs-report-head">
                <div>
                  <b>{item.label}</b>
                  <small>
                    {item.name} · {item.platform}
                  </small>
                </div>
                <div>
                  <Status state={item.status} />
                  <strong>{money(item.amount)}</strong>
                </div>
              </div>
              {(item.content_url || item.insight_screenshot_url) && (
                <div className="bs-proof-links">
                  {item.content_url && (
                    <a href={item.content_url} target="_blank" rel="noreferrer">
                      Buka postingan <ArrowUpRight size={14} />
                    </a>
                  )}
                  {item.insight_screenshot_url && (
                    <a href={item.insight_screenshot_url} target="_blank" rel="noreferrer">
                      Buka screenshot <ArrowUpRight size={14} />
                    </a>
                  )}
                </div>
              )}
              {item.with_admin && <Notice>Sedang diperiksa Admin.</Notice>}
              {item.note && <p className="bs-muted">{item.note}</p>}
              {item.status === "submitted" && !item.with_admin && (
                <div className="bs-actions">
                  <Button kind="primary" onClick={() => review(item, "approve")}>
                    Setujui & bayar
                  </Button>
                  {!expired && <Button onClick={() => review(item, "revision")}>Minta revisi</Button>}
                  <Button kind="text" onClick={() => review(item, "reject")}>
                    Tolak
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty>Belum ada laporan untuk status ini.</Empty>
      )}
    </section>
  );
}
