import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const container = "djiwa-perf-regression";
function sql(input, expectFailure = false) {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-h", "/tmp", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" });
  if ((result.status !== 0) !== expectFailure) throw new Error(result.stderr || "Expected regression was not detected");
  console.log(expectFailure ? "Baseline regression reproduced" : result.stdout.trim());
}
const baseline = readFileSync("supabase/migrations/20260430000003_one_time_auto_close.sql", "utf8");
sql(`create schema pos; create schema cron;
create role anon; create role authenticated; create role service_role;
create table cron.job(jobid bigint, jobname text, active boolean default true);
create function cron.unschedule(bigint) returns boolean language sql as 'delete from cron.job where jobid=$1 returning true';
create function cron.alter_job(bigint, active boolean) returns void language sql as 'update cron.job set active=$2 where jobid=$1';
create table pos.shifts(source_id text, shift_name text, start_time bigint, starting_cash numeric, summary jsonb, raw jsonb, end_time bigint);
create table pos.customer_wallet_topups(topup_id text, transaction_id text, invoice_id text, status text, amount numeric, created_at timestamptz);
insert into pos.shifts(source_id,end_time) values ('closed',1),('open',null);
insert into cron.job values (1,'auto-close-closed',true),(2,'auto-close-open',true),(3,'auto-close-missing',true);
insert into pos.customer_wallet_topups values ('recent',null,'i-new','pending',10000,'2026-11-05 22:00Z'),('old',null,'i-old','pending',10000,'2026-08-01'),('paid',null,'i-paid','paid',10000,'2026-11-05 22:00Z');
${baseline.slice(baseline.indexOf("CREATE OR REPLACE FUNCTION public.auto_close_single_shift"), baseline.indexOf("-- 3. Trigger"))}`);
const assertions = readFileSync("scripts/tests/vps-background-load.sql", "utf8");
sql(assertions, true);
const patch = readFileSync("packages/backend/supabase/scripts/reduce-vps-background-load.sql", "utf8");
sql(`begin; ${patch} ${assertions} rollback;`);
sql(`begin; ${patch} ${patch} ${assertions} rollback;`);
console.log("SQL cleanup, payment selection, permissions and idempotency passed in isolated container");
