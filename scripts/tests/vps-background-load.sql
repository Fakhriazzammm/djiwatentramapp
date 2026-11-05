-- Run only in the disposable fixture database, after applying the patch.
do $$
begin
  if exists(select 1 from cron.job where jobname='auto-close-closed' and active) then
    raise exception 'Closed shift job is still active';
  end if;
  if not exists(select 1 from cron.job where jobname='auto-close-open' and active) then
    raise exception 'Open shift job was disabled';
  end if;
  perform public.auto_close_single_shift('closed');
  if exists(select 1 from cron.job where jobname='auto-close-closed') then
    raise exception 'Early return failed to unschedule closed shift';
  end if;
  if not exists(select 1 from cron.job where jobname='auto-close-missing' and active) then
    raise exception 'Unknown shift job was changed';
  end if;
  if (select count(*) from generate_series(0,59) m
    cross join lateral pos.wallet_topups_due_for_reconciliation('2026-11-06 00:00Z'::timestamptz + m * interval '1 minute') t
    where t.topup_id='recent') <> 60 then
    raise exception 'Recent pending topup was skipped';
  end if;
  if (select count(*) from generate_series(0,59) m
    cross join lateral pos.wallet_topups_due_for_reconciliation('2026-11-06 00:00Z'::timestamptz + m * interval '1 minute') t
    where t.topup_id='old') <> 1 then
    raise exception 'Old pending topup must be checked once per hour';
  end if;
  if exists(select 1 from pos.wallet_topups_due_for_reconciliation('2026-11-06 00:00Z') where status <> 'pending') then
    raise exception 'Paid topup was selected';
  end if;
  if has_function_privilege('anon','pos.wallet_topups_due_for_reconciliation(timestamptz)','execute') then
    raise exception 'Anonymous access to reconciliation RPC';
  end if;
end;
$$;
