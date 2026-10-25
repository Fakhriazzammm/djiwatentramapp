# Djiwa canonical-origin wave1 DoD

- [x] Isolated remote worktree created outside shared dirty checkout.
- [x] Baseline host/path/head recorded before edits.
- [x] 13-app / 14-domain inventory persisted.
- [x] TDD resolver tests: known legacy mapping, path/query/hash preservation, signed URL unchanged, third-party/relative/data unchanged.
- [x] Resolver consumers limited to existing first-party product-image boundary; no DB/auth/payment/schema writes.
- [x] Focused tests and diff-check: 4 pass, 0 fail; git diff --check pass.
- [x] Product-image HTTP evidence: canonical 200 / 17050 bytes / JPEG magic; legacy timed out.
- [x] Historical data connection path inspected without PII; records and IDs untouched.
- [ ] Full app typecheck/build: baseline errors remain; Vite build blocked by undefined path in existing unplugin config under isolated dependency setup.
- [ ] Parent review and production deployment.

Current state: TESTING (safe source wave complete; release gate remains with parent).
