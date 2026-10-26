# POS stock repair — 26 October 2026

The availability event identity sequence was behind imported rows (420 versus
maximum event ID 424). Single and bulk availability changes failed with a
duplicate primary key, so no new events reached the purchasing bot.

The stock toolbar also used recipe inventory adjustments and direct catalog
writes. Catalog UPDATE is restricted, and some recipes reference removed
ingredients. The user confirmed that toolbar +/- should change only ready-to-sell
portions. It now uses a limited RPC with a row lock and expected-quantity check.
Reaching zero marks the product SOLD and records its availability event in the
same transaction. Increasing a SOLD product leaves its explicit availability
unchanged. Ingredient quantities are untouched.

The two migrations in `packages/backend/supabase/migrations/20261026*` were
applied to the running self-hosted database using psql in `supabase-db`.
No broad catalog UPDATE grants or RLS policies were relaxed.

## Validation

- `verify-pos-stock-notifications.sql`: initially failed on the stale sequence;
  passed after repair. Checks single/bulk updates, no-op behavior, delivery claims
  and sent-delivery deduplication.
- `verify-pos-ready-menu-stock.sql`: initially failed because the RPC was absent;
  passed after implementation. Checks +/- portions, stale requests, zero/SOLD
  events, negative stock rejection, delta validation, preserving SOLD state and
  unchanged ingredient quantities.
- Both SQL scripts roll back business data and do not send Telegram messages.
- Public HTTP RPC checks: invalid delta returns 22023; empty bulk returns 200.
- Purchasing bot getMe and group membership checks passed for both destinations.
  Actual new message delivery has not been exercised by an artificial group post.
- POS suite: 133 passed, two unrelated onboarding failures:
  `employee onboarding schema > builds application payload without leaking raw PIN`
  and `employee onboarding schema > builds readable Indonesian contract template`.
- Full TypeScript check reports existing errors in inventory imports, queue
  components, onboarding, leaderboard, route files, missing vitest types and Vite
  orientation typing. No diagnostics identified either changed stock file.
- Independent read-only review found no blocking findings. Suggested sequence
  `is_called` handling and inventory/SOLD regression assertions were incorporated.

## Release

Release staging: `/home/ubuntu/releases/pos-stock-fix-20261026/apps/pos`.
The release uses the exact live 0.2.551 source from
`/home/ubuntu/pos-pr67-integration-review`, with only the two stock patches and
version metadata changed to 0.2.552. The older `/opt` source was not used for the
final build. Build output and rollback copy are retained on the server.

Deployed by atomic directory exchange. The prior live 0.2.551 output is retained
at `/opt/djiwatentramapp/apps/pos/dist.stockfix-20261026`. HTTP checks confirmed
that live version.json, index.html and sw.js match the release, and that the
served stock JavaScript contains the new RPC. Both SQL regression scripts passed
again after deployment. The only application source differences from the live
0.2.551 release are the two stock files and version metadata.

Telegram notifications follow availability changes (available/SOLD); changing a
positive portion count without changing availability does not send a message.

## White-screen recovery after deployment

The user reported a white screen on all their browsers, including after the
first rollback. The 0.2.552 frontend was rolled back to 0.2.551; database repairs
remain active. The new ready-portion toolbar is therefore not currently live.

The generated Workbox NavigationRoute served precached index.html before the
configured NetworkFirst navigation route. This can keep the old HTML active
across a server rollback. An emergency worker was deployed at sw.js to remove
only disposable POS asset/navigation caches, unregister itself, and navigate
once with a recovery marker. It does not remove localStorage, sessions,
IndexedDB, or pending transaction records. PWA application asset caching is
temporarily disabled by this worker.

The ResponsiveVoice CDN script also blocked HTML parsing before the root element.
It now loads asynchronously and initializes only after loading. Its failure or
delay can no longer block parsing the POS application document.

Browser verification after updating the worker showed the login page rendered,
three root children, async voice loading, zero service-worker registrations and
empty disposable asset caches. The actual cause on the user's devices has not
been confirmed by client error logs; successful rendering was verified in the
shared Chromium browser. Recovery backups are retained under
`/home/ubuntu/releases/pos-white-screen-recovery-20261026`.
