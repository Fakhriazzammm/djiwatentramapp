# PR #67 POS integration review

- Scope: apps/pos mobile-first workflow only; no auth/payment/db/schema/notification logic changes.
- Baseline: current production-routing branch HEAD 656153332a2512113d1f4dc69f2cbd7f063468d5.
- Source: canonical POS commit 7851ab04f90bfb5d89f2602ca635e9fae5997e1e.
- Preserve current production callback/44px/build fixes and inspect conflicts before adoption.
- DoD: map every canonical POS hunk, focused tests, POS build, diff check, preview artifact; no deploy.
