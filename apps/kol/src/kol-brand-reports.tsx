import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BRAND_STATUS, brandError, brandFormFields, type FixedReward } from "./kol-brand";
import { kolApi } from "./kol-lib";
import { rupiah } from "./kol-rewards";

type Delivery = {
  id: number;
  label: string;
  platform: string;
  amount: number | string;
  status: string;
  note: string | null;
  dispute_note: string | null;
  dispute_resolution: string | null;
  requires_screenshot: boolean;
  can_submit: boolean;
  content_url: string | null;
  insight_screenshot_url: string | null;
  wallet_ledger_key: string | null;
};

export function FixedRewardBox({ reward }: { reward: FixedReward }) {
  return (
    <section className="kx-reward" aria-label="Reward kampanye">
      <p className="kx-sub">
        {reward.brand} · {reward.slotsLeft} dari {reward.quota} slot tersedia
      </p>
      <div className="kx-reward-rate">
        {rupiah(reward.total)}
        <span className="kx-sub"> total reward</span>
      </div>
      <ul className="kx-brand-list">
        {reward.tasks.map((task) => (
          <li key={task.platform + task.label}>
            <span>
              {task.label}
              <small>
                {task.platform}
                {task.requiresScreenshot ? " · Wajib screenshot" : ""}
              </small>
            </span>
            <b>{rupiah(task.amount)}</b>
          </li>
        ))}
      </ul>
      <p className="kx-sub">Reward per tugas masuk ke Djiwa Pay setelah laporan disetujui.</p>
    </section>
  );
}

export function BrandReports({
  assignment,
  onChanged,
}: {
  assignment: number;
  onChanged: () => Promise<void>;
}) {
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const load = useCallback(async () => {
    try {
      setDeliveries(await kolApi<Delivery[]>(`/portal/brand-deliveries/${assignment}`));
      setError("");
    } catch (reason) {
      setError(brandError(reason));
    }
  }, [assignment]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <h3 className="kx-section">Laporan kampanye</h3>
      {!deliveries && !error && (
        <p className="kx-sub" role="status">
          Memuat tugas…
        </p>
      )}
      {error && (
        <p className="kx-note kx-note--err" role="alert">
          {error}{" "}
          <button type="button" className="kx-link" onClick={() => void load()}>
            Coba lagi
          </button>
        </p>
      )}
      {deliveries?.map((delivery) => (
        <article className="kx-card kx-brand-space" key={delivery.id}>
          <div className="kx-brand-toolbar">
            <b>{delivery.label}</b>
            <span className={`kx-pill ${delivery.status === "paid" ? "kx-pill--ok" : "kx-pill--warn"}`}>
              {BRAND_STATUS[delivery.status]}
            </span>
          </div>
          <p className="kx-sub">
            {delivery.platform} · Reward {rupiah(Number(delivery.amount))}
          </p>
          {delivery.content_url && (
            <a className="kx-link kx-brand-url" href={delivery.content_url} target="_blank" rel="noreferrer">
              {delivery.content_url}
            </a>
          )}
          {delivery.note && <p className="kx-note">{delivery.note}</p>}
          {delivery.dispute_note && (
            <p className="kx-sub">
              {delivery.dispute_resolution
                ? `Keputusan Admin: ${delivery.dispute_resolution}`
                : "Laporan sedang diperiksa Admin."}
            </p>
          )}
          {!delivery.dispute_note && ["submitted", "needs_revision"].includes(delivery.status) && (
            <button
              type="button"
              className="kx-link"
              onClick={async () => {
                const note = window.prompt("Apa yang perlu diperiksa Admin?");
                if (!note?.trim()) return;
                try {
                  await kolApi(`/portal/brand-deliveries/${delivery.id}/dispute`, {
                    method: "POST",
                    body: JSON.stringify({ note }),
                  });
                  await load();
                } catch (reason) {
                  setError(brandError(reason));
                }
              }}
            >
              Minta bantuan Admin
            </button>
          )}
          {delivery.wallet_ledger_key && (
            <p className="kx-sub">Masuk ke Djiwa Pay · {delivery.wallet_ledger_key}</p>
          )}
          {["awaiting", "needs_revision"].includes(delivery.status) &&
            (delivery.can_submit ? (
              open === delivery.id ? (
                <ReportForm
                  key={delivery.id}
                  delivery={delivery}
                  onSaved={async () => {
                    setOpen(null);
                    await load();
                    await onChanged();
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="kx-btn kx-btn--ghost kx-brand-space"
                  onClick={() => setOpen(delivery.id)}
                >
                  {delivery.status === "needs_revision" ? "Kirim revisi" : "Kirim link"}
                </button>
              )
            ) : (
              <p className="kx-sub">Tenggat pengiriman sudah lewat.</p>
            ))}
        </article>
      ))}
    </section>
  );
}

function ReportForm({ delivery, onSaved }: { delivery: Delivery; onSaved: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    const fields = brandFormFields(event.currentTarget);
    try {
      await kolApi(`/portal/brand-deliveries/${delivery.id}`, {
        method: "POST",
        body: JSON.stringify(fields),
      });
      await onSaved();
    } catch (reason) {
      setError(brandError(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <label className="kx-label">
        Link postingan
        <input
          className="kx-input"
          type="url"
          name="contentUrl"
          required
          maxLength={2048}
          defaultValue={delivery.content_url ?? ""}
        />
      </label>
      <label className="kx-label">
        Link screenshot {delivery.requires_screenshot ? "(wajib)" : "(opsional)"}
        <input
          className="kx-input"
          type="url"
          name="screenshotUrl"
          required={delivery.requires_screenshot}
          maxLength={2048}
          defaultValue={delivery.insight_screenshot_url ?? ""}
        />
      </label>
      {error && (
        <p className="kx-note kx-note--err" role="alert">
          {error}
        </p>
      )}
      <button className="kx-btn kx-brand-space" disabled={busy}>
        {busy ? "Mengirim…" : "Kirim untuk review"}
      </button>
    </form>
  );
}
