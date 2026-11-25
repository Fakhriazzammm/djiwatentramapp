import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import "./kol-brand-operations.css";

type Money = number | string;
type Campaign = {
  id: number | string;
  title: string;
  brand: string;
  status: string;
  deadline: string | null;
  quota: number;
  reward_per_kol: Money;
  submitted: Money;
  overdue: Money;
  awaiting: Money;
  applicants: Money;
  accepted: Money;
  paid_reports: Money;
  available: Money;
  reserved: Money;
  paid: Money;
  brand_status: string;
};
type Overview = {
  canConfigure: boolean;
  campaigns: Campaign[];
  totals: Record<
    | "campaigns"
    | "published"
    | "funded"
    | "available"
    | "reserved"
    | "paid"
    | "refunded"
    | "submitted"
    | "overdue",
    Money
  >;
  trend: { day: string; amount: Money; payouts: Money }[];
  businesses: { status: string; total: number }[];
  directory: { id: string; name: string; status: string; created_at: string }[];
};
type Detail = {
  settings: {
    review_sla_hours: number;
    internal_note: string;
    updated_at: string | null;
    tasks: { label: string; platform: string; amount: Money }[];
  };
  reports: {
    id: string;
    label: string;
    platform: string;
    creator: string;
    status: string;
    amount: Money;
    content_url: string | null;
    updated_at: string;
    escalated: boolean;
    overdue: boolean;
  }[];
  platforms: { platform: string; assigned: Money; submitted: Money; completed: Money; paid: Money }[];
};
export type BrandOperationsApi = <T>(path: string, method?: string, body?: unknown) => Promise<T>;

const money = (value: Money) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(value),
  );
const number = (value: Money) => new Intl.NumberFormat("id-ID").format(Number(value));
const labels: Record<string, string> = {
  published: "Terbit",
  draft: "Draft",
  closed: "Ditutup",
  archived: "Diarsipkan",
  active: "Aktif",
  pending: "Menunggu",
  rejected: "Ditolak",
  submitted: "Dalam review",
  awaiting: "Belum dikirim",
  needs_revision: "Perlu revisi",
  paid: "Dibayar",
  expired: "Kedaluwarsa",
};
const status = (value: string) => labels[value] || value;
const date = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(value));
const errors: Record<string, string> = {
  FORBIDDEN: "Akses untuk tindakan ini dibatasi.",
  BRAND_OPERATIONS_UNAVAILABLE: "Data operasional Brand belum dapat dimuat.",
  INVALID_BRAND_SETTINGS: "Periksa target review dan panjang catatan.",
};
const errorText = (reason: unknown) =>
  reason instanceof Error ? errors[reason.message] || reason.message : "Permintaan belum berhasil.";

