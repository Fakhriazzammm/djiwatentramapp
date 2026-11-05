-- Apply using psql -v ON_ERROR_STOP=1 --single-transaction.
-- Additive selection RPC: no payment status, amount, or ledger is changed.
set local lock_timeout = '3s';
set local statement_timeout = '15s';

create or replace function pos.wallet_topups_due_for_reconciliation(p_now timestamptz default now())
returns table (topup_id text, transaction_id text, invoice_id text, status text, amount numeric)
language sql stable security invoker set search_path = '' as $$
  select t.topup_id::text, t.transaction_id::text, t.invoice_id::text, t.status::text, t.amount::numeric
  from pos.customer_wallet_topups t
  where t.status = 'pending' and t.invoice_id is not null
    and (t.created_at >= p_now - interval '24 hours'
      -- Older invoices still recover missed webhooks, once per hour. Hashing
      -- spreads work over all minutes instead of a single hourly spike.
      or mod(abs(hashtext(t.topup_id)::bigint), 60) = extract(minute from p_now)::int)
  order by (t.created_at >= p_now - interval '24 hours') desc, t.created_at desc, t.topup_id
  limit 100;
$$;
revoke all on function pos.wallet_topups_due_for_reconciliation(timestamptz) from public, anon, authenticated;
grant execute on function pos.wallet_topups_due_for_reconciliation(timestamptz) to service_role;

-- Preserve the installed revenue/grace-period implementation. Patch only the
-- early-return branch which previously skipped unscheduling closed shifts.
do $patch$
declare
  definition text := pg_get_functiondef('public.auto_close_single_shift(text)'::regprocedure);
  marker text := 'RETURN; -- Shift not found or already closed';
begin
  if position('vps-cleanup-closed-shift' in definition) = 0 then
    if position(marker in definition) = 0 then
      raise exception 'Unexpected auto_close_single_shift implementation; refusing to replace it';
    end if;
    definition := replace(definition, marker,
      'PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = ''auto-close-'' || p_source_id; -- vps-cleanup-closed-shift
        RETURN; -- Shift not found or already closed');
    execute definition;
  end if;
end;
$patch$;

-- Disable, rather than delete, jobs for positively identified CLOSED shifts.
-- Missing shifts and open shifts remain untouched; rollback can re-enable IDs.
select cron.alter_job(j.jobid, active := false)
from cron.job j join pos.shifts s on j.jobname = 'auto-close-' || s.source_id
where j.active and s.end_time is not null;

notify pgrst, 'reload schema';
