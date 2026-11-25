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

const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
const money = (value: Money) => rupiah(Number(value));
const send = <T,>(path: string, payload: unknown, method = "POST") =>
  kolApi<T>(path, { method, body: JSON.stringify(payload) });

function BrandShell({ children, signed }: { children: ReactNode; signed: boolean }) {
  return (
    <div className="kx kx-wrap">
      <main className="kx-view" style={{ paddingTop: "calc(24px + env(safe-area-inset-top))" }}>
        <header className="kx-brand-toolbar">
          <a className="kx-link" href="/">
            Portal KOL
          </a>
          {signed && (
            <button type="button" className="kx-link" onClick={() => void logoutKol()}>
              Keluar
            </button>
          )}
        </header>
        {children}
      </main>
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
  return (
    <BrandShell signed={signed}>
      {signed ? (
        <BrandWorkspace />
      ) : (
        <>
          <h1 className="kx-h1">Portal Brand</h1>
          <p className="kx-lead">
            Buat kampanye, siapkan anggaran, dan bayar reward setelah laporan KOL disetujui.
          </p>
          {loginError && (
            <p className="kx-note kx-note--err" role="alert">
              {loginError}
            </p>
          )}
          <button
            type="button"
            className="kx-btn"
            style={{ marginTop: 16 }}
            disabled={loading}
            onClick={() => void onLogin()}
          >
            {loading ? "Memeriksa sesi…" : "Lanjutkan dengan Google"}
          </button>
        </>
      )}
    </BrandShell>
  );
}

function BrandWorkspace() {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [brandId, setBrandId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [register, setRegister] = useState(false);
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
  const selected = active.find((brand) => brand.id === brandId) ?? active[0];
  const pending = brands?.some((brand) => brand.status === "pending");
  const registerBrand = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = brandFormFields(event.currentTarget);
    try {
      await send("/brand/register", data);
      setRegister(false);
      await reload();
    } catch (reason) {
      setError(brandError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="kx-h1">Portal Brand</h1>
      {error && (
        <p className="kx-note kx-note--err" role="alert">
          {error}
        </p>
      )}
      {!brands && !error && (
        <p role="status" className="kx-sub">
          Memuat akun Brand…
        </p>
      )}
      {!brands && error && (
        <button type="button" className="kx-btn kx-btn--ghost" onClick={() => void reload()}>
          Coba lagi
        </button>
      )}
      {brands && (
        <>
          {active.length > 1 && (
            <label className="kx-label">
              Pilih Brand
              <select
                className="kx-input"
                value={selected?.id}
                onChange={(event) => setBrandId(event.target.value)}
              >
                {active.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {brands
            .filter((brand) => brand.status !== "active")
            .map((brand) => (
              <div key={brand.id} className="kx-card kx-brand-space">
                <div className="kx-brand-toolbar">
                  <b>{brand.name}</b>
                  <span className="kx-pill kx-pill--warn">
                    {brand.status === "pending" ? "Menunggu verifikasi" : "Pengajuan ditolak"}
                  </span>
                </div>
                {brand.review_note && <p className="kx-sub">{brand.review_note}</p>}
                {brand.status === "pending" && (
                  <button type="button" className="kx-link" onClick={() => void reload()}>
                    Cek status
                  </button>
                )}
              </div>
            ))}
          {!pending && (!selected || register) && (
            <form className="kx-card kx-brand-space" onSubmit={registerBrand}>
              <b>Daftar sebagai Brand</b>
              <label className="kx-label">
                Nama Brand
                <input name="name" className="kx-input" required minLength={2} maxLength={120} />
              </label>
              <label className="kx-label">
                Nomor WhatsApp
                <input
                  name="phone"
                  className="kx-input"
                  type="tel"
                  required
                  maxLength={30}
                  autoComplete="tel"
                />
              </label>
              <button className="kx-btn kx-brand-space" disabled={busy}>
                {busy ? "Mengirim…" : "Ajukan verifikasi"}
              </button>
            </form>
          )}
          {selected && <BrandCampaigns key={selected.id} brand={selected} />}
          {selected && !pending && !register && (
            <button type="button" className="kx-link kx-brand-space" onClick={() => setRegister(true)}>
              Daftarkan Brand lain
            </button>
          )}
        </>
      )}
    </>
  );
}

function BrandCampaigns({ brand }: { brand: Brand }) {
  const endpoint = `/brand/${brand.id}/campaigns`;
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
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
  }, [load]);
  if (selected)
    return (
      <BrandCampaign
        key={selected}
        endpoint={`${endpoint}/${selected}`}
        onBack={() => {
          setSelected("");
          void load();
        }}
      />
    );
  return (
    <>
      <div className="kx-brand-toolbar kx-brand-space">
        <h2 className="kx-h2">{brand.name} · Kampanye</h2>
        <button type="button" className="kx-link" onClick={() => setCreating(!creating)}>
          {creating ? "Batal" : "Buat kampanye"}
        </button>
      </div>
      {creating && (
        <CampaignForm
          key="new"
          endpoint={endpoint}
          onSaved={(id) => {
            setCreating(false);
            setSelected(id);
          }}
        />
      )}
      {error && (
        <p role="alert" className="kx-note kx-note--err">
          {error}{" "}
          <button type="button" className="kx-link" onClick={() => void load()}>
            Coba lagi
          </button>
        </p>
      )}
      {!campaigns && !error && (
        <p className="kx-sub" role="status">
          Memuat kampanye…
        </p>
      )}
      {campaigns?.length === 0 && !creating && (
        <p className="kx-sub">Belum ada kampanye. Buat draft untuk menyiapkan brief dan reward.</p>
      )}
      {campaigns?.map((campaign) => (
        <button
          type="button"
          key={campaign.id}
          className="kx-card kx-brand-picker kx-brand-space"
          onClick={() => setSelected(campaign.id)}
        >
          <div className="kx-brand-toolbar">
            <b>{campaign.title}</b>
            <span className="kx-pill">{BRAND_STATUS[campaign.status]}</span>
          </div>
          <p className="kx-sub">
            {money(campaign.available)} tersedia · {campaign.pending} pelamar · {campaign.in_review} laporan
            masuk
          </p>
        </button>
      ))}
    </>
  );
}

const platforms = ["TikTok", "Instagram", "YouTube", "Threads", "X", "LinkedIn"];
type TaskInput = Omit<BrandTask, "amount"> & { amount: string };
const emptyTask = (): TaskInput => ({ label: "", platform: "TikTok", amount: "", requiresScreenshot: false });

function CampaignForm({
  endpoint,
  initial,
  onSaved,
}: {
  endpoint: string;
  initial?: Details["campaign"];
  onSaved: (id: string) => void;
}) {
  const [tasks, setTasks] = useState<TaskInput[]>(
    initial?.tasks.map((task) => ({ ...task, amount: String(task.amount) })) ?? [emptyTask()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changeTask = (index: number, change: Partial<TaskInput>) =>
    setTasks((list) => list.map((task, i) => (i === index ? { ...task, ...change } : task)));
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    const fields = brandFormFields(event.currentTarget);
    try {
      const result = await send<{ id: string }>(endpoint, { ...fields, tasks }, initial ? "PATCH" : "POST");
      onSaved(result.id);
    } catch (reason) {
      setError(brandError(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="kx-card kx-brand-space" onSubmit={save}>
      <label className="kx-label">
        Nama kampanye
        <input
          className="kx-input"
          name="title"
          required
          maxLength={120}
          minLength={2}
          defaultValue={initial?.title}
        />
      </label>
      <label className="kx-label">
        Brief
        <textarea
          className="kx-input"
          name="brief"
          minLength={10}
          maxLength={5000}
          rows={4}
          required
          defaultValue={initial?.brief}
        />
      </label>
      <label className="kx-label">
        Syarat dan ketentuan
        <textarea
          className="kx-input"
          name="terms"
          maxLength={3000}
          rows={3}
          required
          defaultValue={initial?.terms.join("\n")}
        />
      </label>
      <div className="kx-row2">
        <label className="kx-label">
          Pendaftaran sampai
          <input
            className="kx-input"
            name="applicationDeadline"
            type="date"
            required
            defaultValue={initial?.application_deadline}
          />
        </label>
        <label className="kx-label">
          Laporan sampai
          <input className="kx-input" name="deadline" type="date" required defaultValue={initial?.end_date} />
        </label>
      </div>
      <label className="kx-label">
        Kuota KOL
        <input
          className="kx-input"
          name="quota"
          type="number"
          required
          min={1}
          max={100}
          defaultValue={initial?.quota ?? 1}
        />
      </label>
      <h3 className="kx-section">Tugas dan reward</h3>
      {tasks.map((task, index) => (
        <fieldset className="kx-brand-task" key={index}>
          <legend>Tugas {index + 1}</legend>
          <label className="kx-label">
            Jenis konten
            <input
              className="kx-input"
              required
              maxLength={100}
              placeholder="Contoh: Thread"
              value={task.label}
              onChange={(event) => changeTask(index, { label: event.target.value })}
            />
          </label>
          <div className="kx-row2">
            <label className="kx-label">
              Platform
              <select
                className="kx-input"
                value={task.platform}
                onChange={(event) => changeTask(index, { platform: event.target.value })}
              >
                {platforms.map((platform) => (
                  <option key={platform}>{platform}</option>
                ))}
              </select>
            </label>
            <label className="kx-label">
              Reward (Rp)
              <input
                className="kx-input"
                type="number"
                min={1000}
                max={10000000}
                step={1}
                required
                value={task.amount}
                onChange={(event) => changeTask(index, { amount: event.target.value })}
              />
            </label>
          </div>
          <label className="kx-brand-check">
            <input
              type="checkbox"
              checked={task.requiresScreenshot}
              onChange={(event) => changeTask(index, { requiresScreenshot: event.target.checked })}
            />{" "}
            Wajibkan screenshot
          </label>
          {tasks.length > 1 && (
            <button
              type="button"
              className="kx-link"
              onClick={() => setTasks((list) => list.filter((_, i) => i !== index))}
            >
              Hapus tugas {index + 1}
            </button>
          )}
        </fieldset>
      ))}
      {tasks.length < 10 && (
        <button type="button" className="kx-link" onClick={() => setTasks((list) => [...list, emptyTask()])}>
          Tambah tugas
        </button>
      )}
      <p>
        <b>{money(tasks.reduce((total, task) => total + (Number(task.amount) || 0), 0))}</b> per KOL
      </p>
      {error && (
        <p className="kx-note kx-note--err" role="alert">
          {error}
        </p>
      )}
      <button className="kx-btn" disabled={busy}>
        {busy ? "Menyimpan…" : "Simpan draft"}
      </button>
    </form>
  );
}

function BrandCampaign({ endpoint, onBack }: { endpoint: string; onBack: () => void }) {
  const [detail, setDetail] = useState<Details | null>(null);
  const [tab, setTab] = useState("Ringkasan");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setDetail(await kolApi<Details>(endpoint));
    } catch (reason) {
      setError(brandError(reason));
    }
  }, [endpoint]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (path: string, payload: unknown) => {
    setError("");
    setBusy(true);
    try {
      await send(endpoint + path, payload);
      await load();
    } catch (reason) {
      setError(brandError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="kx-brand-toolbar kx-brand-space">
        <button type="button" className="kx-link" onClick={onBack}>
          Semua kampanye
        </button>
        <button
          type="button"
          className="kx-link"
          onClick={() => {
            setError("");
            void load();
          }}
        >
          Muat ulang
        </button>
      </div>
      {error && (
        <p role="alert" className="kx-note kx-note--err">
          {error}
        </p>
      )}
      {!detail && !error && (
        <p role="status" className="kx-sub">
          Memuat kampanye…
        </p>
      )}
      {detail && (
        <>
          <h2 className="kx-h2 kx-brand-space">{detail.campaign.title}</h2>
          <p className="kx-sub">
            {BRAND_STATUS[detail.campaign.status]} · {money(detail.campaign.reward_per_kol)} per KOL · kuota{" "}
            {detail.campaign.quota}
          </p>
          <nav className="kx-hs" aria-label="Menu kampanye Brand">
            {["Ringkasan", "Anggaran", "Pendaftar", "Laporan"].map((name) => (
              <button
                key={name}
                type="button"
                className="kx-chip"
                aria-pressed={tab === name}
                onClick={() => setTab(name)}
              >
                {name}
                {name === "Pendaftar" && Number(detail.campaign.pending) > 0
                  ? ` · ${detail.campaign.pending}`
                  : ""}
                {name === "Laporan" && Number(detail.campaign.in_review) > 0
                  ? ` · ${detail.campaign.in_review}`
                  : ""}
              </button>
            ))}
          </nav>
          {tab === "Ringkasan" && (
            <>
              {editing ? (
                <CampaignForm
                  endpoint={endpoint}
                  initial={detail.campaign}
                  onSaved={() => {
                    setEditing(false);
                    void load();
                  }}
                />
              ) : (
                <div className="kx-card">
                  <p className="kx-brand-brief">{detail.campaign.brief}</p>
                  <p className="kx-sub">
                    Pendaftaran sampai {dateLabel(detail.campaign.application_deadline)} · laporan sampai{" "}
                    {dateLabel(detail.campaign.end_date)}
                  </p>
                  <ul className="kx-brand-list">
                    {detail.campaign.tasks.map((task) => (
                      <li key={task.platform + task.label}>
                        {task.label} · {task.platform}
                        <b>{money(task.amount)}</b>
                      </li>
                    ))}
                  </ul>
                  {detail.campaign.status === "draft" && (
                    <div className="kx-brand-actions">
                      <button type="button" className="kx-btn kx-btn--ghost" onClick={() => setEditing(true)}>
                        Edit draft
                      </button>
                      <button
                        type="button"
                        className="kx-btn"
                        disabled={
                          busy || Number(detail.campaign.available) < Number(detail.campaign.reward_per_kol)
                        }
                        onClick={() => void act("/status", { status: "published" })}
                      >
                        Terbitkan
                      </button>
                    </div>
                  )}
                  {detail.campaign.status === "draft" &&
                    Number(detail.campaign.available) < Number(detail.campaign.reward_per_kol) && (
                      <button type="button" className="kx-link" onClick={() => setTab("Anggaran")}>
                        Isi anggaran minimal {money(detail.campaign.reward_per_kol)}
                      </button>
                    )}
                  {detail.campaign.status === "published" && (
                    <a className="kx-link" href={`/campaigns/${detail.campaign.slug}`}>
                      Lihat halaman KOL
                    </a>
                  )}
                  {["published", "draft"].includes(detail.campaign.status) && (
                    <button
                      type="button"
                      className="kx-link kx-brand-space"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm("Tutup kampanye ini? Pendaftaran baru akan berhenti."))
                          void act("/status", { status: "closed" });
                      }}
                    >
                      Tutup kampanye
                    </button>
                  )}
                  {detail.campaign.status === "closed" && (
                    <p className="kx-sub">
                      Laporan aktif tetap dapat diselesaikan sesuai tenggat. Sisa dana diproses Finance
                      setelah semua kewajiban selesai.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          {tab === "Anggaran" && <Budget endpoint={endpoint} detail={detail} onChanged={load} />}
          {tab === "Pendaftar" && (
            <ApplicantList
              applications={detail.applications}
              busy={busy}
              canAccept={detail.campaign.status === "published" && !detail.campaign.deadline_passed}
              act={act}
            />
          )}
          {tab === "Laporan" && (
            <ReportList
              deliveries={detail.deliveries}
              busy={busy}
              expired={detail.campaign.deadline_passed}
              act={act}
            />
          )}
        </>
      )}
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fee = Math.ceil(((Number(amount) || 0) * detail.feePercent) / 100);
  const outstanding = detail.deposits.some((deposit) =>
    ["creating", "pending", "review"].includes(deposit.state),
  );
  const act = async (path: string, payload: unknown) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await send<{ state?: string; status?: string }>(endpoint + path, payload);
      const state = result.state ?? result.status ?? "";
      setNotice(
        state === "review"
          ? "Tagihan perlu diperiksa Finance."
          : state === "pending"
            ? "Tagihan menunggu pembayaran."
            : BRAND_STATUS[state] || state,
      );
      if (path === "/topups") {
        setKey(crypto.randomUUID());
        setAmount("");
      }
      await onChanged();
    } catch (reason) {
      setError(brandError(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="kx-card">
        <div className="kx-row2 kx-brand-metrics">
          {(
            [
              ["Tersedia", detail.campaign.available],
              ["Dicadangkan", detail.campaign.reserved],
              ["Dibayar", detail.campaign.paid],
              ["Dikembalikan", detail.campaign.refunded],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <b>{money(value)}</b>
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" className="kx-note kx-note--err">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="kx-note">
            {notice}
          </p>
        )}
        {["published", "draft"].includes(detail.campaign.status) &&
          (detail.paymentsEnabled ? (
            outstanding ? (
              <p className="kx-sub">Selesaikan tagihan yang sedang berjalan sebelum membuat tagihan baru.</p>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void act("/topups", { nominal: Number(amount), key });
                }}
              >
                <label className="kx-label">
                  Nominal top-up (Rp)
                  <input
                    className="kx-input"
                    type="number"
                    min={1000}
                    max={100000000}
                    required
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      setKey(crypto.randomUUID());
                    }}
                  />
                </label>
                <p className="kx-sub">
                  Biaya {money(fee)} · Total tagihan {money((Number(amount) || 0) + fee)}
                </p>
                <button className="kx-btn" disabled={busy}>
                  {busy ? "Memproses…" : "Buat tagihan Mayar"}
                </button>
              </form>
            )
          ) : (
            <p className="kx-sub">Top-up belum tersedia.</p>
          ))}
      </div>
      <h3 className="kx-section">Tagihan</h3>
      {detail.deposits.length === 0 && <p className="kx-sub">Belum ada tagihan.</p>}
      {detail.deposits.map((deposit) => (
        <article key={deposit.id} className="kx-card kx-brand-space">
          <div className="kx-brand-toolbar">
            <b>{money(deposit.nominal)}</b>
            <span className="kx-pill">
              {deposit.state === "pending" ? "Menunggu pembayaran" : BRAND_STATUS[deposit.state]}
            </span>
          </div>
          <p className="kx-sub">
            {dateLabel(deposit.created_at)} · Tagihan {money(deposit.total)}
          </p>
          {deposit.state === "pending" && deposit.invoice_url && (
            <a className="kx-link" href={deposit.invoice_url} target="_blank" rel="noreferrer">
              Bayar di Mayar ↗
            </a>
          )}
          {deposit.invoice_url && ["pending", "review", "expired"].includes(deposit.state) && (
            <button
              type="button"
              className="kx-link"
              disabled={busy}
              onClick={() => void act(`/topups/${deposit.id}/check`, {})}
            >
              Cek pembayaran
            </button>
          )}
        </article>
      ))}
      <h3 className="kx-section">Mutasi anggaran</h3>
      {detail.ledger.length === 0 && <p className="kx-sub">Belum ada mutasi.</p>}
      <ul className="kx-brand-list">
        {detail.ledger.map((entry) => {
          const label =
            {
              deposit: "Top-up",
              reserve: "Dana dicadangkan",
              payout: "Reward dibayar",
              release: "Cadangan dilepas",
              refund: "Pengembalian dana",
            }[entry.kind] ?? entry.kind;
          return (
            <li key={entry.id}>
              <span>
                <b>{label}</b>
                <small>
                  {dateLabel(entry.created_at)}
                  {entry.note ? ` · ${entry.note}` : ""}
                </small>
              </span>
              <b>
                {money(
                  Math.max(
                    ...[
                      entry.available_delta,
                      entry.reserved_delta,
                      entry.paid_delta,
                      entry.refunded_delta,
                    ].map(Number),
                  ),
                )}
              </b>
            </li>
          );
        })}
      </ul>
    </>
  );
}

type Act = (path: string, payload: unknown) => Promise<void>;
function ApplicantList({
  applications,
  act,
  busy,
  canAccept,
}: {
  applications: Application[];
  act: Act;
  busy: boolean;
  canAccept: boolean;
}) {
  return applications.length === 0 ? (
    <p className="kx-sub">Belum ada pendaftar.</p>
  ) : (
    <>
      {applications.map((application) => (
        <article key={application.id} className="kx-card kx-brand-space">
          <div className="kx-brand-toolbar">
            <b>{application.name}</b>
            <span className="kx-pill">{BRAND_STATUS[application.status]}</span>
          </div>
          <p className="kx-sub">
            {application.username}
            {application.review_note ? ` · ${application.review_note}` : ""}
          </p>
          {application.status === "pending" && (
            <div className="kx-brand-actions">
              {canAccept && (
                <button
                  type="button"
                  className="kx-btn"
                  disabled={busy}
                  onClick={() => void act(`/applications/${application.id}`, { approve: true })}
                >
                  Terima & cadangkan reward
                </button>
              )}
              <button
                type="button"
                className="kx-btn kx-btn--ghost"
                disabled={busy}
                onClick={() => {
                  const note = window.prompt("Alasan penolakan pendaftar");
                  if (note?.trim()) void act(`/applications/${application.id}`, { approve: false, note });
                }}
              >
                Tolak
              </button>
            </div>
          )}
        </article>
      ))}
    </>
  );
}

function ReportList({
  deliveries,
  act,
  busy,
  expired,
}: {
  deliveries: Delivery[];
  act: Act;
  busy: boolean;
  expired: boolean;
}) {
  const [status, setStatus] = useState("submitted");
  const list = deliveries.filter((delivery) => status === "all" || delivery.status === status);
  const review = (delivery: Delivery, action: "approve" | "revision" | "reject") => {
    const note =
      action === "approve"
        ? window.confirm(`Bayar ${money(delivery.amount)} ke saldo Djiwa Pay ${delivery.name}?`)
          ? ""
          : null
        : window.prompt(action === "revision" ? "Apa yang perlu direvisi?" : "Alasan penolakan laporan");
    if (note === null || (action !== "approve" && !note.trim())) return;
    void act(`/reports/${delivery.id}`, { action, note, revision: delivery.proof_revision });
  };
  return (
    <>
      <div className="kx-hs" aria-label="Filter laporan">
        {["submitted", "all", "needs_revision", "paid"].map((item) => (
          <button
            className="kx-chip"
            key={item}
            type="button"
            aria-pressed={status === item}
            onClick={() => setStatus(item)}
          >
            {item === "all" ? "Semua" : BRAND_STATUS[item]}
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="kx-sub">Belum ada laporan di status ini.</p>}
      {list.map((delivery) => (
        <article key={delivery.id} className="kx-card kx-brand-space">
          <div className="kx-brand-toolbar">
            <b>{delivery.label}</b>
            <span className="kx-pill">{BRAND_STATUS[delivery.status]}</span>
          </div>
          <p className="kx-sub">
            {delivery.name} · {delivery.platform} · {money(delivery.amount)}
          </p>
          {delivery.content_url && (
            <a className="kx-link kx-brand-url" href={delivery.content_url} target="_blank" rel="noreferrer">
              {delivery.content_url}
            </a>
          )}
          {delivery.insight_screenshot_url && (
            <a className="kx-link" href={delivery.insight_screenshot_url} target="_blank" rel="noreferrer">
              Buka screenshot ↗
            </a>
          )}
          {delivery.with_admin && <p className="kx-note">Sedang diperiksa Admin.</p>}
          {delivery.note && <p className="kx-note">{delivery.note}</p>}
          {delivery.status === "submitted" && !delivery.with_admin && (
            <div className="kx-brand-actions">
              <button
                type="button"
                className="kx-btn"
                disabled={busy}
                onClick={() => review(delivery, "approve")}
              >
                Setujui & bayar
              </button>
              {!expired && (
                <button
                  type="button"
                  className="kx-btn kx-btn--ghost"
                  disabled={busy}
                  onClick={() => review(delivery, "revision")}
                >
                  Minta revisi
                </button>
              )}
              <button
                type="button"
                className="kx-btn kx-btn--ghost"
                disabled={busy}
                onClick={() => review(delivery, "reject")}
              >
                Tolak
              </button>
            </div>
          )}
        </article>
      ))}
    </>
  );
}