function Table({ title, headers, children }: { title: string; headers: string[]; children: ReactNode }) {
  return (
    <div className="kb-table-wrap" tabIndex={0} aria-label={title}>
      <table aria-label={title} className="kb-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function KolBrandOperations({
  call,
  ready = true,
  onOpenOperations,
}: {
  call: BrandOperationsApi;
  ready?: boolean;
  onOpenOperations?: (id: number | string) => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [days, setDays] = useState(30);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const reload = () => setRevision((value) => value + 1);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const data = await call<Overview>(`/dashboard?days=${days}&q=${encodeURIComponent(query.trim())}`);
        if (active) {
          setOverview(data);
          setError("");
        }
      } catch (reason) {
        if (active) setError(errorText(reason));
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [call, days, query, ready, revision]);

  const campaigns =
    overview?.campaigns.filter(
      (item) =>
        filter === "all" || (filter === "overdue" ? Number(item.overdue) > 0 : item.status === filter),
    ) ?? [];
  if (!ready) return null;
  if (!overview && !error)
    return (
      <p role="status" className="kb-muted">
        Memuat data Brand…
      </p>
    );
  return (
    <div className="kb-workspace">
      {error && (
        <p role="alert" className="kb-error">
          {error}{" "}
          <button type="button" className="kb-link" onClick={reload}>
            Coba lagi
          </button>
        </p>
      )}
      {overview && (
        <>
          <section className="kb-section">
            <h2>Ringkasan Brand</h2>
            <div className="kb-metrics">
              {[
                ["Kampanye terbit", number(overview.totals.published)],
                ["Dalam review", number(overview.totals.submitted)],
                ["Lewat target review", number(overview.totals.overdue)],
                ["Dana masuk", money(overview.totals.funded)],
                ["Tersedia", money(overview.totals.available)],
                ["Dicadangkan", money(overview.totals.reserved)],
                ["Reward dibayar", money(overview.totals.paid)],
                ["Dikembalikan", money(overview.totals.refunded)],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>
            <p className="kb-muted">
              {overview.businesses.length
                ? overview.businesses
                    .map((item) => `${number(item.total)} Brand ${status(item.status).toLowerCase()}`)
                    .join(" · ")
                : "Belum ada pendaftaran Brand."}
            </p>
          </section>
          <section className="kb-section">
            <div className="kb-toolbar">
              <h2>Tren reward dibayar</h2>
              <label>
                Periode{" "}
                <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  {[7, 30, 90].map((value) => (
                    <option key={value} value={value}>
                      {value} hari
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <RewardTrend data={overview.trend} />
          </section>
          <section className="kb-section">
            <div className="kb-toolbar">
              <h2>Brand & kampanye · {number(overview.totals.campaigns)} kampanye</h2>
              <label>
                Cari{" "}
                <input
                  type="search"
                  maxLength={120}
                  value={query}
                  placeholder="Nama kampanye atau Brand"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label>
                Filter{" "}
                <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option value="all">Semua kampanye</option>
                  <option value="published">Terbit</option>
                  <option value="draft">Draft</option>
                  <option value="closed">Ditutup</option>
                  <option value="overdue">Lewat target review</option>
                </select>
              </label>
            </div>
            <Table
              title="Kampanye Brand"
              headers={[
                "Kampanye",
                "Brand",
                "Status",
                "Pendaftar",
                "Diterima / kuota",
                "Dalam review",
                "Lewat target",
                "Tersedia",
                "Terbayar",
              ]}
            >
              {campaigns.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    <button
                      type="button"
                      className="kb-link"
                      aria-pressed={selected?.id === item.id}
                      onClick={() => setSelected(item)}
                    >
                      {item.title}
                    </button>
                  </th>
                  <td>{item.brand}</td>
                  <td>{status(item.status)}</td>
                  <td>{number(item.applicants)}</td>
                  <td>
                    {number(item.accepted)} / {item.quota}
                  </td>
                  <td>{number(item.submitted)}</td>
                  <td>{number(item.overdue)}</td>
                  <td>{money(item.available)}</td>
                  <td>{money(item.paid)}</td>
                </tr>
              ))}
            </Table>
            {campaigns.length === 0 && <p className="kb-muted">Belum ada kampanye yang cocok.</p>}
            {overview.campaigns.length === 200 && (
              <p className="kb-muted">
                Menampilkan maksimal 200 kampanye. Gunakan pencarian untuk menemukan kampanye lain.
              </p>
            )}
            <details>
              <summary>Daftar Brand</summary>
              {overview.directory.length ? (
                <Table title="Daftar Brand" headers={["Brand", "Status", "Tanggal daftar"]}>
                  {overview.directory.map((item) => (
                    <tr key={item.id}>
                      <th scope="row">{item.name}</th>
                      <td>{status(item.status)}</td>
                      <td>{date(item.created_at)}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <p className="kb-muted">Belum ada Brand yang cocok.</p>
              )}
              {overview.directory.length === 200 && (
                <p className="kb-muted">Gunakan pencarian untuk menemukan Brand lain.</p>
              )}
            </details>
          </section>
          {selected && (
            <CampaignOperations
              key={selected.id}
              campaign={selected}
              canConfigure={overview.canConfigure}
              call={call}
              onOpenOperations={onOpenOperations}
              onSaved={reload}
              onClose={() => setSelected(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function RewardTrend({ data }: { data: Overview["trend"] }) {
  const max = Math.max(1, ...data.map((item) => Number(item.amount)));
  const sum = data.reduce((total, item) => total + Number(item.amount), 0);
  return (
    <>
      <p>
        <b>{money(sum)}</b> · {number(data.reduce((total, item) => total + Number(item.payouts), 0))} payout
      </p>
      {sum > 0 ? (
        <div className="kb-trend" role="img" aria-label="Diagram reward dibayar per hari">
          {data.map((item) => (
            <span
              key={item.day}
              title={`${date(item.day)} · ${money(item.amount)}`}
              style={{
                height: `${Math.max(Number(item.amount) ? 6 : 1, (Number(item.amount) / max) * 100)}%`,
              }}
            />
          ))}
        </div>
      ) : (
        <p className="kb-muted">Belum ada reward dibayar pada periode ini.</p>
      )}
      {data.length > 0 && (
        <p className="kb-muted">
          {date(data[0]!.day)} hingga {date(data[data.length - 1]!.day)} WIB
        </p>
      )}
      {sum > 0 && (
        <details>
          <summary>Data harian</summary>
          <Table title="Reward per hari" headers={["Tanggal", "Payout", "Reward dibayar"]}>
            {data.map((item) => (
              <tr key={item.day}>
                <th scope="row">{date(item.day)}</th>
                <td>{number(item.payouts)}</td>
                <td>{money(item.amount)}</td>
              </tr>
            ))}
          </Table>
        </details>
      )}
    </>
  );
}

function CampaignOperations({
  campaign,
  canConfigure,
  call,
  onSaved,
  onClose,
  onOpenOperations,
}: {
  campaign: Campaign;
  canConfigure: boolean;
  call: BrandOperationsApi;
  onSaved: () => void;
  onClose: () => void;
  onOpenOperations?: (id: number | string) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [hours, setHours] = useState("48");
  const [note, setNote] = useState("");
  const [tab, setTab] = useState("reports");
  const [reportPage, setReportPage] = useState(0);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const path = `/operations/${campaign.id}`;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    call<Detail>(path)
      .then((data) => {
        if (active) {
          setDetail(data);
          setHours(String(data.settings.review_sla_hours));
          setNote(data.settings.internal_note);
        }
      })
      .catch((reason) => {
        if (active) setError(errorText(reason));
      });
    return () => {
      active = false;
    };
  }, [call, path]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await call(path, "POST", { reviewSlaHours: Number(hours), internalNote: note });
      setDetail(await call<Detail>(path));
      onSaved();
      setNotice("Pengaturan kampanye disimpan.");
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  const reports = detail?.reports.filter(
    (report) => filter === "all" || (filter === "overdue" ? report.overdue : report.status === filter),
  );
  return (
    <section className="kb-section">
      <div className="kb-toolbar">
        <h2 tabIndex={-1} ref={heading}>
          {campaign.title}
        </h2>
        <button type="button" className="kb-link" onClick={onClose}>
          Tutup detail
        </button>
      </div>
      <p className="kb-muted">
        {campaign.brand} · {money(campaign.reward_per_kol)} per KOL ·{" "}
        {campaign.deadline ? `Tenggat ${date(campaign.deadline)}` : "Tanpa tenggat"}
      </p>
      {error && (
        <p role="alert" className="kb-error">
          {error}
        </p>
      )}
      {onOpenOperations && (
        <button className="kb-link" type="button" onClick={() => onOpenOperations(campaign.id)}>
          Buka operasional kampanye →
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
      {!detail && !error && (
        <p role="status" className="kb-muted">
          Memuat detail kampanye…
        </p>
      )}
      {detail && (
        <>
          <nav className="kb-toolbar" aria-label="Detail Brand">
            {[
              ["reports", "Laporan"],
              ["analysis", "Analisis platform"],
              ["settings", "Pengaturan"],
            ].map(([key, label]) => (
              <button
                type="button"
                key={key}
                className="kb-tab"
                aria-pressed={tab === key}
                onClick={() => setTab(key!)}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "reports" && (
            <>
              <label>
                Status laporan{" "}
                <select
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value);
                    setReportPage(0);
                  }}
                >
                  <option value="all">Semua</option>
                  <option value="submitted">Dalam review</option>
                  <option value="overdue">Lewat target review</option>
                  <option value="paid">Dibayar</option>
                  <option value="needs_revision">Perlu revisi</option>
                </select>
              </label>
              {reports?.length ? (
                <Table
                  title="Antrean laporan kampanye"
                  headers={["Tugas", "Creator", "Platform", "Status", "Reward", "Diperbarui", "Bukti"]}
                >
                  {reports.slice(reportPage * 25, (reportPage + 1) * 25).map((item) => (
                    <tr key={item.id}>
                      <th scope="row">{item.label}</th>
                      <td>{item.creator}</td>
                      <td>{item.platform}</td>
                      <td>
                        <span className={item.overdue ? "kb-overdue" : ""}>
                          {status(item.status)}
                          {item.overdue ? " · Lewat target" : ""}
                          {item.escalated ? " · Eskalasi Admin" : ""}
                        </span>
                      </td>
                      <td>{money(item.amount)}</td>
                      <td>{date(item.updated_at)}</td>
                      <td>
                        {item.content_url && /^https?:\/\//i.test(item.content_url) ? (
                          <a href={item.content_url} target="_blank" rel="noreferrer">
                            Buka bukti
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <p className="kb-muted">Belum ada laporan untuk filter ini.</p>
              )}
              {reports && reports.length > 25 && (
                <div className="kb-toolbar kb-pagination">
                  <button
                    className="kb-tab"
                    type="button"
                    disabled={reportPage === 0}
                    onClick={() => setReportPage(reportPage - 1)}
                  >
                    Sebelumnya
                  </button>
                  <span>
                    {reportPage * 25 + 1}–{Math.min((reportPage + 1) * 25, reports.length)} dari{" "}
                    {number(reports.length)}
                  </span>
                  <button
                    className="kb-tab"
                    type="button"
                    disabled={(reportPage + 1) * 25 >= reports.length}
                    onClick={() => setReportPage(reportPage + 1)}
                  >
                    Berikutnya
                  </button>
                </div>
              )}
            </>
          )}
          {tab === "analysis" && (
            <>
              {detail.platforms.length ? (
                <Table
                  title="Analisis per platform"
                  headers={["Platform", "Tugas", "Dalam review", "Dibayar", "Nominal reward"]}
                >
                  {detail.platforms.map((item) => (
                    <tr key={item.platform}>
                      <th scope="row">{item.platform}</th>
                      <td>{number(item.assigned)}</td>
                      <td>{number(item.submitted)}</td>
                      <td>{number(item.completed)}</td>
                      <td>{money(item.paid)}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <p className="kb-muted">
                  Statistik muncul setelah kampanye memiliki tugas yang dialokasikan ke KOL.
                </p>
              )}
              <h3>Reward per tugas</h3>
              <Table title="Konfigurasi reward per tugas" headers={["Tugas", "Platform", "Reward"]}>
                {detail.settings.tasks.map((task) => (
                  <tr key={task.platform + task.label}>
                    <th scope="row">{task.label}</th>
                    <td>{task.platform}</td>
                    <td>{money(task.amount)}</td>
                  </tr>
                ))}
              </Table>
            </>
          )}
          {tab === "settings" && (
            <form className="kb-settings" onSubmit={(e) => void save(e)}>
              <label>
                Target review (jam)
                <input
                  type="number"
                  min={1}
                  max={720}
                  required
                  value={hours}
                  disabled={!canConfigure || busy}
                  onChange={(event) => setHours(event.target.value)}
                />
              </label>
              <p className="kb-muted">
                Laporan yang masih dalam review akan ditandai setelah melewati target ini.
              </p>
              <label>
                Catatan internal
                <textarea
                  maxLength={1000}
                  rows={4}
                  value={note}
                  disabled={!canConfigure || busy}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              {canConfigure ? (
                <button type="submit" className="kb-tab kb-primary" disabled={busy}>
                  {busy ? "Menyimpan…" : "Simpan pengaturan"}
                </button>
              ) : (
                <p className="kb-muted">Pengaturan dapat diubah oleh Manager atau Admin.</p>
              )}
            </form>
          )}
        </>
      )}
    </section>
  );
}
