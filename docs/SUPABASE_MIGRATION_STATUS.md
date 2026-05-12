# Supabase Migration Status

## Current State
Migration target for runtime has been achieved: app runtime paths are Supabase-first and legacy backend source folders have been removed from the repository.

## What Is Done
- Removed runtime provider dependencies tied to old backend in `apps/web`.
- Removed legacy backend source directory under `packages/backend`.
- Removed legacy backend package dependencies and related scripts from workspace manifests.
- Updated env examples to Supabase variables.
- Kept Supabase mirror/transform tooling for historical data import and audit.

## Remaining Work
- Functional QA per module (booking, inventory, attendance, finance, minigames, auth flows) in staging/production.
- Optional naming cleanup in SQL mirror objects if you want to rename historical mirror schema/tables.

## Confidence
- Typecheck (`web`) passes after cleanup.
- Runtime dependency surface is Supabase.

## Suggested Next Verification
1. Run smoke test on all admin pages and checkout flows.
2. Validate RLS and write permissions in Supabase for every role.
3. Run end-to-end booking + payment + attendance scenarios.
