# VPS resource remediation — 6 November 2026

> Update 7 Nov 2026: alur deploy standar kini `scripts/ship-artifacts.sh` + timer `djiwa-artifact-deploy` (lihat `docs/DEPLOYMENT_VPS_WORKFLOW.md`). Instruksi manual di bawah tetap berlaku sebagai fallback.

Production host: `VM-4-244-ubuntu`, canonical checkout `/opt/djiwatentramapp`.
Nginx webroots were checked against the canonical Djiwa domain family.

The historical incident was a `vite build` of Admin under `/opt/djiwa-release`
using about 1.8 GiB RSS. Available RAM dropped below 104 MiB and iowait reached
79–85%. Resource headroom must be preserved when deploying.

## Applied to production

- Supported deploy scripts now accept prebuilt artifacts only. Admin's Vite
  configuration and the shared build-env check reject builds on the Supabase
  host, including builds from its worktrees. Arbitrary old checkouts and raw
  build commands outside these entrypoints are not covered by this guard.
- Notifications filter the existing 24-hour window in PostgreSQL before paging.
  Event types, notification deduplication and push routing are unchanged.
- The notification cron script has a non-blocking lock and uses local Kong;
  credentials are supplied to curl via stdin instead of command-line arguments.
- Wallet reconciliation uses an additive service-role-only, security-invoker
  RPC. Recent invoices remain eligible every minute. Older pending invoices are
  distributed over 60 minute slots and remain eligible hourly. No payment
  statuses, amounts or ledger entries are changed by the selection RPC.
- The installed Mayar processor's Jumat Berkah logic was preserved by applying
  a targeted patch, rather than replacing it with the older worktree version.
- 289 cron jobs tied to confirmed closed shifts were disabled, not deleted.
  Four missing-shift jobs were preserved for investigation. The cleanup branch
  now unschedules its own job even when its shift is already closed.
- `mayar-wallet-reconcile` (job 194) was disabled after verifying the working
  systemd timer. Its Vault ciphertext remains untouched. Do not repair that
  secret and re-enable the job without reassessing the duplicate scheduler.

## Implemented but not yet released as a frontend bundle

Admin/shared hook polling pauses while the browser tab is hidden and refreshes
on return. Initial loads and Realtime behavior remain unchanged. This change
needs a build outside production before it reaches browsers.

`.github/workflows/build-app-artifact.yml` is a manual CI workflow. It requires
repository variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and
`VITE_VAPID_PUBLIC_KEY` (Admin). Workflow changes must be committed/pushed before
GitHub can run them. No workflow was pushed or dispatched during this operation.

Download/extract a trusted CI artifact outside the live webroot, then run:

```bash
cd /opt/djiwatentramapp
bash scripts/deploy-vps.sh admin /absolute/path/to/extracted-admin-artifact
```

The publisher validates app identity, source SHA, version.json, entry assets and
Admin route markers before writing the webroot. It keeps previous hashed assets,
backs up the live dist, and publishes index.html last via rename. This is not a
single atomic swap of every PWA file; smoke-test version.json and worker updates
after publishing. No frontend artifact was published during this operation.

## Verification and limitations

- Handler regression tests pass against both worktree and installed Edge code,
  including paid/pending and mismatched-amount wallet recovery cases.
- SQL behavior and idempotency tested in an isolated PostgreSQL container,
  including preservation of open/unknown shift jobs and anonymous RPC denial.
- Artifact tests verify rejection without replacing the active page, retention
  of old assets, and creation of a rollback copy.
- Full `bun test` reported 467 passing tests, 18 failures (including 3 loader
  errors). The broad suite is not green. Failures involve KOL portal path
  assumptions; POS modal/recovery, checkout stepper/cart expectations; onboarding
  payload/contract expectations; missing Playwright, Deno, and JSR test runtimes.
  Full output: `/tmp/djiwa-perf-suite-output.log`. Unrelated tests were not edited.
- Customer and Admin local HTTPS checks returned 200 and `nginx -t` passed.
- One wallet lookup timed out during rollout. Subsequent scheduled cycles
  succeeded, including the preserved Jumat Berkah reconciliation.

## Rollback

Private backup directory: `/opt/djiwatentramapp/.backups/performance-AYy5BANk`.
It contains original live function sources, canonical script/config sources,
the original auto-close function and prior cron active flags.

Restore the Mayar Edge source before removing or changing its selection RPC.
Restore notification Edge code from `0-pos-notifications-index.ts` and Mayar
from `1-mayar-payment-processor-index.ts` using `sudo install -m 644` to the
corresponding `/opt/supabase-selfhost/volumes/functions/<function>/index.ts`.
Do not restart the whole Supabase stack; workers naturally reload their sources.

To undo only shift cleanup and re-enable its original jobs:

```bash
docker exec -i supabase-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < /opt/djiwatentramapp/.backups/performance-AYy5BANk/restore-database.sql
```

Job 194 rollback is separate and must run as `supabase_admin` using
`restore-mayar-cron.sql`; re-enabling it also restores its known ciphertext error.
Keeping the additive selection RPC installed is safe during rollback.

The SQL patch is recorded at
`packages/backend/supabase/scripts/reduce-vps-background-load.sql` and should be
run with `psql -v ON_ERROR_STOP=1 --single-transaction`. It refuses to modify an
unexpected auto-close implementation rather than overwriting business logic.
