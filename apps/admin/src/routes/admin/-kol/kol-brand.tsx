import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Btn, Card, ErrorBox, Field, KV, Loading, inputCls } from "./kol-ui";
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

export function KolBrandAdmin() {
  const { call, ready } = useRewardApi("kol-brand");
  const [overview, setOverview] = useState<{ businesses: Business[]; campaigns: Campaign[] } | null>(null);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("Laporan");
  const load = useCallback(async () => {
    if (!ready) return;
    try {
      setOverview(await call(""));
      setError("");
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, [call, ready]);
  const loadDetail = useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        setDetail(await call(`/campaigns/${id}`));
      } catch (reason) {
        setError(errorMessage(reason));
      }
    },
    [call],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (selected) void loadDetail(selected);
  }, [loadDetail, selected]);

  const act = async (path: string, body: unknown) => {
    setBusy(true);
    setError("");
    try {
      await call(path, "POST", body);
      toast.success("Perubahan dicatat.");
      await Promise.all([load(), loadDetail(selected)]);
      return true;
    } catch (reason) {
      setError(errorMessage(reason));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const current = detail?.campaign.id === selected ? detail : null;
  const campaignPath = `/campaigns/${selected}`;
  const reviewReport = (report: Delivery, action: string) => {
    const approving = action === "approve";
    if (approving && !window.confirm(`Setujui laporan dan bayar ${rupiah(report.amount)}?`)) return;
    const note = !approving || report.with_admin ? window.prompt("Catatan keputusan Admin") : "";
    if (note === null || ((!approving || report.with_admin) && !note.trim())) return;
    void act(`${campaignPath}/reports/${report.id}`, { action, revision: report.proof_revision, note });
  };
  return (
    <>
      <div className="flex justify-end">
        <Btn onClick={() => void Promise.all([load(), loadDetail(selected)])}>Muat ulang data Brand</Btn>
      </div>
      {error && <ErrorBox message={error} onRetry={() => void Promise.all([load(), loadDetail(selected)])} />}
      {!overview && !error && <Loading />}
      {overview && (
        <>
          <section>
            <h2 className="mb-2 font-semibold">Pendaftaran Brand</h2>
            {overview.businesses.length === 0 && <p>Belum ada pengajuan.</p>}
            <div className="space-y-2">
              {overview.businesses.map((brand) => (
                <Card key={brand.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <strong>{brand.name}</strong>
                      <p className="text-xs text-neutral-600">
                        {brand.contact_email} · {brand.contact_phone} · {label[brand.status]}
                      </p>
                      {brand.review_note && <p className="text-xs">{brand.review_note}</p>}
                    </div>
                    {brand.status === "pending" && (
                      <div className="flex flex-wrap gap-2">
                        <Btn
                          disabled={busy}
                          onClick={() => void act(`/businesses/${brand.id}/review`, { approve: true })}
                        >
                          Aktifkan
                        </Btn>
                        <Btn
                          disabled={busy}
                          onClick={() => {
                            const note = window.prompt("Alasan penolakan Brand");
                            if (note?.trim())
                              void act(`/businesses/${brand.id}/review`, { approve: false, note });
                          }}
                        >
                          Tolak
                        </Btn>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-2 font-semibold">Kampanye Brand</h2>
            <Field label="Pilih kampanye">
              <select
                className={inputCls}
                value={selected}
                onChange={(event) => {
                  setDetail(null);
                  setError("");
                  setSelected(event.target.value);
                }}
              >
                <option value="">Pilih kampanye</option>
                {overview.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.title} · {campaign.brand} · {label[campaign.status]}
                  </option>
                ))}
              </select>
            </Field>
            {selected && !current && !error && <Loading />}
            {current && (
              <>
                <div className="my-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {(
                    [
                      ["Dana masuk", current.campaign.funded],
                      ["Tersedia", current.campaign.available],
                      ["Dicadangkan", current.campaign.reserved],
                      ["Dibayar", current.campaign.paid],
                      ["Dikembalikan", current.campaign.refunded],
                    ] as const
                  ).map(([name, value]) => (
                    <Card key={name}>
                      <KV label={name}>{rupiah(value)}</KV>
                    </Card>
                  ))}
                </div>
                <p
                  className={
                    current.integrity.budgetBalanced && current.integrity.walletMatches
                      ? "text-emerald-700"
                      : "text-red-700"
                  }
                  role="status"
                >
                  {current.integrity.budgetBalanced
                    ? "Ledger anggaran seimbang."
                    : "Ledger anggaran berselisih."}{" "}
                  Payout {rupiah(current.integrity.payoutTotal)} · kredit Djiwa Pay{" "}
                  {rupiah(current.integrity.walletCredited)}
                </p>
                <nav className="my-3 flex flex-wrap gap-2" aria-label="Data kampanye Brand">
                  {["Laporan", "Pendaftar", "Tagihan & refund", "Ledger & audit"].map((item) => (
                    <Btn key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>
                      {item}
                    </Btn>
                  ))}
                </nav>
                {tab === "Laporan" &&
                  (current.deliveries.length ? (
                    current.deliveries.map((report) => (
                      <Card key={report.id}>
                        <div className="flex flex-wrap justify-between gap-2">
                          <b>
                            {report.label} · {report.name}
                          </b>
                          <span>
                            {label[report.status]} · {rupiah(report.amount)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-sm">
                          <span>{report.platform}</span>
                          {report.content_url && (
                            <a
                              className="break-all text-blue-700 underline"
                              href={report.content_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Buka postingan
                            </a>
                          )}
                          {report.insight_screenshot_url && (
                            <a
                              className="text-blue-700 underline"
                              href={report.insight_screenshot_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Buka screenshot
                            </a>
                          )}
                          {report.wallet_ledger_key && <span>{report.wallet_ledger_key}</span>}
                        </div>
                        {report.note && <p className="text-sm">{report.note}</p>}
                        {report.with_admin && (
                          <p className="text-sm text-amber-800">Eskalasi KOL · {report.dispute_note}</p>
                        )}
                        {report.dispute_resolution && (
                          <p className="text-sm">Keputusan Admin · {report.dispute_resolution}</p>
                        )}
                        {(report.status === "submitted" ||
                          (report.status === "needs_revision" && report.with_admin)) && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Btn disabled={busy} onClick={() => reviewReport(report, "approve")}>
                              Setujui & bayar
                            </Btn>
                            {report.status === "submitted" && !current.campaign.deadline_passed && (
                              <Btn disabled={busy} onClick={() => reviewReport(report, "revision")}>
                                Minta revisi
                              </Btn>
                            )}
                            <Btn disabled={busy} onClick={() => reviewReport(report, "reject")}>
                              Tolak
                            </Btn>
                          </div>
                        )}
                        {current.campaign.deadline_passed &&
                          ["awaiting", "needs_revision"].includes(report.status) && (
                            <Btn disabled={busy} onClick={() => reviewReport(report, "expire")}>
                              Akhiri tugas & lepas cadangan
                            </Btn>
                          )}
                      </Card>
                    ))
                  ) : (
                    <p>Belum ada laporan.</p>
                  ))}
                {tab === "Pendaftar" &&
                  (current.applications.length ? (
                    current.applications.map((application) => (
                      <Card key={application.id}>
                        <b>{application.name}</b> · {label[application.status]}
                        {application.review_note && <p>{application.review_note}</p>}
                        {application.status === "pending" && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {current.campaign.status === "published" && !current.campaign.deadline_passed && (
                              <Btn
                                disabled={busy}
                                onClick={() =>
                                  void act(`${campaignPath}/applications/${application.id}`, {
                                    approve: true,
                                  })
                                }
                              >
                                Terima
                              </Btn>
                            )}
                            <Btn
                              disabled={busy}
                              onClick={() => {
                                const note = window.prompt("Alasan penolakan pendaftar");
                                if (note?.trim())
                                  void act(`${campaignPath}/applications/${application.id}`, {
                                    approve: false,
                                    note,
                                  });
                              }}
                            >
                              Tolak
                            </Btn>
                          </div>
                        )}
                      </Card>
                    ))
                  ) : (
                    <p>Belum ada pendaftar.</p>
                  ))}
                {tab === "Tagihan & refund" && (
                  <BrandInvoices
                    key={selected}
                    campaignPath={campaignPath}
                    detail={current}
                    act={act}
                    busy={busy}
                  />
                )}
                {tab === "Ledger & audit" && (
                  <>
                    <h3 className="my-2 font-semibold">Mutasi anggaran</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[620px] text-left text-sm">
                        <thead>
                          <tr>
                            <th>Waktu</th>
                            <th>Aktivitas</th>
                            <th>Tersedia</th>
                            <th>Cadangan</th>
                            <th>Dibayar</th>
                            <th>Refund</th>
                          </tr>
                        </thead>
                        <tbody>
                          {current.ledger.map((entry) => (
                            <tr key={entry.id} className="border-b">
                              <td>{dateTime(entry.created_at)}</td>
                              <td>{label[entry.kind] ?? entry.kind}</td>
                              <td>{rupiah(entry.available_delta)}</td>
                              <td>{rupiah(entry.reserved_delta)}</td>
                              <td>{rupiah(entry.paid_delta)}</td>
                              <td>{rupiah(entry.refunded_delta)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <h3 className="my-2 font-semibold">Audit</h3>
                    {current.events.map((event) => (
                      <Card key={event.id}>
                        <b>{event.action}</b> · {event.entity_id}{" "}
                        <span className="text-neutral-600">
                          {event.actor} · {dateTime(event.created_at)}
                        </span>
                        {typeof event.detail.note === "string" && <p>{event.detail.note}</p>}
                        {typeof event.detail.reference === "string" && (
                          <p>Referensi {event.detail.reference}</p>
                        )}
                      </Card>
                    ))}
                  </>
                )}
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}

function BrandInvoices({
  detail,
  act,
  campaignPath,
  busy,
}: {
  detail: Detail;
  act: (path: string, input: unknown) => Promise<boolean>;
  campaignPath: string;
  busy: boolean;
}) {
  const outstanding = detail.deposits.some((deposit) =>
    ["creating", "pending", "review"].includes(deposit.state),
  );
  const paid = detail.deposits.filter(
    (deposit) => deposit.state === "paid" && Number(deposit.refunded) < Number(deposit.nominal),
  );
  const canRefund =
    detail.campaign.status === "closed" &&
    !outstanding &&
    Number(detail.campaign.reserved) === 0 &&
    Number(detail.campaign.available) > 0 &&
    paid.length > 0;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (
      await act(`${campaignPath}/refunds`, {
        ...Object.fromEntries(fields),
        confirmed: fields.get("confirmed") === "on",
      })
    )
      form.reset();
  };
  return (
    <>
      {detail.deposits.length === 0 && <p>Belum ada tagihan.</p>}
      {detail.deposits.map((deposit) => (
        <Card key={deposit.id}>
          <div className="flex flex-wrap justify-between gap-2">
            <b>
              {rupiah(deposit.nominal)} · tagihan {rupiah(deposit.total)}
            </b>
            <span>{label[deposit.state]}</span>
          </div>
          <p className="break-all text-xs text-neutral-600">
            {dateTime(deposit.created_at)} · {deposit.id}
            {deposit.invoice_id ? ` · Invoice ${deposit.invoice_id}` : ""}
            {deposit.provider_transaction_id ? ` · Transaksi ${deposit.provider_transaction_id}` : ""}
          </p>
          {Number(deposit.refunded) > 0 && <p className="text-xs">Dikembalikan {rupiah(deposit.refunded)}</p>}
          {deposit.issue && (
            <p className="text-sm text-amber-800">{issues[deposit.issue] ?? deposit.issue}</p>
          )}
          {deposit.invoice_id && ["pending", "expired", "review"].includes(deposit.state) && (
            <Btn disabled={busy} onClick={() => void act(`${campaignPath}/topups/${deposit.id}/check`, {})}>
              Cek pembayaran
            </Btn>
          )}
          {!deposit.invoice_id && ["creating", "review"].includes(deposit.state) && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Btn
                disabled={busy}
                onClick={() => {
                  const invoiceId = window.prompt("ID invoice yang ditemukan di Mayar");
                  if (!invoiceId?.trim()) return;
                  const note = window.prompt("Catatan pengecekan");
                  if (note?.trim())
                    void act(`${campaignPath}/topups/${deposit.id}/recover`, { invoiceId, note });
                }}
              >
                Hubungkan invoice
              </Btn>
              <Btn
                disabled={busy}
                onClick={() => {
                  const note = window.prompt(
                    "Catatan yang mengonfirmasi tidak ada invoice yang dapat dibayar di Mayar",
                  );
                  if (note?.trim())
                    void act(`${campaignPath}/topups/${deposit.id}/recover`, { noInvoice: true, note });
                }}
              >
                Tutup percobaan
              </Btn>
            </div>
          )}
        </Card>
      ))}
      {canRefund && (
        <form className="my-3 grid gap-3 rounded-md border p-3" onSubmit={submit}>
          <h3 className="font-semibold">Catat pengembalian yang sudah diproses Finance</h3>
          <Field label="Tagihan asal">
            <select className={inputCls} name="deposit" required>
              <option value="">Pilih tagihan</option>
              {paid.map((deposit) => (
                <option value={deposit.id} key={deposit.id}>
                  {rupiah(deposit.nominal)} · {deposit.invoice_id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nominal pengembalian (Rp)">
            <input
              className={inputCls}
              name="amount"
              type="number"
              min={1}
              max={Number(detail.campaign.available)}
              required
            />
          </Field>
          <Field label="Referensi pengembalian">
            <input className={inputCls} name="reference" required maxLength={150} />
          </Field>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="confirmed" required /> Dana sudah dikembalikan ke sumber pembayaran.
          </label>
          <Btn type="submit" disabled={busy}>
            Catat pengembalian
          </Btn>
        </form>
      )}
    </>
  );
}
