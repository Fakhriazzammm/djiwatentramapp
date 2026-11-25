import { KolBrandOperations } from "../../../../../../packages/djiwaapps-web-shared/src/components/kol-brand-operations";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import {
  KolBrandDecision,
  type BrandDecision,
} from "../../../../../../packages/djiwaapps-web-shared/src/components/kol-brand-decision";
import "./kol-brand.css";
import { toast } from "sonner";
import {
  Btn,
  Card,
  Chips,
  EmptyBlock,
  ErrorBox,
  Label,
  Loading,
  NoAccess,
  Page,
  PageHeader,
  StatusTag,
} from "./kol-ui";
import { dateTime, rupiah, useRewardApi } from "./kol-rewards-api";

type Money = string | number;
type Business = {
  id: string;
  name: string;
  contact_email: string;
  contact_phone: string;
  status: string;
  review_note: string | null;
};
type Campaign = {
  id: string;
  title: string;
  brand: string;
  status: string;
  available: Money;
  reserved: Money;
  paid: Money;
  refunded: Money;
  funded: Money;
  in_review: Money;
  deadline_passed: boolean;
};
type Deposit = {
  id: string;
  state: string;
  nominal: Money;
  refunded: Money;
  total: Money;
  invoice_id: string | null;
  provider_transaction_id: string | null;
  issue: string | null;
  created_at: string;
};
type Delivery = {
  id: string;
  label: string;
  platform: string;
  name: string;
  status: string;
  amount: Money;
  content_url: string | null;
  insight_screenshot_url: string | null;
  proof_revision: string | null;
  wallet_ledger_key: string | null;
  note: string | null;
  with_admin: boolean;
  dispute_note: string | null;
  dispute_resolution: string | null;
};
type Detail = {
  campaign: Campaign;
  deposits: Deposit[];
  deliveries: Delivery[];
  applications: { id: string; name: string; status: string; review_note: string | null }[];
  integrity: { budgetBalanced: boolean; walletMatches: boolean; payoutTotal: Money; walletCredited: Money };
  ledger: {
    id: string;
    kind: string;
    created_at: string;
    note: string | null;
    available_delta: Money;
    reserved_delta: Money;
    paid_delta: Money;
    refunded_delta: Money;
  }[];
  events: {
    id: string;
    entity_id: string;
    action: string;
    actor: string;
    created_at: string;
    detail: Record<string, unknown>;
  }[];
};
const label: Record<string, string> = {
  active: "Aktif",
  pending: "Menunggu",
  approved: "Diterima",
  rejected: "Ditolak",
  draft: "Draft",
  published: "Terbit",
  closed: "Ditutup",
  awaiting: "Belum dikirim",
  submitted: "Dalam review",
  needs_revision: "Perlu revisi",
  paid: "Dibayar",
  expired: "Kedaluwarsa",
  creating: "Menyiapkan tagihan",
  review: "Periksa",
  void: "Dibatalkan",
  deposit: "Top-up",
  reserve: "Pencadangan",
  payout: "Reward",
  release: "Lepas cadangan",
  refund: "Pengembalian",
};
const issues: Record<string, string> = {
  INVOICE_CREATE_UNCONFIRMED: "Pembuatan invoice belum terkonfirmasi.",
  INVOICE_MISMATCH: "Identitas atau nominal invoice berbeda.",
  TRANSACTION_MISMATCH: "Detail transaksi berbeda.",
  TRANSACTION_ID_MISSING: "Invoice belum mengembalikan ID transaksi.",
  TRANSACTION_ALREADY_USED: "Transaksi sudah dipakai.",
  PAID_AFTER_CLOSE: "Pembayaran terkonfirmasi setelah penutupan kampanye.",
};
const messages: Record<string, string> = {
  BRAND_NO_FUNDED_SLOT: "Anggaran atau kuota untuk satu KOL belum tersedia.",
  DELIVERY_CHANGED: "Laporan sudah diperbarui. Muat ulang sebelum mereview.",
  REVIEW_NOTE_REQUIRED: "Isi catatan keputusan.",
  WALLET_BLOCKED: "Saldo penerima belum bisa dikredit.",
  CAMPAIGN_OBLIGATIONS_OPEN: "Selesaikan laporan dan tagihan sebelum mencatat refund.",
  REFUND_AMOUNT_INVALID: "Nominal melebihi saldo tersedia atau pokok tagihan.",
  INVOICE_RECOVERY_UNAVAILABLE: "Invoice belum bisa dipulihkan. Muat ulang dan cek usia percobaan.",
};
const errorMessage = (error: unknown) => {
  const text = error instanceof Error ? error.message : "Permintaan belum berhasil.";
  return messages[text] || text;
};

