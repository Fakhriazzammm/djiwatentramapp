-- Idempotent scheduler for the existing queue-only booking reminder RPC.
-- This migration does not deliver messages; it only enqueues deduplicated jobs.
create extension if not exists pg_cron;

do $migration$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'booking-reminders-enqueue'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'booking-reminders-enqueue',
    '*/5 * * * *',
    $job$select pos.enqueue_due_booking_reminders(extract(epoch from now()) * 1000, 200);$job$
  );
end;
$migration$;

notify pgrst, 'reload schema';
