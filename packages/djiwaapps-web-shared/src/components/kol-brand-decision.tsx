import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import "./kol-brand-decision.css";

export type BrandDecision = {
  title: string;
  detail: string;
  confirm: string;
  danger?: boolean;
  note?: string;
  reference?: string;
  submit: (fields: { note: string; reference: string }) => Promise<void>;
};

export function KolBrandDecision({ decision, onClose }: { decision: BrandDecision; onClose: () => void }) {
  const handle = useRef<HTMLDialogElement>(null);
  const title = useId();
  const description = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = handle.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const note = String(data.get("note") ?? "").trim();
    const reference = String(data.get("reference") ?? "").trim();
    if ((decision.note && !note) || (decision.reference && !reference)) {
      setError("Lengkapi kolom yang diperlukan.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await decision.submit({ note, reference });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Tindakan gagal. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      className="bd-dialog"
      ref={handle}
      aria-labelledby={title}
      aria-describedby={description}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={(event) => void submit(event)}>
        <h2 id={title}>{decision.title}</h2>
        <p id={description}>{decision.detail}</p>
        {decision.reference && (
          <label>
            {decision.reference}
            <input name="reference" maxLength={160} required disabled={busy} />
          </label>
        )}
        {decision.note && (
          <label>
            {decision.note}
            <textarea name="note" maxLength={1000} rows={3} required disabled={busy} />
          </label>
        )}
        {error && (
          <p role="alert" className="bd-error">
            {error}
          </p>
        )}
        <div className="bd-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button type="submit" data-danger={decision.danger || undefined} disabled={busy}>
            {busy ? "Memproses…" : decision.confirm}
          </button>
        </div>
      </form>
    </dialog>
  );
}