type Area = "analytics" | "brands" | "campaigns";
type Act = (path: string, body: unknown) => Promise<void>;
type Decide = (decision: BrandDecision) => void;

const areaItems: { key: Area; label: string }[] = [
  { key: "campaigns", label: "Kampanye" },
  { key: "brands", label: "Pendaftaran Brand" },
  { key: "analytics", label: "Analisis & pengaturan" },
];
const detailItems = ["Laporan", "Pendaftar", "Tagihan & refund", "Ledger & audit"].map((name) => ({
  key: name,
  label: name,
}));

function Status({ value }: { value: string }) {
  const color = ["active", "published", "approved", "paid"].includes(value)
    ? "#166534"
    : ["pending", "submitted", "needs_revision", "review", "creating"].includes(value)
      ? "#7a4b00"
      : ["rejected", "expired", "void"].includes(value)
        ? "#b42318"
        : "#666672";
  return <StatusTag color={color}>{label[value] ?? value}</StatusTag>;
}

function DeskTable({ title, headers, children }: { title: string; headers: string[]; children: ReactNode }) {
  return (
    <div className="ba-table-scroll" tabIndex={0} aria-label={title}>
      <table className="ba-table" aria-label={title}>
        <thead>
          <tr>
            {headers.map((name) => (
              <th scope="col" key={name}>
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <EmptyBlock title={children} />;
}

function Action({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Btn size="sm" variant={primary ? "primary" : "outline"} onClick={onClick} disabled={disabled}>
      {children}
    </Btn>
  );
}

export function KolBrandAdmin() {
  const { call, ready, canManage } = useRewardApi("kol-brand");
  const [area, setArea] = useState<Area>("campaigns");
  const [selected, setSelected] = useState("");
  if (!canManage) return <NoAccess />;
  return (
    <Page>
      <div className="brand-desk">
        <PageHeader title="Brand" description="Kelola pendaftaran, kampanye, dan pembayaran reward." />
        <nav aria-label="Menu Brand Admin">
          <Chips options={areaItems} value={area} onChange={setArea} />
        </nav>
        {area === "analytics" ? (
          <KolBrandOperations
            call={call}
            ready={ready}
            onOpenOperations={(id) => {
              setSelected(String(id));
              setArea("campaigns");
            }}
          />
        ) : (
          <BrandWorkflow area={area} selected={selected} onSelect={setSelected} />
        )}
      </div>
    </Page>
  );
}

function BrandWorkflow({
  area,
  selected,
  onSelect,
}: {
  area: Exclude<Area, "analytics">;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { call, ready } = useRewardApi("kol-brand");
  const [overview, setOverview] = useState<{ businesses: Business[]; campaigns: Campaign[] } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [decision, decide] = useState<BrandDecision | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const data = await call<{ businesses: Business[]; campaigns: Campaign[] }>("");
    setOverview(data);
  }, [call]);

  useEffect(() => {
    setSearch("");
    setFilter("all");
  }, [area]);

  useEffect(() => {
    if (!ready) return;
    void load().catch((reason) => setError(errorMessage(reason)));
  }, [load, ready]);

  useEffect(() => {
    if (!ready || !selected || area !== "campaigns") return;
    let active = true;
    void call<Detail>(`/campaigns/${selected}`)
      .then((data) => {
        if (active) setDetail(data);
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [area, call, ready, selected]);

  const current = String(detail?.campaign.id) === selected ? detail : null;
  const refresh = async () => {
    setError("");
    try {
      await load();
      if (selected && area === "campaigns") setDetail(await call<Detail>(`/campaigns/${selected}`));
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };
  const act: Act = async (path, body) => {
    try {
      await call(path, "POST", body);
    } catch (reason) {
      throw new Error(errorMessage(reason));
    }
    toast.success("Perubahan disimpan.");
    await refresh();
  };
  const select = (id: string) => {
    setError("");
    onSelect(id);
  };
  if (!ready || (!overview && !error)) return <Loading />;
  const query = search.trim().toLowerCase();
  const businesses =
    overview?.businesses.filter(
      (item) =>
        (filter === "all" || item.status === filter) &&
        `${item.name} ${item.contact_email} ${item.contact_phone}`.toLowerCase().includes(query),
    ) ?? [];
  const campaigns =
    overview?.campaigns.filter(
      (item) =>
        (filter === "all" || item.status === filter) &&
        `${item.title} ${item.brand}`.toLowerCase().includes(query),
    ) ?? [];

  return (
    <>
      {error && <ErrorBox message={error} onRetry={() => void refresh()} />}
      {area === "campaigns" && selected ? (
        <>
          <div className="ba-toolbar">
            <button type="button" className="ba-text-action" onClick={() => select("")}>
              <ArrowLeft size={16} /> Semua kampanye
            </button>
            <Action onClick={() => void refresh()}>
              <RefreshCw size={15} /> Muat ulang
            </Action>
          </div>
          {current ? (
            <CampaignDesk
              key={selected}
              detail={current}
              path={`/campaigns/${selected}`}
              act={act}
              decide={decide}
            />
          ) : (
            !error && <Loading />
          )}
        </>
      ) : (
        <Card>
          <div className="ba-section-head">
            <div>
              <h2>{area === "brands" ? "Pendaftaran Brand" : "Kampanye Brand"}</h2>
              <p>
                {area === "brands"
                  ? `${overview?.businesses.filter((item) => item.status === "pending").length ?? 0} menunggu verifikasi`
                  : "Buka kampanye untuk melihat laporan dan transaksi."}
              </p>
            </div>
            <Action onClick={() => void refresh()}>
              <RefreshCw size={15} /> Muat ulang
            </Action>
          </div>
          <div className="ba-filters">
            <label>
              Cari{" "}
              <input
                type="search"
                value={search}
                placeholder={area === "brands" ? "Nama Brand atau kontak" : "Kampanye atau Brand"}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              Status{" "}
              <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                {(area === "brands"
                  ? ["all", "pending", "active", "rejected"]
                  : ["all", "draft", "published", "closed"]
                ).map((value) => (
                  <option key={value} value={value}>
                    {value === "all" ? "Semua status" : label[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {area === "brands" ? (
            businesses.length ? (
              <DeskTable title="Pendaftaran Brand" headers={["Brand", "Kontak", "Status", "Tindakan"]}>
                {businesses.map((brand) => (
                  <tr key={brand.id}>
                    <th scope="row">
                      {brand.name}
                      {brand.review_note && <small>{brand.review_note}</small>}
                    </th>
                    <td>
                      {brand.contact_email}
                      <small>{brand.contact_phone}</small>
                    </td>
                    <td>
                      <Status value={brand.status} />
                    </td>
                    <td>
                      {brand.status === "pending" ? (
                        <div className="ba-row-actions">
                          <Action
                            primary
                            onClick={() =>
                              decide({
                                title: "Aktifkan Brand",
                                detail: `${brand.name} akan bisa mengelola kampanye dan anggaran.`,
                                confirm: "Aktifkan Brand",
                                submit: () => act(`/businesses/${brand.id}/review`, { approve: true }),
                              })
                            }
                          >
                            Aktifkan
                          </Action>
                          <Action
                            onClick={() =>
                              decide({
                                title: "Tolak pendaftaran",
                                detail: brand.name,
                                confirm: "Tolak pengajuan",
                                danger: true,
                                note: "Alasan penolakan",
                                submit: ({ note }) =>
                                  act(`/businesses/${brand.id}/review`, { approve: false, note }),
                              })
                            }
                          >
                            Tolak
                          </Action>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </DeskTable>
            ) : (
              <Empty>Belum ada pendaftaran untuk filter ini.</Empty>
            )
          ) : campaigns.length ? (
            <DeskTable
              title="Kampanye Brand"
              headers={["Kampanye", "Brand", "Status", "Perlu review", "Dana tersedia", "Reward dibayar"]}
            >
              {campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <th scope="row">
                    <button
                      className="ba-text-action"
                      type="button"
                      onClick={() => select(String(campaign.id))}
                    >
                      {campaign.title}
                      <ArrowRight size={14} />
                    </button>
                  </th>
                  <td>{campaign.brand}</td>
                  <td>
                    <Status value={campaign.status} />
                  </td>
                  <td>{campaign.in_review}</td>
                  <td>{rupiah(campaign.available)}</td>
                  <td>{rupiah(campaign.paid)}</td>
                </tr>
              ))}
            </DeskTable>
          ) : (
            <Empty>Belum ada kampanye untuk filter ini.</Empty>
          )}
        </Card>
      )}
      {decision && <KolBrandDecision decision={decision} onClose={() => decide(null)} />}
    </>
  );
}

function CampaignDesk({
  detail,
  path,
  act,
  decide,
}: {
  detail: Detail;
  path: string;
  act: Act;
  decide: Decide;
}) {
  const [tab, setTab] = useState("Laporan");
  const [reportStatus, setReportStatus] = useState("all");
  const { campaign, integrity } = detail;
  const review = (report: Delivery, action: "approve" | "revision" | "reject" | "expire") => {
    const title = {
      approve: "Setujui & bayar",
      revision: "Minta revisi",
      reject: "Tolak laporan",
      expire: "Akhiri tugas",
    }[action];
    decide({
      title,
      confirm: title,
      detail:
        action === "approve"
          ? `${rupiah(report.amount)} akan dikreditkan ke saldo Djiwa Pay ${report.name}.`
          : `${report.label} · ${report.name}`,
      note: action !== "approve" || report.with_admin ? "Catatan keputusan" : undefined,
      danger: action === "reject" || action === "expire",
      submit: ({ note }) =>
        act(`${path}/reports/${report.id}`, { action, revision: report.proof_revision, note }),
    });
  };
  const reports = detail.deliveries.filter(
    (item) =>
      reportStatus === "all" ||
      (reportStatus === "escalated" ? item.with_admin : item.status === reportStatus),
  );
  return (
    <>
      <Card className="ba-campaign-head">
        <div className="ba-section-head">
          <div>
            <p>{campaign.brand}</p>
            <h2>{campaign.title}</h2>
          </div>
          <Status value={campaign.status} />
        </div>
        <dl className="ba-metrics">
          {(
            [
              ["Dana masuk", campaign.funded],
              ["Tersedia", campaign.available],
              ["Dicadangkan", campaign.reserved],
              ["Dibayar", campaign.paid],
              ["Refund", campaign.refunded],
            ] as const
          ).map(([name, value]) => (
            <div key={name}>
              <dt>
                <Label>{name}</Label>
              </dt>
              <dd>{rupiah(value)}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <nav aria-label="Detail kampanye">
        <Chips options={detailItems} value={tab} onChange={setTab} />
      </nav>
      <Card>
        {tab === "Laporan" && (
          <>
            <div className="ba-section-head">
              <div>
                <h2>Laporan KOL</h2>
                <p>{detail.deliveries.length} tugas tercatat</p>
              </div>
              <label className="ba-field">
                Status{" "}
                <select value={reportStatus} onChange={(event) => setReportStatus(event.target.value)}>
                  <option value="all">Semua</option>
                  <option value="submitted">Dalam review</option>
                  <option value="escalated">Eskalasi</option>
                  <option value="needs_revision">Perlu revisi</option>
                  <option value="paid">Dibayar</option>
                </select>
              </label>
            </div>
            {reports.length ? (
              <DeskTable
                title="Laporan KOL"
                headers={["Tugas dan KOL", "Status", "Reward", "Bukti", "Tindakan"]}
              >
                {reports.map((report) => (
                  <tr key={report.id}>
                    <th scope="row">
                      {report.label}
                      <small>
                        {report.name} · {report.platform}
                      </small>
                    </th>
                    <td>
                      <Status value={report.status} />
                      {report.with_admin && <small>Eskalasi KOL · {report.dispute_note}</small>}
                      {report.dispute_resolution && <small>{report.dispute_resolution}</small>}
                      {report.note && <small>{report.note}</small>}
                    </td>
                    <td>
                      {rupiah(report.amount)}
                      {report.wallet_ledger_key && <small>{report.wallet_ledger_key}</small>}
                    </td>
                    <td>
                      {report.content_url && (
                        <a href={report.content_url} target="_blank" rel="noreferrer">
                          Postingan ↗
                        </a>
                      )}
                      {report.insight_screenshot_url && (
                        <small>
                          <a href={report.insight_screenshot_url} target="_blank" rel="noreferrer">
                            Screenshot ↗
                          </a>
                        </small>
                      )}
                      {!report.content_url && !report.insight_screenshot_url && "—"}
                    </td>
                    <td>
                      <div className="ba-row-actions">
                        {(report.status === "submitted" ||
                          (report.status === "needs_revision" && report.with_admin)) && (
                          <>
                            <Action primary onClick={() => review(report, "approve")}>
                              Setujui & bayar
                            </Action>
                            {report.status === "submitted" && !campaign.deadline_passed && (
                              <Action onClick={() => review(report, "revision")}>Minta revisi</Action>
                            )}
                            <Action onClick={() => review(report, "reject")}>Tolak</Action>
                          </>
                        )}
                        {campaign.deadline_passed &&
                          ["awaiting", "needs_revision"].includes(report.status) && (
                            <Action onClick={() => review(report, "expire")}>Akhiri tugas</Action>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </DeskTable>
            ) : (
              <Empty>Belum ada laporan untuk status ini.</Empty>
            )}
          </>
        )}
        {tab === "Pendaftar" && (
          <>
            <div className="ba-section-head">
              <h2>Pendaftar</h2>
            </div>
            {detail.applications.length ? (
              <DeskTable title="Pendaftar kampanye" headers={["KOL", "Status", "Catatan", "Tindakan"]}>
                {detail.applications.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">{item.name}</th>
                    <td>
                      <Status value={item.status} />
                    </td>
                    <td>{item.review_note || "—"}</td>
                    <td>
                      {item.status === "pending" && (
                        <div className="ba-row-actions">
                          {campaign.status === "published" && !campaign.deadline_passed && (
                            <Action
                              primary
                              onClick={() =>
                                decide({
                                  title: "Terima pendaftar",
                                  detail: `Anggaran reward akan dicadangkan untuk ${item.name}.`,
                                  confirm: "Terima",
                                  submit: () => act(`${path}/applications/${item.id}`, { approve: true }),
                                })
                              }
                            >
                              Terima
                            </Action>
                          )}
                          <Action
                            onClick={() =>
                              decide({
                                title: "Tolak pendaftar",
                                detail: item.name,
                                confirm: "Tolak",
                                danger: true,
                                note: "Alasan penolakan",
                                submit: ({ note }) =>
                                  act(`${path}/applications/${item.id}`, { approve: false, note }),
                              })
                            }
                          >
                            Tolak
                          </Action>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </DeskTable>
            ) : (
              <Empty>Belum ada pendaftar.</Empty>
            )}
          </>
        )}
        {tab === "Tagihan & refund" && (
          <BrandInvoices detail={detail} path={path} act={act} decide={decide} />
        )}
        {tab === "Ledger & audit" && (
          <>
            <div className="ba-section-head">
              <div>
                <h2>Ledger & audit</h2>
                <p>
                  Payout {rupiah(integrity.payoutTotal)} · kredit Djiwa Pay {rupiah(integrity.walletCredited)}
                </p>
              </div>
              <StatusTag color={integrity.budgetBalanced && integrity.walletMatches ? "#166534" : "#b42318"}>
                {integrity.budgetBalanced && integrity.walletMatches ? "Saldo cocok" : "Perlu rekonsiliasi"}
              </StatusTag>
            </div>
            {detail.ledger.length ? (
              <DeskTable
                title="Mutasi anggaran"
                headers={["Waktu", "Aktivitas", "Tersedia", "Cadangan", "Dibayar", "Refund"]}
              >
                {detail.ledger.map((item) => (
                  <tr key={item.id}>
                    <td>{dateTime(item.created_at)}</td>
                    <th scope="row">
                      {label[item.kind] ?? item.kind}
                      {item.note && <small>{item.note}</small>}
                    </th>
                    <td>{rupiah(item.available_delta)}</td>
                    <td>{rupiah(item.reserved_delta)}</td>
                    <td>{rupiah(item.paid_delta)}</td>
                    <td>{rupiah(item.refunded_delta)}</td>
                  </tr>
                ))}
              </DeskTable>
            ) : (
              <Empty>Belum ada mutasi anggaran.</Empty>
            )}
            <h3 className="ba-subheading">Aktivitas tim</h3>
            {detail.events.length ? (
              <DeskTable title="Audit kampanye" headers={["Waktu", "Aktivitas", "Aktor", "Catatan"]}>
                {detail.events.map((item) => (
                  <tr key={item.id}>
                    <td>{dateTime(item.created_at)}</td>
                    <th scope="row">
                      {item.action.replaceAll("_", " ")}
                      <small>{item.entity_id}</small>
                    </th>
                    <td>{item.actor}</td>
                    <td>
                      {typeof item.detail.note === "string" ? item.detail.note : "—"}
                      {typeof item.detail.reference === "string" && <small>{item.detail.reference}</small>}
                    </td>
                  </tr>
                ))}
              </DeskTable>
            ) : (
              <Empty>Belum ada aktivitas tim.</Empty>
            )}
          </>
        )}
      </Card>
    </>
  );
}

function BrandInvoices({
  detail,
  path,
  act,
  decide,
}: {
  detail: Detail;
  path: string;
  act: Act;
  decide: Decide;
}) {
  const outstanding = detail.deposits.some((item) => ["creating", "pending", "review"].includes(item.state));
  const paid = detail.deposits.filter(
    (item) => item.state === "paid" && Number(item.refunded) < Number(item.nominal),
  );
  const canRefund =
    detail.campaign.status === "closed" &&
    !outstanding &&
    Number(detail.campaign.reserved) === 0 &&
    Number(detail.campaign.available) > 0 &&
    paid.length > 0;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: string, payload: unknown) => {
    setBusy(true);
    setError("");
    try {
      await act(action, payload);
      return true;
    } catch (reason) {
      setError(errorMessage(reason));
      return false;
    } finally {
      setBusy(false);
    }
  };
  async function refund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    if (
      await run(`${path}/refunds`, {
        ...Object.fromEntries(values),
        confirmed: values.get("confirmed") === "on",
      })
    )
      form.reset();
  }
  return (
    <>
      <div className="ba-section-head">
        <div>
          <h2>Tagihan & refund</h2>
          <p>Periksa pembayaran Mayar dan pengembalian yang diproses Finance.</p>
        </div>
      </div>
      {error && (
        <p className="ba-error" role="alert">
          {error}
        </p>
      )}
      {detail.deposits.length ? (
        <DeskTable title="Tagihan kampanye" headers={["Tagihan", "Status", "Nominal", "Refund", "Tindakan"]}>
          {detail.deposits.map((item) => (
            <tr key={item.id}>
              <th scope="row">
                {dateTime(item.created_at)}
                <small>{item.invoice_id || item.id}</small>
                {item.provider_transaction_id && <small>Transaksi {item.provider_transaction_id}</small>}
              </th>
              <td>
                <Status value={item.state} />
                {item.issue && <small>{issues[item.issue] ?? item.issue}</small>}
              </td>
              <td>
                {rupiah(item.total)}
                <small>Top-up {rupiah(item.nominal)}</small>
              </td>
              <td>{rupiah(item.refunded)}</td>
              <td>
                <div className="ba-row-actions">
                  {item.invoice_id && ["pending", "expired", "review"].includes(item.state) && (
                    <Action disabled={busy} onClick={() => void run(`${path}/topups/${item.id}/check`, {})}>
                      Cek pembayaran
                    </Action>
                  )}
                  {!item.invoice_id && ["creating", "review"].includes(item.state) && (
                    <>
                      <Action
                        onClick={() =>
                          decide({
                            title: "Hubungkan invoice Mayar",
                            detail: `Tagihan ${rupiah(item.total)}`,
                            confirm: "Hubungkan invoice",
                            reference: "ID invoice",
                            note: "Catatan pengecekan",
                            submit: ({ reference, note }) =>
                              act(`${path}/topups/${item.id}/recover`, { invoiceId: reference, note }),
                          })
                        }
                      >
                        Hubungkan invoice
                      </Action>
                      <Action
                        onClick={() =>
                          decide({
                            title: "Tutup percobaan tagihan",
                            detail: "Pastikan tidak ada invoice yang bisa dibayar di Mayar.",
                            confirm: "Tutup percobaan",
                            danger: true,
                            note: "Catatan pengecekan",
                            submit: ({ note }) =>
                              act(`${path}/topups/${item.id}/recover`, { noInvoice: true, note }),
                          })
                        }
                      >
                        Tutup percobaan
                      </Action>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </DeskTable>
      ) : (
        <Empty>Belum ada tagihan.</Empty>
      )}
      {canRefund && (
        <details className="ba-refund">
          <summary>Catat pengembalian dana</summary>
          <form className="ba-refund-form" onSubmit={(event) => void refund(event)}>
            <label className="ba-field">
              Tagihan asal
              <select name="deposit" required>
                <option value="">Pilih tagihan</option>
                {paid.map((item) => (
                  <option key={item.id} value={item.id}>
                    {rupiah(item.nominal)} · {item.invoice_id}
                  </option>
                ))}
              </select>
            </label>
            <label className="ba-field">
              Nominal (Rp)
              <input name="amount" type="number" min={1} max={Number(detail.campaign.available)} required />
            </label>
            <label className="ba-field">
              Referensi pengembalian
              <input name="reference" maxLength={150} required />
            </label>
            <label className="ba-check">
              <input name="confirmed" type="checkbox" required /> Dana sudah dikembalikan ke sumber
              pembayaran.
            </label>
            <Btn type="submit" variant="primary" size="sm" className="justify-self-start" disabled={busy}>
              Catat refund
            </Btn>
          </form>
        </details>
      )}
    </>
  );
}
