import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("../../packages/backend/supabase/migrations/20261118120000_kol_visit_sow_and_mail.sql");

describe("KOL visit SOW + confirmation email contracts", () => {
  it("handles confirmation in the database so every path (admin, manager, legacy) is covered", () => {
    expect(migration).toContain("create trigger trg_kol_visit_after_status after update of status on pos.kol_visit_bookings");
    expect(migration).toContain("create trigger trg_kol_visit_before_status before update of status on pos.kol_visit_bookings");
    expect(migration).toContain("perform pos.kol_enqueue_email('visit_confirmed', new, 'visit_confirmed:' || new.id)");
    expect(migration).toContain("on conflict (dedupe_key) do nothing");
    expect(migration).toContain("'visit_confirmed:' || new.id");
  });

  it("snapshots the active SOW and the post deadline when a booking is confirmed", () => {
    expect(migration).toContain("new.sow_snapshot := jsonb_build_object('title', v_sow.title");
    expect(migration).toContain("new.post_deadline := new.booking_date + v_days");
    expect(migration).toContain("not new.sow_customized");
  });

  it("never emails someone twice about the same change", () => {
    expect(migration).toContain("kind = 'visit_confirmed' and status = 'sent'");
    expect(migration).toContain("BOOKING_DIBATALKAN");
    expect(migration).toContain("EMAIL_TIDAK_ADA");
  });

  it("only exposes the SOW and mail tables to the service role", () => {
    expect(migration).toContain("revoke all on pos.kol_visit_settings, pos.kol_sow_versions, pos.kol_email_outbox from public, anon, authenticated");
    expect(migration).toContain("grant execute on function pos.kol_after_sow_change");
    expect(migration).toContain("and not sow_customized and booking_date >= (now() at time zone 'Asia/Jakarta')::date");
  });

  it("is reachable from admin (Edge Function), manager (auth-server) and the creator portal", () => {
    const edge = read("../../supabase/functions/kol-portal-admin/index.ts");
    const manager = read("./src/manager-kol.ts");
    const portal = read("./src/kol-portal.ts");
    for (const action of ["sow_publish", "booking_sow_set", "booking_sow_sync", "settings_save", "email_resend", "email_skip"]) {
      expect(edge).toContain(`action==="${action}"`);
      expect(manager).toContain(`action === "${action}"`);
    }
    expect(edge).toContain('action==="email_test"');
    expect(edge).toContain("skipEmail");
    expect(manager).toContain("skipEmail");
    expect(portal).toContain("/api/kol/portal/visit-info");
    expect(portal).toContain("b.sow_snapshot end as sow");
    // only the creator's own booking exposes SOW, deadline and note
    expect(portal.split("case when c.source_id = $1::text then").length - 1).toBeGreaterThanOrEqual(3);
  });

  it("sends the queue with idempotency, backoff and a stop on quota errors", () => {
    const worker = read("../../supabase/functions/kol-mail/index.ts");
    expect(worker).toContain("idempotencyKey: `kol-outbox-${row.id}`");
    expect(worker).toContain("x-cron-secret");
    expect(worker).toContain("MONTHLY_QUOTA_EXCEEDED");
    expect(worker).toContain("BACKOFF_MIN");
    expect(worker).toContain("kol_outbox_claim");
  });
});
